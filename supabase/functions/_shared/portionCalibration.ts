// ── Personal calibration from the user's own words (founder 2026-11-13, spec k16) ──
// "my cup is 350 ml", "I drink 350 ml of milk in one cup", "my katori is small",
// "my dal katori is 200 g", "meri katori 200 ml ki hai" → a calibration to store;
// "forget my cup size" → undo; "what are my portion sizes" → list.
// Deterministic and narrow on purpose: a statement must name the user's own unit
// ("my …") AND a number with a unit or a size word, so a food log ("my lunch was
// 2 rotis") never matches and keeps going to the parse model. Pure; jest-tested.

import { normalizeUnitWord, SIZE_WORDS, type Size, type StatedUnit, type Unit } from './portionText.ts'
import { categoryFromWords, type CategoryWord } from './portions.ts'

export type CalibrationIntent =
  | {
      kind: 'set'
      unit: Unit
      size: Size              // 'M' = the unsized unit ("my cup")
      grams: number | null
      ml: number | null
      as_size: Size | null    // "my katori is small"
      foodPhrase: string | null
      pieceOfFood: boolean    // "my roti is 50 g": the unit is a piece of the named food
    }
  | { kind: 'revoke'; unit: Unit | null; all: boolean; foodPhrase: string | null }   // "forget my chai cup size": chai only
  | { kind: 'list' }

const NUM = String.raw`(\d+(?:\.\d+)?)`
const AMOUNT_UNIT = String.raw`(ml|millilitres?|milliliters?|l|ltr|litres?|liters?|g|gm|gms|grams?|kg|kgs|oz|fl ?oz)`
const OWNER = String.raw`(?:my|meri|mera|hamari|hamara)`
const COPULA = String.raw`(?:is|=|holds|measures|weighs|is about|is around|is approx|is approximately|is roughly|comes to|is like)`
const HEDGE = String.raw`(?:about |around |approx |approximately |roughly |nearly |almost )?`
const SIZE_ADJ = String.raw`(small|big|large|medium|regular|normal|chhoti|chhota|choti|chota|badi|bada|mini)`

function amountUnit(raw: string): { kind: 'g' | 'ml'; factor: number } | null {
  const u = raw.replace(/\s/g, '')
  if (/^(ml|millilitres?|milliliters?)$/.test(u)) return { kind: 'ml', factor: 1 }
  if (/^(l|ltr|litres?|liters?)$/.test(u)) return { kind: 'ml', factor: 1000 }
  if (u === 'floz') return { kind: 'ml', factor: 29.5735 }
  if (/^(g|gm|gms|grams?)$/.test(u)) return { kind: 'g', factor: 1 }
  if (/^(kg|kgs)$/.test(u)) return { kind: 'g', factor: 1000 }
  if (u === 'oz') return { kind: 'g', factor: 28.3495 }
  return null
}

// "small dal katori", "katori of dal", "chai cup" → unit, size, food words.
function readUnitPhrase(phrase: string): { unit: Unit; size: Size | null; food: string | null } | null {
  const toks = phrase.split(' ').filter(Boolean)
  for (let n = Math.min(3, toks.length); n >= 1; n--) {
    for (let i = 0; i + n <= toks.length; i++) {
      const w = normalizeUnitWord(toks.slice(i, i + n).join(' '))
      if (!w?.unit) continue
      let size: Size | null = w.size
      const before = toks.slice(0, i).filter((t) => {
        const s = SIZE_WORDS.get(t)
        if (s) { size = size ?? s; return false }
        return true
      })
      let after = toks.slice(i + n)
      if (after[0] === 'of' || after[0] === 'for' || after[0] === 'ka' || after[0] === 'ki') after = after.slice(1)
      const food = [...before, ...after].join(' ').trim()
      return { unit: w.unit, size, food: food || null }
    }
  }
  return null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function parseCalibrationStatement(text: unknown): CalibrationIntent | null {
  if (typeof text !== 'string') return null
  // normText, but a decimal point between digits survives ("1.5 l")
  const s = text.toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length === 0 || s.length > 140) return null

  // list
  if (/^(what|show|list|tell me|which)\b.*\bmy (portion|serving|unit|cup|katori|bowl|glass|spoon|plate|mug)s? ?(sizes?|settings?|measures?|calibrations?)\b/.test(s) ||
      /^(what|show|list)\b.*\bmy (portion|serving) (sizes?|settings?)$/.test(s) || /^my portion (sizes|settings)$/.test(s)) {
    return { kind: 'list' }
  }
  // revoke
  let m = /^(?:please )?(?:forget|reset|undo|delete|remove|clear)(?: all)?(?: of)? my (.+?)(?: (?:size|sizes|setting|settings|calibration|calibrations|measure|measures))?$/.exec(s)
  if (m) {
    const what = m[1].trim()
    if (/^(portion|portions|portion size|serving|servings|unit|units|measure|measures|measurement|measurements|calibration|calibrations|size)s?$/.test(what) ||
        /^(portion|serving) (sizes|settings)$/.test(what)) return { kind: 'revoke', unit: null, all: true, foodPhrase: null }
    const u = readUnitPhrase(what)
    return u ? { kind: 'revoke', unit: u.unit, all: false, foodPhrase: u.food } : null
  }
  // "I drink 350 ml of milk in one cup"
  // Habitual only: "in one / each / every <unit>" or "per <unit>"; "in a <unit>" needs usually/always/…
  // ("I have 200 g rice in a bowl" is a log, not a statement about the bowl).
  const h = new RegExp(String.raw`^(?:i|we) (usually |normally |always |generally |mostly )?(?:drink|eat|have|take|pour|use|fill|get) ${HEDGE}${NUM} ?${AMOUNT_UNIT}(?: of)?(?: (.+?))? (?:(?:in|per) (one|1|each|every|a) |per )(.+)$`).exec(s)
  if (h && !(h[5] === 'a' && !h[1])) {
    const [, , num, unitRaw, foodRaw, , vessel] = h
    const au = amountUnit(unitRaw)
    const u = readUnitPhrase(vessel)
    if (!au || !u) return null
    const amount = r2(parseFloat(num) * au.factor)
    const food = [foodRaw?.trim(), u.food].filter(Boolean).join(' ') || null
    return { kind: 'set', unit: u.unit, size: u.size ?? 'M', grams: au.kind === 'g' ? amount : null, ml: au.kind === 'ml' ? amount : null, as_size: null, foodPhrase: food, pieceOfFood: false }
  }
  // "my cup is 350 ml", "my dal katori is 200 g", "meri katori 200 ml ki hai", "my roti is 50 g"
  m = new RegExp(String.raw`^${OWNER} (.+?) (?:${COPULA} )?${HEDGE}${NUM} ?${AMOUNT_UNIT}(?: (?:ka|ki|ke) hai| hai| only| each)?$`).exec(s)
  if (m) {
    const au = amountUnit(m[3])
    if (!au) return null
    const amount = r2(parseFloat(m[2]) * au.factor)
    const phrase = m[1].replace(/ (?:is|=|holds|measures|weighs)$/, '').trim()
    const u = readUnitPhrase(phrase)
    if (u) {
      return { kind: 'set', unit: u.unit, size: u.size ?? 'M', grams: au.kind === 'g' ? amount : null, ml: au.kind === 'ml' ? amount : null, as_size: null, foodPhrase: u.food, pieceOfFood: false }
    }
    // "my roti is 50 g": a piece of the named food (mass only, at most three words)
    if (au.kind === 'g' && phrase.split(' ').length <= 3) {
      return { kind: 'set', unit: 'piece', size: 'M', grams: amount, ml: null, as_size: null, foodPhrase: phrase, pieceOfFood: true }
    }
    return null
  }
  // "my katori is small", "meri katori chhoti hai", "my cup is a big one"
  m = new RegExp(String.raw`^${OWNER} (.+?) (?:is |are )?(?:a |quite |very |really |pretty |kind of )?${SIZE_ADJ}(?: one| size| sized| wala| wali| vala| vali)?(?: hai| he)?$`).exec(s)
  if (m) {
    const u = readUnitPhrase(m[1].replace(/ (?:is|are)$/, ''))
    const sz = SIZE_WORDS.get(m[2])
    if (!u || !sz || u.size) return null
    return { kind: 'set', unit: u.unit, size: 'M', grams: null, ml: null, as_size: sz, foodPhrase: u.food, pieceOfFood: false }
  }
  return null
}

// Where a statement applies: no food words → every food; food words that name a
// portion category ("milk", "dal", "chai") → that category. Anything else needs a
// food row the caller looks up (scope food), or the statement is not stored.
export function calibrationScopeFromWords(
  foodPhrase: string | null,
  words: CategoryWord[],
): { scope: 'any' } | { scope: 'category'; category: string } | { scope: 'needs_food'; phrase: string } {
  if (!foodPhrase) return { scope: 'any' }
  const hit = categoryFromWords(foodPhrase, words)
  if (hit && hit.category !== 'generic') return { scope: 'category', category: hit.category }
  return { scope: 'needs_food', phrase: foodPhrase }
}

const SIZE_TEXT: Record<Size, string> = { S: 'small', M: 'medium', L: 'large' }
const fmt = (n: number) => String(Math.round(n * 10) / 10)

export function describeCalibration(c: { unit: string; size?: string | null; grams?: number | null; ml?: number | null; as_size?: string | null; category?: string | null; food_name?: string | null }): string {
  const sized = c.size && c.size !== 'M' ? `${SIZE_TEXT[c.size as Size]} ${c.unit}` : c.unit
  const where = c.food_name ? ` (for ${c.food_name})` : c.category ? ` (for ${c.category.replace(/_/g, ' ')})` : ''
  if (c.as_size) return `${c.unit} = ${SIZE_TEXT[c.as_size as Size]}${where}`
  if (c.ml != null) return `${sized} = ${fmt(c.ml)} ml${where}`
  return `${sized} = ${fmt(Number(c.grams))} g${where}`
}

export function calibrationSavedReply(desc: string, unit: string, foodWord: string | null = null): string {
  return `Got it — from now on I'll use your ${desc}. Say "forget my ${foodWord ? `${foodWord} ` : ''}${unit} size" to undo it.`
}
// What an edit taught us, said in the edit's reply (founder k16: visible and undoable).
export function calibrationLearnedNote(descs: string[], undo: string): string {
  return `I'll remember ${descs.join('; ')} for next time — say "forget my ${undo} size" to undo.`
}
export function calibrationListReply(descs: string[]): string {
  return descs.length
    ? `Your portion sizes: ${descs.join('; ')}. Say "forget my <unit> size" to undo one.`
    : `You haven't told me any portion sizes yet — for example, "my cup is 350 ml" or "my katori is small".`
}
export function calibrationRevokedReply(n: number, unit: string | null, where: string | null = null): string {
  const what = unit ? `${unit} size${where ? ` for ${where}` : ''}` : null
  if (n === 0) return what ? `I didn't have a ${what} saved for you.` : `You didn't have any portion sizes saved.`
  if (!what) return `Done — I've forgotten all ${n} of your portion sizes.`
  return n === 1
    ? `Done — I've forgotten your ${what} and will use the standard one again.`
    : `Done — I've forgotten ${n} saved ${unit} sizes${where ? ` for ${where}` : ''} and will use the standard ones again.`
}
// A statement whose weight per unit is outside the R8 bounds (a typo, "my spoon is 500 g"): not saved.
export function calibrationImplausibleReply(desc: string, unit: string, lo: number, hi: number): string {
  return `That seems unusual for one ${unit} (I'd expect about ${lo}–${hi} g), so I haven't saved "${desc}". ` +
    `If it's right, tell me the weight of one ${unit} in grams.`
}
export function calibrationUnmatchedReply(phrase: string): string {
  return `I couldn't match "${phrase}" to a food yet, so I haven't saved that size. Log it once, then tell me again.`
}

// Stated value as stored: grams or ml.
export type StatedKind = Extract<StatedUnit, 'g' | 'ml'>
