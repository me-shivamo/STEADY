import { buildSeed, engineTables } from '../../scripts/portions/lib'
import {
  categoryFromWords, computePortion, cookingFatGrams, regionFromTimezone, R8_BOUNDS,
  type Calibration, type EngineInput, type MemoryPortion, type PortionParse, type PortionUnitRow,
} from '../../supabase/functions/_shared/portions'

// The portion engine (v1.2 Phase 5, spec (d) + (k)) against the REAL seed that
// migration 054 ships (scripts/portions/data, folded exactly as emit054.ts does).
// The golden table is spec (d) "Expected grams, region IN, after 053 and 054";
// the rows are the live resolutions of each phrase (read-only query, 2026-11-13).

const seed = buildSeed()
const { tables, foodRows } = engineTables(seed)

const P = (count: number, unit: PortionParse['unit'], size: PortionParse['size'] = null, extra: Partial<PortionParse> = {}): PortionParse =>
  ({ count, unit, size, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...extra })
const row = (id: string | null, fdc: number | null, name: string, status = 'verified') => ({ id, fdc_id: fdc, status, name })
const run = (parse: PortionParse, phrase: string, r: ReturnType<typeof row>, extra: Partial<EngineInput> = {}) =>
  computePortion(tables, { parse, phrase, row: r, foodRows, region: 'IN', proposed: false, channel: 'text', ...extra })

// live rows (exact key or alias) for the golden phrases
const ROTI = row('2f9486f1-e89e-563d-9dba-dc4b9b7ee915', null, 'roti')
const PHULKA = row('f1cf4b91-0c2c-58d6-8e16-0849b57c59d3', null, 'Phulka (plain roti)')
const DAL = row('8cbd7524-bc18-5e4c-862b-cd6d61ee08b6', null, 'dal')
const CHAI = row('e21a4369-e513-534a-8968-4e4240e871d0', null, 'Tea (home-style chai with milk and sugar)')
const RICE = row('d4043769-d2f2-5413-afd8-18a21da162aa', 168930, 'cooked white rice')
const MILK = row('3857270e-27e9-487c-bc51-bb97dea319c7', null, 'Milk, whole, Cow')
const COFFEE = row('00511fec-5452-415f-bc47-205af357e4f6', 171881, 'coffee')
const CURD = row('50d9a39a-bd2c-4f55-a78e-0416f7a4d63f', 2651751, 'dahi')
const CHICKEN_CURRY = row('a4d48a40-8ccb-42dd-a682-c7647b59fc23', null, 'Chicken curry')
const CHUTNEY = row('397c24c0-7e82-4e3b-8d42-0ed5cafd64b8', 2709309, 'chutney')
const BANANA = row('397ab1fa-1643-4e92-a356-33bfab2526e4', 173944, 'banana')
const GHEE = row('777d20f9-d7d1-4dbe-af8b-4e918d8ec72f', 171314, 'ghee')
const SUGAR = row('d0c6e018-b0a5-4582-8f8d-ceac809e549a', 746784, 'sugar')
const CHAAS = row('29c65def-14f9-424e-b9e8-fa04bb2f78fd', 172225, 'buttermilk (chaas)')
const priv = (name: string) => row(`private-${name}`, null, name, 'unverified')

describe('golden table, spec (d), region IN', () => {
  // [phrase, parse, row, grams, source, confidence]
  const cases: Array<[string, PortionParse, ReturnType<typeof row>, number, string, number]> = [
    ['roti', P(2, 'piece'), ROTI, 80, 'food', 0.85],
    ['phulka', P(3, 'piece'), PHULKA, 90, 'food', 0.85],
    ['bajra roti', P(1, 'piece'), priv('bajra roti'), 35, 'category', 0.70],
    ['dal', P(1, 'katori'), DAL, 150, 'food', 0.85],
    ['dal', P(1, 'bowl'), DAL, 240, 'food', 0.85],
    ['dal', P(1, 'bowl', 'S'), DAL, 150, 'food', 0.75],                       // 240 x (150 / 240), food F scaled
    ['dal', P(1, null), DAL, 150, 'serving_default', 0.80],                   // the founder katori, -0.05
    ['chai', P(1, 'cup'), CHAI, 128, 'food', 0.85],
    ['chai', P(1, 'cutting'), CHAI, 75, 'food', 0.85],
    ['chai', P(1, 'mug'), CHAI, 200, 'food', 0.85],
    ['rice', P(1, 'cup'), RICE, 158, 'food', 0.85],
    ['rice', P(1, 'katori'), RICE, 130, 'food', 0.85],
    ['rice', P(1, 'plate'), RICE, 250, 'food', 0.85],
    ['rice', P(1, 'bowl'), RICE, 158, 'volume', 0.60],                        // 240 ml x 0.658 (the founder cup row)
    ['milk', P(1, 'glass'), MILK, 206, 'category', 0.60],
    ['milk', P(1, 'cup'), MILK, 123.6, 'category', 0.60],                     // the 120 ml teacup (founder k2)
    ['coffee', P(1, 'cup'), COFFEE, 155, 'category', 0.60],
    ['curd', P(1, 'katori'), CURD, 150, 'category', 0.60],
    ['chicken curry', P(1, null), CHICKEN_CURRY, 200, 'serving_default', 0.45],
    ['poha', P(1, 'plate'), row('14a2b0ba-2195-4b11-85d4-569ef1d06408', null, 'Poha'), 150, 'category', 0.60],
    ['paratha', P(1, 'piece'), row('394445ae-b76b-5b1a-b3eb-7da41588a966', null, 'paratha'), 50, 'category', 0.60],
    ['aloo paratha', P(1, 'piece'), row('8725aa4a-3059-5433-aa1f-75c4fef1cb0a', null, 'Aloo Paratha'), 100, 'category', 0.60],
    ['dosa', P(1, 'piece'), row('98ec8567-9d7c-4331-978c-bc6784e7efe7', 2708347, 'Dosa'), 60, 'category', 0.60],
    ['masala dosa', P(1, 'piece'), row('c4919e98-094c-4f0f-ae70-87884c47aa90', null, 'Masala dosa'), 195, 'category', 0.60],
    ['idli', P(2, 'piece'), row('bece02c8-1c8a-4f85-8de0-6d90879b1a32', null, 'Idli'), 80, 'category', 0.60],
    ['chicken biryani', P(1, 'plate'), priv('chicken biryani'), 300, 'category', 0.60],
    ['chicken biryani', P(1, 'plate', null, { context: 'restaurant' }), priv('chicken biryani'), 450, 'category', 0.60],
    ['eggs', P(2, 'piece'), row('3d3e2c25-938d-4923-a457-2b5e7ae4ffb7', 748967, 'egg'), 100, 'category', 0.70],
    ['banana', P(1, 'piece'), BANANA, 118, 'food', 0.80],
    ['almonds', P(10, 'piece'), row('a1f3ed09-8be4-4cb9-9431-e70715a9f90b', null, 'Almond'), 12, 'category', 0.70],
    ['peanuts', P(1, 'handful'), priv('peanuts'), 33, 'category', 0.70],
    ['ghee', P(1, 'tsp'), GHEE, 5, 'category', 0.70],
    ['ghee', P(1, 'tbsp'), GHEE, 13, 'category', 0.70],
    ['ghee', P(1, 'spoon'), GHEE, 5, 'category', 0.70],
    ['sugar', P(2, 'spoon'), SUGAR, 8.4, 'category', 0.70],
    ['whey', P(1, 'scoop'), priv('whey'), 32, 'category', 0.70],
    ['chaas', P(1, 'glass'), CHAAS, 204.2, 'category', 0.60],                 // 200 ml x 1.02 (USDA buttermilk cup)
    ['pav bhaji', P(1, 'plate'), row('6614c89a-2056-410d-8ec2-6bebc9d8b2f1', null, 'Pav bhaji'), 200, 'category', 0.45],
    ['milk', P(1, null, null, { stated_amount: 250, stated_unit: 'ml' }), MILK, 257.5, 'stated', 0.95],
  ]
  it.each(cases)('%s %j', (phrase, parse, r, grams, source, conf) => {
    const out = run(parse, phrase, r)
    expect(out).not.toBeNull()
    expect(out!.grams).toBe(grams)
    expect(out!.portion.source).toBe(source)
    expect(out!.portion.confidence).toBeCloseTo(conf, 2)
  })

  it('1 small katori chutney: no approved condiment row → the fallback (ai 0.30), never a generic katori', () => {
    const out = run(P(1, 'katori', 'S', { fallback_g: 40 }), 'chutney', CHUTNEY)!
    expect(out).toMatchObject({ grams: 40, portion: { source: 'ai', confidence: 0.3 }, needs_follow_up: true })
  })
  it('1 small katori chutney under eval_only: the proposed condiment row, 30 g', () => {
    const out = run(P(1, 'katori', 'S', { fallback_g: 40 }), 'chutney', CHUTNEY, { proposed: true })!
    expect(out.grams).toBe(30)
    expect(out.portion.source).toBe('category')
  })
})

describe('golden table, region US', () => {
  it('1 cup coffee: the USDA cup row, 248 g food U', () => {
    expect(run(P(1, 'cup'), 'coffee', COFFEE, { region: 'US' })).toMatchObject({ grams: 248, portion: { source: 'food', confidence: 0.8 } })
  })
  it('1 cup milk on a USDA milk row with a 244 g cup: food U (spec (d))', () => {
    const usdaMilk: PortionUnitRow = { ...foodRows[0], id: 'x-milk-cup', food_item_id: null, fdc_id: 999001, category: null, unit: 'cup', size: 'M', grams: 244, ml: 240, region: null, context: null, is_default: false, is_unit_default: false, source: 'food_items_portions', grade: 'U', confidence: 0.8, status: 'active', source_ref: 't' }
    const out = computePortion(tables, { parse: P(1, 'cup'), phrase: 'milk', row: row('m', 999001, 'milk'), foodRows: [usdaMilk], region: 'US', proposed: false })!
    expect(out).toMatchObject({ grams: 244, portion: { source: 'food', confidence: 0.8 } })
  })
  it('1 cup milk on the live IFCT milk row (no USDA cup): the generic 240 ml cup x milk density', () => {
    expect(run(P(1, 'cup'), 'milk', MILK, { region: 'US' })).toMatchObject({ grams: 247.2, portion: { source: 'volume' } })
  })
  it('the IN-only rows never apply in the US: a US glass is 240 ml', () => {
    expect(run(P(1, 'glass'), 'water', priv('water'), { region: 'US' })!.grams).toBe(240)
    expect(run(P(1, 'glass'), 'water', priv('water'), { region: 'IN' })!.grams).toBe(200)
  })
  it('a US pint is 473 ml, an Indian one 568 ml', () => {
    expect(run(P(1, 'pint'), 'beer', priv('beer'), { region: 'US' })!.grams).toBeCloseTo(473 * 1.01, 1)
    expect(run(P(1, 'pint'), 'beer', priv('beer'), { region: 'IN' })!.grams).toBeCloseTo(568 * 1.01, 1)
  })
})

describe('rank order', () => {
  const mem = (grams: number, size: 'S' | 'M' | 'L' = 'M'): MemoryPortion => ({ unit: 'katori', size, grams, origin: 'correction', at: '2026-11-13' })
  const cal = (c: Partial<Calibration>): Calibration => ({ id: 'cal-1', scope: 'any', category: null, food_item_id: null, unit: 'katori', size: 'M', grams: null, ml: null, as_size: null, ...c })

  it('memory beats the founder row', () => {
    expect(run(P(1, 'katori'), 'dal', DAL, { memory: [mem(180)] })).toMatchObject({ grams: 180, portion: { source: 'memory', confidence: 0.9 } })
  })
  it('memory (unit, M) x the unit ratio for another size, at 0.80', () => {
    const out = run(P(1, 'katori', 'S'), 'dal', DAL, { memory: [mem(180)] })!
    expect(out.grams).toBeCloseTo(180 * (100 / 150), 1)
    expect(out.portion).toMatchObject({ source: 'memory', confidence: 0.8 })
  })
  it('a personal calibration beats every default (founder rows included)', () => {
    expect(run(P(1, 'katori'), 'dal', DAL, { calibrations: [cal({ grams: 200 })] }))
      .toMatchObject({ grams: 200, portion: { source: 'user_calibration', confidence: 0.9 } })
  })
  it('memory beats a calibration', () => {
    expect(run(P(1, 'katori'), 'dal', DAL, { memory: [mem(180)], calibrations: [cal({ grams: 200 })] })!.portion.source).toBe('memory')
  })
  it('calibration scope: food beats category beats any', () => {
    const cals = [cal({ id: 'a', grams: 100 }), cal({ id: 'c', scope: 'category', category: 'liquid_dish', grams: 120 }),
      cal({ id: 'f', scope: 'food', food_item_id: DAL.id, grams: 140 })]
    expect(run(P(1, 'katori'), 'dal', DAL, { calibrations: cals })!.grams).toBe(140)
    expect(run(P(1, 'katori'), 'chicken curry', CHICKEN_CURRY, { calibrations: cals })!.grams).toBe(120)
    expect(run(P(1, 'katori'), 'rice', RICE, { calibrations: cals })!.grams).toBe(100)
  })
  it('"my cup is 350 ml" weighs a cup of milk with milk\'s density', () => {
    const out = run(P(1, 'cup'), 'milk', MILK, { calibrations: [cal({ unit: 'cup', ml: 350 })] })!
    expect(out.grams).toBeCloseTo(350 * 1.03, 1)
    expect(out.portion.source).toBe('user_calibration')
  })
  it('"my katori is small": an unsized katori becomes S from the data, recorded as user_calibration', () => {
    const out = run(P(1, 'katori'), 'dal', DAL, { calibrations: [cal({ as_size: 'S' })] })!
    expect(out.grams).toBe(100)                 // founder M 150 x the liquid-dish katori S/M ratio
    expect(out.portion.source).toBe('user_calibration')
    expect(out.portion.size).toBe('S')
  })
  it('an explicit size word overrides "my katori is small"', () => {
    expect(run(P(1, 'katori', 'L'), 'dal', DAL, { calibrations: [cal({ as_size: 'S' })] })!.grams).toBe(250)
  })
  it('a stated amount still beats memory and calibration', () => {
    expect(run(P(1, null, null, { stated_amount: 90, stated_unit: 'g' }), 'dal', DAL, { memory: [mem(180)], calibrations: [cal({ grams: 200 })] })!.grams).toBe(90)
  })
  it('founder rows beat region-tagged rows: chai cup is 128 g, not the 120 ml category teacup', () => {
    expect(run(P(1, 'cup'), 'chai', CHAI)!.grams).toBe(128)
  })
  it('region-tagged rows beat untagged food rows: Indian coffee cup 150 ml beats USDA 248 g', () => {
    expect(run(P(1, 'cup'), 'coffee', COFFEE)!.grams).toBe(155)
  })
  it('other-region rows are never used, and retired rows never served', () => {
    const r = run(P(1, 'glass'), 'juice', priv('juice'))!
    expect(r.grams).toBe(208)                    // IN 200 ml x juice 1.04; never the retired 245 ml glass
    expect(r.portion.ref).not.toMatch(/245/)
  })
  it('proposed rows are served only under eval_only', () => {
    expect(run(P(1, 'bowl'), 'ketchup', priv('ketchup'), { proposed: false })?.grams ?? null).toBeNull()
    expect(run(P(1, 'bowl'), 'ketchup', priv('ketchup'), { proposed: true })!.grams).toBe(50)
  })
})

describe('sizes, servings, density, fallback', () => {
  it('ratio uses the unit\'s own S/M row before the category ratio', () => {
    // bowl S for dal: generic bowl 150/240, not liquid_dish s_ratio 0.67
    expect(run(P(1, 'bowl', 'S'), 'dal', DAL)!.grams).toBe(150)
  })
  it('no size word = the unit default (egg M 50 g), not "medium" invented by the parse', () => {
    expect(run(P(1, 'piece'), 'egg', priv('egg'))!.grams).toBe(50)
    expect(run(P(1, 'piece', 'S'), 'egg', priv('egg'))!.grams).toBe(44)   // the Indian medium as the small chip (founder k7)
  })
  it('the serving chain: is_default rows, then the category serving unit', () => {
    expect(run(P(1, null), 'rajma', priv('rajma'))).toMatchObject({ grams: 200, portion: { source: 'serving_default' } })
    expect(run(P(1, null), 'aloo sabzi', priv('aloo sabzi'))!.grams).toBe(150)
    expect(run(P(1, null), 'milk', MILK)).toMatchObject({ grams: 180.3, portion: { source: 'serving_default' } })  // 175 ml
    expect(run(P(1, null), 'idli', priv('idli'))).toMatchObject({ grams: 40, portion: { source: 'serving_default' } })  // serving unit piece
  })
  it('a main dish with no amount asks a follow-up; a high-confidence unit amount does not', () => {
    expect(run(P(1, null), 'chicken curry', CHICKEN_CURRY)!.needs_follow_up).toBe(true)
    expect(run(P(1, 'katori'), 'dal', DAL)!.needs_follow_up).toBe(false)
  })
  it('density: a food row with grams and ml (0.8), else the category (0.6), else none = no vessel', () => {
    expect(run(P(1, 'bowl'), 'rice', RICE)!.portion.ref).toMatch(/food row cup/)
    expect(run(P(1, 'bowl'), 'rice', priv('rice'))!.portion.ref).toMatch(/category cooked_rice/)
    // generic has no density on purpose: a bowl of an unknown food goes to the fallback, not a guess
    expect(run(P(1, 'bowl'), 'zorblax', priv('zorblax'))).toBeNull()
    expect(run(P(1, 'bowl', null, { fallback_g: 250 }), 'zorblax', priv('zorblax'))!.portion.source).toBe('ai')
  })
  it('stated volume with no density: 1.0 g/ml at 0.85', () => {
    expect(run(P(1, null, null, { stated_amount: 300, stated_unit: 'ml' }), 'zorblax', priv('zorblax')))
      .toMatchObject({ grams: 300, portion: { source: 'stated', confidence: 0.85 } })
  })
  it('stated mass converts directly; a count of vessels multiplies a per-vessel amount', () => {
    expect(run(P(1, null, null, { stated_amount: 0.25, stated_unit: 'kg' }), 'paneer', priv('paneer'))!.grams).toBe(250)
    expect(run(P(2, 'glass', null, { stated_amount: 250, stated_unit: 'ml' }), 'milk', MILK)!.grams).toBe(515)
  })
  it('R8 clamps the parser guess to the per-unit bounds', () => {
    expect(run(P(1, 'tsp', null, { fallback_g: 40 }), 'zorblax', priv('zorblax'))!.grams).toBe(R8_BOUNDS.tsp[1])
    expect(run(P(2, 'piece', null, { fallback_g: 2000 }), 'zorblax', priv('zorblax'))!.grams).toBe(1200)
    expect(run(P(1, null, null, { fallback_g: 300 }), 'zorblax', priv('zorblax'), { channel: 'photo' })!.portion.confidence).toBe(0.4)
  })
  it('condiment: inherit_vessels=false skips the generic katori / bowl rows, keeps the spoons', () => {
    expect(run(P(1, 'katori'), 'coconut chutney', priv('coconut chutney'))).toBeNull()
    expect(run(P(1, 'tbsp'), 'ketchup', priv('ketchup'))!.grams).toBe(15)
  })
  it('a not-verified row\'s own USDA measures are read (R5); a verified row\'s legacy portions are not', () => {
    const portions = [{ description: '1 medium (7" long)', gramWeight: 120 }, { description: '1 cup, sliced', gramWeight: 150 }]
    expect(computePortion(tables, { parse: P(1, 'piece'), phrase: 'zorblax', row: { ...priv('zorblax'), portions }, foodRows, region: 'IN', proposed: false })!.grams).toBe(120)
    expect(computePortion(tables, { parse: P(1, 'piece'), phrase: 'zorblax', row: { ...row('v', null, 'zorblax'), portions }, foodRows, region: 'IN', proposed: false })).toBeNull()
  })
  it('options: the same unit at S, M, L plus the default serving of another unit, near-duplicates merged', () => {
    const out = run(P(1, 'cutting'), 'chai', CHAI)!
    expect(out.options.map((o) => o.grams)).toEqual([60, 75, 90, 128])
    expect(out.options[0]).toMatchObject({ unit: 'cutting', size: 'S', label: '1 small cutting' })
    expect(out.options.length).toBeLessThanOrEqual(4)
  })
})

describe('determinism', () => {
  it('the same parse and the same rows give the same grams, source and confidence', () => {
    const a = run(P(2, 'katori'), 'dal', DAL)
    const b = run(P(2, 'katori'), 'dal', DAL)
    expect(a).toEqual(b)
  })
  it('row order in the input does not change the answer', () => {
    const shuffled = [...foodRows].reverse()
    const a = computePortion(tables, { parse: P(1, 'piece'), phrase: 'banana', row: BANANA, foodRows, region: 'IN', proposed: false })
    const b = computePortion({ ...tables, categoryRows: [...tables.categoryRows].reverse() }, { parse: P(1, 'piece'), phrase: 'banana', row: BANANA, foodRows: shuffled, region: 'IN', proposed: false })
    expect(a).toEqual(b)
  })
})

describe('helpers', () => {
  it('region: Kolkata, Calcutta or none = IN; everything else = US', () => {
    expect(regionFromTimezone('Asia/Kolkata')).toBe('IN')
    expect(regionFromTimezone('Asia/Calcutta')).toBe('IN')
    expect(regionFromTimezone(null)).toBe('IN')
    expect(regionFromTimezone('America/Los_Angeles')).toBe('US')
    expect(regionFromTimezone('Europe/London')).toBe('US')
  })
  it('category words: the head noun that ends furthest right wins; longer phrases beat shorter', () => {
    expect(categoryFromWords('paneer pakora', tables.words)?.category).toBe('generic')
    expect(categoryFromWords('aloo paratha', tables.words)?.category).toBe('stuffed_paratha')
    expect(categoryFromWords('peanut butter', tables.words)?.category).toBe('spread')
    expect(categoryFromWords('egg curry', tables.words)?.category).toBe('liquid_dish')
    expect(categoryFromWords('rice with dal', tables.words)?.category).toBe('cooked_rice')   // cut at "with"
  })
  it('cooking fat: only for a dish split into raw parts; restaurant with no word = heavy; recipe rows never', () => {
    const raw = { recipe_fat: false }
    expect(cookingFatGrams([{ cooking_fat: 'normal', context: null, servings: 1, ...raw }], 1)).toBe(0)
    expect(cookingFatGrams([{ cooking_fat: 'light', context: null, servings: 1, ...raw }, { cooking_fat: null, context: null, servings: 1, ...raw }], 2)).toBe(2.5)
    expect(cookingFatGrams([{ cooking_fat: null, context: 'restaurant', servings: 2, ...raw }], 3)).toBe(20)
    expect(cookingFatGrams([{ cooking_fat: 'none', context: 'restaurant', servings: 1, ...raw }], 2)).toBe(0)
    // a whole-dish row (recipe fat included) or an unknown one: never a line, so "kam tel sabzi + roti" adds nothing
    expect(cookingFatGrams([{ cooking_fat: 'light', context: null, servings: 1, recipe_fat: true }], 2)).toBe(0)
    expect(cookingFatGrams([{ cooking_fat: 'heavy', context: 'restaurant', servings: 1 }], 2)).toBe(0)
  })
})
