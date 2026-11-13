import { buildSeed } from '../../scripts/portions/lib'
import { GRAM_HINTS_PROMPT } from '../../supabase/functions/_shared/macroResolver'
import { normalizeUnitWord } from '../../supabase/functions/_shared/portionText'

// Spec (h): every number in GRAM_HINTS_PROMPT has an active or retired 054 seed
// row (or is not a portion: a density, a coffee-chain size handled in code, or
// the 45/35/20 biryani split the spec deletes). After cleanup step (g)10 the
// prompt goes; this test then asserts nothing imports it.

const seed = buildSeed()
type Where = { category?: string; food?: string; unit: string; size?: 'S' | 'M' | 'L'; value: number; status?: 'active' | 'retired' }
const has = (w: Where) => seed.rows.some((r) =>
  (w.category === undefined || r.category === w.category) &&
  (w.food === undefined || r.food_item_id?.startsWith(w.food)) &&
  r.unit === w.unit && (w.size === undefined || r.size === w.size) &&
  (r.grams === w.value || r.ml === w.value) &&
  (w.status === undefined ? r.status !== 'proposed' : r.status === w.status))
const density = (category: string, value: number) => seed.categories.some((c) => c.category === category && c.density_g_per_ml === value)

// hint number → where it lives now
const COVERED: Array<[number, () => boolean, string]> = [
  [1.03, () => density('milk', 1.03), 'milk density'],
  [1.0, () => density('beverage', 1.0), 'water / most drinks density'],
  [1.04, () => density('juice', 1.04), 'juice density'],
  [0.92, () => density('fat', 0.92), 'oil density'],
  [568, () => has({ category: 'generic', unit: 'pint', value: 568 }), 'pint IN'],
  [473, () => has({ category: 'generic', unit: 'pint', value: 473 }) && normalizeUnitWord('grande')?.stated_amount === 473, 'pint US, grande'],
  [240, () => has({ category: 'generic', unit: 'cup', value: 240 }) && has({ category: 'generic', unit: 'glass', value: 240 }), 'US cup / US glass'],
  [330, () => has({ category: 'beverage', unit: 'can', value: 330 }), 'can IN'],
  [355, () => has({ category: 'beverage', unit: 'can', value: 355 }), 'can US'],
  [250, () => has({ category: 'generic', unit: 'glass', value: 245, status: 'retired' }), '"glass = 240-250 ml" retired'],
  [354, () => normalizeUnitWord('tall')?.stated_amount === 354, 'tall (code)'],
  [591, () => normalizeUnitWord('venti')?.stated_amount === 591, 'venti (code)'],
  [1.2, () => has({ category: 'almond', unit: 'piece', value: 1.2 }), 'almond'],
  [1.6, () => has({ category: 'cashew', unit: 'piece', value: 1.6 }), 'cashew'],
  [2, () => has({ category: 'walnut', unit: 'piece', value: 2 }), 'walnut half'],
  [50, () => has({ category: 'egg', unit: 'piece', size: 'M', value: 50 }) && has({ category: 'samosa', unit: 'piece', size: 'M', value: 50 }), 'egg, samosa'],
  [25, () => has({ category: 'bread', unit: 'slice', size: 'M', value: 25 }), 'bread slice'],
  [40, () => has({ food: '2f9486f1', unit: 'piece', value: 40 }) && has({ category: 'idli', unit: 'piece', size: 'M', value: 40 }), 'roti (founder), idli'],
  [80, () => has({ category: 'paratha', unit: 'piece', value: 80, status: 'retired' }), 'paratha 80 retired'],
  [85, () => has({ category: 'dosa', unit: 'piece', value: 85, status: 'retired' }), 'plain dosa 85 retired'],
  [118, () => has({ category: 'banana', unit: 'piece', size: 'M', value: 118 }), 'banana'],
  [180, () => has({ category: 'apple', unit: 'piece', value: 180 }), 'apple'],
  [130, () => has({ category: 'vada_pav', unit: 'piece', value: 130 }), 'vada pav'],
  [11, () => has({ category: 'biscuit', unit: 'piece', value: 11 }), 'biscuit'],
  [16, () => has({ category: 'nugget', unit: 'piece', value: 16 }), 'nugget'],
  [65, () => has({ category: 'french_toast', unit: 'slice', value: 65 }), 'french toast'],
  [24, () => has({ category: 'date_fruit', unit: 'piece', value: 24 }), 'medjool date'],
  [110, () => has({ category: 'pizza', unit: 'slice', size: 'M', value: 110 }), 'pizza slice'],
  [200, () => has({ category: 'masala_dosa', unit: 'piece', value: 200, status: 'retired' }) && has({ category: 'generic', unit: 'plate', size: 'M', value: 200 }), 'masala dosa ~200 retired, plate 200'],
  [150, () => has({ category: 'liquid_dish', unit: 'katori', size: 'M', value: 150 }) && has({ category: 'generic', unit: 'bowl', size: 'S', value: 150 }), 'katori / small bowl'],
  [160, () => has({ category: 'cooked_rice', unit: 'cup', value: 160, status: 'retired' }), 'rice cup 160 retired (158 active)'],
  [15, () => has({ category: 'generic', unit: 'tbsp', size: 'M', value: 15 }), 'tbsp'],
  [5, () => has({ category: 'generic', unit: 'tsp', size: 'M', value: 5 }), 'tsp'],
  [350, () => has({ category: 'biryani', unit: 'plate', value: 400, status: 'retired' }) && has({ category: 'cooked_rice', unit: 'plate', value: 350 }), '"350-450 g plate" retired'],
  [450, () => has({ category: 'biryani', unit: 'plate', value: 450 }), 'restaurant biryani'],
  [30, () => has({ category: 'generic', unit: 'splash', value: 30 }), 'milk splash in coffee'],
  [10, () => has({ category: 'generic', unit: 'tsp', value: 5 }), '"2 spoons of sugar ≈ 10g" = 2 x tsp'],
  // the 45/35/20 rice/chicken/sauce split: deleted, no source (spec (e) Retired rows); kept as evidence text only
  [45, () => seed.rows.some((r) => r.status === 'retired' && /45\/35\/20/.test(r.evidence)), 'biryani split (deleted)'],
  [35, () => seed.rows.some((r) => r.status === 'retired' && /45\/35\/20/.test(r.evidence)), 'biryani split (deleted)'],
  [20, () => seed.rows.some((r) => r.status === 'retired' && /45\/35\/20/.test(r.evidence)), 'biryani split (deleted)'],
  [1, () => true, '"1 US cup", "1 tbsp": a count, not a weight'],
  [3, () => true, '"3 cans" in the count example: a count, not a weight'],
]

it('every number in GRAM_HINTS_PROMPT is covered', () => {
  const numbers = [...new Set([...GRAM_HINTS_PROMPT.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])))]
  const missing = numbers.filter((n) => !COVERED.some(([v]) => v === n))
  expect(missing).toEqual([])
})

it.each(COVERED.map(([n, check, what]) => [n, what, check] as const))('%s (%s) has its row', (_n, _what, check) => {
  expect(check()).toBe(true)
})
