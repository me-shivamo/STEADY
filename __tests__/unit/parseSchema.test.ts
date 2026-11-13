import { SYSTEM_PROMPT, SYSTEM_PROMPT_V2, editInstructionV2 } from '../../supabase/functions/_shared/foodParsePrompt'
import { PHOTO_PROMPT_V1, PHOTO_PROMPT_V2 } from '../../supabase/functions/_shared/photoPrompt'
import {
  PARSE_SCHEMA_V2, describePortion, numbersInText, validateParsedFoodV2,
} from '../../supabase/functions/_shared/parseSchema'

// Spec (c): the V2 parse contract and its validator.

const GRAM_ANCHOR = /\d+\s?(g|gm|grams?|ml)\b/

describe('V2 prompts carry no gram or ml anchors', () => {
  it.each([['SYSTEM_PROMPT_V2', SYSTEM_PROMPT_V2], ['PHOTO_PROMPT_V2', PHOTO_PROMPT_V2], ['edit instruction', editInstructionV2('- [p1] "Dal"')]])('%s', (_n, text) => {
    expect(text).not.toMatch(GRAM_ANCHOR)
    expect(text).not.toContain('Gram estimation reference')
  })
  it('the V1 prompts still do (they are untouched)', () => {
    expect(SYSTEM_PROMPT).toMatch(GRAM_ANCHOR)
    expect(PHOTO_PROMPT_V1).toMatch(GRAM_ANCHOR)
  })
  it('V2 keeps the agent: coaching, tools and language rules are the V1 text', () => {
    const coaching = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('── COACHING')).replace('"log 500ml water"', '"log a litre of water"')
      .replace(`"you're 40g short on protein"`, `"you're forty grams short on protein"`)
    expect(SYSTEM_PROMPT_V2.endsWith(coaching)).toBe(true)
    expect(SYSTEM_PROMPT_V2.startsWith(SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf('── FOOD LOGGING')))).toBe(true)
  })
  it('V2 drops "break compound foods into components" and names the dish-split rule', () => {
    expect(SYSTEM_PROMPT_V2).not.toMatch(/break compound foods/i)
    expect(SYSTEM_PROMPT_V2).toMatch(/Log a named dish as ONE food/)
    expect(SYSTEM_PROMPT_V2).toMatch(/"<curry> chawal"/)
  })
})

describe('PARSE_SCHEMA_V2 (strict json_schema)', () => {
  const food = PARSE_SCHEMA_V2.schema.properties.foods.items
  it('every property is required and no extras are allowed', () => {
    expect(food.additionalProperties).toBe(false)
    expect([...food.required].sort()).toEqual(Object.keys(food.properties).sort())
  })
  it('optional fields are nullable type arrays', () => {
    expect(food.properties.unit.type).toEqual(['string', 'null'])
    expect(food.properties.fallback_g.type).toEqual(['number', 'null'])
  })
})

describe('validateParsedFoodV2', () => {
  const base = { name: 'dal', count: 1, unit: 'katori', unit_word: null, size: null, stated_amount: null, stated_unit: null, prep: null, cooking_fat: null, context: null, fallback_g: 150, confidence: 0.9 }
  it('a clean food passes, with a code-built description', () => {
    const v = validateParsedFoodV2({ ...base, count: 2 }, '2 katori dal')
    expect(v.ok).toBe(true)
    expect(v.food).toMatchObject({ name: 'dal', quantity_description: '2 katori', portion: { count: 2, unit: 'katori', fallback_g: 150 } })
    expect(v.issues).toEqual([])
  })
  it('the user\'s word wins over the model\'s unit', () => {
    expect(validateParsedFoodV2({ ...base, unit: 'bowl', unit_word: 'vati' }, '1 vati dal').food!.portion.unit).toBe('katori')
    expect(validateParsedFoodV2({ ...base, unit: 'bowl', unit_word: 'chhoti bowl' }, '1 chhoti bowl dal').food!.portion).toMatchObject({ unit: 'bowl', size: 'S' })
    expect(validateParsedFoodV2({ ...base, unit: 'plate', unit_word: 'half plate', count: 1 }, 'half plate rajma chawal').food!.portion).toMatchObject({ unit: 'plate', count: 0.5 })
  })
  it('a stated amount survives only if its number is in the user\'s text', () => {
    const kept = validateParsedFoodV2({ ...base, unit: null, stated_amount: 250, stated_unit: 'ml' }, 'had 250ml milk')
    expect(kept.food!.portion).toMatchObject({ stated_amount: 250, stated_unit: 'ml' })
    expect(kept.invented_stated).toBe(false)
    const invented = validateParsedFoodV2({ ...base, unit: 'glass', stated_amount: 240, stated_unit: 'ml' }, 'a glass of milk')
    expect(invented.food!.portion).toMatchObject({ stated_amount: null, stated_unit: null, unit: 'glass' })
    expect(invented.invented_stated).toBe(true)
    expect(invented.issues).toContain('invented_stated')
  })
  it('tall / grande / venti become stated volumes in code (their numbers are not the user\'s)', () => {
    expect(validateParsedFoodV2({ ...base, name: 'latte', unit: null, unit_word: 'grande' }, 'grande latte').food!.portion)
      .toMatchObject({ stated_amount: 473, stated_unit: 'ml', unit: null })
  })
  it('counts: words, ranges, caps', () => {
    expect(validateParsedFoodV2({ ...base, count: 'aadha' }, 'aadha katori dal').food!.portion.count).toBe(0.5)
    expect(validateParsedFoodV2({ ...base, count: '2-3' }, '2-3 katori dal').food!.portion.count).toBe(2.5)
    expect(validateParsedFoodV2({ ...base, count: 500 }, 'x').food!.portion.count).toBe(50)
    expect(validateParsedFoodV2({ ...base, count: -1 }, 'x').food!.portion.count).toBe(1)
  })
  it('unknown enums are dropped, not trusted', () => {
    const v = validateParsedFoodV2({ ...base, size: 'XL', prep: 'grilled', cooking_fat: 'lots', context: 'office' }, 'x')
    expect(v.food).toMatchObject({ prep: null, cooking_fat: null, portion: { size: null, context: null } })
    expect(v.issues).toEqual(expect.arrayContaining(['size_unknown', 'prep_unknown', 'cooking_fat_unknown', 'context_unknown']))
  })
  it('no name → not a food', () => {
    expect(validateParsedFoodV2({ ...base, name: '  ' }, 'x').ok).toBe(false)
    expect(validateParsedFoodV2(null, 'x').ok).toBe(false)
  })
  it('prev_id rides along on edits', () => {
    expect(validateParsedFoodV2({ ...base, prev_id: 'p2' }, 'x').food!.prev_id).toBe('p2')
  })
})

describe('describePortion (quantity_description, which entryQuantityLabel prints)', () => {
  const p = (x: object) => ({ count: 1, unit: null, size: null, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...x }) as never
  it.each([
    [p({ count: 2, unit: 'katori' }), 'dal', '2 katori'],
    [p({ unit: 'bowl', size: 'S' }), 'dal', '1 small bowl'],
    [p({ count: 3, unit: 'piece' }), 'roti', '3 roti'],
    [p({ count: 0.5, unit: 'plate' }), 'rice', 'half plate'],
    [p({ stated_amount: 250, stated_unit: 'ml' }), 'milk', '250 ml'],
    [p({}), 'dal', '1 serving'],
  ])('%j', (portion, name, text) => expect(describePortion(portion, name)).toBe(text))
})

it('numbersInText reads the user\'s numbers', () => {
  expect(numbersInText('2 rotis, 250ml milk and 1/2 katori dal, 1,000 g')).toEqual([2, 250, 0.5, 1, 1000])
})
