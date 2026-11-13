// ── Portion words → structured units (v1.2 Phase 5) ──────────────────────────
// Pure text helpers shared by the parse validator (parseSchema.ts), the portion
// engine (portions.ts), the 054 generator (scripts/portions/emit054.ts) and,
// later, the USDA import (056):
//
//   normalizeUnitWord(word)          "vati" → katori, "small bowl" → bowl S,
//                                     "half plate" → plate × 0.5, "grande" → 473 ml
//   portionFromDescription(desc)     shadow mode: a V1 quantity_description
//                                     ("2 katori", "1 small bowl", "250 ml") → a portion
//   classifyMeasure(text, grams)     a USDA / food_items portion text ("1 cup, diced",
//                                     "1 large (8\" long)") → one unit row, or null
//
// No I/O and no imports, so jest, tsx and Deno all load it as is.

export const UNITS = [
  'piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'mug', 'cutting', 'tbsp', 'tsp', 'spoon',
  'handful', 'scoop', 'splash', 'serving', 'can', 'bottle', 'packet', 'pint', 'peg', 'shot',
] as const
export type Unit = typeof UNITS[number]
// 'ml' is a density-only row in portion_units (USDA "1 fl oz"): never a parsed unit.
export type RowUnit = Unit | 'ml'
export type Size = 'S' | 'M' | 'L'
export const STATED_UNITS = ['g', 'kg', 'mg', 'oz', 'lb', 'ml', 'l', 'fl_oz'] as const
export type StatedUnit = typeof STATED_UNITS[number]

export const MASS_G: Readonly<Record<string, number>> = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 }
export const VOLUME_ML: Readonly<Record<string, number>> = { ml: 1, l: 1000, fl_oz: 29.5735 }

const isUnit = (u: unknown): u is Unit => typeof u === 'string' && (UNITS as readonly string[]).includes(u)
export { isUnit }

// Same normalization as macroResolver.normalizeName (kept local so this module
// has no imports; portionText.test.ts pins the two together).
export function normText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// ── Vocabulary (spec (c), "Word-to-unit mapping") ─────────────────────────────
// Keys are normText()ed phrases. A phrase may carry a size or a count of its own.
interface WordSense { unit?: Unit; size?: Size; count?: number; stated_amount?: number; stated_unit?: StatedUnit }

const W: Array<[string[], WordSense]> = [
  [['katori', 'katoris', 'katoriyan', 'katoriya', 'katoriyaan', 'vati', 'vatis', 'wati', 'watis'], { unit: 'katori' }],
  [['small bowl', 'small bowls', 'chhoti bowl', 'choti bowl', 'chhoti katori bowl'], { unit: 'bowl', size: 'S' }],
  [['bowl', 'bowls', 'katora', 'katore', 'katoras'], { unit: 'bowl' }],
  [['half plate', 'aadhi plate', 'adhi plate', 'aadha plate'], { unit: 'plate', count: 0.5 }],
  [['full plate', 'puri plate', 'poori plate'], { unit: 'plate', count: 1 }],
  [['plate', 'plates', 'thali', 'thalis'], { unit: 'plate' }],
  [['cup', 'cups', 'teacup', 'teacups', 'tea cup', 'tea cups', 'coffee cup', 'coffee cups', 'cuppa'], { unit: 'cup' }],
  [['cutting', 'cuttings', 'cutting chai'], { unit: 'cutting' }],
  [['glass', 'glasses', 'gilaas', 'gilas', 'glaas', 'tumbler', 'tumblers'], { unit: 'glass' }],
  [['mug', 'mugs'], { unit: 'mug' }],
  [['tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs', 'tbl', 'big spoon', 'big spoons', 'bada chamach',
    'bade chamach', 'bada chammach', 'bade chammach', 'bada chamcha'], { unit: 'tbsp' }],
  [['tsp', 'tsps', 'teaspoon', 'teaspoons', 'chhota chamach', 'chota chamach', 'chhote chamach', 'chhota chammach',
    'chota chammach'], { unit: 'tsp' }],
  [['spoon', 'spoons', 'spoonful', 'spoonfuls', 'chamach', 'chammach', 'chamche', 'chamcha', 'chamchi'], { unit: 'spoon' }],
  [['slice', 'slices'], { unit: 'slice' }],
  [['piece', 'pieces', 'pc', 'pcs', 'nos', 'pieces of'], { unit: 'piece' }],
  [['handful', 'handfuls', 'mutthi', 'muthi', 'mutthi bhar', 'muthi bhar', 'fistful', 'fistfuls'], { unit: 'handful' }],
  [['scoop', 'scoops'], { unit: 'scoop' }],
  [['splash', 'splashes', 'dash', 'dashes', 'a little', 'thoda', 'thodi', 'thoda sa', 'thodi si'], { unit: 'splash' }],
  [['packet', 'packets', 'pack', 'packs', 'pouch', 'pouches', 'sachet', 'sachets', 'bag', 'bags'], { unit: 'packet' }],
  [['can', 'cans', 'tin', 'tins'], { unit: 'can' }],
  [['bottle', 'bottles'], { unit: 'bottle' }],
  [['pint', 'pints'], { unit: 'pint' }],
  [['large peg', 'large pegs', 'patiala peg', 'patiala pegs'], { unit: 'peg', size: 'L' }],
  [['peg', 'pegs'], { unit: 'peg' }],
  [['shot', 'shots'], { unit: 'shot' }],
  [['serving', 'servings', 'portion', 'portions', 'helping', 'helpings'], { unit: 'serving' }],
  // Coffee-chain sizes are amounts, applied as stated volumes in code (the V2
  // prompt may carry no ml numbers). 12 / 16 / 20 US fl oz.
  [['tall'], { stated_amount: 354, stated_unit: 'ml' }],
  [['grande'], { stated_amount: 473, stated_unit: 'ml' }],
  [['venti'], { stated_amount: 591, stated_unit: 'ml' }],
]
const WORD_SENSE = new Map<string, WordSense>()
for (const [words, sense] of W) for (const w of words) WORD_SENSE.set(w, sense)
const MAX_PHRASE_WORDS = 3

export const SIZE_WORDS: ReadonlyMap<string, Size> = new Map([
  ...['small', 'chhota', 'chhoti', 'chota', 'choti', 'chhote', 'mini', 'thin', 'level'].map((w) => [w, 'S'] as const),
  ...['medium', 'regular', 'normal'].map((w) => [w, 'M'] as const),
  ...['large', 'big', 'bada', 'badi', 'bade', 'heaped', 'heaping', 'thick'].map((w) => [w, 'L'] as const),
])

export const COUNT_WORDS: ReadonlyMap<string, number> = new Map([
  ['a', 1], ['an', 1], ['one', 1], ['ek', 1], ['single', 1],
  ['two', 2], ['do', 2], ['couple', 2], ['three', 3], ['teen', 3], ['few', 3], ['four', 4], ['char', 4], ['chaar', 4],
  ['five', 5], ['paanch', 5], ['panch', 5], ['six', 6], ['chhe', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['half', 0.5], ['aadha', 0.5], ['aadhi', 0.5], ['adha', 0.5], ['adhi', 0.5], ['quarter', 0.25], ['dedh', 1.5], ['dhai', 2.5],
])

export interface UnitWordResult {
  unit: Unit | null
  size: Size | null
  count: number | null           // only when the word itself carries one ("half plate")
  stated_amount: number | null   // only for tall / grande / venti
  stated_unit: StatedUnit | null
}

// A user's unit word, verbatim from the parse ("vati", "chhoti bowl", "bada
// chamach", "large peg", "grande") → the unit, plus any size or count the word
// itself carries. Leading size words are read too ("small katori"). null when
// the word is not in the vocabulary (the model's own `unit` is then used).
export function normalizeUnitWord(word: unknown): UnitWordResult | null {
  if (typeof word !== 'string') return null
  const toks = normText(word).split(' ').filter((t) => t !== '' && t !== 'of')
  if (toks.length === 0) return null
  let size: Size | null = null
  // the whole phrase first ("small bowl" is its own entry), then size words + rest
  for (let start = 0; start < toks.length; start++) {
    const rest = toks.slice(start).join(' ')
    const sense = WORD_SENSE.get(rest)
    if (sense) {
      return {
        unit: sense.unit ?? null,
        size: sense.size ?? size,
        count: sense.count ?? null,
        stated_amount: sense.stated_amount ?? null,
        stated_unit: sense.stated_unit ?? null,
      }
    }
    const sz = SIZE_WORDS.get(toks[start])
    if (sz === undefined) break
    size = sz
  }
  // A single-word size alone ("large") is not a unit.
  return null
}

export function sizeWord(word: unknown): Size | null {
  return typeof word === 'string' ? SIZE_WORDS.get(normText(word)) ?? null : null
}

// "2", "2.5", "1/2", "1 1/2", "2-3" (midpoint), "½", count words. null = no count.
export function parseCountToken(s: string): number | null {
  const t = s.trim().toLowerCase()
  let m = /^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/.exec(t)
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10)
  m = /^(\d+)\/(\d+)$/.exec(t)
  if (m) return parseInt(m[2], 10) > 0 ? parseInt(m[1], 10) / parseInt(m[2], 10) : null
  m = /^(\d+)?\s*½$/.exec(t)
  if (m) return (m[1] ? parseInt(m[1], 10) : 0) + 0.5
  m = /^\d+(?:\.\d+)?$/.exec(t)
  if (m) return parseFloat(t)
  return COUNT_WORDS.get(t) ?? null
}

// ── Shadow mode: a V1 quantity_description → a portion ───────────────────────
export interface DescribedPortion {
  count: number
  unit: Unit | null
  size: Size | null
  stated_amount: number | null
  stated_unit: StatedUnit | null
}

const STATED_RE = /(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|kilos?|g|gm|gms|grams?|mg|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|fl\.?\s?oz|oz|ounces?|lbs?|pounds?)\b/i

function statedUnitOf(raw: string): StatedUnit | null {
  const u = raw.toLowerCase().replace(/\s|\./g, '')
  if (/^(kgs?|kilograms?|kilos?)$/.test(u)) return 'kg'
  if (/^(g|gm|gms|grams?)$/.test(u)) return 'g'
  if (u === 'mg') return 'mg'
  if (/^(ml|millilit(re|er)s?)$/.test(u)) return 'ml'
  if (/^(l|lit(re|er)s?)$/.test(u)) return 'l'
  if (u === 'floz') return 'fl_oz'
  if (/^(oz|ounces?)$/.test(u)) return 'oz'
  if (/^(lbs?|pounds?)$/.test(u)) return 'lb'
  return null
}

// Reads the amount phrase the V1 parse wrote ("2 katori", "1 small bowl",
// "half plate", "3 rotis", "250 ml"). `foodName` lets a bare count of the food
// itself ("2 rotis", "an apple") read as pieces. null when it names no amount.
export function portionFromDescription(desc: unknown, foodName = ''): DescribedPortion | null {
  if (typeof desc !== 'string') return null
  let d = desc.toLowerCase().replace(/[~≈]/g, ' ').replace(/\b(about|approx\.?|approximately|around|roughly)\b/g, ' ').trim()
  if (d === '') return null
  // keep "1/2", "2-3" and "0.5" whole through normText (which drops punctuation and lowercases): "0.5 apple"
  // used to read as a count of 0
  const toks = normText(d.replace(/(\d)\s*\/\s*(\d)/g, '$1qslashq$2').replace(/(\d)\s*-\s*(\d)/g, '$1qdashq$2').replace(/(\d)\.(\d)/g, '$1qdotq$2'))
    .split(' ').map((t) => t.replace(/(\d)qslashq(\d)/g, '$1/$2').replace(/(\d)qdashq(\d)/g, '$1-$2').replace(/(\d)qdotq(\d)/g, '$1.$2')).filter((t) => t !== '')
  // leading count (also "1 1/2")
  let i = 0
  let count: number | null = null
  if (toks.length > 1 && /^\d+$/.test(toks[0]) && /^\d+\/\d+$/.test(toks[1])) { count = parseCountToken(`${toks[0]} ${toks[1]}`); i = 2 }
  else if (toks.length > 0) { const c = parseCountToken(toks[0]); if (c !== null) { count = c; i = 1 } }
  if (toks[i] === 'a' || toks[i] === 'an') i++                  // "half a plate"
  let size: Size | null = null
  while (i < toks.length && SIZE_WORDS.has(toks[i])) { size = SIZE_WORDS.get(toks[i])!; i++ }
  // longest unit phrase starting here
  for (let n = Math.min(MAX_PHRASE_WORDS, toks.length - i); n >= 1; n--) {
    const sense = WORD_SENSE.get(toks.slice(i, i + n).join(' '))
    if (sense?.unit) {
      return { count: (count ?? 1) * (sense.count ?? 1), unit: sense.unit, size: sense.size ?? size, stated_amount: null, stated_unit: null }
    }
    if (sense?.stated_amount) {
      return { count: count ?? 1, unit: null, size: null, stated_amount: sense.stated_amount, stated_unit: sense.stated_unit ?? null }
    }
  }
  // an explicit weight or volume anywhere ("250 ml", "100g", "1 cup (240ml)" was caught above)
  const sm = STATED_RE.exec(d)
  if (sm) {
    const su = statedUnitOf(sm[2])
    if (su) return { count: 1, unit: null, size: null, stated_amount: parseFloat(sm[1]), stated_unit: su }
  }
  // a bare count of the food itself: "2 rotis", "an apple", "3 eggs"
  if (count !== null && i < toks.length) {
    const head = toks[i]
    const food = normText(foodName)
    if (head.length >= 3 && (food.includes(head.slice(0, 4)) || head.includes(food.split(' ')[0]?.slice(0, 4) ?? '\u0000'))) {
      return { count, unit: 'piece', size, stated_amount: null, stated_unit: null }
    }
  }
  if (count !== null && i >= toks.length) {
    return { count, unit: 'piece', size, stated_amount: null, stated_unit: null }
  }
  return null
}

// ── USDA / food_items portion text → one unit row ────────────────────────────
// Port of the judged prototype (scratchpad usda_units.py) with three fixes found
// while reviewing the live fold-in: "extra large"/"jumbo"/"extra small" are not
// S/M/L (they would overwrite "large" = L), "yields" rows describe what is left
// of a whole food, and "surface inch" / "cubic inch" are not household measures.
export interface ClassifiedMeasure {
  unit: RowUnit
  size: Size
  grams: number          // per ONE unit
  ml: number | null      // per ONE unit, for measuring volumes (cup 240, tbsp 15, tsp 5, fl oz 29.5735)
  isDefault: boolean     // FNDDS "quantity not specified"
  plain: boolean         // no form word (chopped, diced…): preferred when two texts give the same unit+size
  explicitSize: boolean  // the text names its size ("1 medium"): preferred over "1 stick" for piece M
}

const FRAC = String.raw`(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)`
const SKIP = /gerber|beech-nut|earth.s best|heinz|\bjar\b|\bracc\b|cubic inch|surface inch|guideline amount|\byields?\b|extra large|extra small|\bjumbo\b|\bxl\b/i
const WEIGHT = new RegExp(String.raw`^\s*` + FRAC + String.raw`?\s*(oz|ounces?|lbs?|pounds?|g|grams?|kg)\b(?!.*\bcup)`, 'i')
const MEASURE_UNITS: Array<[RowUnit, RegExp]> = [
  // cup first: "1 cup (8 fl oz)" is a cup; a bare "1 fl oz" is a density-only row
  ['cup', /\bcups?\b/i],
  ['ml', /\bfl\.?\s*oz\b/i],
  ['tbsp', /\b(tbsps?|tablespoons?)\b/i],
  ['tsp', /\b(tsps?|teaspoons?)\b/i],
  ['scoop', /\bscoops?\b/i],
  ['slice', /\bslices?\b/i],
  ['can', /\bcans?\b/i],
  ['bottle', /\bbottles?\b/i],
  // serving before packet: "1 serving 5 servings per 24.2 oz package" is a serving
  ['serving', /\b(nlea serving|servings?|quantity not specified|drinks?)\b/i],
  ['packet', /\b(packets?|packages?|pack|pouch(es)?|bags?|containers?|cartons?|box(es)?|envelopes?)\b/i],
  ['piece', new RegExp(String.raw`\b(pieces?|pcs?|items?|each|bars?|cookies?|muffins?|rolls?|buns?|patt(y|ies)|links?|fillets?|breasts?|` +
    String.raw`drumsticks?|thighs?|wings?|pancakes?|tortillas?|sandwich(es)?|burritos?|tacos?|eggs?|fruits?|whole|` +
    String.raw`chap+at+is?|rotis?|naans?|idlis?|dosas?|samosas?|nuggets?|kernels?|nuts?|medium|large|small|` +
    String.raw`leg|strips?|sticks?|sausages?|biscuits?|crackers?|chips?|wafers?|wedges?|halves|half|regular|steaks?|roasts?|chops?|` +
    String.raw`miniature|sliders?|pretzels?|submarine|units?|ears?|leaf|leaves|heads?|shells?|grapes?|apples?|bananas?|onions?|` +
    String.raw`tomato(es)?|avocados?|limes?|lemons?|pizzas?|sprigs?|rings?|pats?|thin|thick|melons?|balls?|patties|stalks?)\b`, 'i')],
]
// Size words first; thin/thick only when no size word is given ("1 slice, medium
// (1/8\" thick)" is a medium slice).
const MEASURE_SIZE: Array<[Size, RegExp]> = [
  ['S', /\b(small|mini|miniature|snack.size|kids?)\b/i],
  ['L', /\b(large|big)\b/i],
  ['M', /\b(medium|regular)\b/i],
]
const MEASURE_SIZE_SHAPE: Array<[Size, RegExp]> = [['S', /\bthin\b/i], ['L', /\bthick\b/i]]
const FORM = /\b(chopped|diced|sliced|cubes?|cubed|pureed|mashed|shredded|grated|crushed|packed|halves|pieces|whole|heaping|level|rounded|sifted|melted|spooned|balls|pared)\b/i
const MEASURE_ML: Partial<Record<RowUnit, number>> = { cup: 240, tbsp: 15, tsp: 5 }

function leadingAmount(text: string): number {
  const m = new RegExp(String.raw`^\s*` + FRAC).exec(text)
  if (!m) return 1
  const a = m[1].trim()
  if (/\s/.test(a) && a.includes('/')) {
    const [w, f] = a.split(/\s+/)
    const [n, d] = f.split('/')
    return parseFloat(w) + parseFloat(n) / parseFloat(d)
  }
  if (a.includes('/')) { const [n, d] = a.split('/'); return parseFloat(n) / parseFloat(d) }
  return parseFloat(a)
}

const r2 = (n: number) => Math.round(n * 100) / 100

// When two texts give the same unit and size, the higher one is kept.
export const measurePreference = (c: ClassifiedMeasure): number => (c.explicitSize ? 2 : 0) + (c.plain ? 1 : 0)

export function classifyMeasure(text: unknown, gramWeight: unknown): ClassifiedMeasure | null {
  const t = typeof text === 'string' ? text.trim() : ''
  const g = typeof gramWeight === 'number' ? gramWeight : Number(gramWeight)
  if (!t || !Number.isFinite(g) || g <= 0 || SKIP.test(t) || WEIGHT.test(t)) return null
  const hit = MEASURE_UNITS.find(([, rx]) => rx.test(t))
  if (!hit) return null
  const unit = hit[0]
  const a = leadingAmount(t)
  if (!(a > 0)) return null
  if (unit === 'ml') {
    // "1 fl oz", or a container described by its fluid ounces ("1 can or bottle (12 fl oz)")
    for (const cu of ['can', 'bottle', 'packet'] as const) {
      if (MEASURE_UNITS.find(([u]) => u === cu)![1].test(t)) {
        return { unit: cu, size: 'M', grams: r2(g / a), ml: null, isDefault: false, plain: true, explicitSize: false }
      }
    }
    const fo = new RegExp(FRAC + String.raw`\s*fl\.?\s*oz`, 'i').exec(t)
    const vol = (fo ? leadingAmount(fo[1]) : 1) * 29.5735
    return { unit: 'ml', size: 'M', grams: r2(g / (fo ? 1 : a)), ml: r2(vol), isDefault: false, plain: true, explicitSize: false }
  }
  // A measuring volume has no S/M/L ("1 large cup" is not a USDA measure).
  const measuring = MEASURE_ML[unit] !== undefined
  const word = measuring ? undefined : MEASURE_SIZE.find(([, rx]) => rx.test(t))?.[0]
  const shape = measuring || word ? undefined : MEASURE_SIZE_SHAPE.find(([, rx]) => rx.test(t))?.[0]
  return {
    unit,
    size: word ?? shape ?? 'M',
    grams: r2(g / a),
    ml: MEASURE_ML[unit] ?? null,
    isDefault: /quantity not specified/i.test(t),
    plain: !FORM.test(t),
    explicitSize: word !== undefined,
  }
}
