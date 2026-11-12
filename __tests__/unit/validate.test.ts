import {
  ALCOHOL_RE,
  FAT_FOOD_RE,
  ISSUE_ORDER,
  LIMITS,
  REFERENCE_SOURCES,
  ZERO_OK_RE,
  foodItemIssues,
  fromRow,
  isBlocking,
  isShareable,
  issueHints,
  roughEstimate,
  toPer100g,
  type IssueCode,
} from '../../supabase/functions/_shared/validate'
import { ISSUE_FIXTURES } from '../../scripts/audit/validate-fixtures'

// Rules v1 exist twice — validate.ts (Edge Functions, scripts) and
// public.food_item_issues() in migration 050 (the database). These tests pin
// the TypeScript side to the exact arrays Postgres returned for the same rows
// on 2026-11-12; scripts/audit-food-items.ts --check runs the same fixtures
// through the live database. Together they catch either side drifting.

const n = (calories: unknown, protein_g: unknown = 0, carbs_g: unknown = 0, fat_g: unknown = 0, fiber_g: unknown = 0) =>
  ({ calories, protein_g, carbs_g, fat_g, fiber_g })

const isSubsequenceOfOrder = (codes: IssueCode[]) => {
  let at = -1
  return codes.every((c) => {
    const i = ISSUE_ORDER.indexOf(c)
    if (i <= at) return false
    at = i
    return true
  })
}

describe('foodItemIssues — live-row fixtures (must equal the SQL output)', () => {
  it.each(ISSUE_FIXTURES.map((f) => [`#${f.id} [${f.source}] ${f.name}`, f] as const))('%s', (_label, f) => {
    expect(foodItemIssues(f.source, f.name, n(f.kcal, f.protein, f.carbs, f.fat, f.fiber))).toEqual(f.expected)
  })

  it('covers the khasta kachori that started Phase 3', () => {
    expect(foodItemIssues('indb', 'Khasta kachori', n(712.73, 2.51, 12.81, 72.27, 0.97))).toEqual(['fat_dominant_dish'])
  })

  it('reads food_items rows through fromRow the same way', () => {
    const row = { calories_per_100g: 712.73, protein_per_100g: 2.51, carbs_per_100g: 12.81, fat_per_100g: 72.27, fiber_per_100g: 0.97 }
    expect(foodItemIssues('indb', 'Khasta kachori', fromRow(row))).toEqual(['fat_dominant_dish'])
    expect(fromRow(null)).toBeNull()
  })
})

describe('foodItemIssues — order', () => {
  it('emits several codes in ISSUE_ORDER', () => {
    expect(foodItemIssues('ai_estimated', 'x', n(950, 60, 50, 0)))
      .toEqual(['energy_out_of_range', 'macro_sum_over_100', 'atwater_mismatch'])
  })

  it('every fixture output is a subsequence of ISSUE_ORDER', () => {
    for (const f of ISSUE_FIXTURES) {
      expect(isSubsequenceOfOrder(foodItemIssues(f.source, f.name, n(f.kcal, f.protein, f.carbs, f.fat, f.fiber)))).toBe(true)
    }
  })
})

describe('foodItemIssues — boundaries (JS doubles behave like SQL numeric)', () => {
  it('protein + carbs + fat: exactly 100.5 passes, 100.6 fails', () => {
    expect(foodItemIssues('ai_estimated', 'x', n(502.5, 33.5, 33.5, 33.5))).toEqual([])
    // 33.4 + 33.4 + 33.7 is 100.50000000000001 in floating point
    expect(foodItemIssues('ai_estimated', 'x', n(510, 33.4, 33.4, 33.7))).toEqual([])
    expect(foodItemIssues('ai_estimated', 'x', n(503, 33.5, 33.5, 33.6))).toEqual(['macro_sum_over_100'])
  })

  it('kcal 900 passes, 900.0001 is out of range', () => {
    expect(foodItemIssues('usda', 'ghee', n(900, 0, 0, 100))).toEqual([])
    expect(foodItemIssues('usda', 'ghee', n(900.0001, 0, 0, 100))).toEqual(['energy_out_of_range'])
  })

  it('fat rule: INDB only, fat ≥ 30, P+C strictly under 20', () => {
    expect(foodItemIssues('indb', 'x', n(300, 0, 0, 30))).toEqual(['fat_dominant_dish'])
    expect(foodItemIssues('indb', 'x', n(300, 0, 0, 29.9))).toEqual([])
    expect(foodItemIssues('usda', 'x', n(300, 0, 0, 30))).toEqual([])
    expect(foodItemIssues('indb', 'x', n(400, 10, 10, 35))).toEqual([])
  })

  it('kcal exactly at the lower Atwater edge passes', () => {
    // lo − tol = 400 − (0.2·k + 20) = k  →  k = 380 / 1.2
    expect(foodItemIssues('ai_estimated', 'x', n(380 / 1.2, 0, 100, 0))).toEqual([])
  })

  // Each pair sits ON an edge and a hair past it, so changing the constant
  // behind it (or dropping a term) flips one of the two. The same rows are in
  // ISSUE_FIXTURES (#33-#38), so audit --check pins the SQL side as well.
  it('upper Atwater edge counts fiber outside carbs: k = hi + tol passes, +0.01 fails', () => {
    // hi = 4·10 carbs + 4·10 fiber = 80; k ≤ 80 + 0.2k + 20  →  k ≤ 125
    expect(foodItemIssues('ifct', 'x', n(125, 0, 10, 0, 10))).toEqual([])
    expect(foodItemIssues('ifct', 'x', n(125.01, 0, 10, 0, 10))).toEqual(['atwater_mismatch'])
  })

  it('fat share: 9F exactly 0.85·k flags, just under does not', () => {
    // 9·34 = 306 = 0.85·360
    expect(foodItemIssues('indb', 'x', n(360, 0, 0, 34))).toEqual(['fat_dominant_dish'])
    expect(foodItemIssues('indb', 'x', n(360.01, 0, 0, 34))).toEqual([])
  })

  it('alcohol allowance is +315 kcal: k = 315 + tol passes, +0.01 fails', () => {
    // k ≤ 315 + 0.2k + 20  →  k ≤ 418.75
    expect(foodItemIssues('ai_estimated', 'whiskey', n(418.75))).toEqual([])
    expect(foodItemIssues('ai_estimated', 'whiskey', n(418.76))).toEqual(['atwater_mismatch'])
    // and it applies only to drinks
    expect(foodItemIssues('ai_estimated', 'water', n(231))).toEqual(['atwater_mismatch'])
  })

  it('the placeholder is caught with or without fiber', () => {
    expect(foodItemIssues('ai_estimated', 'x', n(200, 8, 25, 8, 0))).toEqual(['generic_placeholder'])
    expect(foodItemIssues('ai_estimated', 'x', n(200, 8, 25, 8, 2))).toEqual(['generic_placeholder'])
  })
})

describe('strict number parsing (never coercion)', () => {
  it('accepts plain decimal strings', () => {
    expect(foodItemIssues('ai_estimated', 'x', { calories: '120', protein_g: '3', carbs_g: '20', fat_g: '3' })).toEqual([])
  })

  it.each([['abc'], [true], [Infinity], [NaN], [undefined], [null]])('calories %p → missing_energy', (k) => {
    expect(foodItemIssues('ai_estimated', 'x', n(k))).toEqual(['missing_energy'])
  })

  it.each([['abc'], [{}], [NaN]])('macro %p → macro_out_of_range', (bad) => {
    expect(foodItemIssues('ai_estimated', 'x', n(100, bad))).toContain('macro_out_of_range')
  })

  it('a missing estimate object is missing_energy', () => {
    expect(foodItemIssues('ai_estimated', 'x', null)).toEqual(['missing_energy'])
    expect(foodItemIssues('ai_estimated', 'x', undefined)).toEqual(['missing_energy'])
  })

  it('toPer100g returns clean numbers, or null when unusable', () => {
    expect(toPer100g({ calories: '250', protein_g: null, carbs_g: undefined, fat_g: '3.5' }))
      .toEqual({ calories: 250, protein_g: 0, carbs_g: 0, fat_g: 3.5, fiber_g: 0 })
    expect(toPer100g(null)).toBeNull()
    expect(toPer100g({ calories: Infinity })).toBeNull()
    expect(toPer100g({ calories: 'abc' })).toBeNull()
    expect(toPer100g({ calories: 100, protein_g: 'abc' })).toBeNull()
    expect(toPer100g({ calories: 100, fat_g: {} })).toBeNull()
  })
})

describe('word lists (same booleans as Postgres ~* with \\m...\\M)', () => {
  it.each([
    ['red wine', true], ['gin and tonic', true], ['pale ale', true], ['whisky', true], ['whiskey', true],
    ['ginger tea', false], ['Kale chips', false],
    // the extended list; booleans checked against Postgres ~* on 2026-11-12
    ['Old Monk', true], ['peg of daru', true], ['mojito', true], ['virgin mojito', true], ['margarita', true],
    ['martini', true], ['sangria', true], ['Bacardi Breezer', true], ['arrack', true], ['liquor', true], ['spirits', true],
    ['Pegasus bar', false], ['oldmonk', false], ['daruma', false], ['peppermint', false],
  ])('alcohol: %s → %p', (name, want) => expect(ALCOHOL_RE.test(name)).toBe(want))

  it.each([
    ['Jeera baghar', true], ['Thousand island dressing', true], ['Soyabean oil', true], ['Butter chicken', true],
    ['boiled', false], ['Mathri', false],
  ])('fat food: %s → %p', (name, want) => expect(FAT_FOOD_RE.test(name)).toBe(want))

  it.each([
    ['ginger tea', true], ['black coffee', true], ['ORS powder', true], ['sugar-free gum', true],
    ['Steak', false], ['Bournvita', false], ['baby banana', false], ['café', false],
  ])('zero-ok: %s → %p', (name, want) => expect(ZERO_OK_RE.test(name)).toBe(want))
})

describe('helpers', () => {
  it('isBlocking is true only for physically impossible numbers', () => {
    expect(isBlocking(['missing_energy'])).toBe(true)
    expect(isBlocking(['energy_out_of_range'])).toBe(true)
    expect(isBlocking(['macro_out_of_range'])).toBe(true)
    expect(isBlocking(['macro_sum_over_100'])).toBe(true)
    expect(isBlocking(['atwater_mismatch', 'fat_dominant_dish', 'zero_energy', 'generic_placeholder'])).toBe(false)
    expect(isBlocking([])).toBe(false)
  })

  it('isShareable only for reference sources with no issues', () => {
    for (const s of REFERENCE_SOURCES) expect(isShareable(s, [])).toBe(true)
    expect(isShareable('usda', ['atwater_mismatch'])).toBe(false)
    expect(isShareable('ai_estimated', [])).toBe(false)
    expect(isShareable('label', [])).toBe(false)
    expect(isShareable(null, [])).toBe(false)
  })

  it('issueHints has a sentence for every code', () => {
    const hints = issueHints(ISSUE_ORDER)
    expect(hints).toHaveLength(ISSUE_ORDER.length)
    for (const h of hints) expect(h.length).toBeGreaterThan(10)
  })

  it('LIMITS is frozen', () => {
    expect(Object.isFrozen(LIMITS)).toBe(true)
    expect(Object.isFrozen(LIMITS.placeholder)).toBe(true)
  })

  it('never mutates its input', () => {
    const input = n('712.73', 2.51, 12.81, 72.27, 0.97)
    const copy = JSON.parse(JSON.stringify(input))
    foodItemIssues('indb', 'Khasta kachori', input)
    toPer100g(input)
    roughEstimate(input)
    expect(input).toEqual(copy)
  })
})

// Founder decision D5, "log the rest, flag the unknown": a guess that failed the
// rules twice is repaired instead of refused. Whatever it returns must log
// without a blocking issue.
describe('roughEstimate', () => {
  const expectLoggable = (est: ReturnType<typeof roughEstimate>) => {
    expect(est).not.toBeNull()
    expect(isBlocking(foodItemIssues('ai_estimated', 'x', est))).toBe(false)
  }

  it('scales per-serving macros back to 100 g and recomputes kcal by Atwater', () => {
    const est = roughEstimate(n(480, 6, 75, 20))   // P+C+F = 101 → blocking
    expectLoggable(est)
    expect(est!.protein_g + est!.carbs_g + est!.fat_g).toBeLessThanOrEqual(100.01)
    expect(est!.calories).toBeCloseTo(4 * est!.protein_g + 4 * est!.carbs_g + 9 * est!.fat_g, 1)
    // the repaired guess passes the rules outright
    expect(foodItemIssues('ai_estimated', 'Parle-G biscuits', est)).toEqual([])
  })

  it('computes kcal from macros when calories are missing or impossible', () => {
    const fromMissing = roughEstimate({ calories: null, protein_g: 10, carbs_g: 20, fat_g: 5 })
    expect(fromMissing).toEqual({ calories: 165, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 0 })
    const fromHuge = roughEstimate(n(4000, 10, 20, 5))
    expect(fromHuge!.calories).toBe(165)
  })

  it('clamps negative or garbage macros to 0 and each macro to 100 g', () => {
    const est = roughEstimate({ calories: 300, protein_g: -5, carbs_g: 'abc', fat_g: 150 })
    expectLoggable(est)
    expect(est!.protein_g).toBe(0)
    expect(est!.carbs_g).toBe(0)
    expect(est!.fat_g).toBe(100)
    expect(est!.calories).toBe(900)
  })

  it('keeps stated calories (capped to 0..900) only when there are no macros at all', () => {
    expect(roughEstimate({ calories: 350 })).toEqual({ calories: 350, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
    expect(roughEstimate({ calories: 1200 })!.calories).toBe(900)
  })

  it('returns null when nothing usable is left (no positive energy)', () => {
    expect(roughEstimate(null)).toBeNull()
    expect(roughEstimate(undefined)).toBeNull()
    expect(roughEstimate({})).toBeNull()
    expect(roughEstimate({ calories: 'abc' })).toBeNull()
    expect(roughEstimate({ calories: -50 })).toBeNull()
    expect(roughEstimate(n(0, 0, 0, 0))).toBeNull()
  })

  it('never produces a blocking issue across a sweep of bad inputs', () => {
    const bad: Array<Record<string, unknown>> = [
      n(480, 6, 75, 20), n(950, 60, 50, 0), n(-10, 30, 30, 30), n(100, 200, 0, 0), n(null, 99, 99, 99, 99),
      n('9999', '50', '50', '50'), n(NaN, 1, 1, 1), n(Infinity, 0, 0, 0.5), n(200, -1, 20, 2, 500),
    ]
    for (const b of bad) {
      const est = roughEstimate(b)
      if (est) expect(isBlocking(foodItemIssues('ai_estimated', 'x', est))).toBe(false)
    }
  })
})
