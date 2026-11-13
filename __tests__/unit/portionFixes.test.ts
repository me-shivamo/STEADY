import { buildSeed, engineTables } from '../../scripts/portions/lib'
import { computeEstimate } from '../../supabase/functions/_shared/aiMacros'
import { describePortion, validateParsedFoodV2 } from '../../supabase/functions/_shared/parseSchema'
import {
  categoryForEnergyClamp, categoryFromWords, computePortion,
  type Calibration, type EngineInput, type PortionParse, type PortionUnitRow,
} from '../../supabase/functions/_shared/portions'

// The fixer pass on Phase 5 + 7 (2026-11-13): one test per reviewed finding, against the REAL seed 054 ships.

const seed = buildSeed()
const { tables, foodRows } = engineTables(seed)
const P = (count: number, unit: PortionParse['unit'], size: PortionParse['size'] = null, extra: Partial<PortionParse> = {}): PortionParse =>
  ({ count, unit, size, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...extra })
const row = (id: string | null, fdc: number | null, name: string, status = 'verified') => ({ id, fdc_id: fdc, status, name })
const priv = (name: string) => row(`private-${name}`, null, name, 'unverified')
const run = (parse: PortionParse, phrase: string, r: ReturnType<typeof row>, extra: Partial<EngineInput> = {}) =>
  computePortion(tables, { parse, phrase, row: r, foodRows, region: 'IN', proposed: false, channel: 'text', ...extra })!
const cal = (c: Partial<Calibration>): Calibration =>
  ({ id: `cal-${Math.random()}`, scope: 'any', category: null, food_item_id: null, unit: 'cup', size: 'M', grams: null, ml: null, as_size: null, ...c })

const ROTI = row('2f9486f1-e89e-563d-9dba-dc4b9b7ee915', null, 'roti')
const DAL = row('8cbd7524-bc18-5e4c-862b-cd6d61ee08b6', null, 'dal')
const CHAI = row('e21a4369-e513-534a-8968-4e4240e871d0', null, 'Tea (home-style chai with milk and sugar)')
const MILK = row('3857270e-27e9-487c-bc51-bb97dea319c7', null, 'Milk, whole, Cow')
const CHICKEN_CURRY = row('a4d48a40-8ccb-42dd-a682-c7647b59fc23', null, 'Chicken curry')
const GHEE = row('777d20f9-d7d1-4dbe-af8b-4e918d8ec72f', 171314, 'ghee')

describe('B1 head-noun classifier: ingredient words never name a dish they only flavour', () => {
  it.each([
    ['butter chicken', 'liquid_dish'], ['paneer butter masala', 'paneer_gravy'], ['paneer in butter sauce', 'paneer_gravy'],
    ['chicken tikka masala', 'liquid_dish'], ['dal makhani', 'liquid_dish'], ['egg halwa', 'generic'],
    ['egg and tomato sandwich', 'generic'], ['vanilla ice cream without egg', 'ice_cream'], ['dairy milk chocolate', 'generic'],
    ['milk cookies', 'biscuit'], ['apple jam', 'spread'], ['apple cinnamon pie', 'generic'], ['peanut chikki', 'generic'],
    ['banana chips', 'generic'], ['coconut milk', 'generic'], ['garam masala', 'generic'], ['murmura', 'cereal_dry'],
    // ingredient words still name the food when they are its head
    ['butter', 'fat'], ['toned milk', 'milk'], ['boiled egg', 'egg'], ['bread and butter', 'bread'], ['honey', 'honey'],
    ['masala dosa', 'masala_dosa'], ['masala chai', 'tea'], ['masala papad', 'generic'],
  ])('%s -> %s', (phrase, category) => {
    expect(categoryFromWords(phrase, seed.words)?.category ?? 'none').toBe(category)
  })
  it.each([['lemon butter fish'], ['honey chilli potato'], ['butter garlic prawns']])('%s names no category (no ingredient fallback)', (phrase) => {
    expect(categoryFromWords(phrase, seed.words)).toBeNull()
  })
  it('butter chicken weighs as a curry, never as a teaspoon of butter', () => {
    const none = run(P(1, null), 'butter chicken', priv('Butter chicken'))
    expect([none.grams, none.category, none.portion.source, none.needs_follow_up]).toEqual([200, 'liquid_dish', 'serving_default', true])
    expect(run(P(1, 'katori'), 'butter chicken', priv('Butter chicken')).grams).toBe(150)
    // paneer gravy inherits the main-curry no-amount serving (spec j4: 200 g, chips); 1 katori is its own 150 g
    expect(run(P(1, null), 'paneer butter masala', priv('paneer butter masala'))).toMatchObject({ grams: 200, category: 'paneer_gravy' })
    expect(run(P(1, 'katori'), 'paneer butter masala', priv('paneer butter masala')).grams).toBe(150)
  })
  it('the AI kcal clamp applies only to a category word plus plain modifiers', () => {
    const ctx = { tables, ranges: new Map(seed.categories.flatMap((c) => (c.kcal100_min !== null || c.kcal100_max !== null
      ? [[c.category, { min: c.kcal100_min, max: c.kcal100_max }] as const] : []))) }
    const k = (name: string, p: number, c: number, f: number, fb = 0) => computeEstimate({ protein_g: p, carbs_g: c, fat_g: f, fiber_g: fb }, name, ctx)!
    expect(Math.round(k('paneer butter masala', 7, 6, 12).per100g.calories)).toBe(160)       // 28 + 24 + 108: inside paneer gravy's range
    expect(k('milk chocolate', 7.6, 59, 30, 3).bounded).toBeNull()
    expect(k('banana chips', 2.3, 58, 34, 7.7).bounded).toBeNull()
    expect(k('coconut milk', 2.3, 6, 24, 2.2).bounded).toBeNull()
    expect(k('apple pie', 2, 34, 11, 1.6).bounded).toBeNull()
    expect(k('roasted peanuts', 26, 16, 49, 8).category).toBe('peanut')
    expect(k('glass of toned milk', 1, 2, 0.5).bounded).toBe('min')
    expect(['masala peanuts', 'masala milk', 'coconut milk', 'butter chicken'].map((n) => categoryForEnergyClamp(tables, n))).toEqual([null, null, 'generic', 'liquid_dish'])
  })
})

describe('M1 a volume calibration needs a density', () => {
  it('no density: the calibration is skipped and the data rows answer (never ml x 1 g/ml at 0.8)', () => {
    const bowl = [cal({ unit: 'bowl', ml: 500 })]
    const cup = [cal({ unit: 'cup', ml: 350 })]
    expect(run(P(1, 'bowl'), 'cornflakes', priv('cornflakes'), { calibrations: bowl })).toMatchObject({ grams: 35, portion: { source: 'category' } })
    for (const [phrase, cals] of [['oats', cup], ['whey', cup], ['salad', bowl]] as const) {
      const r = computePortion(tables, { parse: P(1, phrase === 'salad' ? 'bowl' : 'cup', null, { fallback_g: 40 }), phrase, row: priv(phrase), foodRows, region: 'IN', proposed: false, calibrations: cals })
      expect(r?.portion.source).not.toBe('user_calibration')
    }
  })
  it('with a density it applies: my cup is 350 ml -> 1 cup milk = 360.5 g', () => {
    expect(run(P(1, 'cup'), 'milk', MILK, { calibrations: [cal({ unit: 'cup', ml: 350 })] })).toMatchObject({ grams: 360.5, portion: { source: 'user_calibration', confidence: 0.9 } })
  })
})

describe('M2 calibrations apply to a no-amount log', () => {
  it('"my katori is small" then "dal": the small katori, not the founder katori', () => {
    const r = run(P(1, null), 'dal', DAL, { calibrations: [cal({ unit: 'katori', as_size: 'S' })] })
    expect(r).toMatchObject({ grams: 100, portion: { source: 'user_calibration', unit: 'katori', size: 'S' } })
  })
  it('"my cup is 350 ml" then "chai": the user\'s cup of chai', () => {
    const r = run(P(1, null), 'chai', CHAI, { calibrations: [cal({ unit: 'cup', ml: 350 })] })
    expect(r.portion.source).toBe('user_calibration')
    expect(r.grams).toBeCloseTo(350 * 128 / 120, 0)
  })
  it('an edit-learned katori of dal sticks for the next "dal" too', () => {
    const r = run(P(1, null), 'dal', DAL, { calibrations: [cal({ scope: 'food', food_item_id: DAL.id, unit: 'katori', grams: 300, origin: 'edit_confirmed' })] })
    expect(r).toMatchObject({ grams: 300, portion: { source: 'user_calibration' } })
  })
  it('no size word: the food-level size beats a broader as_size row', () => {
    const r = run(P(1, 'katori'), 'dal', DAL, { calibrations: [
      cal({ scope: 'food', food_item_id: DAL.id, unit: 'katori', size: 'S', grams: 110 }),
      cal({ unit: 'katori', as_size: 'L' }),
    ] })
    expect(r).toMatchObject({ grams: 110, portion: { source: 'user_calibration', size: 'S' } })
  })
})

describe('M3 a piece calibration names one food', () => {
  const roti50 = [cal({ scope: 'category', category: 'flatbread', unit: 'piece', grams: 50 })]
  it('"my roti is 50 g" changes roti, not paratha or naan', () => {
    expect(run(P(1, 'piece'), 'roti', ROTI, { calibrations: roti50 }).grams).toBe(50)
    expect(run(P(1, 'piece'), 'aloo paratha', priv('aloo paratha'), { calibrations: roti50 }).grams).toBe(100)
    expect(run(P(1, 'piece'), 'naan', priv('naan'), { calibrations: roti50 }).grams).toBe(60)
  })
})

describe('M4 a stated amount is the total unless it is per unit', () => {
  it('"2 eggs 100g" = 100 g; "2 scoops whey 60g" = 60 g; "2 glasses of 250 ml milk" = 2 x 250 ml', () => {
    expect(run(P(2, 'piece', null, { stated_amount: 100, stated_unit: 'g' }), 'egg', priv('egg')).grams).toBe(100)
    expect(run(P(2, 'scoop', null, { stated_amount: 60, stated_unit: 'g' }), 'whey', priv('whey')).grams).toBe(60)
    expect(run(P(2, 'glass', null, { stated_amount: 250, stated_unit: 'ml' }), 'milk', MILK).grams).toBe(515)
    expect(run(P(2, 'piece', null, { stated_amount: 60, stated_unit: 'g', stated_per_unit: true }), 'idli', priv('idli')).grams).toBe(120)
  })
  it('"2 grande lattes" = 2 x 473 ml', () => {
    const v = validateParsedFoodV2({ name: 'latte', count: 2, unit: null, unit_word: 'grande' }, '2 grande lattes')
    expect(v.food!.portion).toMatchObject({ count: 2, stated_amount: 473, stated_unit: 'ml', stated_per_unit: true })
    expect(v.food!.quantity_description).toBe('2 x 473 ml')
    expect(run(v.food!.portion, 'latte', priv('latte')).grams).toBeCloseTo(2 * 473 * 1.03, 1)
    expect(describePortion({ ...P(2, 'piece'), stated_amount: 100, stated_unit: 'g' }, 'egg')).toBe('100 g')
  })
})

describe('M5 "half plate" is halved once', () => {
  it.each([
    [{ count: 0.5, unit: 'plate', unit_word: 'half plate' }, 0.5],
    [{ count: 1, unit: 'plate', unit_word: 'half plate' }, 0.5],
    [{ count: 0.5, unit: 'plate', unit_word: 'aadhi plate' }, 0.5],
    [{ count: 2, unit: 'plate', unit_word: 'half plate' }, 1],
    [{ count: 0.5, unit: 'plate', unit_word: 'plate' }, 0.5],
  ])('%j -> count %s', (raw, count) => {
    const v = validateParsedFoodV2({ name: 'rice', ...raw }, 'half plate rice')
    expect(v.food!.portion.count).toBe(count)
  })
})

describe('M6 restaurant context beats home food rows', () => {
  it('2 roti from a restaurant = 2 x 60 g (founder k5), not the founder\'s 40 g home roti', () => {
    expect(run(P(2, 'piece', null, { context: 'restaurant' }), 'roti', ROTI)).toMatchObject({ grams: 120, portion: { source: 'category' } })
    expect(run(P(2, 'piece'), 'roti', ROTI).grams).toBe(80)
    expect(run(P(1, null, null, { context: 'restaurant' }), 'chicken biryani', priv('chicken biryani')).grams).toBe(450)
  })
})

describe('M7 056 USDA measures do not override Indian defaults (founder l3)', () => {
  const FDC = 2706538
  const usda = (unit: PortionUnitRow['unit'], grams: number, extra: Partial<PortionUnitRow> = {}): PortionUnitRow => ({
    id: `usda-${unit}-${grams}`, food_item_id: null, fdc_id: FDC, category: null, unit, size: 'M', grams, ml: null, context: null, region: null,
    is_default: false, is_unit_default: false, source: 'usda_fndds', grade: 'U', confidence: 0.8, source_ref: 'fndds', status: 'active', ...extra,
  })
  const rows = [...foodRows, usda('serving', 245, { is_default: true }), usda('plate', 280), usda('cup', 360)]
  const biryani = row('a6958211-0000-4000-8000-000000000000', FDC, 'Biryani with chicken')
  it('IN, no size word: the category answers first; US keeps USDA', () => {
    expect(run(P(1, null), 'biryani', biryani, { foodRows: rows }).grams).toBe(300)
    expect(run(P(1, 'plate'), 'biryani', biryani, { foodRows: rows }).grams).toBe(300)
    expect(run(P(1, null), 'biryani', biryani, { foodRows: rows, region: 'US' }).grams).toBe(245)
    expect(run(P(1, null, null, { context: 'restaurant' }), 'biryani', biryani, { foodRows: rows }).grams).toBe(450)
  })
  it('an explicit size keeps USDA\'s own sized row', () => {
    const sized = [...rows, usda('plate', 400, { id: 'usda-plate-L', size: 'L' })]
    expect(run(P(1, 'plate', 'L'), 'biryani', biryani, { foodRows: sized }).grams).toBe(400)
  })
  it('proposed rows (056 measures on live verified rows) are not served in table mode', () => {
    const proposed = [...foodRows, usda('piece', 80, { status: 'proposed' })]
    const dosa = row('98ec8567-0000-4000-8000-000000000000', FDC, 'Dosa')
    expect(run(P(1, 'piece'), 'dosa', dosa, { foodRows: proposed }).grams).toBe(60)
  })
})

describe('M8 when unsure, the engine offers options', () => {
  it.each([
    ['chicken curry', CHICKEN_CURRY], ['rajma', priv('rajma')], ['kadhi', priv('kadhi')], ['aloo gobi sabzi', priv('aloo gobi sabzi')],
    ['milk', MILK], ['masala omelette', priv('masala omelette')], ['pav bhaji', priv('pav bhaji')],
  ])('%s with no amount asks and offers chips', (phrase, r) => {
    const res = run(P(1, null), phrase, r)
    expect(res.needs_follow_up || res.band !== 'high').toBe(true)
    expect(res.options.length).toBeGreaterThanOrEqual(2)
    expect(res.options.every((o) => o.grams_per_unit > 0 && Math.abs(o.grams - o.grams_per_unit * o.count) < 0.2)).toBe(true)
  })
  it('the R8 answer (no data) still offers its own S / M / L', () => {
    const r = run(P(1, 'bowl', null, { fallback_g: 300 }), 'mystery stew', priv('mystery stew'))
    expect(r.portion.source).toBe('ai')
    expect(r.options.map((o) => o.size)).toEqual(['S', 'M', 'L'])
  })
})

describe('M9 calibration poisoning', () => {
  it('one edit is low confidence (the app asks); a confirmed edit is high', () => {
    const one = run(P(1, 'katori'), 'dal', DAL, { calibrations: [cal({ scope: 'food', food_item_id: DAL.id, unit: 'katori', grams: 300, origin: 'edit' })] })
    expect([one.grams, one.band, one.needs_follow_up]).toEqual([300, 'low', true])
    const two = run(P(1, 'katori'), 'dal', DAL, { calibrations: [cal({ scope: 'food', food_item_id: DAL.id, unit: 'katori', grams: 300, origin: 'edit_confirmed' })] })
    expect([two.grams, two.band]).toEqual([300, 'high'])
  })
  it('an implausible stored value never serves ("my spoon is 500 g", "my cup is 3500 ml")', () => {
    expect(run(P(1, 'spoon'), 'ghee', GHEE, { calibrations: [cal({ unit: 'spoon', grams: 500 })] }).grams).toBe(5)
    expect(run(P(1, 'cup'), 'milk', MILK, { calibrations: [cal({ unit: 'cup', ml: 3500 })] }).grams).toBe(123.6)
  })
})

describe('M10 a table-mode edit keeps the foods the user did not change', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sameAmount, keptPortion } = require('../../supabase/functions/_shared/editPortions')
  const stored = (label: string, extra: Record<string, unknown> = {}) => ({
    food_item_id: 'x', food_name: 'Dal', quantity_g: 150, quantity_label: label, portion_unit: null, portion_size: null,
    portion_count: null, portion_source: null, portion_confidence: null, ...extra,
  })
  it.each([
    ['1 bowl', P(1, 'bowl'), true], ['1 bowl', P(2, 'bowl'), false], ['1 bowl', P(1, 'bowl', 'S'), false],
    ['2 rotis', P(2, 'piece'), true], ['1 cup · rough estimate', P(1, 'cup'), true], ['250 ml', P(1, null, null, { stated_amount: 250, stated_unit: 'ml' }), true],
    ['0.25 kg', P(1, null, null, { stated_amount: 250, stated_unit: 'g' }), true], ['1 serving', P(1, null), true], ['', P(1, 'bowl'), false],
  ])('stored "%s" vs %j -> %s', (label, parse, same) => {
    const name = label === '2 rotis' ? 'Roti' : 'Dal'
    expect(sameAmount(parse, stored(label as string, { food_name: name }) as never, name)).toBe(same)
  })
  it('a kept food carries its stored portion columns, or legacy when it had none', () => {
    expect(keptPortion(stored('2 katori', { portion_unit: 'katori', portion_count: 2, portion_source: 'food', portion_confidence: 0.85 }) as never, 300))
      .toMatchObject({ unit: 'katori', count: 2, grams_per_unit: 150, source: 'food', confidence: 0.85 })
    expect(keptPortion(stored('1 bowl') as never, 150)).toMatchObject({ source: 'legacy', count: 1 })
  })
})

describe('shadow-mode reader keeps decimals', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { portionFromDescription } = require('../../supabase/functions/_shared/portionText')
  it.each([['0.5 apple', 'apple', { count: 0.5, unit: 'piece' }], ['1.5 cups', 'milk', { count: 1.5, unit: 'cup' }], ['2.5 katori', 'dal', { count: 2.5, unit: 'katori' }]])(
    '%s', (desc, name, want) => expect(portionFromDescription(desc, name)).toMatchObject(want))
})
