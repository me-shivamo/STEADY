import { correctPortionFromMeasures } from '../../supabase/functions/_shared/macroResolver'

// USDA-shaped portion lists, as stored on food_items.portions (migration 023).
const CEREAL = [
  { description: '1 cup', gramWeight: 30 },
  { description: '1 oz', gramWeight: 28.4 },
]
const SAMOSA = [{ description: '1 piece', gramWeight: 50 }]
const RICE = [{ description: '1 cup', gramWeight: 160 }]

describe('correctPortionFromMeasures', () => {
  it('maps "a bowl" onto USDA\'s cup measure', () => {
    // The bug this exists for: a bowl of dry cereal was being logged at 150g
    // (a bowl-of-cooked-rice weight) instead of ~30g.
    expect(correctPortionFromMeasures('a bowl', CEREAL)).toBe(30)
  })

  it('multiplies by an explicit count', () => {
    expect(correctPortionFromMeasures('2 pieces', SAMOSA)).toBe(100)
    expect(correctPortionFromMeasures('3 cups', RICE)).toBe(480)
  })

  it('handles fractional portions', () => {
    expect(correctPortionFromMeasures('half a cup', RICE)).toBe(80)
  })

  it('treats "a"/"an"/"one" as a count of 1', () => {
    expect(correctPortionFromMeasures('a cup', RICE)).toBe(160)
    expect(correctPortionFromMeasures('one bowl', CEREAL)).toBe(30)
  })

  it('never overrides an explicit weight or volume the user gave', () => {
    // If someone weighed their food, that beats any table lookup.
    expect(correctPortionFromMeasures('100g', RICE)).toBeNull()
    expect(correctPortionFromMeasures('250 ml', RICE)).toBeNull()
    expect(correctPortionFromMeasures('2 cups (500g)', RICE)).toBeNull()
  })

  it('returns null when no portion data is available', () => {
    expect(correctPortionFromMeasures('a bowl', [])).toBeNull()
    expect(correctPortionFromMeasures('a bowl', null)).toBeNull()
    expect(correctPortionFromMeasures('a bowl', undefined)).toBeNull()
  })

  it('returns null when the unit does not match any published measure', () => {
    // "a handful" has no USDA equivalent — better to keep the original estimate
    // than to invent a mapping.
    expect(correctPortionFromMeasures('a handful', CEREAL)).toBeNull()
    // cereal has no "piece" measure
    expect(correctPortionFromMeasures('2 pieces', CEREAL)).toBeNull()
  })

  it('normalises measures whose own amount is not 1', () => {
    // USDA publishes cereal as "1.5 cup (1 NLEA serving) = 32g". Treating that
    // as "1 cup = 32g" would inflate every cereal portion by 50%.
    const usdaCereal = [{ description: '1.5 cup (1 NLEA serving)', gramWeight: 32 }]
    expect(correctPortionFromMeasures('a bowl', usdaCereal)).toBeCloseTo(21.3, 1)
    expect(correctPortionFromMeasures('2 cups', usdaCereal)).toBeCloseTo(42.7, 1)
  })

  it('returns null when the phrase names no count at all', () => {
    expect(correctPortionFromMeasures('', CEREAL)).toBeNull()
    expect(correctPortionFromMeasures('cereal', CEREAL)).toBeNull()
  })
})
