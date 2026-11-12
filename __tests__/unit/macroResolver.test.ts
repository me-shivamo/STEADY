import {
  commitLabelFoods,
  effectiveSearch,
  entryQuantityLabel,
  estimateNote,
  placeFoods,
  planLabelFoods,
  resolveFoods,
  searchModeFromEnv,
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
//   * Phase 4 (migration 052), behind RESOLVER_SEARCH: curated aliases sit
//     between the verified exact hit and machine-learned memory, and ranked
//     search_foods rows replace the FTS query. RESULT ORDER is SQL's job, so it
//     is pinned by 052's self-check and scripts/eval/search-check.sql, not here.

// ── Fake supabase: a chainable builder that records every call ──────────────
interface Call {
  table: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  columns?: string
  payload?: any
  filters: Array<[string, ...unknown[]]>
}

function fakeSupabase(rows: {
  memory?: any[]; exact?: any[]; fuzzy?: any[]; alias?: any[]; search?: any[]
  errors?: { alias?: string; search?: string }
  // A REJECTED promise rather than an { error } result (a dropped socket): the
  // ranked rpc, or the fts textSearch query.
  rejects?: { search?: string; fuzzy?: string }
  // Holds every search_foods answer until this promise settles (ordering tests).
  searchGate?: Promise<unknown>
} = {}) {
  const calls: Call[] = []
  const answer = (c: Call): any[] | null => {
    if (c.op !== 'select') return null
    if (c.table === 'user_food_memory') return rows.memory ?? []
    if (c.table === 'food_aliases') return rows.alias ?? []
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
          if (rows.rejects?.fuzzy && call.filters.some(([f]) => f === 'textSearch')) {
            return Promise.reject(new Error(rows.rejects.fuzzy)).then(resolve, reject)
          }
          const err = call.table === 'food_aliases' && rows.errors?.alias ? { message: rows.errors.alias } : null
          return Promise.resolve({ data: err ? null : answer(call), error: err }).then(resolve, reject)
        },
      }
      for (const f of ['eq', 'in', 'not', 'textSearch', 'order', 'limit', 'range']) {
        builder[f] = (...args: unknown[]) => { call.filters.push([f, ...args]); return builder }
      }
      return builder
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: `rpc:${fn}`, op: 'select', payload: args, filters: [] })
      if (rows.rejects?.search) return Promise.reject(new Error(rows.rejects.search))
      const err = rows.errors?.search ? { message: rows.errors.search, code: 'PGRST202' } : null
      return Promise.resolve(rows.searchGate).then(() => ({ data: err ? null : rows.search ?? [], error: err }))
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

describe('resolveFoods — Phase 4 search and aliases', () => {
  const RANKED = { ...OPTS, search: 'ranked' as const }
  const row = (id: string, source: string, kcal: number, extra: Record<string, unknown> = {}) =>
    ({ ...per100(id, source, kcal), name: id, match_kind: 'trgm', score: 0.62, name_sim: 0.4, head_match: false, matched_key: id, ...extra })
  const rpcCalls = (sb: ReturnType<typeof fakeSupabase>) => sb.calls.filter((c) => c.table.startsWith('rpc:'))
  const usedTextSearch = (sb: ReturnType<typeof fakeSupabase>) => sb.calls.some((c) => c.filters.some(([f]) => f === 'textSearch'))
  const pick0 = { candidate_index: 0, est_per_100g: null, corrected_quantity_g: null }

  it('fts (default) never reads food_aliases or calls search_foods', async () => {
    const sb = fakeSupabase({ fuzzy: [{ ...per100('indb-poha', 'indb', 130), name: 'Poha' }],
      alias: [{ alias: 'poha', food_items: per100('x', 'usda', 1) }], search: [row('y', 'indb', 1)] })
    matcherAnswers.push([pick0])
    const r = await resolveFoods(sb.client, [food('poha')], OPTS)
    expect(rpcCalls(sb)).toEqual([])
    expect(sb.calls.some((c) => c.table === 'food_aliases')).toBe(false)
    expect(usedTextSearch(sb)).toBe(true)
    expect(r.foods[0]).toMatchObject({ food_item_id: 'indb-poha', resolution: 'reference_match' })
    expect(r.foods[0].match_score).toBeUndefined()
  })

  it('ranked: one search_foods call per miss with the normalized name and k=5, never textSearch', async () => {
    const sb = fakeSupabase({ search: [row('sago', 'indb', 187)] })
    matcherAnswers.push([pick0])
    await resolveFoods(sb.client, [food('Sabudana Khichdi!')], RANKED)
    expect(rpcCalls(sb)).toEqual([expect.objectContaining({ table: 'rpc:search_foods', payload: { q: 'sabudana khichdi', k: 5 } })])
    expect(usedTextSearch(sb)).toBe(false)
  })

  it('search rows reach the matcher in SQL order; a pick is a reference_match carrying its score', async () => {
    const sb = fakeSupabase({ search: [row('uttapam', 'indb', 256, { name: 'Uttapam', score: 0.57 }), row('pulao', 'usda', 140, { name: 'plain pulao' })] })
    matcherAnswers.push([pick0])
    const r = await resolveFoods(sb.client, [food('set dosa')], RANKED)
    expect(matcherPrompts[0]).toMatch(/0: Uttapam \[indb\][\s\S]*1: plain pulao \[usda\]/)
    expect(matcherPrompts[0]).not.toContain('0.57')        // the raw score never reaches the prompt
    expect(r.foods[0]).toMatchObject({ food_item_id: 'uttapam', resolution: 'reference_match', match_score: 0.57 })
  })

  it('an alias hit is deterministic: no search, no matcher, no memory write; last_used_at touched', async () => {
    const sb = fakeSupabase({ alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71) }] })
    const r = await resolveFoods(sb.client, [food('curd', 150)], RANKED)
    expect(r.foods[0]).toMatchObject({ food_item_id: 'dahi', resolution: 'verified_alias', macro_source: 'usda', calories: 106.5, match_score: 1 })
    expect(matcherPrompts).toHaveLength(0)
    expect(rpcCalls(sb)).toHaveLength(0)
    expect(sb.writes('user_food_memory')).toEqual([])
    expect(sb.writes('food_items')).toEqual([expect.objectContaining({ op: 'update', payload: { last_used_at: expect.any(String) } })])
  })

  it('the alias read asks only for verified targets, in the same round trip as the exact read', async () => {
    const sb = fakeSupabase({ alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71) }] })
    await resolveFoods(sb.client, [food('curd'), food('Curd!')], RANKED)
    const [read] = sb.calls.filter((c) => c.table === 'food_aliases')
    expect(read.filters).toEqual(expect.arrayContaining([
      ['in', 'alias', ['curd']], ['eq', 'food_items.status', 'verified'], ['not', 'food_items.calories_per_100g', 'is', null],
    ]))
  })

  it('the verified exact key beats an alias for the same words', async () => {
    const sb = fakeSupabase({ exact: [{ ...per100('shared-roti', 'usda', 297), normalized_name: 'roti' }],
      alias: [{ alias: 'roti', food_items: per100('indb-roti', 'indb', 202) }] })
    expect((await resolveFoods(sb.client, [food('roti')], RANKED)).foods[0]).toMatchObject({ food_item_id: 'shared-roti', resolution: 'verified_exact', match_score: 1 })
  })

  it('user-taught memory beats an alias; an alias beats machine-learned memory', async () => {
    const taught = fakeSupabase({ memory: [{ normalized_name: 'curd', origin: 'correction', food_items: per100('my-curd', 'user_created', 98, { status: 'unverified' }) }],
      alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71) }] })
    const t = (await resolveFoods(taught.client, [food('curd')], RANKED)).foods[0]
    expect(t).toMatchObject({ food_item_id: 'my-curd', resolution: 'memory' })
    expect(t.match_score).toBeUndefined()
    const learned = fakeSupabase({ memory: [{ normalized_name: 'curd', origin: 'history', food_items: per100('old-ai', 'ai_estimated', 61, { status: 'unverified' }) }],
      alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71) }] })
    expect((await resolveFoods(learned.client, [food('curd')], RANKED)).foods[0]).toMatchObject({ food_item_id: 'dahi', resolution: 'verified_alias' })
  })

  it('an alias whose target is no longer verified is ignored and the food is searched', async () => {
    const sb = fakeSupabase({ alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71, { status: 'quarantined' }) }] })
    matcherAnswers.push([est(120, 4, 18, 3)])
    const r = await resolveFoods(sb.client, [food('curd')], RANKED)
    expect(rpcCalls(sb)).toHaveLength(1)
    expect(r.foods[0].resolution).toBe('ai_estimate')
  })

  it('alias and search failures are not fatal (USDA/estimate path continues)', async () => {
    const sb = fakeSupabase({ errors: { alias: 'relation does not exist', search: 'Could not find the function' } })
    matcherAnswers.push([est(120, 4, 18, 3)])
    const r = await resolveFoods(sb.client, [food('sambhar')], RANKED)
    expect(r.foods[0].resolution).toBe('ai_estimate')
    expect(matcherPrompts[0]).toContain('(no candidates found)')
  })

  // A REJECTED DB promise (dropped socket) instead of an { error } result. The DB
  // query is no longer awaited inline, so a rejection must neither 500 the log nor
  // vanish silently: USDA still answers, the prompt holds USDA rows only, and the
  // failure is logged in both modes.
  describe('a rejected DB search promise', () => {
    const withUsda = () => {
      const openRouter = (globalThis as any).fetch
      ;(globalThis as any).fetch = jest.fn(async (url: string, init: any) => {
        if (!String(url).includes('api.nal.usda.gov')) return openRouter(url, init)
        const foods = [{ fdcId: 7, description: 'Sambar, cooked', dataType: 'Survey (FNDDS)', foodNutrients: [{ nutrientId: 1008, value: 90 }] }]
        return { ok: true, json: async () => ({ foods }), text: async () => '' }
      })
    }
    const errorLog = () => (console.error as jest.Mock).mock.calls.map((c) => c.join(' ')).join('\n')

    it('ranked: logs through USDA, offers only USDA rows, and logs the failure', async () => {
      const sb = fakeSupabase({ rejects: { search: 'socket hang up' }, search: [row('never', 'indb', 1, { name: 'Never shown' })] })
      withUsda()
      matcherAnswers.push([pick0])
      const r = await resolveFoods(sb.client, [food('sambhar')], { ...RANKED, fdcApiKey: 'fdc-key' })
      expect(r.foods[0].resolution).toBe('usda_match')
      expect(matcherPrompts[0]).toMatch(/0: Sambar, cooked \[USDA Survey \(FNDDS\)\]/)
      expect(matcherPrompts[0]).not.toContain('Never shown')
      expect(errorLog()).toMatch(/\[resolver\] search failed, continuing with USDA only: sambhar socket hang up/)
    })

    it('fts: the same, and the failure is logged instead of dropped', async () => {
      const sb = fakeSupabase({ rejects: { fuzzy: 'socket hang up' } })
      withUsda()
      matcherAnswers.push([pick0])
      const r = await resolveFoods(sb.client, [food('sambhar')], { ...OPTS, fdcApiKey: 'fdc-key' })
      expect(r.foods[0].resolution).toBe('usda_match')
      expect(matcherPrompts[0]).toMatch(/0: Sambar, cooked \[USDA/)
      expect(errorLog()).toMatch(/\[resolver\] fuzzy search failed, continuing with USDA only: sambhar socket hang up/)
    })
  })

  it('verified rows now pass portions to the matcher, labelled by source', async () => {
    const sb = fakeSupabase({ search: [
      row('roti-usda', 'usda', 297, { name: 'roti', portions: [{ description: '1 piece', gramWeight: 68 }] }),
      row('katori-dal', 'indb', 100, { name: 'Dal', portions: [{ description: '1 katori', gramWeight: 150 }] })] })
    matcherAnswers.push([pick0])
    await resolveFoods(sb.client, [food('rotti')], RANKED)
    expect(matcherPrompts[0]).toContain('USDA portions: 1 piece = 68g')
    expect(matcherPrompts[0]).toContain('       Portions: 1 katori = 150g')
  })

  it('an alias row with portions corrects the parse grams like an exact hit', async () => {
    const sb = fakeSupabase({ alias: [{ alias: 'phulka', food_items: per100('chapati', 'usda', 299, { portions: [{ description: '1 piece', gramWeight: 43 }] }) }] })
    const r = await resolveFoods(sb.client, [{ ...food('phulka', 60), quantity_description: '2 pieces' }], RANKED)
    expect(r.foods[0]).toMatchObject({ resolution: 'verified_alias', quantity_g: 86 })
  })

  it("memory:'off' (the eval) still applies aliases", async () => {
    const sb = fakeSupabase({ alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 71) }] })
    expect((await resolveFoods(sb.client, [food('curd')], { ...RANKED, memory: 'off' })).foods[0].resolution).toBe('verified_alias')
  })

  it('the DB search and USDA run in parallel, and DB rows still come first in the prompt', async () => {
    // search_foods answers only once USDA has been asked (or after 200 ms). If the
    // resolver still awaited the DB before calling USDA, the safety timer would
    // release search_foods first and the event order below would flip.
    const events: string[] = []
    let openGate: () => void = () => {}
    const searchGate = new Promise<void>((res) => { openGate = res })
    const timer = setTimeout(() => { events.push('timer'); openGate() }, 200)
    const sb = fakeSupabase({ search: [row('indb-dal', 'indb', 116, { name: 'Dal' })], searchGate })
    const openRouter = (globalThis as any).fetch
    ;(globalThis as any).fetch = jest.fn(async (url: string, init: any) => {
      if (!String(url).includes('api.nal.usda.gov')) return openRouter(url, init)
      events.push('usda')
      openGate()
      const foods = [{ fdcId: 1, description: 'Dal, cooked', dataType: 'Survey (FNDDS)', foodNutrients: [{ nutrientId: 1008, value: 120 }] }]
      return { ok: true, json: async () => ({ foods }), text: async () => '' }
    })
    searchGate.then(() => events.push('search'))
    matcherAnswers.push([pick0])
    try {
      await resolveFoods(sb.client, [food('dal tadka')], { ...RANKED, fdcApiKey: 'fdc-key' })
    } finally {
      clearTimeout(timer)
    }
    expect(events.slice(0, 2)).toEqual(['usda', 'search'])
    expect(matcherPrompts[0]).toMatch(/0: Dal \[indb\][\s\S]*1: Dal, cooked \[USDA Survey \(FNDDS\)\]/)
  })

  it.each([
    [undefined, 'a@gmail.com', 'fts'], ['garbage', 'eval-test@steadyapp.internal', 'fts'],
    ['eval_only', 'eval-test@steadyapp.internal', 'ranked'], ['eval_only', 'Eval-Test@SteadyApp.Internal', 'ranked'],
    ['eval_only', 'a@gmail.com', 'fts'], ['eval_only', null, 'fts'], ['ranked', null, 'ranked'],
  ])('RESOLVER_SEARCH=%s for %s → %s', (env, email, want) =>
    expect(effectiveSearch(searchModeFromEnv(env as string | undefined), email as string | null)).toBe(want))
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
