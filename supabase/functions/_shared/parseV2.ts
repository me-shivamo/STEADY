// ── V2 parse → the resolver's ParsedFood (v1.2 Phase 5, table mode) ──────────
// One copy shared by log-food-from-text and the in-process eval (scripts/eval/run.ts),
// so the eval measures exactly what production does with a V2 parse: each food is
// validated (parseSchema.validateParsedFoodV2; a stated amount whose number is not
// in the user's own text is dropped and counted), then carries its amount as
// portion_parse. quantity_g holds only the parse's rough fallback guess (or 0): the
// portion engine decides the grams.

import type { ParsedFood } from './macroResolver.ts'
import { validateParsedFoodV2, type ParsedFoodV2 } from './parseSchema.ts'

export function v2ToParsed(f: ParsedFoodV2): ParsedFood & { prev_id?: string } {
  return {
    name: f.name,
    quantity_description: f.quantity_description,
    quantity_g: f.portion.fallback_g ?? 0,
    confidence: f.confidence,
    portion_parse: f.portion,
    cooking_fat: f.cooking_fat,
    ...(f.prev_id ? { prev_id: f.prev_id } : {}),
  }
}

// The model's foods array → validated ParsedFoods, plus how many invented stated amounts were dropped.
export function parsedFoodsFromV2(rawFoods: unknown, userText: string | null | undefined): {
  foods: Array<ParsedFood & { prev_id?: string }>
  invented: number
} {
  let invented = 0
  const foods = (Array.isArray(rawFoods) ? rawFoods : []).flatMap((raw) => {
    const v = validateParsedFoodV2(raw, userText)
    if (v.invented_stated) invented++
    return v.ok && v.food ? [v2ToParsed(v.food)] : []
  })
  return { foods, invented }
}
