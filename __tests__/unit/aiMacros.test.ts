import {
  aiMacrosModeFromEnv, AI_COMPUTED_MAX_CONFIDENCE, clearAiMacroCache, computedKcal, computeEstimate, effectiveAiMacros, loadAiMacroContext,
} from '../../supabase/functions/_shared/aiMacros'
import { resolveFoods, type ParsedFood } from '../../supabase/functions/_shared/macroResolver'
import { clearPortionCache } from '../../supabase/functions/_shared/portionStore'
import { foodItemIssues } from '../../supabase/functions/_shared/validate'
import { portionFake } from '../../test-utils/portionFake'

// v1.2 Phase 7, spec (g) 8c: RESOLVER_AI_MACROS. legacy (unset) = the matcher's own estimate, unchanged
// (legacy prompt identity is pinned in portionLegacy.test.ts). computed = macros only from the matcher,
// energy computed on 053's basis, bounded by the food's portion category range, confidence <= 0.4.

let matcherAnswers: unknown[][] = []
let matcherPrompts: string[] = []
beforeEach(() => {
  clearPortionCache(); clearAiMacroCache()
  matcherAnswers = []; matcherPrompts = []
  ;(globalThis as { fetch?: unknown }).fetch = jest.fn(async (_url: string, init: { body?: string } = {}): Promise<unknown> => {
    matcherPrompts.push(JSON.parse(init.body ?? '{}').messages[0].content)
    const matches = matcherAnswers.shift() ?? []
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches }) } }], usage: {} }), text: async () => '' }
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const OPTS = { openRouterKey: 'k', fdcApiKey: '', userId: 'user-1' }
const pf = (name: string, q = '1 bowl', g = 100, confidence = 0.9): ParsedFood => ({ name, quantity_description: q, quantity_g: g, confidence })
const est = (e: Record<string, number>) => ({ candidate_index: null, est_per_100g: e, corrected_quantity_g: null })

describe('the flag', () => {
  it('unset or misspelt = legacy; eval_only routes only the eval accounts', () => {
    expect(aiMacrosModeFromEnv(undefined)).toBe('legacy')
    expect(aiMacrosModeFromEnv('Computed')).toBe('legacy')
    expect(aiMacrosModeFromEnv('computed')).toBe('computed')
    expect(effectiveAiMacros('eval_only', 'eval@steadyapp.internal')).toBe('computed')
    expect(effectiveAiMacros('eval_only', 'x@gmail.com')).toBe('legacy')
    expect(effectiveAiMacros('computed', null)).toBe('computed')
  })
})

describe('computed energy (053 basis: 4P + 4(C - fibre) + 2 fibre + 9F + 7 alcohol)', () => {
  it('the formula', () => {
    expect(computedKcal(10, 30, 5, 4, 0)).toBe(40 + 104 + 8 + 45)
    expect(computedKcal(0, 4, 0, 0, 10)).toBe(16 + 70)
  })
  it('alcohol counts only for a name the alcohol word list matches; fibre never exceeds carbs; bad macros give null', () => {
    expect(computeEstimate({ protein_g: 0, carbs_g: 4, fat_g: 0, fiber_g: 0, alcohol_g: 10 }, 'old monk rum', null)!.per100g.calories).toBe(86)
    expect(computeEstimate({ protein_g: 0, carbs_g: 4, fat_g: 0, fiber_g: 0, alcohol_g: 10 }, 'lemon soda', null)!.per100g.calories).toBe(16)
    expect(computeEstimate({ protein_g: 1, carbs_g: 2, fat_g: 0, fiber_g: 5 }, 'greens', null)!.per100g).toMatchObject({ fiber_g: 2, calories: 8 })
    expect(computeEstimate({ calories: 300 }, 'x', null)).toBeNull()
    expect(computeEstimate({ protein_g: '7', carbs_g: 'abc', fat_g: 1 }, 'x', null)).toBeNull()
    expect(computeEstimate({ protein_g: -1, carbs_g: 2, fat_g: 1 }, 'x', null)).toBeNull()
  })
  it('bounded by the category range with every macro scaled, so energy and macros still agree (rules v1 pass)', async () => {
    const ctx = await loadAiMacroContext(portionFake().client)
    expect(ctx.ranges.get('nuts')).toEqual({ min: 500, max: 650 })
    const nuts = computeEstimate({ protein_g: 20, carbs_g: 20, fat_g: 60, fiber_g: 8 }, 'roasted peanuts', ctx)!   // 80 + 48 + 16 + 540 = 684 raw
    expect(nuts.category).toBe('peanut')
    expect(nuts.bounded).toBe('max')
    expect(nuts.kcalRaw).toBe(684)
    expect(Math.abs(nuts.per100g.calories - 650)).toBeLessThan(0.5)
    expect(foodItemIssues('ai_estimated', 'roasted peanuts', nuts.per100g)).toEqual([])
    const milk = computeEstimate({ protein_g: 1, carbs_g: 2, fat_g: 0.5, fiber_g: 0 }, 'glass of milk', ctx)!       // 16.5 raw
    expect([milk.category, milk.bounded, Math.round(milk.per100g.calories)]).toEqual(['milk', 'min', 40])
    const curry = computeEstimate({ protein_g: 8, carbs_g: 10, fat_g: 9, fiber_g: 2 }, 'chicken curry', ctx)!       // no range: as computed
    expect(curry.bounded).toBeNull()
    expect(curry.per100g.calories).toBe(32 + 32 + 4 + 81)
  })
})

describe('resolveFoods with RESOLVER_AI_MACROS', () => {
  it('computed: the matcher is asked for macros only; energy is computed and bounded; confidence capped at 0.4', async () => {
    const sb = portionFake()
    matcherAnswers.push([est({ protein_g: 20, carbs_g: 20, fat_g: 60, fiber_g: 8 })])
    const r = await resolveFoods(sb.client, [pf('roasted peanuts', '1 handful', 30, 0.9)], { ...OPTS, aiMacros: 'computed' })
    expect(matcherPrompts[0]).toContain('we compute the calories from them, so do not give calories')
    expect(matcherPrompts[0]).toContain('"est_per_100g": null or { "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "alcohol_g": 0 }')
    expect(r.foods[0].resolution).toBe('ai_estimate')
    expect(r.foods[0].confidence).toBe(AI_COMPUTED_MAX_CONFIDENCE)
    expect(Math.abs(r.foods[0].calories - 0.3 * 650)).toBeLessThan(0.5)
    const row = (sb.calls.find((c) => c.table === 'food_items' && c.op === 'insert')!.payload as Array<{ calories_per_100g: number }>)[0]
    expect(Math.abs(row.calories_per_100g - 650)).toBeLessThan(0.5)
  })
  it('legacy (default): the estimate is the matcher\'s own, with calories, and the confidence is untouched', async () => {
    const sb = portionFake()
    matcherAnswers.push([est({ calories: 700, protein_g: 20, carbs_g: 20, fat_g: 58, fiber_g: 8 })])
    const r = await resolveFoods(sb.client, [pf('masala peanuts', '1 handful', 30, 0.9)], OPTS)
    expect(matcherPrompts[0]).not.toContain('we compute the calories')
    expect(matcherPrompts[0]).toContain('"est_per_100g": null or { "calories": 0, "protein_g": 0')
    expect(r.foods[0]).toMatchObject({ resolution: 'ai_estimate', confidence: 0.9, calories: 210 })
    expect(sb.calls.some((c) => c.table === 'portion_categories')).toBe(false)
  })
})
