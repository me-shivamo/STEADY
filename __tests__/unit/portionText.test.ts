import { normalizeName } from '../../supabase/functions/_shared/macroResolver'
import {
  classifyMeasure, normalizeUnitWord, normText, parseCountToken, portionFromDescription,
} from '../../supabase/functions/_shared/portionText'

// Spec (c) "Word-to-unit mapping", count words, ranges, and the USDA measure
// texts the 054 fold-in and the 056 import classify.

describe('normalizeUnitWord: every row of the mapping table', () => {
  const rows: Array<[string, Partial<ReturnType<typeof normalizeUnitWord>>]> = [
    ['katori', { unit: 'katori' }], ['Katoriyan', { unit: 'katori' }], ['vati', { unit: 'katori' }], ['wati', { unit: 'katori' }],
    ['small bowl', { unit: 'bowl', size: 'S' }], ['chhoti bowl', { unit: 'bowl', size: 'S' }],
    ['bowl', { unit: 'bowl', size: null }], ['katora', { unit: 'bowl' }],
    ['plate', { unit: 'plate' }], ['thali', { unit: 'plate' }],
    ['half plate', { unit: 'plate', count: 0.5 }], ['full plate', { unit: 'plate', count: 1, size: null }],
    ['cup', { unit: 'cup' }], ['teacup', { unit: 'cup' }], ['coffee cup', { unit: 'cup' }],
    ['cutting', { unit: 'cutting' }],
    ['glass', { unit: 'glass' }], ['gilaas', { unit: 'glass' }], ['tumbler', { unit: 'glass' }],
    ['mug', { unit: 'mug' }],
    ['tbsp', { unit: 'tbsp' }], ['tablespoon', { unit: 'tbsp' }], ['tbs', { unit: 'tbsp' }], ['big spoon', { unit: 'tbsp' }],
    ['bada chamach', { unit: 'tbsp' }],
    ['tsp', { unit: 'tsp' }], ['teaspoon', { unit: 'tsp' }], ['chhota chamach', { unit: 'tsp' }],
    ['spoon', { unit: 'spoon' }], ['spoonful', { unit: 'spoon' }], ['chamach', { unit: 'spoon' }], ['chammach', { unit: 'spoon' }],
    ['slice', { unit: 'slice' }],
    ['piece', { unit: 'piece' }], ['pc', { unit: 'piece' }], ['pcs', { unit: 'piece' }], ['nos', { unit: 'piece' }],
    ['handful', { unit: 'handful' }], ['mutthi', { unit: 'handful' }], ['muthi', { unit: 'handful' }], ['fistful', { unit: 'handful' }],
    ['scoop', { unit: 'scoop' }],
    ['splash', { unit: 'splash' }], ['dash', { unit: 'splash' }], ['a little', { unit: 'splash' }],
    ['packet', { unit: 'packet' }], ['pack', { unit: 'packet' }], ['pouch', { unit: 'packet' }], ['sachet', { unit: 'packet' }], ['bag', { unit: 'packet' }],
    ['can', { unit: 'can' }], ['tin', { unit: 'can' }],
    ['bottle', { unit: 'bottle' }], ['pint', { unit: 'pint' }],
    ['peg', { unit: 'peg', size: null }], ['large peg', { unit: 'peg', size: 'L' }],
    ['shot', { unit: 'shot' }],
    ['serving', { unit: 'serving' }], ['portion', { unit: 'serving' }], ['helping', { unit: 'serving' }],
    ['small katori', { unit: 'katori', size: 'S' }], ['bada glass', { unit: 'glass', size: 'L' }], ['heaped tsp', { unit: 'tsp', size: 'L' }],
    ['tall', { unit: null, stated_amount: 354, stated_unit: 'ml' }],
    ['grande', { stated_amount: 473, stated_unit: 'ml' }],
    ['venti', { stated_amount: 591, stated_unit: 'ml' }],
  ]
  it.each(rows)('%s', (word, expected) => {
    expect(normalizeUnitWord(word)).toMatchObject(expected as object)
  })
  it('unknown words and bare size words are not units', () => {
    expect(normalizeUnitWord('ladle')).toBeNull()
    expect(normalizeUnitWord('large')).toBeNull()
    expect(normalizeUnitWord('')).toBeNull()
    expect(normalizeUnitWord(null)).toBeNull()
  })
})

describe('counts', () => {
  it.each([
    ['2', 2], ['2.5', 2.5], ['1/2', 0.5], ['1 1/2', 1.5], ['2-3', 2.5], ['2 to 3', 2.5], ['½', 0.5], ['1½', 1.5],
    ['ek', 1], ['do', 2], ['teen', 3], ['char', 4], ['paanch', 5], ['aadha', 0.5], ['half', 0.5], ['quarter', 0.25],
    ['couple', 2], ['few', 3], ['a', 1], ['an', 1], ['one', 1],
  ] as Array<[string, number]>)('%s → %d', (t, n) => expect(parseCountToken(t)).toBe(n))
})

describe('portionFromDescription (shadow mode reads the V1 quantity_description)', () => {
  it.each([
    ['2 katori', 'dal', { count: 2, unit: 'katori', size: null }],
    ['1 small bowl', 'dal', { count: 1, unit: 'bowl', size: 'S' }],
    ['half plate', 'rice', { count: 0.5, unit: 'plate' }],
    ['half a plate', 'rice', { count: 0.5, unit: 'plate' }],
    ['ek katori', 'dal', { count: 1, unit: 'katori' }],
    ['do roti', 'roti', { count: 2, unit: 'piece' }],
    ['3 rotis', 'roti', { count: 3, unit: 'piece' }],
    ['an apple', 'apple', { count: 1, unit: 'piece' }],
    ['2-3 idlis', 'idli', { count: 2.5, unit: 'piece' }],
    ['1 large glass', 'milk', { count: 1, unit: 'glass', size: 'L' }],
    ['250 ml', 'milk', { stated_amount: 250, stated_unit: 'ml', unit: null }],
    ['100g', 'paneer', { stated_amount: 100, stated_unit: 'g' }],
    ['1 cup (240ml)', 'milk', { count: 1, unit: 'cup' }],
    ['1 grande', 'latte', { stated_amount: 473, stated_unit: 'ml' }],
    ['2', 'eggs', { count: 2, unit: 'piece' }],
  ] as Array<[string, string, object]>)('%s (%s)', (desc, food, expected) => {
    expect(portionFromDescription(desc, food)).toMatchObject(expected)
  })
  it('no amount at all → null', () => {
    expect(portionFromDescription('some', 'dal')).toBeNull()
    expect(portionFromDescription('', 'dal')).toBeNull()
  })
})

describe('classifyMeasure: USDA texts', () => {
  it.each([
    // SR Legacy (amount + modifier)
    ['1 cup, chopped', 160, { unit: 'cup', size: 'M', grams: 160, ml: 240, plain: false }],
    ['1 medium (7" to 7-7/8" long)', 118, { unit: 'piece', size: 'M', grams: 118, explicitSize: true }],
    ['1 large (8" to 8-7/8" long)', 136, { unit: 'piece', size: 'L' }],
    ['1 small (6" to 6-7/8" long)', 101, { unit: 'piece', size: 'S' }],
    ['1 tbsp', 14.2, { unit: 'tbsp', grams: 14.2, ml: 15 }],
    ['1 tsp', 4.5, { unit: 'tsp', ml: 5 }],
    ['1.5 cup (1 NLEA serving)', 32, { unit: 'cup', grams: 21.33 }],
    ['3 scoop', 86, { unit: 'scoop', grams: 28.67 }],
    ['1 slice, medium (1/8" thick)', 14, { unit: 'slice', size: 'M' }],
    ['1 slice, thin', 9, { unit: 'slice', size: 'S' }],
    ['1 fl oz', 30.5, { unit: 'ml', grams: 30.5, ml: 29.57 }],
    ['1 can or bottle (12 fl oz)', 355, { unit: 'can', grams: 355 }],
    ['1 cup (8 fl oz)', 240, { unit: 'cup', ml: 240 }],
    ['1 serving 5 servings per 24.2 oz package', 143, { unit: 'serving' }],
    ['1 package (10 oz)', 284, { unit: 'packet' }],
    ['16 chips', 26, { unit: 'piece', grams: 1.63 }],
    // FNDDS portion_description
    ['Quantity not specified', 240, { unit: 'serving', isDefault: true }],
    ['1 cup', 248, { unit: 'cup' }],
    ['1 dosa', 113, { unit: 'piece' }],
    // Foundation measureUnit-style
    ['1 piece', 196, { unit: 'piece' }],
    ['1 each taco', 98, { unit: 'piece' }],
  ] as Array<[string, number, object]>)('%s = %d g', (text, g, expected) => {
    expect(classifyMeasure(text, g)).toMatchObject(expected)
  })
  it.each([
    ['1 oz', 28.35], ['3 oz', 85], ['1 bottle Gerber First Food (4 fl oz)', 125], ['1 jar', 127], ['1 RACC', 8],
    ['1 cubic inch', 17], ['1 surface inch', 3.4], ['1 extra large (9" or longer)', 152], ['1 lime yields', 44], ['1 ml', 1],
  ] as Array<[string, number]>)('not a household measure: %s', (text, g) => {
    expect(classifyMeasure(text, g)).toBeNull()
  })
  it('a missing or non-positive weight is no measure', () => {
    expect(classifyMeasure('1 cup', 0)).toBeNull()
    expect(classifyMeasure('1 cup', null)).toBeNull()
  })
})

it('normText is normalizeName (the engine keeps its own copy to stay import-free)', () => {
  for (const s of ['Dal Tadka!', '  CHAI  (masala) ', 'Aloo-Paratha', 'café latte', 'roti, 2 pcs']) {
    expect(normText(s)).toBe(normalizeName(s))
  }
})
