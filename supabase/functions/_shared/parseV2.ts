// ── V2 parse → the resolver's ParsedFood (v1.2 Phase 5, table mode) ──────────
// One copy shared by log-food-from-text and the in-process eval (scripts/eval/run.ts),
// so the eval measures exactly what production does with a V2 parse: each food is
// validated (parseSchema.validateParsedFoodV2; a stated amount whose number is not
// in the user's own text is dropped and counted), then carries its amount as
// portion_parse. quantity_g holds only the parse's rough fallback guess (or 0): the
// portion engine decides the grams.

import type { ParsedFood } from './macroResolver.ts'
import { describePortion, validateParsedFoodV2, type ParsedFoodV2 } from './parseSchema.ts'
import { normText } from './portionText.ts'

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

// ── Splash guard ──────────────────────────────────────────────────────────────
// A splash is 30 ml: right for the milk in a chai, wrong for the milk in cereal (a full
// serving), the curd with parathas, butter, honey or jam (a spoon or less), or a whole
// "coffee with milk". The model over-applies it, and a splash it adds looks to the engine
// like an amount the user typed. Kept only for:
//   a) milk, cream or creamer logged as its own food beside tea, chai or coffee
//   b) a drink where the user typed "splash" or "dash" ("whisky with a splash of soda")
// Anything else gets no unit (its usual serving, and the app can ask); "thoda", "thodi" or
// "a little" makes that serving small.
// milk, cream or creamer as the food's last word ("oat milk", "doodh", "fresh cream")
const ADDITIVE_HEADS: ReadonlySet<string> = new Set(['milk', 'doodh', 'dudh', 'cream', 'creamer', 'malai'])
const HOT_DRINK = /\b(tea|chai|chay|coffee|kaapi|kapi|espresso|latte|cappuccino|americano|macchiato|mocha|cortado|kahwa)\b/
// a food whose own name is the drink ("masala chai", "protein shake"): a splash on it is never its amount
const DRINK_ITSELF = /\b(tea|chai|chay|coffee|kaapi|kapi|espresso|latte|cappuccino|americano|macchiato|mocha|cortado|kahwa|shake|milkshake|smoothie|lassi|frappe|frappuccino|cocoa|chocolate)\b/
// liquids a user may pour by the splash or dash
const POURABLE = /\b(milk|doodh|dudh|cream|creamer|malai|water|soda|tonic|juice|whisky|whiskey|rum|vodka|gin|brandy|tequila|wine|beer|liqueur|vermouth|bitters)\b/
const TYPED_SPLASH = /\b(splash|splashes|dash|dashes)\b/
const LITTLE = /\b(thoda|thodi|a little)\b/

function keepsSplash(name: string, others: string[], text: string): boolean {
  const n = normText(name).replace(/\bhalf and half\b/g, 'creamer')
  const toks = n.split(' ').filter(Boolean)
  if (toks.includes('with') || toks.includes('and')) return false   // a whole "coffee with milk" or "cornflakes with milk"
  if (DRINK_ITSELF.test(n)) return false
  const additive = ADDITIVE_HEADS.has(toks[toks.length - 1] ?? '') && !toks.includes('ice') && !toks.includes('sour')
  if (additive && (others.some((o) => HOT_DRINK.test(normText(o))) || HOT_DRINK.test(text))) return true
  return POURABLE.test(n) && TYPED_SPLASH.test(text)
}

function guardSplash(f: ParsedFoodV2, others: string[], userText: string | null | undefined): ParsedFoodV2 {
  if (f.portion.unit !== 'splash') return f
  const text = normText(userText ?? '')
  if (keepsSplash(f.name, others, text)) return f
  // "thoda chawal": the model's word, or (with no word) the user's text, says the serving is small
  const little = LITTLE.test(f.unit_word ? normText(f.unit_word) : text)
  const portion = { ...f.portion, unit: null, size: f.portion.size ?? (little ? 'S' as const : null) }
  return { ...f, portion, quantity_description: describePortion(portion, f.name, f.unit_word) }
}

// The model's foods array → validated ParsedFoods, plus how many invented stated amounts were dropped.
export function parsedFoodsFromV2(rawFoods: unknown, userText: string | null | undefined): {
  foods: Array<ParsedFood & { prev_id?: string }>
  invented: number
} {
  let invented = 0
  const valid = (Array.isArray(rawFoods) ? rawFoods : []).flatMap((raw) => {
    const v = validateParsedFoodV2(raw, userText)
    if (v.invented_stated) invented++
    return v.ok && v.food ? [v.food] : []
  })
  const foods = valid.map((f, i) => v2ToParsed(guardSplash(f, valid.filter((_, j) => j !== i).map((o) => o.name), userText)))
  return { foods, invented }
}
