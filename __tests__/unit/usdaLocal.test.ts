import { effectiveUsda, resolveFoods, usdaModeFromEnv, type ParsedFood, type PortionContext } from '../../supabase/functions/_shared/macroResolver'
import { clearPortionCache } from '../../supabase/functions/_shared/portionStore'
import { searchUsda } from '../../supabase/functions/_shared/usda'
import { portionFake } from '../../test-utils/portionFake'

// v1.2 Phase 7, spec (g) 8a/8b: RESOLVER_USDA. api (default, unset, misspelt) = today's three USDA API
// tiers; local = search_usda_local's stored rows (migrations 055/056) after the DB rows, the API for
// Branded only, and only when no stored row matched. A stored-row pick is a reference_match.

let matcherAnswers: unknown[][] = []
let matcherPrompts: string[] = []
let usdaUrls: URL[] = []
let usdaFoods: unknown[] = []
beforeEach(() => {
  clearPortionCache()
  matcherAnswers = []; matcherPrompts = []; usdaUrls = []; usdaFoods = []
  ;(globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string, init: { body?: string } = {}): Promise<unknown> => {
    if (String(url).includes('api.nal.usda.gov')) {
      usdaUrls.push(new URL(String(url)))
      return { ok: true, json: async () => ({ foods: usdaFoods }), text: async () => '' }
    }
    matcherPrompts.push(JSON.parse(init.body ?? '{}').messages[0].content)
    const matches = matcherAnswers.shift() ?? []
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches }) } }], usage: {} }), text: async () => '' }
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const OPTS = { openRouterKey: 'k', fdcApiKey: 'fdc-key', userId: 'user-1' }
const pf = (name: string, q = '1 bowl', g = 200): ParsedFood => ({ name, quantity_description: q, quantity_g: g, confidence: 0.9 })
const LOCAL_ROW = {
  id: '0f1e2d3c-0000-5000-8000-000000000001', name: 'Chicken curry', fdc_id: 2707427,
  calories_per_100g: 143, protein_per_100g: 13.1, carbs_per_100g: 3.2, fat_per_100g: 8.6, fiber_per_100g: 0.7,
  score: 1, head_match: true, name_sim: 1, dataset: 'fndds',
}
const dataTypes = (u: URL) => u.searchParams.getAll('dataType')
const brandedFood = (energy: Array<[number, number]>) => ({
  fdcId: 999, description: 'MAGGI MASALA NOODLES', dataType: 'Branded',
  foodNutrients: [...energy.map(([id, v]) => ({ nutrientId: id, value: v })), { nutrientId: 1003, value: 9 }, { nutrientId: 1005, value: 60 }, { nutrientId: 1004, value: 15 }],
  foodMeasures: [],
})

describe('the flag', () => {
  it('unset or misspelt = api; eval_only routes only the @steadyapp.internal accounts', () => {
    expect(usdaModeFromEnv(undefined)).toBe('api')
    expect(usdaModeFromEnv('Local')).toBe('api')
    expect(usdaModeFromEnv('')).toBe('api')
    expect(usdaModeFromEnv('local')).toBe('local')
    expect(usdaModeFromEnv('eval_only')).toBe('eval_only')
    expect(effectiveUsda('eval_only', 'eval@steadyapp.internal')).toBe('local')
    expect(effectiveUsda('eval_only', 'someone@gmail.com')).toBe('api')
    expect(effectiveUsda('eval_only', null)).toBe('api')
    expect(effectiveUsda('local', null)).toBe('local')
    expect(effectiveUsda('api', 'eval@steadyapp.internal')).toBe('api')
  })
})

describe('api (default): today\'s path', () => {
  it('never calls search_usda_local; the API tiers run as before (Foundation + SR first, repeated dataType params)', async () => {
    const sb = portionFake({ noPortionTables: true, rpc: { search_usda_local: () => [LOCAL_ROW] } })
    matcherAnswers.push([{ candidate_index: null, est_per_100g: { calories: 150, protein_g: 10, carbs_g: 5, fat_g: 10, fiber_g: 1 }, corrected_quantity_g: null }])
    await resolveFoods(sb.client, [pf('chicken curry')], OPTS)
    expect(sb.calls.some((c) => c.table === 'rpc:search_usda_local')).toBe(false)
    expect(usdaUrls.map(dataTypes)).toEqual([['Foundation', 'SR Legacy'], ['Survey (FNDDS)', 'Foundation', 'SR Legacy'], ['Branded']])
  })
  it('the fts candidate query reads keyed rows only (spec (g)1), so stored key-less rows never reach it', async () => {
    const sb = portionFake({ noPortionTables: true, foodItems: [
      { id: 'keyed', name: 'Chicken curry', normalized_name: 'chicken curry indian', source: 'indb', status: 'verified', calories_per_100g: 150 },
      { id: 'stored', name: 'Chicken curry', normalized_name: null, source: 'usda', status: 'verified', calories_per_100g: 143 },
    ] })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [pf('chicken curry')], { ...OPTS, fdcApiKey: '' })
    const fts = sb.calls.find((c) => c.table === 'food_items' && c.filters.some((f) => f[0] === 'textSearch'))!
    expect(fts.columns).toBe('id, name, normalized_name, source, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g')
    expect(fts.filters).toContainEqual(['not', 'normalized_name', 'is', null])
    expect(matcherPrompts[0]).toContain('0: Chicken curry [indb]')
    expect(matcherPrompts[0]).not.toContain('1: Chicken curry')
    expect(r.foods[0].food_item_id).toBe('keyed')
  })
  it('a Foundation API result with only Atwater energy (2047/2048) is still dropped in api mode (byte-identical parse)', async () => {
    usdaFoods = [brandedFood([[2048, 400]])]
    expect(await searchUsda('noodles', 'k')).toEqual([])
  })
})

describe('local', () => {
  it('stored rows come after the DB rows and before any API result; a stored-row pick is a reference_match (no private row)', async () => {
    const sb = portionFake({ noPortionTables: true, foodItems: [
      { id: 'indb-curry', name: 'Chicken curry (Murgh)', normalized_name: 'chicken curry murgh', source: 'indb', status: 'verified', calories_per_100g: 160 },
    ], rpc: { search_usda_local: () => [LOCAL_ROW] } })
    matcherAnswers.push([{ candidate_index: 1, est_per_100g: null, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [pf('chicken curry')], { ...OPTS, usda: 'local' })
    const rpc = sb.calls.filter((c) => c.table === 'rpc:search_usda_local')
    expect(rpc.map((c) => c.payload)).toEqual([{ q: 'chicken curry', k: 5 }])
    expect(usdaUrls).toEqual([])                                   // a stored row matched: no API call at all
    expect(matcherPrompts[0]).toMatch(/0: Chicken curry \(Murgh\) \[indb\][\s\S]*1: Chicken curry \[usda\]/)
    expect(r.foods[0]).toMatchObject({ food_item_id: LOCAL_ROW.id, resolution: 'reference_match', macro_source: 'usda', calories: 286 })
    expect(sb.calls.some((c) => c.table === 'food_items' && c.op === 'insert')).toBe(false)
    const mem = sb.calls.find((c) => c.table === 'user_food_memory' && c.op === 'upsert')!
    expect(mem.payload).toEqual([expect.objectContaining({ normalized_name: 'chicken curry', food_item_id: LOCAL_ROW.id, origin: 'reference_match' })])
  })
  it('no stored row: the API is asked for Branded only, and its energy falls back 1008 -> 2048 -> 2047', async () => {
    const sb = portionFake({ noPortionTables: true, rpc: { search_usda_local: () => [] } })
    usdaFoods = [brandedFood([[2048, 400]])]
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [pf('maggi noodles', '1 packet', 70)], { ...OPTS, usda: 'local' })
    expect(usdaUrls.map(dataTypes)).toEqual([['Branded']])
    expect(usdaUrls[0].search).toContain('dataType=Branded')
    expect(r.foods[0]).toMatchObject({ resolution: 'usda_match', calories: 280 })
    expect(sb.calls.some((c) => c.table === 'food_items' && c.op === 'insert')).toBe(true)   // a Branded pick stays a private row
  })
  it('the stored search failing (056 missing, a timeout) falls back to the full API tiers, as api mode', async () => {
    const sb = portionFake({ noPortionTables: true })   // no rpc handler = "function search_usda_local missing"
    matcherAnswers.push([{ candidate_index: null, est_per_100g: { calories: 150, protein_g: 10, carbs_g: 5, fat_g: 10, fiber_g: 1 }, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [pf('chicken curry')], { ...OPTS, usda: 'local' })
    expect(usdaUrls.map(dataTypes)).toEqual([['Foundation', 'SR Legacy'], ['Survey (FNDDS)', 'Foundation', 'SR Legacy'], ['Branded']])
    expect(r.foods[0].resolution).toBe('ai_estimate')
  })
  it('no API key: stored rows still answer', async () => {
    const sb = portionFake({ noPortionTables: true, rpc: { search_usda_local: () => [LOCAL_ROW] } })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null, corrected_quantity_g: null }])
    const r = await resolveFoods(sb.client, [pf('chicken curry')], { ...OPTS, fdcApiKey: '', usda: 'local' })
    expect(r.foods[0].resolution).toBe('reference_match')
  })
  it('table mode: the portion engine gets the stored row\'s fdc_id from the search (no extra fdc lookup) and its 056 rows', async () => {
    const TABLE: PortionContext = { mode: 'table', proposed: false, region: 'IN', channel: 'text' }
    const sb = portionFake({ rpc: { search_usda_local: () => [LOCAL_ROW] } })
    matcherAnswers.push([{ candidate_index: 0, est_per_100g: null }])
    const r = await resolveFoods(sb.client, [{ ...pf('chicken curry'), portion_parse: { count: 1, unit: null, size: null, stated_amount: null, stated_unit: null, context: null, fallback_g: null } }],
      { ...OPTS, usda: 'local', portion: TABLE })
    expect(sb.calls.some((c) => c.table === 'food_items' && c.columns === 'id, fdc_id')).toBe(false)
    const read = sb.calls.find((c) => c.table === 'portion_units' && c.filters.some((f) => f[0] === 'or'))!
    expect(String(read.filters.find((f) => f[0] === 'or')![1])).toContain('fdc_id.in.(2707427)')
    expect(r.foods[0].resolution).toBe('reference_match')
  })
})
