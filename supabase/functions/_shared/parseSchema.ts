// ── Parse contract V2 (v1.2 Phase 5, spec (c)) ───────────────────────────────
// The V2 parse names the amount the user typed — count, unit, size, or a stated
// weight/volume — and NO grams (except fallback_g, a rough guess used only when
// no data tier answers). Code turns the amount into grams (portions.ts).
//
// Used only when the effective PORTION_MODE is 'table' (eval_only routes the
// eval account there); legacy and shadow keep the V1 prompts byte for byte.
//   log-food-from-text  SYSTEM_PROMPT_V2 (foodParsePrompt.ts) in its tool loop, then validateParsedFoodV2
//   analyze-food-photo  PHOTO_PROMPT_V2 (photoPrompt.ts) with json_object, then validateParsedFoodV2
//   log-food-v2 (Phase 8) passes PARSE_SCHEMA_V2 as response_format json_schema strict.

import {
  COUNT_WORDS, MASS_G, normalizeUnitWord, normText, parseCountToken, sizeWord, STATED_UNITS, UNITS, VOLUME_ML,
  type Size, type StatedUnit, type Unit,
} from './portionText.ts'
import { statedPerUnit, type CookingFat, type PortionParse } from './portions.ts'

export { normalizeUnitWord } from './portionText.ts'

export const PREP = ['raw', 'cooked', 'fried'] as const
export const COOKING_FAT = ['none', 'light', 'normal', 'heavy'] as const
export const CONTEXTS = ['home', 'restaurant', 'packaged'] as const

const nullable = (t: string | string[], extra: Record<string, unknown> = {}) =>
  ({ type: [...(Array.isArray(t) ? t : [t]), 'null'], ...extra })

// Strict JSON Schema: every property required, optional ones nullable.
export const PARSE_SCHEMA_V2 = {
  name: 'food_log_v2',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'meal_name', 'foods', 'coach_note'],
    properties: {
      intent: { type: 'string', enum: ['log'] },
      meal_name: { type: 'string' },
      coach_note: { type: 'string' },
      foods: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'count', 'unit', 'unit_word', 'size', 'stated_amount', 'stated_unit', 'stated_per_unit', 'prep',
            'cooking_fat', 'context', 'fallback_g', 'confidence', 'prev_id'],
          properties: {
            name: { type: 'string' },
            count: { type: 'number' },
            unit: nullable('string', { enum: [...UNITS, null] }),
            unit_word: nullable('string'),
            size: nullable('string', { enum: ['S', 'M', 'L', null] }),
            stated_amount: nullable('number'),
            stated_unit: nullable('string', { enum: [...STATED_UNITS, null] }),
            stated_per_unit: nullable('boolean'),
            prep: nullable('string', { enum: [...PREP, null] }),
            cooking_fat: nullable('string', { enum: [...COOKING_FAT, null] }),
            context: nullable('string', { enum: [...CONTEXTS, null] }),
            fallback_g: nullable('number'),
            confidence: { type: 'number' },
            prev_id: nullable('string'),
          },
        },
      },
    },
  },
} as const

export interface ParsedFoodV2 {
  name: string
  portion: PortionParse
  unit_word: string | null
  prep: typeof PREP[number] | null
  cooking_fat: CookingFat | null
  confidence: number
  prev_id?: string
  quantity_description: string   // built in code: "2 katori", "1 small bowl", "3 roti", "250 ml"
}

export interface V2Validation {
  ok: boolean
  food?: ParsedFoodV2
  issues: string[]          // what was repaired or dropped (counts only go to logs)
  invented_stated: boolean  // a stated amount whose number is not in the user's text was dropped
}

const COUNT_MAX = 50
const r3 = (n: number) => Math.round(n * 1000) / 1000

// Amount words, read only when a weight or volume word follows ("half litre", "aadha kilo",
// "pao kg", "dedh litre", "two kg"), so a bare "a" or "one" never vouches for a stated amount.
const AMOUNT_WORDS: ReadonlyMap<string, number> = new Map([
  ['half', 0.5], ['aadha', 0.5], ['aadhi', 0.5], ['adha', 0.5], ['adhi', 0.5],
  ['quarter', 0.25], ['pao', 0.25], ['pau', 0.25],
  ['a', 1], ['an', 1], ['one', 1], ['ek', 1], ['dedh', 1.5], ['dhai', 2.5], ['dhaai', 2.5],
  ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
])
const STATED_WORD: ReadonlyArray<[RegExp, StatedUnit]> = [
  [/^(g|gm|gms|gram|grams|gramme|grammes)$/, 'g'],
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 'kg'],
  [/^(mg|milligram|milligrams)$/, 'mg'],
  [/^(ml|mls|millilitre|millilitres|milliliter|milliliters)$/, 'ml'],
  [/^(l|ltr|ltrs|litre|litres|liter|liters)$/, 'l'],
  [/^(fl oz|floz)$/, 'fl_oz'],
  [/^(oz|ounce|ounces)$/, 'oz'],
  [/^(lb|lbs|pound|pounds)$/, 'lb'],
]
const statedWord = (w: string): StatedUnit | null => STATED_WORD.find(([rx]) => rx.test(w))?.[1] ?? null
const AMOUNT_RE = new RegExp(String.raw`(\d+(?:\.\d+)?(?:\s*/\s*\d+)?|\b(?:${[...AMOUNT_WORDS.keys()].join('|')})\b)` +
  String.raw`\s*(?:\b(?:a|an|of)\s+){0,2}(fl\.?\s?oz|[a-z]+)\b`, 'gi')

// The weights and volumes the user typed: "250ml" → 250 ml, "half litre" → 0.5 l, "1.5 kg" → 1.5 kg.
export function statedInText(text: string | null | undefined): Array<{ amount: number; unit: StatedUnit; word: boolean }> {
  if (!text) return []
  const out: Array<{ amount: number; unit: StatedUnit; word: boolean }> = []
  for (const m of text.toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2').matchAll(AMOUNT_RE)) {
    const unit = statedWord(m[2].replace(/[.\s]/g, '') === 'floz' ? 'fl oz' : m[2])
    if (!unit) continue
    const raw = m[1].replace(/\s/g, '')
    let amount: number
    if (AMOUNT_WORDS.has(raw)) amount = AMOUNT_WORDS.get(raw)!
    else if (raw.includes('/')) { const [a, b] = raw.split('/').map(Number); if (!(b > 0)) continue; amount = a / b }
    else amount = Number(raw)
    if (amount > 0) out.push({ amount, unit, word: AMOUNT_WORDS.has(raw) })
  }
  return out
}

// Every number the user typed ("2.5", "250ml", "1/2", "1,000"), as numbers, plus an amount written
// as a word before a weight or volume ("half litre" → 0.5).
export function numbersInText(text: string | null | undefined): number[] {
  if (!text) return []
  const out: number[] = []
  for (const m of text.replace(/(\d),(\d{3})\b/g, '$1$2').matchAll(/\d+(?:\.\d+)?(?:\s*\/\s*\d+)?/g)) {
    const raw = m[0].replace(/\s/g, '')
    if (raw.includes('/')) {
      const [a, b] = raw.split('/').map(Number)
      if (b > 0) out.push(a / b)
      out.push(a)
    } else out.push(Number(raw))
  }
  for (const s of statedInText(text)) if (s.word) out.push(s.amount)
  return out
}

// A stated amount is the user's when its number is in the text, or when it is the same weight or
// volume as one the user typed in another unit ("half litre" → 500 ml, "1 kg" → 1000 g).
function typedAmount(userText: string | null | undefined, amt: number, su: StatedUnit): boolean {
  if (numbersInText(userText).some((x) => Math.abs(x - amt) < 1e-9)) return true
  const base = (u: StatedUnit) => MASS_G[u] !== undefined ? ['mass', MASS_G[u]] as const : ['volume', VOLUME_ML[u]] as const
  const [kind, f] = base(su)
  return statedInText(userText).some((s) => {
    const [k2, f2] = base(s.unit)
    if (k2 !== kind || !(f > 0) || !(f2 > 0)) return false
    const a = amt * f
    const b = s.amount * f2
    return Math.abs(a - b) <= 0.01 * Math.max(a, b)
  })
}

// Does any word in the user's text name this unit ("2 scoops ice cream" → scoop)?
function textNamesUnit(userText: string | null | undefined, unit: Unit): boolean {
  if (!userText) return false
  const toks = normText(userText).split(' ').filter(Boolean)
  for (let i = 0; i < toks.length; i++) {
    for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
      if (normalizeUnitWord(toks.slice(i, i + n).join(' '))?.unit === unit) return true
    }
  }
  return false
}

// "had a lot of pasta": an amount said as a size. SIZE_WORDS (portionText.ts) is one of the 054
// generator's hashed inputs, so these whole phrases are read here, by the validator only.
const AMOUNT_SIZE: ReadonlyMap<string, Size> = new Map(
  ['a lot of', 'a lot', 'lots of', 'lots', 'plenty of', 'plenty'].map((w) => [w, 'L'] as const))
export function sizeOfWord(word: unknown): Size | null {
  return sizeWord(word) ?? (typeof word === 'string' ? AMOUNT_SIZE.get(normText(word)) ?? null : null)
}

// Units the model is not trusted to add on its own: no row means R8, which serves its own
// guess as if the user had typed the unit ("granola with yogurt" read as "1 scoop" of yogurt).
// Vessels (katori, bowl, plate) are NOT here: their rows are the founder's defaults.
const TYPED_ONLY_UNITS: ReadonlySet<Unit> = new Set(['scoop'])

function countOf(v: unknown, issues: string[]): number {
  let c: number | null = null
  if (typeof v === 'number' && Number.isFinite(v)) c = v
  else if (typeof v === 'string') c = parseCountToken(v) ?? COUNT_WORDS.get(v.trim().toLowerCase()) ?? null
  if (c === null) { if (v !== undefined && v !== null) issues.push('count_unreadable'); return 1 }
  if (!(c > 0)) { issues.push('count_not_positive'); return 1 }
  if (c > COUNT_MAX) { issues.push('count_capped'); return COUNT_MAX }
  return r3(c)
}

function fmtCount(c: number): string {
  if (c === 0.5) return 'half'
  if (c === 0.25) return 'quarter'
  return String(Math.round(c * 100) / 100)
}

const SIZE_WORD: Record<Size, string> = { S: 'small', M: 'medium', L: 'large' }

// "2 katori", "1 small bowl", "half plate", "3 roti", "250 ml", "1 serving".
export function describePortion(p: PortionParse, name: string, unitWord: string | null = null): string {
  if (p.stated_amount != null && p.stated_unit) {
    const su = p.stated_unit === 'fl_oz' ? 'fl oz' : p.stated_unit
    const amt = `${Math.round(p.stated_amount * 100) / 100} ${su}`
    return statedPerUnit(p) && p.count !== 1 ? `${fmtCount(p.count)} x ${amt}` : amt
  }
  const size = p.size ? `${SIZE_WORD[p.size]} ` : ''
  if (!p.unit || p.unit === 'serving') return `${fmtCount(p.count)} ${size}serving`.replace(/\s+/g, ' ')
  if (p.unit === 'piece' && !unitWord) return `${fmtCount(p.count)} ${size}${name}`.replace(/\s+/g, ' ').trim()
  return `${fmtCount(p.count)} ${size}${p.unit}`.replace(/\s+/g, ' ')
}

// One parsed food (V2 shape, as the model returned it) → a validated food, or
// ok:false when it has no usable name. `userText` is the message (or the photo's
// caption): a stated amount is kept only if its number appears there. `channel`
// 'photo': units come from what the model sees, so a unit is never checked
// against the caption.
export function validateParsedFoodV2(raw: unknown, userText: string | null | undefined,
  opts: { channel?: 'text' | 'photo' } = {}): V2Validation {
  const issues: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, issues: ['not_an_object'], invented_stated: false }
  const f = raw as Record<string, unknown>
  const name = typeof f.name === 'string' ? f.name.trim() : ''
  if (!name) return { ok: false, issues: ['no_name'], invented_stated: false }

  let count = countOf(f.count, issues)
  const unitWord = typeof f.unit_word === 'string' && f.unit_word.trim() ? f.unit_word.trim() : null
  // code reads the user's own word first; the model's unit only for words not in the vocabulary
  const fromWord = normalizeUnitWord(unitWord)
  let unit: Unit | null = fromWord?.unit ?? null
  if (!unit && !fromWord?.stated_amount) {
    const mu = typeof f.unit === 'string' ? (normalizeUnitWord(f.unit)?.unit ?? null) : null
    if (typeof f.unit === 'string' && !mu) issues.push('unit_unknown')
    unit = mu
  }
  // "half plate": the word carries the count. The V2 prompt also says half = count 0.5, so a model that
  // already put 0.5 in count must not be halved again (0.25 = "quarter plate"); "2 half plates" = 1.
  if (fromWord?.count != null && fromWord.count !== 1 && Math.abs(count - fromWord.count) > 1e-9) count = r3(count * fromWord.count)
  let size: Size | null = fromWord?.size ?? null
  if (!size) {
    if (f.size === 'S' || f.size === 'M' || f.size === 'L') size = f.size
    else if (typeof f.size === 'string') { size = sizeOfWord(f.size); if (!size) issues.push('size_unknown') }
  }
  // a size phrase the model filed as the unit word ("a lot of", "large") is still the user's size
  if (!size && !fromWord && unitWord) size = sizeOfWord(unitWord)
  // a unit the model may not add on its own ("1 scoop" of yogurt nobody typed): no unit, so the
  // food gets its usual serving and the app can ask
  if (unit && TYPED_ONLY_UNITS.has(unit) && opts.channel !== 'photo' && !textNamesUnit(userText, unit)) {
    unit = null
    issues.push('invented_unit')
  }

  // stated amounts: only the user's own numbers survive
  let stated_amount: number | null = null
  let stated_unit: StatedUnit | null = null
  let stated_per_unit: boolean | null = typeof f.stated_per_unit === 'boolean' ? f.stated_per_unit : null
  let invented = false
  if (fromWord?.stated_amount) {
    stated_amount = fromWord.stated_amount            // tall / grande / venti: code's constant, per drink
    stated_unit = fromWord.stated_unit
    stated_per_unit = true                            // "2 grande lattes" = 2 x 473 ml
  } else if (f.stated_amount != null || f.stated_unit != null) {
    const amt = typeof f.stated_amount === 'number' ? f.stated_amount : Number(f.stated_amount)
    const su = typeof f.stated_unit === 'string' ? f.stated_unit.toLowerCase().replace(/\s|\./g, '').replace(/^floz$/, 'fl_oz') : ''
    const okUnit = (STATED_UNITS as readonly string[]).includes(su)
    if (Number.isFinite(amt) && amt > 0 && okUnit) {
      if (typedAmount(userText, amt, su as StatedUnit)) {
        stated_amount = amt
        stated_unit = su as StatedUnit
      } else if (Math.abs(count - 1) > 1e-9 && typedAmount(userText, amt * count, su as StatedUnit)) {
        // "half litre" read as count 0.5 x 1 l: the user's amount once the count is applied
        stated_amount = amt
        stated_unit = su as StatedUnit
        stated_per_unit = true
      } else {
        invented = true
        issues.push('invented_stated')
      }
    } else issues.push('stated_unreadable')
  }

  const pick = <T extends string>(v: unknown, allowed: readonly T[], issue: string): T | null => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v.toLowerCase())) return v.toLowerCase() as T
    issues.push(issue)
    return null
  }
  const prep = pick(f.prep, PREP, 'prep_unknown')
  const cooking_fat = pick(f.cooking_fat, COOKING_FAT, 'cooking_fat_unknown')
  const context = pick(f.context, CONTEXTS, 'context_unknown')
  let fallback_g: number | null = null
  if (f.fallback_g != null) {
    const fb = Number(f.fallback_g)
    if (Number.isFinite(fb) && fb > 0) fallback_g = Math.min(fb, 10000)
    else issues.push('fallback_unreadable')
  }
  let confidence = typeof f.confidence === 'number' && Number.isFinite(f.confidence) ? f.confidence : 0.7
  if (confidence < 0 || confidence > 1) { issues.push('confidence_clamped'); confidence = Math.max(0, Math.min(1, confidence)) }

  if (stated_amount === null) stated_per_unit = null
  // A count other than 1 with no unit and no stated amount is a count of the food itself ("a third"
  // of a pizza, "2 samosas"): a piece. With no unit the engine would scale its serving unit (one
  // slice) instead. "serving" and tall/grande keep their meaning.
  if (unit === null && stated_amount === null && Math.abs(count - 1) > 1e-9) {
    unit = 'piece'
    issues.push('count_without_unit')
  }
  const portion: PortionParse = { count, unit, size, stated_amount, stated_unit, stated_per_unit, context, fallback_g }
  const food: ParsedFoodV2 = {
    name, portion, unit_word: unitWord, prep, cooking_fat, confidence,
    quantity_description: describePortion(portion, name, unitWord),
    ...(typeof f.prev_id === 'string' && f.prev_id.trim() ? { prev_id: f.prev_id.trim() } : {}),
  }
  return { ok: true, food, issues, invented_stated: invented }
}
