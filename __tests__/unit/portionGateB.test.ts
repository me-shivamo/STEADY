import { buildSeed, engineTables } from '../../scripts/portions/lib'
import { SYSTEM_PROMPT_V2 } from '../../supabase/functions/_shared/foodParsePrompt'
import { weighFoods, type PortionContext } from '../../supabase/functions/_shared/macroResolver'
import { numbersInText, sizeOfWord, statedInText, validateParsedFoodV2 } from '../../supabase/functions/_shared/parseSchema'
import { parsedFoodsFromV2 } from '../../supabase/functions/_shared/parseV2'
import { computePortionGuarded, pieceIsServing } from '../../supabase/functions/_shared/portionGuards'
import { computePortion, type EngineInput, type PortionParse } from '../../supabase/functions/_shared/portions'
import { clearPortionCache } from '../../supabase/functions/_shared/portionStore'
import { portionFake } from '../../test-utils/portionFake'

// The Gate B diagnosis fixes (docs/testing/gate-b-diagnosis-2026-11-17.md, section 4, steps 1 and 2):
// code guards on the parse and on the engine's input, and the V2 prompt revision. No portion value changes.

const { tables, foodRows } = engineTables(buildSeed())
const P = (count: number, unit: PortionParse['unit'], size: PortionParse['size'] = null, extra: Partial<PortionParse> = {}): PortionParse =>
  ({ count, unit, size, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...extra })
const priv = (name: string) => ({ id: null, fdc_id: null, status: 'unverified', name })
const ROTI = { id: '2f9486f1-e89e-563d-9dba-dc4b9b7ee915', fdc_id: null, status: 'verified', name: 'roti' }
const RICE = { id: 'd4043769-d2f2-5413-afd8-18a21da162aa', fdc_id: 168930, status: 'verified', name: 'cooked white rice' }
const input = (parse: PortionParse, phrase: string, row: EngineInput['row'] = priv(phrase), extra: Partial<EngineInput> = {}): EngineInput =>
  ({ parse, phrase, row, foodRows, region: 'IN', proposed: false, channel: 'text', ...extra })
const weigh = (parse: PortionParse, phrase: string, row: EngineInput['row'] = priv(phrase)) =>
  computePortionGuarded(tables, input(parse, phrase, row))

// the model's V2 food, with the fields every test leaves at their defaults
const raw = (name: string, count: number, unit: string | null, extra: Record<string, unknown> = {}) => ({
  name, count, unit, unit_word: null, size: null, stated_amount: null, stated_unit: null, stated_per_unit: null,
  prep: null, cooking_fat: null, context: null, fallback_g: 100, confidence: 0.9, ...extra,
})
const parsed = (foods: unknown[], text: string) => parsedFoodsFromV2(foods, text).foods
const portionOf = (foods: unknown[], text: string, name: string) => parsed(foods, text).find((f) => f.name === name)!.portion_parse!

describe('A1: a piece of a food served whole is one serving (omelette)', () => {
  it('masala omelette, 1 piece: its 125 g serving, not one egg', () => {
    expect(computePortion(tables, input(P(1, 'piece'), 'masala omelette'))!.grams).toBe(50)   // the bug: egg piece M
    const r = weigh(P(1, 'piece', null, { fallback_g: 150 }), 'masala omelette')!
    expect(r).toMatchObject({ grams: 125, portion: { source: 'serving_default' } })
    expect(pieceIsServing(tables, input(P(1, 'piece'), 'masala omelette'))).toBe(true)
  })
  it('cheese omelette, 1 piece: the omelette serving (100 g); the count and a size word still apply', () => {
    expect(weigh(P(1, 'piece'), 'cheese omelette')!.grams).toBe(100)
    expect(weigh(P(2, 'piece'), 'omelette')!.grams).toBe(200)
    expect(weigh(P(1, 'piece', 'L'), 'masala omelette')!.grams).toBe(150)
  })
  it('foods with a piece row keep the piece: eggs, roti', () => {
    expect(pieceIsServing(tables, input(P(2, 'piece'), 'boiled egg'))).toBe(false)
    expect(weigh(P(2, 'piece'), 'boiled egg')!.grams).toBe(100)
    expect(weigh(P(2, 'piece'), 'roti', ROTI)!.grams).toBe(80)
  })
  it('the user\'s own piece of omelette (memory) keeps the unit', () => {
    const memory = [{ unit: 'piece' as const, size: 'M' as const, grams: 140, origin: 'edit', at: '2026-11-01' }]
    const r = computePortionGuarded(tables, input(P(1, 'piece'), 'masala omelette', priv('masala omelette'), { memory }))!
    expect(r).toMatchObject({ grams: 140, portion: { source: 'memory' } })
  })
  it('a stated weight is never touched', () => {
    expect(weigh(P(1, 'piece', null, { stated_amount: 180, stated_unit: 'g' }), 'masala omelette')!.grams).toBe(180)
  })
  it('the resolver weighs through the guard', async () => {
    clearPortionCache()
    const TABLE: PortionContext = { mode: 'table', proposed: false, region: 'IN', channel: 'text' }
    const sb = portionFake({ foodItems: [] })
    const [w] = await weighFoods(sb.client, [{ parse: P(1, 'piece'), phrase: 'masala omelette', foodItemId: null, parseG: 150 }],
      { userId: 'user-1', portion: TABLE })
    expect(w).toMatchObject({ grams: 125, portion: { source: 'serving_default' } })
  })
})

describe('A2: a count with no unit is a count of the food (piece)', () => {
  it('"about a third" of a pizza with no unit: piece, so the engine never takes a third of one slice', () => {
    const v = validateParsedFoodV2(raw('pizza', 0.333, null, { size: 'L', fallback_g: 300 }), 'shared a large pizza, i had about a third')
    expect(v.food!.portion).toMatchObject({ count: 0.333, unit: 'piece', size: 'L' })
    expect(v.issues).toContain('count_without_unit')
    expect(weigh(v.food!.portion, 'pizza')!.grams).toBe(199.8)
  })
  it('count 1 with no unit stays a serving; "serving" and a stated amount are unchanged', () => {
    expect(validateParsedFoodV2(raw('dal', 1, null), 'dal').food!.portion.unit).toBeNull()
    expect(validateParsedFoodV2(raw('rajma', 0.5, 'serving'), 'half plate rajma chawal').food!.portion).toMatchObject({ count: 0.5, unit: 'serving' })
    expect(validateParsedFoodV2(raw('latte', 2, null, { unit_word: 'grande' }), '2 grande lattes').food!.portion)
      .toMatchObject({ count: 2, unit: null, stated_amount: 473 })
    expect(validateParsedFoodV2(raw('egg', 2, null, { stated_amount: 100, stated_unit: 'g' }), '2 eggs 100g').food!.portion)
      .toMatchObject({ count: 2, unit: null, stated_amount: 100 })
  })
})

describe('A3: a splash only where it is one', () => {
  it('milk in cereal, a smoothie or a shake gets its usual serving, not 30 ml', () => {
    const p = portionOf([raw('cornflakes', 1, 'bowl'), raw('milk', 1, 'splash')], 'a bowl of cornflakes with milk', 'milk')
    expect(p.unit).toBeNull()
    expect(weigh(p, 'milk')!.grams).toBe(180.3)
    expect(portionOf([raw('protein shake', 1, 'splash'), raw('milk', 1, 'splash')], 'a protein shake with milk', 'milk').unit).toBeNull()
  })
  it('toast with butter: 5 g; oatmeal with honey: 7.1 g; toast with jam: no splash', () => {
    const butter = portionOf([raw('toast', 1, 'slice'), raw('butter', 1, 'splash')], 'a slice of toast with butter', 'butter')
    expect(weigh(butter, 'butter')!.grams).toBe(5)
    const honey = portionOf([raw('oatmeal', 1, 'bowl'), raw('honey', 1, 'splash')], 'a bowl of oatmeal with honey', 'honey')
    expect(weigh(honey, 'honey')!.grams).toBe(7.1)
    expect(portionOf([raw('toast', 1, 'slice'), raw('jam', 1, 'splash')], 'a slice of toast with jam', 'jam').unit).toBeNull()
  })
  it('milk added to tea or coffee keeps its splash, also "thoda doodh" in chai', () => {
    expect(portionOf([raw('coffee', 1, null), raw('milk', 1, 'splash')], 'coffee with a splash of milk', 'milk').unit).toBe('splash')
    expect(portionOf([raw('chai', 1, 'cup'), raw('milk', 1, null, { unit_word: 'thoda' })], 'chai with thoda doodh', 'milk').unit).toBe('splash')
    expect(portionOf([raw('masala chai', 1, null), raw('cream', 1, 'splash')], 'masala chai with cream', 'cream').unit).toBe('splash')
  })
  it('a drink where the user typed splash or dash keeps it', () => {
    expect(portionOf([raw('whisky', 1, 'peg'), raw('soda', 1, 'splash')], 'a peg of whisky with a splash of soda', 'soda').unit).toBe('splash')
    expect(portionOf([raw('cornflakes', 1, 'bowl'), raw('milk', 1, 'splash')], 'cornflakes with a splash of milk', 'milk').unit).toBe('splash')
  })
  it('a food whose own name is the drink never keeps a splash', () => {
    expect(portionOf([raw('coffee with milk', 1, 'splash')], 'coffee with milk, no sugar', 'coffee with milk').unit).toBeNull()
    expect(portionOf([raw('protein shake', 1, 'splash')], 'a splash of protein shake', 'protein shake').unit).toBeNull()
    expect(portionOf([raw('chai', 1, 'splash')], 'a dash of chai', 'chai').unit).toBeNull()
  })
  it('"thoda chawal": rice at size S, not a 30 ml splash', () => {
    const [rice] = parsed([raw('rice', 1, null, { unit_word: 'thoda' })], 'thoda chawal')
    expect(rice.portion_parse).toMatchObject({ unit: null, size: 'S' })
    expect(rice.quantity_description).toBe('1 small serving')
    expect(weigh(rice.portion_parse!, 'rice', RICE)!.grams).toBeGreaterThan(80)
    expect(portionOf([raw('dal', 1, 'splash')], 'a little dal', 'dal').size).toBe('S')
    expect(portionOf([raw('honey', 1, 'splash')], 'a splash of honey', 'honey')).toMatchObject({ unit: null, size: null })
  })
})

describe('A4: a scoop nobody typed', () => {
  it('"granola with yogurt" read as 1 scoop of yogurt: no unit, flagged invented_unit', () => {
    const v = validateParsedFoodV2(raw('yogurt', 1, 'scoop'), 'granola with yogurt')
    expect(v.food!.portion.unit).toBeNull()
    expect(v.issues).toContain('invented_unit')
    expect(weigh(v.food!.portion, 'yogurt')!.grams).toBe(200)
  })
  it('a typed scoop stays; a photo\'s scoop is what the model saw; vessels are not checked', () => {
    expect(validateParsedFoodV2(raw('ice cream', 2, 'scoop'), '2 scoops of ice cream').food!.portion.unit).toBe('scoop')
    expect(validateParsedFoodV2(raw('whey', 1, null, { unit_word: 'scoop' }), 'one scoop whey').food!.portion.unit).toBe('scoop')
    expect(validateParsedFoodV2(raw('ice cream', 2, 'scoop'), 'dessert', { channel: 'photo' }).food!.portion.unit).toBe('scoop')
    expect(validateParsedFoodV2(raw('chutney', 1, 'katori'), 'idli with chutney').food!.portion.unit).toBe('katori')
  })
})

describe('A5: amounts written as words', () => {
  it('"half litre milk" keeps the 500 ml', () => {
    const v = validateParsedFoodV2(raw('milk', 1, null, { stated_amount: 500, stated_unit: 'ml' }), 'half litre milk')
    expect(v.food!.portion).toMatchObject({ stated_amount: 500, stated_unit: 'ml' })
    expect(v.invented_stated).toBe(false)
  })
  it('count 0.5 x 1 l (the prompt\'s own "half is a count") is the same half litre, per unit', () => {
    const v = validateParsedFoodV2(raw('milk', 0.5, null, { stated_amount: 1, stated_unit: 'l' }), 'half litre milk')
    expect(v.food!.portion).toMatchObject({ count: 0.5, stated_amount: 1, stated_unit: 'l', stated_per_unit: true })
  })
  it.each([
    ['quarter kg chicken curry', 250, 'g'], ['pao kilo paneer', 250, 'g'], ['aadha kilo dahi', 0.5, 'kg'],
    ['dedh litre chaas', 1500, 'ml'], ['dhai litre water', 2.5, 'l'], ['two kg mangoes', 2, 'kg'], ['a litre of milk', 1000, 'ml'],
    ['ek litre doodh', 1, 'l'], ['1.5 litres of water', 1500, 'ml'],
  ])('%s: %d %s is the user\'s', (text, amt, su) => {
    const v = validateParsedFoodV2(raw('x', 1, null, { stated_amount: amt, stated_unit: su }), text)
    expect(v.invented_stated).toBe(false)
    expect(v.food!.portion).toMatchObject({ stated_amount: amt, stated_unit: su })
  })
  it('a word with no weight or volume after it vouches for nothing', () => {
    expect(numbersInText('a glass of milk')).toEqual([])
    expect(validateParsedFoodV2(raw('milk', 1, 'glass', { stated_amount: 1, stated_unit: 'l' }), 'a glass of milk').invented_stated).toBe(true)
    expect(validateParsedFoodV2(raw('milk', 1, 'glass', { stated_amount: 250, stated_unit: 'ml' }), 'half a glass of milk').invented_stated).toBe(true)
  })
  it('reads the amounts', () => {
    expect(numbersInText('half litre milk and 2 rotis')).toEqual([2, 0.5])
    expect(statedInText('half a litre of milk, 250ml juice, 8 fl oz soda')).toEqual([
      { amount: 0.5, unit: 'l', word: true }, { amount: 250, unit: 'ml', word: false }, { amount: 8, unit: 'fl_oz', word: false },
    ])
  })
})

describe('size: "a lot of" is large', () => {
  it('as the size or as the unit word', () => {
    expect(['a lot of', 'lots of', 'plenty of', 'A lot'].map(sizeOfWord)).toEqual(['L', 'L', 'L', 'L'])
    expect(validateParsedFoodV2(raw('pasta', 1, null, { size: 'a lot of' }), 'had a lot of pasta').food!.portion.size).toBe('L')
    expect(validateParsedFoodV2(raw('pasta', 1, 'plate', { unit_word: 'a lot' }), 'had a lot of pasta').food!.portion.size).toBe('L')
  })
})

describe('B: the V2 prompt revision', () => {
  it('a curry with no amount has no unit; nothing adds a vessel the user did not type', () => {
    expect(SYSTEM_PROMPT_V2).toContain('the curry with count 1, unit null')
    expect(SYSTEM_PROMPT_V2).toContain('Never add a katori, bowl or plate the user did not type')
    expect(SYSTEM_PROMPT_V2).not.toMatch(/curry with count 1, unit "katori"/)
  })
  it('a splash is milk or cream in tea or coffee only', () => {
    expect(SYSTEM_PROMPT_V2).toContain('Only milk or cream added to tea or coffee is a "splash"')
    expect(SYSTEM_PROMPT_V2).not.toContain('A drink additive ("coffee with milk", "chai with thoda doodh") is its own food with unit "splash"')
  })
  it('"a lot of" is L; a size word inside a product name is not a size', () => {
    expect(SYSTEM_PROMPT_V2).toContain('"a lot of", "lots of" or "plenty of" = L')
    expect(SYSTEM_PROMPT_V2).toMatch(/part of a product's name .* is not a size: null/)
  })
})
