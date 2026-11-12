// ── Rules v1 fixtures, shared by both sides of the parity check ──────────────
// The same 40 rows are checked twice:
//   * __tests__/unit/validate.test.ts pins foodItemIssues() (TypeScript) to them;
//   * scripts/audit-food-items.ts --check runs them through the database's
//     public.food_item_issues() (SQL, migration 050) and fails on any mismatch.
// If the two implementations of rules v1 ever drift, one of those two goes red.
//
// Most rows are real food_items rows as they stood on 2026-11-12, and every
// `expected` array is the exact output Postgres gave for them on that date
// (the judge's dry run; .claude/plans/v1.2-phase3-spec.md §(e)). A few are
// synthetic edge cases (negative energy, null calories, the old placeholder),
// and #33-#38 sit exactly ON a rule's edge and a hair past it, so a changed
// constant (the fiber term in the upper energy bound, the 0.85 fat share, the
// +315 kcal alcohol allowance) flips one of them — those passed every other
// fixture when mutated. Their expected arrays were computed by the 050 SQL
// expression on the live database (read-only, 2026-11-12), like the rest.
// Numbers are kept as plain numerics on purpose: the SQL function takes
// numeric arguments, so strings / NaN / Infinity are tested in jest only.

import type { IssueCode } from '../../supabase/functions/_shared/validate.ts'

export interface IssueFixture {
  id: number
  source: string
  name: string
  kcal: number | null
  protein: number
  carbs: number
  fat: number
  fiber: number
  expected: IssueCode[]
}

const fx = (
  id: number, source: string, name: string,
  kcal: number | null, protein: number, carbs: number, fat: number, fiber: number,
  expected: IssueCode[],
): IssueFixture => ({ id, source, name, kcal, protein, carbs, fat, fiber, expected })

export const ISSUE_FIXTURES: readonly IssueFixture[] = [
  // Fat counted as dish mass (the 713 kcal khasta kachori that started Phase 3)
  fx(1, 'indb', 'Khasta kachori', 712.73, 2.51, 12.81, 72.27, 0.97, ['fat_dominant_dish']),
  fx(17, 'indb', 'Matar kachori', 585, 3.21, 13.25, 57.51, 2.03, ['fat_dominant_dish']),
  fx(21, 'indb', 'Boondi raita', 688, 2.2, 4.0, 73.8, 0, ['fat_dominant_dish']),
  fx(23, 'indb', 'Masala vada', 826, 1.7, 4.1, 89.2, 0, ['fat_dominant_dish']),
  // Energy that the macros cannot explain
  fx(2, 'indb', 'Egg drop soup', 27, 12.9, 1.1, 13.5, 0, ['atwater_mismatch']),
  fx(15, 'ifct', 'Chicken, poultry, leg, skinless (raw)', 384, 19.44, 0, 12.64, 0, ['atwater_mismatch']),
  fx(24, 'ifct', 'Lemon, juice', 36.6, 0.41, 0, 0.75, 0, ['atwater_mismatch']),
  fx(6, 'ai_estimated', 'spices and oil', 200, 0, 0, 0, 0, ['atwater_mismatch']),
  fx(31, 'ai_estimated', 'reconstituted soya chunks', 120, 50, 20, 1, 0, ['atwater_mismatch']),
  // Physically impossible
  fx(9, 'ai_estimated', 'Parle-G biscuits', 480, 6, 75, 20, 0, ['macro_sum_over_100']),
  fx(12, 'ai_estimated', 'synthetic', 950, 0, 0, 100, 0, ['energy_out_of_range']),
  fx(19, 'ai_estimated', 'negative', -1, 0, 0, 0, 0, ['energy_out_of_range']),
  fx(20, 'ai_estimated', 'neg macro', 100, -1, 20, 2, 0, ['macro_out_of_range']),
  fx(13, 'ai_estimated', 'null kcal', null, 1, 1, 1, 0, ['missing_energy']),
  // Zero energy for food that has energy
  fx(10, 'ai_estimated', 'baby banana', 0, 0, 0, 0, 0, ['zero_energy']),
  fx(30, 'ai_estimated', 'Kale chips', 0, 0, 0, 0, 0, ['zero_energy']),
  // The old resolver's generic stand-in
  fx(14, 'ai_estimated', 'sambhar', 200, 8, 25, 8, 2, ['generic_placeholder']),

  // Must pass: each one guards a rule against a false positive
  fx(3, 'usda', 'oregano', 265, 9, 68.9, 4.3, 42.5, []),                 // fiber-heavy (carbs include fiber)
  fx(4, 'usda', 'red wine', 85, 0.1, 2.6, 0, 0, []),                     // alcohol energy
  fx(5, 'ai_estimated', 'whiskey', 250, 0, 0, 0, 0, []),
  fx(26, 'ai_estimated', 'gin and tonic', 80, 0, 8, 0, 0, []),
  fx(7, 'usda', 'ghee', 900, 0, 0, 100, 0, []),                          // pure fat, at the 900 bound
  fx(8, 'indb', 'Mayonnaise', 775, 1.86, 1.65, 84.52, 0, []),            // fat-food word list
  fx(27, 'indb', 'Jeera baghar', 737, 0.5, 1.5, 81, 0, []),
  fx(29, 'indb', 'Thousand island dressing', 408, 1, 10, 40, 0, []),
  fx(18, 'indb', 'Macadamia nuts', 718, 7.9, 13.8, 75.8, 8.6, []),       // P+C ≥ 20 keeps nuts out of the fat rule
  fx(16, 'ifct', 'Mushroom, oyster, dried', 244, 19.04, 33.07, 2.86, 39.12, []),  // IFCT carbs exclude fiber
  fx(22, 'indb', 'Coconut chutney', 266, 3.6, 8.3, 25, 0, []),
  fx(28, 'indb', 'Gobi 65', 278, 0.6, 3.6, 29.1, 0, []),
  fx(11, 'usda', 'water', 0, 0, 0, 0, 0, []),                            // zero-ok word list
  fx(25, 'usda', 'ginger tea', 0, 0, 0, 0, 0, []),
  fx(32, 'usda', 'milk', 61, 3.3, 4.8, 3.3, 0, []),
  // Exact edges. Upper energy bound hi = 4P + 9F + 4C + 4·fiber (+315 alcohol), tol = 0.2k + 20:
  fx(33, 'ifct', 'Synthetic upper energy edge', 125, 0, 10, 0, 10, []),                     // k = hi + tol exactly (needs the fiber term)
  fx(34, 'ifct', 'Synthetic upper energy edge', 125.01, 0, 10, 0, 10, ['atwater_mismatch']),
  fx(35, 'indb', 'Synthetic fat share edge', 360, 0, 0, 34, 0, ['fat_dominant_dish']),      // 9F = 0.85·k exactly
  fx(36, 'indb', 'Synthetic fat share edge', 360.01, 0, 0, 34, 0, []),
  fx(37, 'ai_estimated', 'whiskey', 418.75, 0, 0, 0, 0, []),                                // k = 315 + tol exactly
  fx(38, 'ai_estimated', 'whiskey', 418.76, 0, 0, 0, 0, ['atwater_mismatch']),
  // Drinks the extended alcohol list covers (each failed the energy check before it)
  fx(39, 'ai_estimated', 'Old Monk', 231, 0, 0, 0, 0, []),
  fx(40, 'ai_estimated', 'mojito', 75, 0, 9, 0, 0, []),
]
