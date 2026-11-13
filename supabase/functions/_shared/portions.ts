// ── Portion engine (v1.2 Phase 5, spec .claude/plans/v1.2-phase5-7-spec.md (d) + (k)) ──
// Turns a parsed amount ("2 katori", "1 small bowl", "250 ml", nothing at all)
// into grams from DATA — migration 054's portion_units / portion_categories rows,
// the user's own memory portions and personal calibrations — instead of the
// parse model's gram guess. Pure: the same inputs always give the same grams,
// source and confidence, so the first and the second log of the same words weigh
// the same.
//
// Order (the first rank that yields grams wins):
//   R1  the user's stated weight or volume                 stated
//   R2  the user's memory portions for this phrase         memory
//   R2' the user's personal calibration ("my cup is 350 ml", learned from edits
//       and chip answers): food > category > any scope    user_calibration
//   R3  founder / weighed rows (grade F) for the food      food
//   R4  rows tagged with the user's region: food, then the category chain, then generic
//   R5  untagged food rows (food_item_id, fdc_id, then a NOT-verified row's own
//       legacy portions classified at run time)             food
//   R6  untagged category rows that give grams, chain then generic   category
//   R7  untagged volume rows × density, chain then generic           volume
//   R8  the parser's fallback_g clamped to per-unit bounds           ai
// No amount at all = a serving: R2 'serving', then is_default / serving rows at
// R3–R6, then the category's serving unit through R2–R7, then R8.

import {
  classifyMeasure, MASS_G, measurePreference, normText, VOLUME_ML,
  type RowUnit, type Size, type StatedUnit, type Unit,
} from './portionText.ts'

export type Region = 'IN' | 'US'
export type PortionSource =
  | 'stated' | 'memory' | 'user_calibration' | 'food' | 'category' | 'volume' | 'serving_default'
  | 'ai' | 'label' | 'edit_rescale' | 'rule' | 'legacy'
export type PortionStatus = 'active' | 'proposed' | 'retired'

export interface PortionCategory {
  category: string
  parent: string | null
  density_g_per_ml: number | null
  s_ratio: number
  l_ratio: number
  serving_unit: string | null
  inherit_vessels: boolean
}
// head_only: an ingredient word (butter, sauce, milk, egg, apple, peanut, honey, …) that names the food
// only when it is the phrase's LAST word ("bread butter", "toned milk"), never as a modifier of a dish
// noun the list does not know ("butter chicken", "milk cookies", "egg halwa").
export interface CategoryWord { word: string; category: string; priority: number; head_only?: boolean }
export interface PortionUnitRow {
  id: string
  food_item_id: string | null
  fdc_id: number | null
  category: string | null
  unit: RowUnit
  size: Size
  grams: number | null
  ml: number | null
  context: 'home' | 'restaurant' | null
  region: Region | null
  is_default: boolean
  is_unit_default: boolean
  source: string
  grade: string
  confidence: number
  source_ref: string
  status: PortionStatus
}
// The cached reference data (portionStore.ts): every category, word, map row
// and category-scoped (incl. generic) portion row.
export interface PortionTables {
  categories: Map<string, PortionCategory>
  words: CategoryWord[]
  categoryMap: Map<string, string>
  categoryRows: PortionUnitRow[]
}

// user_food_memory.portions entries (054's portion_memory_ok shape).
export interface MemoryPortion { unit: Unit; size: Size; grams: number; origin: string; at: string }
// user_portion_calibrations rows (active only), already filtered to the user.
export interface Calibration {
  id: string
  scope: 'any' | 'category' | 'food'
  category: string | null
  food_item_id: string | null
  unit: Unit
  size: Size
  grams: number | null
  ml: number | null
  as_size: Size | null
  // 'edit' = learned from ONE gram edit, not yet confirmed: served at low confidence, so the app asks
  // (needs_follow_up) instead of trusting a single, possibly mistyped, edit. A second consistent edit
  // stores 'edit_confirmed'. Absent (older callers, tests) = an explicit setting.
  origin?: 'statement' | 'edit' | 'edit_confirmed' | 'chip' | 'follow_up'
}

export interface PortionParse {
  count: number
  unit: Unit | null
  size: Size | null
  stated_amount: number | null
  stated_unit: StatedUnit | null
  // true = the stated amount is per unit ("2 glasses of 250 ml each", "2 grande lattes"); otherwise it is
  // the TOTAL ("2 eggs 100g" = 100 g). Absent/null: per unit only for a volume in a drink container
  // (statedPerUnit below), a total in every other case.
  stated_per_unit?: boolean | null
  context: 'home' | 'restaurant' | 'packaged' | null
  fallback_g: number | null
}

export interface PortionFoodRow {
  id: string | null
  fdc_id: number | null
  status: string | null
  name: string | null
  // the row's own food_items.portions: read ONLY for rows that are not verified
  portions?: Array<{ description: string; gramWeight: number }> | null
}

export interface EngineInput {
  parse: PortionParse
  phrase: string
  row: PortionFoodRow
  foodRows: PortionUnitRow[]          // portion_units keyed by this row's id or fdc_id
  memory?: MemoryPortion[] | null
  calibrations?: Calibration[] | null
  region: Region
  proposed: boolean                   // eval_only: proposed rows are served too
  channel?: 'text' | 'photo'
}

export interface PortionInfo {
  unit: Unit | 'g' | 'ml' | null
  size: Size | null
  count: number
  grams_per_unit: number
  source: PortionSource
  ref: string
  confidence: number
}
// grams = the total for `count` units; grams_per_unit = what a chip answer stores (op 'set') without dividing.
export interface PortionOption { label: string; unit: Unit; size: Size; count: number; grams: number; grams_per_unit: number }
export type ConfidenceBand = 'high' | 'medium' | 'low'
export interface PortionResult {
  grams: number
  portion: PortionInfo
  options: PortionOption[]
  category: string
  band: ConfidenceBand
  // true when the app should ask (low confidence, or a main dish logged with no amount)
  needs_follow_up: boolean
}

// ── Constants (spec (d)) ──────────────────────────────────────────────────────
export const FOOD_CONFIDENCE: Readonly<Record<string, number>> = { F: 0.85, A: 0.85, U: 0.80, B: 0.80, C: 0.70, H: 0.55 }
export const CATEGORY_CONFIDENCE: Readonly<Record<string, number>> = { F: 0.85, A: 0.75, B: 0.70, C: 0.60, H: 0.50 }
export const GENERIC_CONFIDENCE: Readonly<Record<string, number>> = { F: 0.85, A: 0.70, B: 0.65, C: 0.55, H: 0.45 }
const STATED_CONF = 0.95
const STATED_CONF_NO_DENSITY = 0.85
const PERSONAL_EXACT = 0.90
const PERSONAL_SCALED = 0.80
// A calibration learned from ONE gram edit (origin 'edit'): low band, so needs_follow_up asks the user
// to confirm with a chip instead of silently trusting a possibly mistyped edit (fixer 2026-11-13).
const PERSONAL_UNCONFIRMED = 0.55
const SIZE_PENALTY = 0.10
const SERVING_PENALTY = 0.05
const VOLUME_PENALTY = 0.05
const DENSITY_FOOD_CONF = 0.8
const DENSITY_CATEGORY_CONF = 0.6
export const AI_CONFIDENCE = { text: 0.30, photo: 0.40 } as const
export const LABEL_CONFIDENCE = 0.95
export const RULE_CONFIDENCE = 0.50
const DEFAULT_RATIO = { S: 0.67, L: 1.5 } as const

// R8: grams per ONE unit the parser's fallback guess is clamped to.
export const R8_BOUNDS: Readonly<Record<Unit, readonly [number, number]>> = {
  piece: [1, 600], slice: [5, 200], katori: [40, 400], bowl: [60, 700], plate: [80, 800], cup: [30, 500],
  glass: [80, 600], mug: [80, 500], cutting: [40, 120], tbsp: [3, 30], tsp: [1, 10], spoon: [2, 30],
  handful: [5, 80], scoop: [10, 100], splash: [5, 60], serving: [10, 800], packet: [5, 500], can: [150, 750],
  bottle: [100, 1000], pint: [400, 600], peg: [25, 65], shot: [25, 50],
}
const VESSELS: ReadonlySet<string> = new Set(['katori', 'bowl', 'cup', 'glass', 'mug', 'plate'])
// A main dish logged with no amount asks a follow-up even at medium confidence.
const MAIN_DISH: ReadonlySet<string> = new Set([
  'liquid_dish', 'paneer_gravy', 'cooked_rice', 'biryani', 'poha_upma', 'dry_sabzi', 'sabzi_bhindi', 'porridge',
])
// "paneer in butter sauce" is paneer; "ice cream without egg" is ice cream (fixer 2026-11-13: 'in', 'without')
const CUT_WORDS: ReadonlySet<string> = new Set(['with', 'without', 'in', 'on', 'and', 'plus', 'topped', 'served'])
// Drink containers: a stated VOLUME with one of these is per container ("2 cans 330 ml", "2 glasses of 250 ml").
const DRINK_CONTAINERS: ReadonlySet<string> = new Set(['glass', 'cup', 'mug', 'cutting', 'can', 'bottle', 'pint', 'peg', 'shot'])
// Units that name a piece of one particular food: a category calibration of these ("my roti is 50 g")
// applies to that exact category only, never to its children (paratha, naan are not "my roti").
const FOOD_SPECIFIC_UNITS: ReadonlySet<string> = new Set(['piece', 'slice'])
// The USDA household measures 056 imports (US servings: a 16 fl oz cappuccino, an FNDDS "quantity not
// specified" biryani). Founder l3: region IN uses Indian sizes, so with no size word they rank below the
// food's own non-generic category rows (research / founder numbers) and above generic rows only. Region
// US, or an explicit size word, keeps spec (d)'s order (fixer 2026-11-13).
const USDA_IMPORT_SOURCES: ReadonlySet<string> = new Set(['usda_foundation', 'usda_sr', 'usda_fndds'])
const isUsdaImport = (r: PortionUnitRow) => USDA_IMPORT_SOURCES.has(r.source)

export const bandOf = (c: number): ConfidenceBand => (c >= 0.8 ? 'high' : c >= 0.6 ? 'medium' : 'low')
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const clampConf = (c: number) => r2(Math.max(0.05, Math.min(1, c)))

// ── Region ────────────────────────────────────────────────────────────────────
// Spec (a)9: Asia/Kolkata, Asia/Calcutta or no timezone = India; anything else = US.
export function regionFromTimezone(tz: unknown): Region {
  if (tz === null || tz === undefined || tz === '') return 'IN'
  return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' ? 'IN' : 'US'
}

// ── Category of a food ────────────────────────────────────────────────────────
interface WordIndex { toks: string[]; category: string; priority: number; headOnly: boolean }
const wordIndexCache = new WeakMap<CategoryWord[], WordIndex[]>()
function wordIndex(words: CategoryWord[]): WordIndex[] {
  let idx = wordIndexCache.get(words)
  if (!idx) {
    idx = words.map((w) => ({ toks: normText(w.word).split(' ').filter(Boolean), category: w.category, priority: w.priority, headOnly: !!w.head_only }))
    wordIndexCache.set(words, idx)
  }
  return idx
}

// The listed word or phrase that ends furthest right wins (the head noun); a tie
// on position goes to the longer phrase, then the higher priority, then the name.
// A head_only (ingredient) word counts only when it ends the phrase: "butter chicken"
// is not butter, "milk cookies" is not milk (fixer 2026-11-13).
// The phrase is cut at the first cut word ("dosa with chutney" is a dosa), except that
// a dish NAME joined by "and" keeps its head noun when the full name ends in one
// ("egg and tomato sandwich" is a sandwich, "bread and butter" is still bread).
interface WordHit { end: number; n: number; priority: number; category: string; word: string; headOnly: boolean }
function bestWord(toks: string[], words: CategoryWord[]): WordHit | null {
  let best: WordHit | null = null
  for (const w of wordIndex(words)) {
    const n = w.toks.length
    for (let i = 0; i + n <= toks.length; i++) {
      let ok = true
      for (let j = 0; j < n; j++) if (toks[i + j] !== w.toks[j]) { ok = false; break }
      if (!ok) continue
      if (w.headOnly && i + n !== toks.length) continue
      const c: WordHit = { end: i + n, n, priority: w.priority, category: w.category, word: w.toks.join(' '), headOnly: w.headOnly }
      if (!best || c.end > best.end || (c.end === best.end && (c.n > best.n || (c.n === best.n &&
          (c.priority > best.priority || (c.priority === best.priority && c.category < best.category)))))) {
        best = c
      }
    }
  }
  return best
}

export function categoryFromWords(text: string | null | undefined, words: CategoryWord[]): { category: string; word: string } | null {
  if (!text) return null
  const all = normText(text).split(' ').filter(Boolean)
  const cut = all.findIndex((t) => CUT_WORDS.has(t))
  if (cut > 0 && all[cut] === 'and') {
    const full = bestWord(all, words)
    if (full && full.end === all.length && !full.headOnly) return { category: full.category, word: full.word }
  }
  const hit = bestWord(cut > 0 ? all.slice(0, cut) : all, words)
  return hit ? { category: hit.category, word: hit.word } : null
}

export function categoryOf(tables: PortionTables, rowId: string | null, phrase: string, rowName: string | null): string {
  if (rowId) {
    const mapped = tables.categoryMap.get(rowId)
    if (mapped && tables.categories.has(mapped)) return mapped
  }
  for (const t of [phrase, rowName]) {
    const hit = categoryFromWords(t, tables.words)
    if (hit && tables.categories.has(hit.category)) return hit.category
  }
  return 'generic'
}

// The category for the AI-estimate kcal clamp (aiMacros.ts) — stricter than categoryOf: the
// listed word must END the name and every other word must be a plain modifier (preparation, state,
// size, a vessel), so "roasted peanuts", "toned milk" and "glass of milk" are bounded but "coconut
// milk", "milk chocolate", "banana chips" and "paneer butter masala" can never be bounded by the milk,
// fruit or fat range (fixer 2026-11-13). null = no clamp.
const CLAMP_MODIFIERS: ReadonlySet<string> = new Set([
  'a', 'an', 'one', 'of', 'some', 'plain', 'fresh', 'raw', 'roasted', 'salted', 'unsalted', 'fried', 'deep', 'boiled',
  'steamed', 'dry', 'dried', 'hot', 'cold', 'warm', 'iced', 'chilled', 'toned', 'double', 'skimmed', 'skim', 'full', 'cream',
  'low', 'fat', 'whole', 'organic', 'homemade', 'home', 'made', 'desi', 'pure', 'sweetened', 'unsweetened', 'small', 'medium',
  'large', 'big', 'glass', 'cup', 'bowl', 'katori', 'handful', 'cow', 'cows', 'buffalo', 'goat', 'chopped', 'sliced',
])
export function categoryForEnergyClamp(tables: PortionTables, name: string | null | undefined): string | null {
  if (!name) return null
  const toks = normText(name).split(' ').filter(Boolean)
  if (toks.length === 0) return null
  const hit = bestWord(toks, tables.words)
  if (!hit || hit.end !== toks.length || !tables.categories.has(hit.category)) return null
  if (!toks.slice(0, hit.end - hit.n).every((t) => CLAMP_MODIFIERS.has(t))) return null
  return hit.category
}

export function categoryChain(tables: PortionTables, category: string): string[] {
  const out: string[] = []
  let c: string | null = category
  while (c && !out.includes(c)) {
    out.push(c)
    c = tables.categories.get(c)?.parent ?? null
  }
  if (!out.includes('generic') && tables.categories.has('generic')) out.push('generic')
  return out
}

// ── The engine ────────────────────────────────────────────────────────────────
interface Answer { perUnit: number; source: PortionSource; ref: string; confidence: number; unit: Unit; size: Size | null }
interface Density { d: number; conf: number; ref: string }

// Is the stated amount per unit (× count) or the total? The parse says so when it can
// (stated_per_unit); otherwise only a VOLUME in a drink container is per unit
// ("2 cans 330 ml", "2 glasses of 250 ml") and every other stated amount is the total
// ("2 eggs 100g", "2 scoops whey 60g"). Fixer 2026-11-13.
export function statedPerUnit(p: Pick<PortionParse, 'stated_per_unit' | 'stated_unit' | 'unit' | 'count'>): boolean {
  if (p.stated_per_unit === true) return true
  if (p.stated_per_unit === false) return false
  return !!p.unit && !!p.stated_unit && VOLUME_ML[p.stated_unit] !== undefined && DRINK_CONTAINERS.has(p.unit)
}

export function computePortion(tables: PortionTables, input: EngineInput): PortionResult | null {
  return new Engine(tables, input).run()
}

class Engine {
  private readonly category: string
  private readonly chain: string[]
  private readonly skipGenericVessels: boolean
  private readonly foodIdRows: PortionUnitRow[]
  private readonly fdcRows: PortionUnitRow[]
  private readonly legacyRows: PortionUnitRow[]
  private readonly catRows: Map<string, PortionUnitRow[]>
  private readonly density: Density | null
  private readonly count: number

  constructor(private readonly t: PortionTables, private readonly inp: EngineInput) {
    this.category = categoryOf(t, inp.row.id, inp.phrase, inp.row.name)
    this.chain = categoryChain(t, this.category)
    this.skipGenericVessels = this.chain.some((c) => c !== 'generic' && t.categories.get(c)?.inherit_vessels === false)
    const usable = (r: PortionUnitRow) =>
      (r.status === 'active' || (r.status === 'proposed' && inp.proposed)) && (r.region === null || r.region === inp.region)
    const byId = (a: PortionUnitRow, b: PortionUnitRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    this.foodIdRows = inp.row.id ? inp.foodRows.filter((r) => r.food_item_id === inp.row.id && usable(r)).sort(byId) : []
    this.fdcRows = inp.row.fdc_id != null
      ? inp.foodRows.filter((r) => r.fdc_id != null && Number(r.fdc_id) === Number(inp.row.fdc_id) && usable(r)).sort(byId)
      : []
    this.legacyRows = inp.row.status !== 'verified' ? legacyPortionRows(inp.row) : []
    this.catRows = new Map()
    for (const r of t.categoryRows) {
      if (!r.category || !usable(r)) continue
      if (r.category === 'generic' && this.skipGenericVessels && VESSELS.has(r.unit)) continue
      const list = this.catRows.get(r.category) ?? []
      list.push(r)
      this.catRows.set(r.category, list)
    }
    for (const list of this.catRows.values()) list.sort(byId)
    this.density = this.findDensity()
    const c = Number(inp.parse.count)
    this.count = Number.isFinite(c) && c > 0 ? Math.min(c, 100) : 1
  }

  run(): PortionResult | null {
    const p = this.inp.parse
    // R1: the user's own weight or volume
    if (p.stated_amount != null && p.stated_amount > 0 && p.stated_unit) {
      const stated = this.stated(p.stated_amount, p.stated_unit)
      if (stated) {
        // the TOTAL ("2 eggs 100g" = 100 g) unless it is per unit ("2 glasses of 250 ml", "2 grande lattes")
        const mult = statedPerUnit(p) ? this.count : 1
        const grams = r1(stated.grams * mult)
        return this.finish(grams, {
          unit: stated.kind, size: null, count: mult, grams_per_unit: r1(stated.grams),
          source: 'stated', ref: stated.ref, confidence: stated.conf,
        }, p.unit ?? null)
      }
    }
    const unit = p.unit && p.unit !== 'serving' ? p.unit : null
    const answer = unit ? this.resolveUnit(unit, p.size) : this.resolveServing(p.size)
    if (answer) {
      return this.finish(r1(answer.perUnit * this.count), {
        unit: answer.unit, size: answer.size, count: this.count, grams_per_unit: r2(answer.perUnit),
        source: answer.source, ref: answer.ref, confidence: clampConf(answer.confidence),
      }, unit)
    }
    // R8: the parser's own rough guess, clamped per unit
    const fb = Number(p.fallback_g)
    if (p.fallback_g != null && Number.isFinite(fb) && fb > 0) {
      const u: Unit = unit ?? 'serving'
      const [lo, hi] = R8_BOUNDS[u]
      const per = Math.min(hi, Math.max(lo, fb / this.count))
      return this.finish(r1(per * this.count), {
        unit: unit ?? null, size: p.size, count: this.count, grams_per_unit: r2(per),
        source: 'ai', ref: `fallback_g ${fb} clamped to ${u} ${lo}-${hi}`,
        confidence: this.inp.channel === 'photo' ? AI_CONFIDENCE.photo : AI_CONFIDENCE.text,
      }, unit)
    }
    return null
  }

  // ── R1 ──
  private stated(amount: number, su: StatedUnit): { grams: number; kind: 'g' | 'ml'; ref: string; conf: number } | null {
    if (MASS_G[su] !== undefined) return { grams: amount * MASS_G[su], kind: 'g', ref: `${amount} ${su}`, conf: STATED_CONF }
    if (VOLUME_ML[su] !== undefined) {
      const ml = amount * VOLUME_ML[su]
      const d = this.density
      return d
        ? { grams: ml * d.d, kind: 'ml', ref: `${r2(ml)} ml x ${r2(d.d)} g/ml (${d.ref})`, conf: STATED_CONF }
        : { grams: ml, kind: 'ml', ref: `${r2(ml)} ml x 1.0 g/ml (no density)`, conf: STATED_CONF_NO_DENSITY }
    }
    return null
  }

  // ── Density ──
  private findDensity(): Density | null {
    const order: Record<string, number> = { ml: 0, cup: 1, tbsp: 2, tsp: 3 }
    const rank = (r: PortionUnitRow) => order[r.unit] ?? 9
    for (const [label, rows] of [['food row', this.foodIdRows], ['fdc row', this.fdcRows], ['legacy portion', this.legacyRows]] as const) {
      const withBoth = rows.filter((r) => r.grams != null && r.ml != null && r.ml > 0)
        .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      if (withBoth.length) {
        const r = withBoth[0]
        return { d: r.grams! / r.ml!, conf: DENSITY_FOOD_CONF, ref: `${label} ${r.unit}` }
      }
    }
    for (const c of this.chain) {
      const d = this.t.categories.get(c)?.density_g_per_ml
      if (d != null && d > 0) return { d: Number(d), conf: DENSITY_CATEGORY_CONF, ref: `category ${c}` }
    }
    return null
  }

  // ── ratio(u, s) ──
  ratio(u: Unit, s: Size): number {
    if (s === 'M') return 1
    const fromRows = (rows: PortionUnitRow[] | undefined): number | null => {
      if (!rows) return null
      const pick = (sz: Size) => rows.find((r) => r.unit === u && r.size === sz && r.context === null)
      const a = pick(s)
      const m = pick('M')
      if (!a || !m) return null
      if (a.grams != null && m.grams != null && m.grams > 0) return a.grams / m.grams
      if (a.ml != null && m.ml != null && m.ml > 0) return a.ml / m.ml
      return null
    }
    for (const c of this.chain) {
      if (c === 'generic') continue
      const r = fromRows(this.catRows.get(c))
      if (r !== null) return r
    }
    const g = fromRows(this.catRows.get('generic'))
    if (g !== null) return g
    const own = this.t.categories.get(this.chain[0])
    if (own) return Number(s === 'S' ? own.s_ratio : own.l_ratio)
    return DEFAULT_RATIO[s]
  }

  // ── one scope: the row for (u, s) ──
  private pick(rows: PortionUnitRow[], u: Unit, s: Size | null): { row: PortionUnitRow; scale: number; scaled: boolean } | null {
    let cand = rows.filter((r) => r.unit === u)
    if (cand.length === 0) return null
    const ctx = this.inp.parse.context
    if (ctx === 'restaurant') {
      const rest = cand.filter((r) => r.context === 'restaurant')
      cand = rest.length ? rest : cand.filter((r) => r.context !== 'restaurant')
    } else {
      cand = cand.filter((r) => r.context !== 'restaurant')
    }
    if (cand.length === 0) return null
    // under eval_only a proposed row is the one being evaluated: it shadows an active twin
    if (this.inp.proposed) cand = [...cand].sort((a, b) => (a.status === 'proposed' ? 0 : 1) - (b.status === 'proposed' ? 0 : 1))
    if (s) {
      const exact = cand.find((r) => r.size === s)
      if (exact) return { row: exact, scale: 1, scaled: false }
      const m = cand.find((r) => r.size === 'M')
      return m ? { row: m, scale: this.ratio(u, s), scaled: true } : null
    }
    const d = cand.find((r) => r.is_unit_default) ?? cand.find((r) => r.size === 'M') ?? (cand.length === 1 ? cand[0] : undefined)
    return d ? { row: d, scale: 1, scaled: false } : null
  }

  // grams for a picked row (mass, or ml × density); null when it cannot be converted
  private valueOf(row: PortionUnitRow, volumeRank: boolean): { grams: number; conf: number; note: string } | null {
    const base = Number(row.confidence)
    if (row.grams != null && !volumeRank) return { grams: Number(row.grams), conf: base, note: `${row.grams} g` }
    if (row.ml != null) {
      const d = this.density
      if (!d) return null
      const conf = Math.min(base, d.conf) - (volumeRank ? VOLUME_PENALTY : 0)
      return { grams: Number(row.ml) * d.d, conf, note: `${row.ml} ml x ${r2(d.d)} g/ml (${d.ref})` }
    }
    return null
  }

  private fromScope(rows: PortionUnitRow[], u: Unit, s: Size | null, source: PortionSource, label: string,
    opts: { massOnly?: boolean; volumeOnly?: boolean } = {}): Answer | null {
    const filtered = rows.filter((r) =>
      (!opts.massOnly || r.grams != null) && (!opts.volumeOnly || (r.grams == null && r.ml != null)))
    const hit = this.pick(filtered, u, s)
    if (!hit) return null
    const v = this.valueOf(hit.row, !!opts.volumeOnly)
    if (!v) return null
    return {
      perUnit: v.grams * hit.scale,
      source,
      ref: `${label} ${u} ${hit.row.size}${hit.scaled ? ` x ${r2(hit.scale)} -> ${s}` : ''}: ${v.note} [${hit.row.source_ref}]`,
      confidence: v.conf - (hit.scaled ? SIZE_PENALTY : 0),
      unit: u,
      size: s ?? hit.row.size,
    }
  }

  // ── R2: memory ──
  private fromMemory(u: Unit, s: Size | null): Answer | null {
    const entries = (this.inp.memory ?? []).filter((e) => e && e.unit === u && Number(e.grams) > 0)
    if (entries.length === 0) return null
    const find = (sz: Size) => entries.find((e) => e.size === sz)
    if (s) {
      const exact = find(s)
      if (exact) return { perUnit: Number(exact.grams), source: 'memory', ref: `memory ${u} ${s} (${exact.origin} ${exact.at})`, confidence: PERSONAL_EXACT, unit: u, size: s }
      const m = find('M')
      if (m) {
        const k = this.ratio(u, s)
        return { perUnit: Number(m.grams) * k, source: 'memory', ref: `memory ${u} M x ${r2(k)} -> ${s} (${m.origin} ${m.at})`, confidence: PERSONAL_SCALED, unit: u, size: s }
      }
      return null
    }
    const d = find('M') ?? (entries.length === 1 ? entries[0] : undefined)
    return d ? { perUnit: Number(d.grams), source: 'memory', ref: `memory ${u} ${d.size} (${d.origin} ${d.at})`, confidence: PERSONAL_EXACT, unit: u, size: d.size } : null
  }

  // ── R2': personal calibration ── returns grams, or a size to use instead ("my katori is small")
  private fromCalibration(u: Unit, s: Size | null): Answer | { asSize: Size; ref: string } | null {
    const cals = (this.inp.calibrations ?? []).filter((c) => c && c.unit === u)
    if (cals.length === 0) return null
    const levels: Array<[string, Calibration[], boolean]> = []   // [label, rows, is the food level]
    if (this.inp.row.id) levels.push(['food', cals.filter((c) => c.scope === 'food' && c.food_item_id === this.inp.row.id), true])
    // a vessel is the same vessel for every food in the chain; a piece names one food ("my roti is 50 g"
    // is not "my paratha"), so a piece/slice calibration applies to its exact category only
    const chain = FOOD_SPECIFIC_UNITS.has(u) ? this.chain.slice(0, 1) : this.chain
    for (const cat of chain) {
      if (cat === 'generic') continue
      levels.push([`category ${cat}`, cals.filter((c) => c.scope === 'category' && c.category === cat), false])
    }
    levels.push(['any food', cals.filter((c) => c.scope === 'any'), false])
    // grams per ONE unit, or null = this calibration cannot apply here (the next level is tried)
    const value = (c: Calibration): { g: number; conf: number; note: string } | null => {
      let g: number
      let note: string
      if (c.grams != null && c.grams > 0) { g = Number(c.grams); note = `${c.grams} g` }
      else if (c.ml != null && c.ml > 0) {
        // no density: a volume cannot be weighed (spec (d) density rule 3, as for vessel rows); the data
        // rows answer instead of a 1 g/ml guess served as high confidence (fixer 2026-11-13)
        const d = this.density
        if (!d) return null
        g = Number(c.ml) * d.d
        note = `${c.ml} ml x ${r2(d.d)} g/ml (${d.ref})`
      } else return null
      // an implausible weight per unit (a typo, "my spoon is 500 g") never serves; the write paths refuse it too
      const [lo, hi] = R8_BOUNDS[u]
      if (!(g >= lo && g <= hi)) return null
      // learned from ONE edit: low confidence, so the app asks before trusting it
      return { g, conf: c.origin === 'edit' ? PERSONAL_UNCONFIRMED - PERSONAL_EXACT : 0, note }
    }
    for (const [label, rows, foodLevel] of levels) {
      if (rows.length === 0) continue
      const bySize = (sz: Size) => rows.find((c) => c.size === sz)
      if (s) {
        const exact = bySize(s)
        const v = exact && exact.as_size == null ? value(exact) : null
        if (exact && v) {
          return { perUnit: v.g, source: 'user_calibration', ref: `calibration ${exact.id} (${label}) ${u} ${s}: ${v.note}`, confidence: PERSONAL_EXACT + v.conf, unit: u, size: s }
        }
        const m = bySize('M')
        const vm = m && m.as_size == null ? value(m) : null
        if (m && vm) {
          const k = this.ratio(u, s)
          return { perUnit: vm.g * k, source: 'user_calibration', ref: `calibration ${m.id} (${label}) ${u} M x ${r2(k)} -> ${s}: ${vm.note}`, confidence: PERSONAL_SCALED + vm.conf, unit: u, size: s }
        }
        continue
      }
      const m = bySize('M')
      if (m?.as_size) return { asSize: m.as_size, ref: `calibration ${m.id} (${label}): your ${u} = ${m.as_size}` }
      const v = m ? value(m) : null
      if (m && v) return { perUnit: v.g, source: 'user_calibration', ref: `calibration ${m.id} (${label}) ${u}: ${v.note}`, confidence: PERSONAL_EXACT + v.conf, unit: u, size: null }
      // no size word: at the food level the user's only size of this unit is THEIR unit of this food
      // (an edit-learned "your small katori of dal"), checked before any broader scope
      if (foodLevel) {
        const sized = rows.filter((c) => c.size !== 'M' && c.as_size == null)
        const vs = sized.length === 1 ? value(sized[0]) : null
        if (vs) return { perUnit: vs.g, source: 'user_calibration', ref: `calibration ${sized[0].id} (${label}) ${u} ${sized[0].size}: ${vs.note}`, confidence: PERSONAL_EXACT + vs.conf, unit: u, size: sized[0].size }
      }
    }
    return null
  }

  // ── R2 + R2' for one unit: the user's own sizes (memory, then calibration) ──
  private personal(u: Unit, s: Size | null): Answer | null {
    const mem = this.fromMemory(u, s)
    if (mem) return mem
    const cal = this.fromCalibration(u, s)
    if (cal && 'asSize' in cal) {
      const under = this.fromData(u, cal.asSize)
      return under ? { ...under, source: 'user_calibration', ref: `${cal.ref}; ${under.ref}`, size: cal.asSize } : null
    }
    return cal
  }

  // ── R3–R7 for one unit ──
  // Restaurant context (founder k5): a restaurant-tagged row ANYWHERE in the food or its category chain
  // beats untagged food rows, founder rows included (those are home portions): restaurant roti 60 g, not
  // the founder's 40 g home roti. Only when no restaurant row exists do the usual ranks answer.
  private fromData(u: Unit, s: Size | null): Answer | null {
    if (this.inp.parse.context === 'restaurant') {
      const r = this.dataPass(u, s, (row) => row.context === 'restaurant')
      if (r) return r
    }
    return this.dataPass(u, s, () => true)
  }

  private dataPass(u: Unit, s: Size | null, keep: (r: PortionUnitRow) => boolean): Answer | null {
    const region = this.inp.region
    const isF = (r: PortionUnitRow) => r.grade === 'F'
    const k = (rows: PortionUnitRow[]) => rows.filter(keep)
    const demote = this.demoteUsda(s)
    // R3: founder / weighed rows for the food
    const r3 = this.fromScope(k(this.foodIdRows.filter(isF)), u, s, 'food', 'food F')
      ?? this.fromScope(k(this.fdcRows.filter(isF)), u, s, 'food', 'fdc F')
    if (r3) return r3
    // R4: rows tagged with the user's region
    const tagged = (rows: PortionUnitRow[]) => k(rows.filter((r) => r.region === region))
    let a = this.fromScope(tagged(this.foodIdRows), u, s, 'food', `food ${region}`)
      ?? this.fromScope(tagged(this.fdcRows), u, s, 'food', `fdc ${region}`)
    if (a) return a
    for (const c of this.chain) {
      a = this.fromScope(tagged(this.catRows.get(c) ?? []), u, s, 'category', `${c === 'generic' ? 'generic' : `category ${c}`} ${region}`)
      if (a) return a
    }
    // R5: untagged food rows (in IN with no size word, 056's USDA measures wait until after the category rows)
    const untagged = (rows: PortionUnitRow[]) => k(rows.filter((r) => r.region === null && !isF(r)))
    a = this.fromScope(untagged(this.foodIdRows), u, s, 'food', 'food')
      ?? this.fromScope(untagged(this.fdcRows).filter((r) => !demote || !isUsdaImport(r)), u, s, 'food', 'fdc')
      ?? this.fromScope(k(this.legacyRows), u, s, 'food', 'row portions')
    if (a) return a
    // R6: untagged category rows that give grams; R7: untagged volume rows x density (chain, generic last)
    const r6 = (c: string) => this.fromScope(k((this.catRows.get(c) ?? []).filter((r) => r.region === null)), u, s, 'category',
      c === 'generic' ? 'generic' : `category ${c}`, { massOnly: true })
    const r7 = (c: string) => this.density
      ? this.fromScope(k((this.catRows.get(c) ?? []).filter((r) => r.region === null)), u, s, 'volume',
        c === 'generic' ? 'generic' : `category ${c}`, { volumeOnly: true })
      : null
    if (!demote) {
      for (const c of this.chain) { a = r6(c); if (a) return a }
      for (const c of this.chain) { a = r7(c); if (a) return a }
      return null
    }
    const own = this.chain.filter((c) => c !== 'generic')
    for (const c of own) { a = r6(c); if (a) return a }
    for (const c of own) { a = r7(c); if (a) return a }
    a = this.fromScope(untagged(this.fdcRows).filter(isUsdaImport), u, s, 'food', 'fdc usda')
    if (a) return a
    if (this.chain.includes('generic')) { a = r6('generic') ?? r7('generic'); if (a) return a }
    return null
  }

  // Region IN and no size word: 056's USDA measures rank after the food's own category rows (founder l3).
  private demoteUsda(s: Size | null): boolean {
    return this.inp.region === 'IN' && s === null
  }

  resolveUnit(u: Unit, s: Size | null): Answer | null {
    return this.personal(u, s) ?? this.fromData(u, s)
  }

  // The scopes a no-amount log reads, in rank order (R3..R6): [rows, label]. In IN with no size word,
  // 056's USDA measures (an FNDDS "quantity not specified" biryani, a US cappuccino) come after the food's
  // own category rows and before generic ones (founder l3).
  // part: 'all', or (IN, no size word) 'own' = up to the food's own category rows, 'rest' = USDA measures then generic
  private servingScopes(s: Size | null = null, part: 'all' | 'own' | 'rest' = 'all'): Array<[PortionUnitRow[], string]> {
    const region = this.inp.region
    const isF = (r: PortionUnitRow) => r.grade === 'F'
    const tagged = (rows: PortionUnitRow[]) => rows.filter((r) => r.region === region)
    const untagged = (rows: PortionUnitRow[]) => rows.filter((r) => r.region === null && !isF(r))
    const demote = this.demoteUsda(s)
    // a category serving row may be a volume ("milk, no amount = 175 ml"): converted with the density
    const cat = (c: string): [PortionUnitRow[], string] =>
      [(this.catRows.get(c) ?? []).filter((r) => r.region === null), c === 'generic' ? 'generic' : `category ${c}`]
    const head: Array<[PortionUnitRow[], string]> = [
      [this.foodIdRows.filter(isF), 'food F'],
      [this.fdcRows.filter(isF), 'fdc F'],
      [tagged(this.foodIdRows), `food ${region}`],
      [tagged(this.fdcRows), `fdc ${region}`],
      ...this.chain.map((c) => [tagged(this.catRows.get(c) ?? []), `category ${c} ${region}`] as [PortionUnitRow[], string]),
      [untagged(this.foodIdRows), 'food'],
    ]
    if (!demote) return part === 'rest' ? [] : [...head, [untagged(this.fdcRows), 'fdc'], [this.legacyRows, 'row portions'], ...this.chain.map(cat)]
    const own: Array<[PortionUnitRow[], string]> = [
      ...head,
      [untagged(this.fdcRows).filter((r) => !isUsdaImport(r)), 'fdc'],
      [this.legacyRows, 'row portions'],
      ...this.chain.filter((c) => c !== 'generic').map(cat),
    ]
    const rest: Array<[PortionUnitRow[], string]> = [
      [untagged(this.fdcRows).filter(isUsdaImport), 'fdc usda'],
      ...(this.chain.includes('generic') ? [cat('generic')] : []),
    ]
    return part === 'own' ? own : part === 'rest' ? rest : [...own, ...rest]
  }

  private servingUnit(): Unit | null {
    return (this.chain.map((c) => this.t.categories.get(c)?.serving_unit).find((x) => !!x) as Unit | undefined) ?? null
  }

  // The units a no-amount log would be weighed in: the first default row's unit, then the category's serving unit.
  private servingUnits(): Unit[] {
    const out: Unit[] = []
    const ctx = this.inp.parse.context
    for (const [rows] of this.servingScopes(null)) {
      const d = rows.find((r) => r.is_default && r.unit !== 'ml' && r.unit !== 'serving' && (ctx === 'restaurant' || r.context !== 'restaurant'))
      if (d) { out.push(d.unit as Unit); break }
    }
    const su = this.servingUnit()
    if (su && su !== 'serving' && !out.includes(su)) out.push(su)
    return out
  }

  // ── No amount: a serving ──
  resolveServing(s: Size | null): Answer | null {
    // 1. personal 'serving'
    const own = this.personal('serving', s)
    if (own) return own
    // 1b. the user's own size of the unit a no-amount log is weighed in: "my katori is small" then "dal",
    //     or the katori of dal an edit taught us, beats the default katori row (fixer 2026-11-13)
    for (const u of this.servingUnits()) {
      const p = this.personal(u, s)
      if (p) return { ...p, confidence: p.confidence - SERVING_PENALTY, ref: `serving unit ${u}: ${p.ref}` }
    }
    // 2. is_default rows (any unit), then 'serving' rows, at R3..R6; restaurant rows first anywhere (founder k5).
    //    In IN with no size word the category's serving unit (3) answers before 056's USDA defaults (founder l3:
    //    a US "quantity not specified" cappuccino or biryani never beats the Indian cup or plate).
    const demote = this.demoteUsda(s)
    if (this.inp.parse.context === 'restaurant') {
      const r = this.servingPass(s, (row) => row.context === 'restaurant', 'all')
      if (r) return r
    }
    const nonRestaurant = (row: PortionUnitRow) => row.context !== 'restaurant'
    const d = this.servingPass(s, nonRestaurant, demote ? 'own' : 'all')
    if (d) return d
    // 3. the category's serving unit, through R2–R7
    const su = this.servingUnit()
    if (su && su !== 'serving') {
      const a = this.resolveUnit(su, s)
      if (a) {
        const personal = a.source === 'memory' || a.source === 'user_calibration'
        return { ...a, source: personal ? a.source : 'serving_default', confidence: a.confidence - SERVING_PENALTY, ref: `serving unit ${su}: ${a.ref}` }
      }
    }
    return demote ? this.servingPass(s, nonRestaurant, 'rest') : null
  }

  private servingPass(s: Size | null, keep: (r: PortionUnitRow) => boolean, part: 'all' | 'own' | 'rest'): Answer | null {
    for (const [all, label] of this.servingScopes(s, part)) {
      const rows = all.filter(keep)
      const defaults = rows.filter((r) => r.is_default).sort((a, b) => (a.id < b.id ? -1 : 1))
      for (const d of defaults) {
        const u = d.unit === 'ml' ? null : d.unit
        if (!u) continue
        // the default row names the unit; the size the user said (if any) still applies
        const hit = this.fromScope(rows.filter((r) => r.unit === u), u, s ?? d.size, 'serving_default', `${label} default`)
        if (hit) return { ...hit, confidence: hit.confidence - SERVING_PENALTY, source: 'serving_default' }
      }
      const sv = this.fromScope(rows, 'serving', s, 'serving_default', label)
      if (sv) return { ...sv, confidence: sv.confidence - SERVING_PENALTY }
    }
    return null
  }

  // ── options + band ──
  private finish(grams: number, portion: PortionInfo, unit: Unit | null): PortionResult {
    const band = bandOf(portion.confidence)
    const options = portion.source === 'stated' ? [] : this.options(unit, portion)
    const needs = band === 'low' || (portion.source === 'serving_default' && this.chain.some((c) => MAIN_DISH.has(c)))
    return { grams, portion, options, category: this.category, band, needs_follow_up: needs }
  }

  // Up to 4 chips (spec (d), founder k2: when unsure, offer options). The same unit at S / M / L (for a
  // no-amount log: the serving at S / M / L), then the category's serving unit (katori for a curry),
  // then the food's default serving; any two within 5% merged. With no data (R8) the chips scale the
  // parser's own guess, so the app can still ask.
  private options(unit: Unit | null, portion: PortionInfo): PortionOption[] {
    const out: PortionOption[] = []
    const count = this.count
    const SIZES = ['S', 'M', 'L'] as const
    const push = (uu: Unit, sz: Size, perUnit: number) => {
      const grams = r1(perUnit * count)
      if (!(grams > 0)) return
      if (out.some((o) => Math.abs(o.grams - grams) <= 0.05 * Math.max(o.grams, grams))) return
      const word = sz === 'S' ? 'small ' : sz === 'L' ? 'large ' : ''
      out.push({ label: `${count} ${word}${uu}`, unit: uu, size: sz, count, grams, grams_per_unit: r2(perUnit) })
    }
    const real = (x: PortionInfo['unit']): Unit | null => (x && x !== 'g' && x !== 'ml' ? x : null)
    const u: Unit | null = unit ?? real(portion.unit)
    if (portion.source === 'ai') {
      const uu: Unit = u ?? 'serving'
      for (const sz of SIZES) push(uu, sz, portion.grams_per_unit * (sz === 'M' ? 1 : this.ratio(uu, sz)))
      return out.slice(0, 4)
    }
    if (u && u !== 'serving') {
      for (const sz of SIZES) {
        const a = this.resolveUnit(u, sz)
        if (a) push(u, sz, a.perUnit)
      }
    } else {
      for (const sz of SIZES) {
        const a = this.resolveServing(sz)
        if (a) push(a.unit, a.size ?? sz, a.perUnit)
      }
    }
    // a no-amount log also offers the category's serving unit (katori for a curry)
    const su = this.servingUnit()
    if (su && su !== 'serving' && su !== u && (!unit || unit === 'serving')) {
      for (const sz of ['M', 'S', 'L'] as const) {
        const a = this.resolveUnit(su, sz)
        if (a) push(su, sz, a.perUnit)
      }
    }
    const serving = this.resolveServing(null)
    if (serving && serving.unit !== u && serving.unit !== 'serving') push(serving.unit, serving.size ?? 'M', serving.perUnit)
    return out.slice(0, 4)
  }
}

// A not-verified row's own food_items.portions (a personal USDA pick keeps USDA's
// measures), classified at run time. Ties on unit+size: measurePreference, then order.
export function legacyPortionRows(row: PortionFoodRow): PortionUnitRow[] {
  const out: PortionUnitRow[] = []
  const seen = new Map<string, { rank: number; idx: number }>()
  ;(row.portions ?? []).forEach((p, i) => {
    const c = classifyMeasure(p?.description, p?.gramWeight)
    if (!c) return
    const key = `${c.unit}|${c.size}`
    const prev = seen.get(key)
    const rank = measurePreference(c)
    if (prev && prev.rank >= rank) return
    const r: PortionUnitRow = {
      id: `legacy:${row.id ?? 'row'}:${i}`, food_item_id: row.id, fdc_id: null, category: null,
      unit: c.unit, size: c.size, grams: c.grams, ml: c.ml, context: null, region: null,
      is_default: c.isDefault, is_unit_default: false, source: 'food_items_portions', grade: 'U',
      confidence: FOOD_CONFIDENCE.U, source_ref: `row portion "${p.description}"`, status: 'active',
    }
    if (prev) { out[prev.idx] = r; seen.set(key, { rank, idx: prev.idx }) }
    else { seen.set(key, { rank, idx: out.length }); out.push(r) }
  })
  return out
}

// ── Cooking fat (spec (d), founder decision 9) ────────────────────────────────
// Its own "cooking oil" line, only for a dish the user SPLIT into parts: light 2.5 g,
// normal 5 g, heavy 10 g per serving of each part that says so; restaurant context
// with no cooking_fat word means heavy. Source 'rule'.
// A part whose row is a whole cooked dish (an INDB/053 recipe, an AI estimate of the
// dish) already carries its recipe oil: it never gets a line, so "kam tel bhindi
// sabzi" can never ADD calories (fixer 2026-11-13; a reduction for 'light' on recipe
// rows waits for the founder's base_per_100g decision).
export const COOKING_FAT_G = { light: 2.5, normal: 5, heavy: 10 } as const
export type CookingFat = 'none' | 'light' | 'normal' | 'heavy'
// `parts` = the meal's cooked curry/sabzi parts; `mealSize` = how many foods the meal was split into.
export function cookingFatGrams(
  parts: Array<{ cooking_fat: CookingFat | null; context: string | null; servings: number; recipe_fat?: boolean }>,
  mealSize: number,
): number {
  if (mealSize < 2) return 0
  let g = 0
  for (const p of parts) {
    if (p.recipe_fat !== false) continue   // only a part known to carry no recipe fat (a raw-ingredient row)
    const level = p.cooking_fat ?? (p.context === 'restaurant' ? 'heavy' : null)
    if (!level || level === 'none') continue
    g += COOKING_FAT_G[level] * Math.max(0, Math.min(10, p.servings || 1))
  }
  return r1(g)
}
