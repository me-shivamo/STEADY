import { resolveFoods, weighFoods, portionColumns, type ParsedFood, type PortionContext } from '../../supabase/functions/_shared/macroResolver'
import { clearPortionCache, effectivePortion, portionModeFromEnv } from '../../supabase/functions/_shared/portionStore'
import type { PortionParse } from '../../supabase/functions/_shared/portions'
import { portionFake } from '../../test-utils/portionFake'

// resolveFoods with PORTION_MODE table / shadow (spec (g) 4): grams from 054's
// data through the engine, the matcher asked about identity only, the 5 entry
// columns, the cooking-fat line, and "first log = second log".

let matcherAnswers: unknown[][] = []
let matcherPrompts: string[] = []
beforeEach(() => {
  clearPortionCache()
  matcherAnswers = []
  matcherPrompts = []
  ;(globalThis as { fetch?: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    matcherPrompts.push(JSON.parse(init.body).messages[0].content)
    const matches = matcherAnswers.shift() ?? []
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches }) } }], usage: {} }), text: async () => '' }
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const TABLE: PortionContext = { mode: 'table', proposed: false, region: 'IN', channel: 'text' }
const SHADOW: PortionContext = { mode: 'shadow', proposed: false, region: 'IN', channel: 'text' }
const OPTS = { openRouterKey: 'k', fdcApiKey: '', userId: 'user-1' }
const per100 = (id: string, source: string, kcal: number, extra: Record<string, unknown> = {}) => ({
  id, source, status: 'verified', calories_per_100g: kcal, protein_per_100g: 3, carbs_per_100g: 5, fat_per_100g: 3, fiber_per_100g: 0, portions: null, ...extra,
})
const DAL_ID = '8cbd7524-bc18-5e4c-862b-cd6d61ee08b6'
const RICE_ID = 'd4043769-d2f2-5413-afd8-18a21da162aa'
const dalRow = { ...per100(DAL_ID, 'indb', 104, { portions: [{ description: '1 katori', gramWeight: 150 }, { description: '1 bowl (1 cup)', gramWeight: 240 }] }), name: 'dal', normalized_name: 'dal', fdc_id: null }
const riceRow = { ...per100(RICE_ID, 'usda', 130, { portions: [{ description: '1 cup', gramWeight: 158 }] }), name: 'cooked white rice', normalized_name: 'rice', fdc_id: 168930 }
const bhindiRaw = { ...per100('5b0c6a3e-1f2d-4c5b-9a8e-7d6c5b4a3f21', 'ifct', 35), name: 'Ladies finger (raw)', normalized_name: 'bhindi', fdc_id: null }
const oilRow = { ...per100('d947b92b-5a56-4cdc-866f-4ad38a1a8386', 'usda', 884, { fat_per_100g: 100, protein_per_100g: 0, carbs_per_100g: 0 }), name: 'olive oil', normalized_name: 'olive oil', fdc_id: 171413 }
const pp = (count: number, unit: PortionParse['unit'], extra: Partial<PortionParse> = {}): PortionParse =>
  ({ count, unit, size: null, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...extra })
const v2 = (name: string, parse: PortionParse, extra: Partial<ParsedFood> = {}): ParsedFood =>
  ({ name, quantity_description: `${parse.count} ${parse.unit ?? 'serving'}`, quantity_g: parse.fallback_g ?? 0, confidence: 0.9, portion_parse: parse, ...extra })

describe('flag', () => {
  it('unset or misspelt = legacy; eval_only routes only the eval account, with proposed rows', () => {
    expect(portionModeFromEnv(undefined)).toBe('legacy')
    expect(portionModeFromEnv('Table')).toBe('legacy')
    expect(effectivePortion('eval_only', 'eval@steadyapp.internal')).toEqual({ mode: 'table', proposed: true })
    expect(effectivePortion('eval_only', 'someone@gmail.com')).toEqual({ mode: 'legacy', proposed: false })
    expect(effectivePortion('table', 'someone@gmail.com')).toEqual({ mode: 'table', proposed: false })
    expect(effectivePortion('shadow', null)).toEqual({ mode: 'shadow', proposed: false })
  })
})

describe('resolveFoods, table mode', () => {
  it('an exact hit is weighed by the engine: 1 bowl dal = the founder 240 g, not the stored-measures correction', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    const r = await resolveFoods(sb.client, [v2('dal', pp(1, 'bowl', { fallback_g: 300 }))], { ...OPTS, portion: TABLE })
    expect(r.foods[0]).toMatchObject({ quantity_g: 240, calories: 249.6, portion: { source: 'food', unit: 'bowl', confidence: 0.85, needs_follow_up: false } })
    expect(r.foods[0].options!.map((o) => o.grams)).toEqual([150, 240, 320])
    expect(portionColumns(r.foods[0])).toEqual({ portion_unit: 'bowl', portion_size: 'M', portion_count: 1, portion_source: 'food', portion_confidence: 0.85 })
  })
  it('reads each row\'s fdc_id and name, and the portion rows in ONE batched portion_units read', async () => {
    const sb = portionFake({ foodItems: [dalRow, riceRow] })
    await resolveFoods(sb.client, [v2('dal', pp(1, 'katori')), v2('rice', pp(1, 'katori'))], { ...OPTS, portion: TABLE })
    const exact = sb.reads('food_items').find((c) => c.filters.some((f) => f[0] === 'in' && f[1] === 'normalized_name'))!
    expect(exact.columns).toMatch(/, name, fdc_id$/)
    const perRequest = sb.reads('portion_units').filter((c) => c.filters.some((f) => f[0] === 'or'))
    expect(perRequest).toHaveLength(1)
    expect(String(perRequest[0].filters.find((f) => f[0] === 'or')![1])).toMatch(/food_item_id\.in\.\(.*8cbd7524.*d4043769.*\),fdc_id\.in\.\(168930\)/)
  })
  it('the matcher is asked about identity only: no portion section, no gram estimate, corrected grams ignored', async () => {
    const sb = portionFake()
    matcherAnswers.push([{ candidate_index: null, est_per_100g: { calories: 150, protein_g: 5, carbs_g: 20, fat_g: 5, fiber_g: 0 }, corrected_quantity_g: 999 }])
    const r = await resolveFoods(sb.client, [v2('mystery curry', pp(1, 'katori', { fallback_g: 180 }))], { ...OPTS, portion: TABLE })
    expect(matcherPrompts[0]).not.toContain('ALSO CHECK THE PORTION SIZE')
    expect(matcherPrompts[0]).not.toContain('which we currently estimate as')
    expect(matcherPrompts[0]).not.toContain('corrected_quantity_g')
    expect(r.foods[0].quantity_g).toBe(150)          // liquid_dish katori (curry), not 999, not the 180 fallback
    // remembered: the gramsCorrected no-remember rule is gone in table mode
    expect(sb.calls.some((c) => c.table === 'user_food_memory' && c.op === 'upsert')).toBe(true)
  })
  it('first log = second log: a reference pick, then a memory hit on the same row, weigh the same', async () => {
    // a verified row always holds a key (every row did before 055; the fts query reads keyed rows only, spec (g)1)
    const fts = { ...per100('indb-poha', 'indb', 180), name: 'Poha', normalized_name: 'poha flattened rice', fdc_id: null }
    const sb1 = portionFake({ foodItems: [fts] })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: 400 }])
    const first = await resolveFoods(sb1.client, [v2('poha', pp(1, 'plate'))], { ...OPTS, portion: TABLE })
    const sb2 = portionFake({ foodItems: [fts], memory: [{ user_id: 'user-1', normalized_name: 'poha', origin: 'reference_match', portions: null, food_items: fts }] })
    const second = await resolveFoods(sb2.client, [v2('poha', pp(1, 'plate'))], { ...OPTS, portion: TABLE })
    expect(first.foods[0].resolution).toBe('reference_match')
    expect(second.foods[0].resolution).toBe('memory')
    expect(second.foods[0].quantity_g).toBe(first.foods[0].quantity_g)
    expect(first.foods[0].quantity_g).toBe(150)
  })
  it('calibrations are explicit settings: applied whatever RESOLVER_MEMORY says; only the eval (persist:false) runs cold', async () => {
    const cal = [{ id: 'c1', user_id: 'user-1', scope: 'any', category: null, food_item_id: null, unit: 'katori', size: 'M', grams: 200, ml: null, as_size: null, revoked_at: null }]
    const warm = portionFake({ foodItems: [dalRow], calibrations: cal })
    const w = await resolveFoods(warm.client, [v2('dal', pp(1, 'katori'))], { ...OPTS, portion: TABLE })
    expect(w.foods[0]).toMatchObject({ quantity_g: 200, portion: { source: 'user_calibration' } })
    for (const memory of ['off', 'write_only'] as const) {
      const sb = portionFake({ foodItems: [dalRow], calibrations: cal })
      const r = await resolveFoods(sb.client, [v2('dal', pp(1, 'katori'))], { ...OPTS, memory, portion: TABLE })
      expect(r.foods[0]).toMatchObject({ quantity_g: 200, portion: { source: 'user_calibration' } })
    }
    const cold = portionFake({ foodItems: [dalRow], calibrations: cal })
    const c = await resolveFoods(cold.client, [v2('dal', pp(1, 'katori'))], { ...OPTS, memory: 'off', persist: false, portion: TABLE })
    expect(c.foods[0].quantity_g).toBe(150)
    expect(cold.reads('user_portion_calibrations')).toHaveLength(0)
  })
  it('a V1 parse (no portion_parse) is read from quantity_description', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    const r = await resolveFoods(sb.client, [{ name: 'dal', quantity_description: '2 katori', quantity_g: 300, confidence: 0.9 }], { ...OPTS, portion: TABLE })
    expect(r.foods[0].quantity_g).toBe(300)
    expect(r.foods[0].portion).toMatchObject({ unit: 'katori', count: 2, source: 'food' })
  })
  it('no reference tables (054 not applied / a read error): stated amounts, else the guess clamped like R8, flagged; never 0 g', async () => {
    const sb = portionFake({ foodItems: [dalRow], noPortionTables: true })
    const r = await resolveFoods(sb.client, [
      v2('dal', pp(1, 'bowl', { fallback_g: 222 })),
      v2('dal', pp(1, 'bowl', { fallback_g: 5000 })),
      v2('dal', pp(2, 'katori')),
      v2('dal', pp(1, null, { stated_amount: 300, stated_unit: 'g' })),
    ], { ...OPTS, portion: TABLE })
    expect(r.foods.map((f) => f.quantity_g)).toEqual([222, 700, 100, 300])
    expect(r.foods.map((f) => f.portion?.source)).toEqual(['ai', 'ai', 'ai', 'stated'])
    expect(r.foods.slice(0, 3).every((f) => f.portion?.needs_follow_up)).toBe(true)
    expect(r.foods[2].portion!.confidence).toBe(0.2)
  })
  it('the cooking-fat rule adds its own "cooking oil" line for a dish split into raw parts that says so', async () => {
    const sb = portionFake({ foodItems: [bhindiRaw, riceRow, oilRow] })
    const r = await resolveFoods(sb.client, [
      v2('bhindi', pp(1, 'katori'), { cooking_fat: 'heavy' }),
      v2('rice', pp(1, 'plate')),
    ], { ...OPTS, portion: TABLE })
    expect(r.foods).toHaveLength(2)
    expect(r.extras).toHaveLength(1)
    expect(r.extras![0]).toMatchObject({ name: 'cooking oil', quantity_g: 10, calories: 88.4, food_item_id: oilRow.id, portion: { source: 'rule', confidence: 0.5 } })
    // totals include the rule line, so the eval measures what production logs
    expect(r.totals.calories).toBeCloseTo(r.foods.reduce((s, f) => s + f.calories, 0) + 88.4, 5)
  })
  it('a whole-dish (recipe) row already carries its oil: "kam tel" or "dhaba" never adds a line to it', async () => {
    const sb = portionFake({ foodItems: [dalRow, riceRow, oilRow] })
    for (const fat of ['light', 'heavy'] as const) {
      const r = await resolveFoods(sb.client, [v2('dal', pp(1, 'katori'), { cooking_fat: fat }), v2('rice', pp(1, 'plate'))], { ...OPTS, portion: TABLE })
      expect(r.extras).toBeUndefined()
    }
    const rest = await resolveFoods(sb.client, [v2('dal', pp(1, 'katori', { context: 'restaurant' })), v2('rice', pp(1, 'plate'))], { ...OPTS, portion: TABLE })
    expect(rest.extras).toBeUndefined()
  })
  it('no cooking-fat line for a single food, or a meal that names no fat', async () => {
    const sb = portionFake({ foodItems: [dalRow, riceRow, oilRow] })
    expect((await resolveFoods(sb.client, [v2('dal', pp(1, 'katori'), { cooking_fat: 'heavy' })], { ...OPTS, portion: TABLE })).extras).toBeUndefined()
    expect((await resolveFoods(sb.client, [v2('dal', pp(1, 'katori')), v2('rice', pp(1, 'plate'))], { ...OPTS, portion: TABLE })).extras).toBeUndefined()
  })
})

describe('resolveFoods, shadow and legacy', () => {
  it('shadow keeps the legacy grams and logs counts only (no food names)', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    const r = await resolveFoods(sb.client, [{ name: 'dal', quantity_description: '1 bowl', quantity_g: 300, confidence: 0.9 }], { ...OPTS, portion: SHADOW })
    expect(r.foods[0].quantity_g).toBe(240)            // legacy: the stored "1 bowl (1 cup)" measure (correctPortionFromMeasures)
    expect(r.foods[0].portion).toBeUndefined()
    const lines = (console.log as jest.Mock).mock.calls.map((c) => c.join(' ')).filter((l) => l.startsWith('[portion-shadow]'))
    expect(lines).toEqual(['[portion-shadow] bowl food 240 240'])
  })
  it('legacy (no portion option) never touches the portion tables', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    await resolveFoods(sb.client, [{ name: 'dal', quantity_description: '1 bowl', quantity_g: 300, confidence: 0.9 }], OPTS)
    expect(sb.calls.filter((c) => c.table.startsWith('portion') || c.table === 'user_portion_calibrations')).toEqual([])
  })
})

describe('weighFoods (the edit-rescale path)', () => {
  it('weighs a kept food on the previous entry\'s row', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    const [w] = await weighFoods(sb.client, [{ parse: pp(2, 'katori'), phrase: 'dal', foodItemId: DAL_ID, parseG: 0 }], { userId: 'user-1', portion: TABLE })
    expect(w).toMatchObject({ grams: 300, portion: { source: 'food' } })
  })
  it('legacy: nothing to weigh', async () => {
    const sb = portionFake({ foodItems: [dalRow] })
    expect(await weighFoods(sb.client, [{ parse: pp(1, 'katori'), phrase: 'dal', foodItemId: DAL_ID, parseG: 0 }], { userId: 'u', portion: { ...TABLE, mode: 'legacy' } })).toEqual([null])
    expect(sb.calls).toEqual([])
  })
})
