import {
  commitLabelFoods,
  entryQuantityLabel,
  estimateNote,
  placeFoods,
  planLabelFoods,
  resolveFoods,
  unsureReply,
  ROUGH_MAX_CONFIDENCE,
  type ParsedFood,
  type ResolvedFood,
} from '../../supabase/functions/_shared/macroResolver'

// resolveFoods() against a fake supabase client and a fake OpenRouter, so the
// trust rules from migration 050 are pinned without a network:
//   * precedence: user-taught memory > verified exact hit > machine-learned memory
//   * a memory pointer at a quarantined row is ignored
//   * persist:false writes nothing at all
//   * founder decision D5, "log the rest, flag the unknown": a food whose
//     estimate still fails the rules after the retry (impossible OR merely
//     doubtful) logs as a private, flagged rough estimate that is never
//     remembered; a food with no usable number at all is left out while the
//     rest of the meal still logs; nothing is written when nothing is loggable.
//   * a food whose grams the matcher corrected is not remembered (the next log
//     of the same words would skip that correction).

// ── Fake supabase: a chainable builder that records every call ──────────────
interface Call {
  table: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  columns?: string
  payload?: any
  filters: Array<[string, ...unknown[]]>
}

function fakeSupabase(rows: { memory?: any[]; exact?: any[]; fuzzy?: any[] } = {}) {
  const calls: Call[] = []
  const answer = (c: Call): any[] | null => {
    if (c.op !== 'select') return null
    if (c.table === 'user_food_memory') return rows.memory ?? []
    if (c.table === 'food_items') {
      if (c.filters.some(([f]) => f === 'textSearch')) return rows.fuzzy ?? []
      if (c.filters.some(([f, col]) => f === 'in' && col === 'normalized_name')) return rows.exact ?? []
      return []
    }
    return []
  }
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      const builder: any = {
        select(columns: string) { if (call.op === 'select') call.columns = columns; return builder },
        insert(payload: any) { call.op = 'insert'; call.payload = payload; return builder },
        upsert(payload: any) { call.op = 'upsert'; call.payload = payload; return builder },
        update(payload: any) { call.op = 'update'; call.payload = payload; return builder },
        delete() { call.op = 'delete'; return builder },
        then(resolve: any, reject: any) {
          calls.push(call)
          return Promise.resolve({ data: answer(call), error: null }).then(resolve, reject)
        },
      }
      for (const f of ['eq', 'in', 'not', 'textSearch', 'order', 'limit', 'range']) {
        builder[f] = (...args: unknown[]) => { call.filters.push([f, ...args]); return builder }
      }
      return builder
    },
  }
  const writes = (table?: string) =>
    calls.filter((c) => c.op !== 'select' && c.table !== 'ai_logs' && (!table || c.table === table))
  return { client, calls, writes }
}

// ── Fake OpenRouter: one queued matcher answer per call ─────────────────────
const NETWORK_DOWN: any[] = []
let matcherAnswers: any[][] = []
let matcherPrompts: string[] = []
beforeEach(() => {
  matcherAnswers = []
  matcherPrompts = []
  ;(globalThis as any).fetch = jest.fn(async (_url: string, init: any) => {
    matcherPrompts.push(JSON.parse(init.body).messages[0].content)
    const matches = matcherAnswers.shift() ?? []
    if (matches === NETWORK_DOWN) throw new Error('network down')
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches }) } }], usage: {} }),
      text: async () => '',
    }
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const OPTS = { openRouterKey: 'k', fdcApiKey: '', userId: 'user-1' }
const food = (name: string, quantity_g = 100, confidence = 0.9): ParsedFood =>
  ({ name, quantity_description: `${quantity_g}g`, quantity_g, confidence })
const per100 = (id: string, source: string, kcal: number, extra: Record<string, unknown> = {}) => ({
  id, source, status: 'verified', calories_per_100g: kcal, protein_per_100g: 3, carbs_per_100g: 5,
  fat_per_100g: 3, fiber_per_100g: 0, portions: null, ...extra,
})
const est = (calories: unknown, protein_g = 0, carbs_g = 0, fat_g = 0) =>
  ({ candidate_index: null, est_per_100g: { calories, protein_g, carbs_g, fat_g, fiber_g: 0 }, corrected_quantity_g: null })

describe('resolveFoods — precedence', () => {
  it('user-taught memory (label) beats the shared verified exact hit', async () => {
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'milk', origin: 'label', food_items: per100('label-row', 'label', 64, { status: 'unverified' }) }],
      exact: [{ ...per100('shared-milk', 'usda', 61), normalized_name: 'milk' }],
    })
    const r = await resolveFoods(sb.client, [food('milk')], OPTS)
    expect(r.foods[0].food_item_id).toBe('label-row')
    expect(r.foods[0].resolution).toBe('memory')
    expect(r.foods[0].calories).toBe(64)
    expect(matcherPrompts).toHaveLength(0)
  })

  it('the verified exact hit beats machine-learned memory (history)', async () => {
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'milk', origin: 'history', food_items: per100('old-ai-row', 'ai_estimated', 70, { status: 'unverified' }) }],
      exact: [{ ...per100('shared-milk', 'usda', 61), normalized_name: 'milk' }],
    })
    const r = await resolveFoods(sb.client, [food('milk')], OPTS)
    expect(r.foods[0].food_item_id).toBe('shared-milk')
    expect(r.foods[0].resolution).toBe('verified_exact')
  })

  it('machine-learned memory is used when there is no verified row', async () => {
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'poha', origin: 'ai_estimate', food_items: per100('my-poha', 'ai_estimated', 130, { status: 'unverified' }) }],
    })
    const r = await resolveFoods(sb.client, [food('poha')], OPTS)
    expect(r.foods[0].food_item_id).toBe('my-poha')
    expect(r.foods[0].resolution).toBe('memory')
  })

  it('ignores a memory pointer whose target is quarantined, and lets today\'s answer replace it', async () => {
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'kachori', origin: 'label', food_items: per100('bad', 'indb', 713, { status: 'quarantined' }) }],
    })
    matcherAnswers.push([est(300, 6, 40, 13)])
    const r = await resolveFoods(sb.client, [food('kachori')], OPTS)
    expect(r.foods[0].food_item_id).not.toBe('bad')
    expect(r.foods[0].resolution).toBe('ai_estimate')
    const [mem] = sb.writes('user_food_memory').filter((c) => c.op === 'upsert')
    expect(mem.payload[0]).toMatchObject({ normalized_name: 'kachori', origin: 'ai_estimate', food_item_id: r.foods[0].food_item_id })
  })

  it('a machine-learned answer never overwrites a usable user-taught pointer', async () => {
    // write_only: the label pointer is not SERVED, but it must still be protected.
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'protein bar', origin: 'label', food_items: per100('my-bar', 'label', 380, { status: 'unverified', protein_per_100g: 30, carbs_per_100g: 40, fat_per_100g: 11 }) }],
    })
    matcherAnswers.push([est(350, 20, 45, 10)])
    const r = await resolveFoods(sb.client, [food('protein bar')], { ...OPTS, memory: 'write_only' })
    expect(r.foods[0].resolution).toBe('ai_estimate')
    expect(sb.writes('user_food_memory').filter((c) => c.op === 'upsert')).toEqual([])
  })

  it("memory:'off' never reads memory", async () => {
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'milk', origin: 'label', food_items: per100('label-row', 'label', 64) }],
      exact: [{ ...per100('shared-milk', 'usda', 61), normalized_name: 'milk' }],
    })
    const r = await resolveFoods(sb.client, [food('milk')], { ...OPTS, memory: 'off' })
    expect(r.foods[0].food_item_id).toBe('shared-milk')
    expect(sb.calls.some((c) => c.table === 'user_food_memory')).toBe(false)
  })
})

describe('resolveFoods — writes', () => {
  it('a clean AI estimate becomes a private, key-less row plus an ai_estimate memory pointer', async () => {
    const sb = fakeSupabase()
    matcherAnswers.push([est(150, 5, 20, 5)])
    const r = await resolveFoods(sb.client, [food('mystery curry')], OPTS)

    const [insert] = sb.writes('food_items').filter((c) => c.op === 'insert')
    expect(insert.payload).toHaveLength(1)
    const row = insert.payload[0]
    expect(row).toMatchObject({ source: 'ai_estimated', created_by: 'user-1', status: 'unverified', status_reason: 'private' })
    expect(row).not.toHaveProperty('normalized_name')
    expect(r.foods[0].food_item_id).toBe(row.id)

    const [mem] = sb.writes('user_food_memory').filter((c) => c.op === 'upsert')
    expect(mem.payload).toEqual([expect.objectContaining({ user_id: 'user-1', normalized_name: 'mystery curry', food_item_id: row.id, origin: 'ai_estimate' })])
  })

  it('persist:false writes nothing at all', async () => {
    const sb = fakeSupabase({ exact: [{ ...per100('shared-milk', 'usda', 61), normalized_name: 'milk' }] })
    matcherAnswers.push([est(150, 5, 20, 5)])
    const r = await resolveFoods(sb.client, [food('milk'), food('mystery curry')], { ...OPTS, persist: false })
    expect(r.foods).toHaveLength(2)
    expect(sb.writes()).toEqual([])
  })

  it('a doubtful estimate is retried once, with the rule it broke in the prompt', async () => {
    const sb = fakeSupabase()
    matcherAnswers.push([est(200, 8, 25, 8)])       // the old placeholder → doubt
    matcherAnswers.push([est(120, 4, 18, 3)])       // corrected
    const r = await resolveFoods(sb.client, [food('sambhar')], OPTS)
    expect(matcherPrompts).toHaveLength(2)
    expect(matcherPrompts[1]).toContain('Your previous estimate for this food was rejected')
    expect(matcherPrompts[1]).toContain('placeholder')
    expect(r.foods[0].calories).toBe(120)
    expect(r.foods[0].resolution).toBe('ai_estimate')
    expect(r.foods[0].rough).toBeUndefined()
  })

  it('a food whose grams the matcher corrected is logged with them but not remembered', async () => {
    const sb = fakeSupabase({
      fuzzy: [{ id: 'indb-poha', name: 'Poha', source: 'indb', calories_per_100g: 130, protein_per_100g: 2.5, carbs_per_100g: 25, fat_per_100g: 2.5, fiber_per_100g: 1 }],
    })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: 180 }])
    const r = await resolveFoods(sb.client, [{ ...food('poha', 150), quantity_description: '1 bowl' }], OPTS)
    expect(r.foods[0]).toMatchObject({ food_item_id: 'indb-poha', resolution: 'reference_match', quantity_g: 180, calories: 234 })
    expect(sb.writes('user_food_memory').filter((c) => c.op === 'upsert')).toEqual([])
  })

  it('the same pick without a gram correction is remembered', async () => {
    const sb = fakeSupabase({
      fuzzy: [{ id: 'indb-poha', name: 'Poha', source: 'indb', calories_per_100g: 130, protein_per_100g: 2.5, carbs_per_100g: 25, fat_per_100g: 2.5, fiber_per_100g: 1 }],
    })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: null }])
    await resolveFoods(sb.client, [{ ...food('poha', 150), quantity_description: '1 bowl' }], OPTS)
    const [mem] = sb.writes('user_food_memory').filter((c) => c.op === 'upsert')
    expect(mem.payload).toEqual([expect.objectContaining({ normalized_name: 'poha', food_item_id: 'indb-poha', origin: 'reference_match' })])
  })
})

describe('resolveFoods — D5: log the rest, flag the unknown', () => {
  it('an estimate that is impossible twice logs as a rough estimate; the rest logs normally', async () => {
    const sb = fakeSupabase({ exact: [{ ...per100('shared-roti', 'indb', 202), normalized_name: 'roti' }] })
    matcherAnswers.push([est(480, 6, 75, 20)])      // per-serving numbers: P+C+F > 100
    matcherAnswers.push([est(470, 6, 74, 21)])      // same mistake on the retry
    const r = await resolveFoods(sb.client, [food('roti', 80), food('Parle-G', 30, 0.95)], OPTS)

    expect(r.unresolved).toEqual([])
    expect(r.foods.map((f) => f.resolution)).toEqual(['verified_exact', 'rough_estimate'])
    expect(r.foods.map((f) => f.rough)).toEqual([undefined, true])
    const rough = r.foods[1]
    expect(rough.macro_source).toBe('ai_estimated')
    expect(rough.confidence).toBeLessThanOrEqual(ROUGH_MAX_CONFIDENCE)
    // repaired: P+C+F scaled to 100 g, kcal from Atwater
    expect(rough.protein_g + rough.carbs_g + rough.fat_g).toBeLessThanOrEqual(30.1)

    const [insert] = sb.writes('food_items').filter((c) => c.op === 'insert')
    expect(insert.payload).toHaveLength(1)
    expect(insert.payload[0]).toMatchObject({ created_by: 'user-1', source: 'ai_estimated', status: 'unverified' })
    expect(insert.payload[0].status_reason).toMatch(/^rough_v1:macro_sum_over_100/)
    expect(insert.payload[0]).not.toHaveProperty('normalized_name')
    // never remembered
    expect(sb.writes('user_food_memory').filter((c) => c.op === 'upsert')).toEqual([])
  })

  it('a food with no usable number on either try is left out; the rest still logs', async () => {
    const sb = fakeSupabase({ exact: [{ ...per100('shared-roti', 'indb', 202), normalized_name: 'roti' }] })
    matcherAnswers.push([{ candidate_index: null, est_per_100g: null, corrected_quantity_g: null }])
    matcherAnswers.push([{ candidate_index: null, est_per_100g: null, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [food('roti', 80), food('zorblax'), food('roti', 40)], OPTS)

    expect(r.foods.map((f) => f.name)).toEqual(['roti', 'roti'])
    expect(r.unresolved).toEqual([{ index: 1, name: 'zorblax', reason: 'no_estimate', issues: ['missing_energy'] }])
    expect(sb.writes('food_items').filter((c) => c.op === 'insert')).toEqual([])

    // placeFoods puts the survivors back where they came from
    const placed: Array<ResolvedFood | undefined> = new Array(4)
    placeFoods(placed, [0, 2, 3], r)
    expect(placed.map((f) => f?.quantity_g)).toEqual([80, undefined, undefined, 40])
  })

  it('when nothing is loggable, nothing is written', async () => {
    const sb = fakeSupabase()
    matcherAnswers.push([{ candidate_index: null, est_per_100g: null, corrected_quantity_g: null }])
    matcherAnswers.push([{ candidate_index: null, est_per_100g: { calories: 'abc' }, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [food('zorblax')], OPTS)
    expect(r.foods).toEqual([])
    expect(r.unresolved).toHaveLength(1)
    expect(r.unresolved[0].reason).toBe('invalid_estimate')
    expect(sb.writes()).toEqual([])
  })

  it('a failed retry call falls back to the first answer, flagged, instead of failing the meal', async () => {
    const sb = fakeSupabase()
    matcherAnswers.push([est(200, 8, 25, 8)])        // doubtful → retry
    matcherAnswers.push(NETWORK_DOWN)                 // …and the retry call fails
    const r = await resolveFoods(sb.client, [food('sambhar')], OPTS)
    expect(r.foods).toHaveLength(1)
    expect(r.foods[0]).toMatchObject({ resolution: 'rough_estimate', rough: true, calories: 200 })
    expect(r.foods[0].confidence).toBeLessThanOrEqual(ROUGH_MAX_CONFIDENCE)
    // the doubtful first answer is logged but never remembered, and stored quarantined
    const [insert] = sb.writes('food_items').filter((c) => c.op === 'insert')
    expect(insert.payload[0]).toMatchObject({ status: 'quarantined', status_reason: 'rough_v1:generic_placeholder' })
    expect(sb.writes('user_food_memory').filter((c) => c.op === 'upsert')).toEqual([])
  })

  it('a doubtful estimate that is still doubtful after the retry is a flagged rough estimate, numbers kept', async () => {
    // The 200/8/25/8 placeholder twice used to log as a plain ai_estimate at
    // full confidence, unnamed in the note, while its row said "judged wrong".
    const sb = fakeSupabase()
    matcherAnswers.push([est(200, 8, 25, 8)])
    matcherAnswers.push([est(200, 8, 25, 8)])
    const r = await resolveFoods(sb.client, [food('sambhar', 150, 0.9)], OPTS)
    expect(r.unresolved).toEqual([])
    expect(r.foods[0]).toMatchObject({ resolution: 'rough_estimate', rough: true, calories: 300, macro_source: 'ai_estimated' })
    expect(r.foods[0].confidence).toBe(ROUGH_MAX_CONFIDENCE)
    const [insert] = sb.writes('food_items').filter((c) => c.op === 'insert')
    expect(insert.payload[0]).toMatchObject({ created_by: 'user-1', status: 'quarantined', status_reason: 'rough_v1:generic_placeholder', calories_per_100g: 200 })
    expect(sb.writes('user_food_memory').filter((c) => c.op === 'upsert')).toEqual([])
    expect(estimateNote(r.foods.filter((f) => f.rough).map((f) => f.name), [])).toContain('"sambhar" is a rough estimate')
  })

  it('a correct drink estimate is not pushed through the retry (alcohol word list)', async () => {
    const sb = fakeSupabase()
    matcherAnswers.push([est(231, 0, 0, 0)])
    const r = await resolveFoods(sb.client, [food('Old Monk', 60)], OPTS)
    expect(matcherPrompts).toHaveLength(1)
    expect(r.foods[0]).toMatchObject({ resolution: 'ai_estimate', calories: 138.6 })
  })
})

describe('label foods', () => {
  const label = (name: string, extra: Partial<ParsedFood> = {}): ParsedFood => ({
    name, quantity_description: '1 serving (40g)', quantity_g: 40, confidence: 0.95,
    label_serving_g: 40, label_macros: { calories: 150, protein_g: 5, carbs_g: 27, fat_g: 2.5 }, ...extra,
  })

  it('plans the label numbers deterministically, missing values counting as 0', () => {
    const { plans, unresolved } = planLabelFoods([label('Oats', { quantity_g: 80 })])
    expect(unresolved).toEqual([])
    expect(plans[0].totals).toEqual({ calories: 300, protein_g: 10, carbs_g: 54, fat_g: 5, fiber_g: 0 })
    expect(plans[0].per100g.calories).toBeCloseTo(375)
  })

  it('a label with no usable gram weight is left out, not divided by zero', () => {
    const { plans, unresolved } = planLabelFoods([label('Mystery bar', { label_serving_g: 0, quantity_g: 0 })])
    expect(plans).toEqual([])
    expect(unresolved).toEqual([{ index: 0, name: 'Mystery bar', reason: 'label_serving_missing', issues: [] }])
  })

  it('commits a private label row and a user-taught label pointer', async () => {
    const sb = fakeSupabase()
    const { plans } = planLabelFoods([label('Oats')])
    const [f] = await commitLabelFoods(sb.client, plans, { userId: 'user-1' })
    expect(f).toMatchObject({ macro_source: 'label', resolution: 'label_scan', calories: 150 })
    const [insert] = sb.writes('food_items').filter((c) => c.op === 'insert')
    expect(insert.payload[0]).toMatchObject({ source: 'label', created_by: 'user-1', status: 'unverified', fdc_id: null })
    expect(insert.payload[0]).not.toHaveProperty('normalized_name')
    const [mem] = sb.writes('user_food_memory').filter((c) => c.op === 'upsert')
    expect(mem.payload[0]).toMatchObject({ origin: 'label', food_item_id: f.food_item_id })
  })

  it('re-scanning the same label reuses the row instead of minting a new one', async () => {
    const { plans } = planLabelFoods([label('Oats')])
    const sb = fakeSupabase({
      memory: [{ normalized_name: 'oats', origin: 'label', food_items: {
        id: 'my-oats', status: 'unverified', calories_per_100g: 375, protein_per_100g: 12.5,
        carbs_per_100g: 67.5, fat_per_100g: 6.25, fiber_per_100g: 0,
      } }],
    })
    const [f] = await commitLabelFoods(sb.client, plans, { userId: 'user-1' })
    expect(f.food_item_id).toBe('my-oats')
    expect(sb.writes('food_items')).toEqual([])
  })
})

describe('reply text', () => {
  it('flags rough estimates and left-out foods in one short line each', () => {
    // the food rows are not tappable; the adjust screen is behind the card's ⋮ menu
    expect(estimateNote(['Parle-G'], [])).toBe('"Parle-G" is a rough estimate — adjust it from the meal\'s ⋮ menu.')
    expect(estimateNote(['a', 'b'], [])).toBe('"a" and "b" are rough estimates — adjust them from the meal\'s ⋮ menu.')
    expect(estimateNote([], ['zorblax'])).toBe('I couldn\'t estimate "zorblax" — add it manually.')
    expect(estimateNote([], [])).toBe('')
  })

  it('puts the rough flag on the entry label the installed app shows, exactly once', () => {
    expect(entryQuantityLabel({ quantity_description: '1 plate', rough: true })).toBe('1 plate · rough estimate')
    // an edit sends the card's text back, marker included: never doubled…
    expect(entryQuantityLabel({ quantity_description: '2 plates · rough estimate', rough: true })).toBe('2 plates · rough estimate')
    // …and dropped once the numbers are no longer rough
    expect(entryQuantityLabel({ quantity_description: '2 plates · rough estimate' })).toBe('2 plates')
    expect(entryQuantityLabel({ quantity_description: '2 plates (rough estimate)' })).toBe('2 plates')
    // everything else is passed through untouched, including a missing label
    expect(entryQuantityLabel({ quantity_description: '1 bowl ' })).toBe('1 bowl ')
    expect(entryQuantityLabel({ quantity_description: undefined })).toBeNull()
    expect(entryQuantityLabel({ quantity_description: undefined, rough: true })).toBe('rough estimate')
  })

  it('names every unusable food when nothing could be logged', () => {
    expect(unsureReply(['x', 'y', 'z'], 'text')).toContain('"x", "y" and "z"')
    expect(unsureReply(['x'], 'photo')).toContain('in this photo')
  })
})
