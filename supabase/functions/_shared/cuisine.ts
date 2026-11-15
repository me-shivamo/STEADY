// ── Cuisine classifier (v1.2 follow-up WP6, pure parts) ─────────────────────────
// Plan: .claude/plans/v1.2-followup-build-plan.md WP6, with the adversarial review's corrections
// (#16, #26) and the decisions on Q13 / Q15. Founder direction (m)2 in .claude/plans/v1.2-phase5-7-spec.md:
//   Indian dishes  -> 053/058 recalculated rows, then INDB/IFCT, then founder/research portions, USDA last (every user)
//   Western dishes -> USDA first
//   neutral foods  -> (milk, rice, egg, banana...) the user's region decides between Indian and US rows and sizes
//   055/056 local USDA rows are a fallback that never replaces an Indian value.
//
// This module answers "which cuisine is this?" for a typed phrase and for a food_items row, and holds the
// pure ranking decisions WP6 needs. Pure and deterministic: no I/O, no clock, no randomness.
//
// NOT WIRED IN YET. No resolver, portion-engine or eval code imports it; WP6's resolver part does that behind
// RESOLVER_REGION (default off). The vocabulary (cuisineVocab.ts, generated from scripts/cuisine/data/*.csv)
// is a DRAFT awaiting founder sign-off (plan Q15).

import { normText } from './portionText.ts'
import { CUISINE_VOCAB, type VocabEntry } from './cuisineVocab.ts'
import type { Region } from './portions.ts'

export type { VocabEntry }
export type Cuisine = 'in' | 'west' | 'neutral'
export type PreferredCuisine = Exclude<Cuisine, 'neutral'>

// Same cut words as portions.ts CUT_WORDS: "dosa with chutney" is a dosa, "paneer in butter sauce" is paneer.
const CUT_WORDS: ReadonlySet<string> = new Set(['with', 'without', 'in', 'on', 'and', 'plus', 'topped', 'served'])

// ── Vocabulary index ───────────────────────────────────────────────────────────
interface Entry { toks: string[]; cuisine: Cuisine; phrase: string; marker: boolean }
interface Hit { start: number; end: number; n: number; cuisine: Cuisine; phrase: string; marker: boolean }

const indexCache = new WeakMap<ReadonlyArray<VocabEntry>, Map<string, Entry[]>>()
function vocabIndex(vocab: ReadonlyArray<VocabEntry>): Map<string, Entry[]> {
  let idx = indexCache.get(vocab)
  if (!idx) {
    idx = new Map()
    for (const [phrase, cuisine, marker] of vocab) {
      const toks = normText(phrase).split(' ').filter(Boolean)
      if (!toks.length) continue
      const e: Entry = { toks, cuisine, phrase: toks.join(' '), marker: marker === true }
      const list = idx.get(toks[0])
      if (list) list.push(e)
      else idx.set(toks[0], [e])
    }
    indexCache.set(vocab, idx)
  }
  return idx
}

function hitsIn(toks: string[], idx: Map<string, Entry[]>): Hit[] {
  const out: Hit[] = []
  for (let i = 0; i < toks.length; i++) {
    for (const e of idx.get(toks[i]) ?? []) {
      const n = e.toks.length
      if (i + n > toks.length) continue
      let ok = true
      for (let j = 1; j < n; j++) if (toks[i + j] !== e.toks[j]) { ok = false; break }
      if (ok) out.push({ start: i, end: i + n, n, cuisine: e.cuisine, phrase: e.phrase, marker: e.marker })
    }
  }
  return out
}

// The head noun: the listed phrase that ends furthest right; a tie goes to the longer phrase, then the
// smaller phrase (byte order) so the answer never depends on list order. Markers (Hindi grammar words)
// are never the head.
function headOf(hits: Hit[]): Hit | null {
  let best: Hit | null = null
  for (const h of hits) {
    if (h.marker) continue
    if (!best || h.end > best.end || (h.end === best.end && (h.n > best.n || (h.n === best.n && h.phrase < best.phrase)))) best = h
  }
  return best
}

// ── Phrases ───────────────────────────────────────────────────────────────────
export interface PhraseCuisine {
  cuisine: Cuisine
  // the vocabulary phrase that decided it (the head, or the tipping word); null = nothing listed matched
  word: string | null
  // head: an Indian / Western head noun decided; modifier: the head was neutral (or absent) and the other
  // listed words were all one cuisine ("jeera rice", "amul butter"); mixed: they disagreed, so neutral;
  // neutral_food: a neutral head and nothing else; none: no listed word at all
  via: 'head' | 'modifier' | 'mixed' | 'neutral_food' | 'none'
}

const NONE: PhraseCuisine = { cuisine: 'neutral', word: null, via: 'none' }

// Classifies a typed food phrase ("masala dosa", "Paneer pizza", "milk"). Cut at the first cut word, as the
// portion engine's category words are, except that a dish name joined by "and" keeps the full phrase when
// its head ends it ("mac and cheese", "fish and chips"). An Indian or Western head decides; a neutral head
// (milk, rice, egg...) or no head at all lets the other listed words tip it, and conflicting words leave it
// neutral so the region decides.
export function phraseCuisine(text: string | null | undefined, vocab: ReadonlyArray<VocabEntry> = CUISINE_VOCAB): PhraseCuisine {
  if (!text) return NONE
  const idx = vocabIndex(vocab)
  const all = normText(text).split(' ').filter(Boolean)
  if (!all.length) return NONE
  const cut = all.findIndex((t) => CUT_WORDS.has(t))
  let hits = hitsIn(cut > 0 ? all.slice(0, cut) : all, idx)
  if (cut > 0 && all[cut] === 'and') {
    const fullHits = hitsIn(all, idx)
    const full = headOf(fullHits)
    if (full && full.end === all.length) hits = fullHits
  }
  const head = headOf(hits)
  if (head && head.cuisine !== 'neutral') return { cuisine: head.cuisine, word: head.phrase, via: 'head' }
  const others = hits.filter((h) => h.cuisine !== 'neutral' && (!head || h.end <= head.start || h.start >= head.end))
  if (!others.length) return head ? { cuisine: 'neutral', word: head.phrase, via: 'neutral_food' } : NONE
  if (new Set(others.map((h) => h.cuisine)).size > 1) return { cuisine: 'neutral', word: head?.phrase ?? null, via: 'mixed' }
  // all one cuisine: record the rightmost tipping word (markers included)
  let tip = others[0]
  for (const h of others) if (h.end > tip.end || (h.end === tip.end && (h.n > tip.n || (h.n === tip.n && h.phrase < tip.phrase)))) tip = h
  return { cuisine: tip.cuisine, word: tip.phrase, via: 'modifier' }
}

// ── Rows ──────────────────────────────────────────────────────────────────────
export interface CuisineRow {
  // the row's food_item_cuisine tag (WP6 migration) when it was read: it always wins. 'neutral' is needed
  // for the 053 rice copies, whose 'chawal' key reads as Indian but whose numbers are USDA 168930's by
  // founder decision (h)4 (plan WP6 backfill: "explicit values for the USDA rice copies").
  tag?: Cuisine | null
  source?: string | null        // food_items.source
  recipeRef?: string | null     // food_derivations.recipe_ref of a 053/058 row ('INDB:ASC096@…', 'USDA:168930', 'STEADY:…')
  key?: string | null           // food_items.normalized_name (NULL on 055's imported rows)
  name?: string | null          // food_items.name, read only when the row has no key
  // USDA food group, for USDA rows the vocabulary leaves neutral (WP12 tags 055's imports with this; review #30)
  usdaCategory?: { dataset: string; code?: string | number | null; description?: string | null } | null
}
export type RowBasis = 'tag' | 'source' | 'recipe_ref' | 'key' | 'name' | 'usda_category' | 'default'
export interface RowCuisine { cuisine: Cuisine; basis: RowBasis; word: string | null }

const INDIAN_SOURCES: ReadonlySet<string> = new Set(['indb', 'ifct'])
// INDB / IFCT recipes and the STEADY home-style recipes (chai, upma, poha, biryani, dal makhani so far).
// 'USDA:' copies (the rice rows, the 058 pizza) are classified by what they are, below.
const INDIAN_RECIPE_REF = /^(INDB|IFCT|STEADY):/
// SR Legacy food groups that hold restaurant and mixed dishes (plan WP6 backfill: "USDA FNDDS/SR mixed-dish groups: west")
const SR_WEST_GROUPS: ReadonlySet<string> = new Set(['Fast Foods', 'Meals, Entrees, and Side Dishes', 'Restaurant Foods'])
// FNDDS WWEIA "Mixed Dishes" categories are 3002–3808 (meat / poultry / seafood, bean and vegetable,
// grain-based, Asian, Mexican, pizza, sandwiches, soups). FNDDS files its Indian dishes there too
// (Chicken curry, Biryani, Sambar, Samosa, Idli), so the vocabulary runs first.
const isWestUsdaGroup = (g: CuisineRow['usdaCategory']): boolean => {
  if (!g) return false
  const ds = String(g.dataset).toLowerCase()
  if (ds === 'fndds') {
    const code = Number(g.code)
    return Number.isInteger(code) && code >= 3000 && code < 3900
  }
  if (ds === 'sr' || ds === 'sr_legacy') return SR_WEST_GROUPS.has(String(g.description ?? ''))
  return false
}

// Order: tag; Indian source (indb, ifct); Indian recipe_ref; the key's vocabulary (the name's when there is no
// key); a USDA mixed-dish group = west; otherwise neutral (basic commodities: milk, rice, egg, banana).
export function rowCuisine(row: CuisineRow, vocab: ReadonlyArray<VocabEntry> = CUISINE_VOCAB): RowCuisine {
  if (row.tag === 'in' || row.tag === 'west' || row.tag === 'neutral') return { cuisine: row.tag, basis: 'tag', word: null }
  const source = String(row.source ?? '').toLowerCase()
  if (INDIAN_SOURCES.has(source)) return { cuisine: 'in', basis: 'source', word: null }
  if (row.recipeRef && INDIAN_RECIPE_REF.test(row.recipeRef)) return { cuisine: 'in', basis: 'recipe_ref', word: null }
  const hasKey = typeof row.key === 'string' && row.key.trim() !== ''
  const p = phraseCuisine(hasKey ? row.key : row.name, vocab)
  if (p.cuisine !== 'neutral') return { cuisine: p.cuisine, basis: hasKey ? 'key' : 'name', word: p.word }
  if (source === 'usda' && isWestUsdaGroup(row.usdaCategory)) return { cuisine: 'west', basis: 'usda_category', word: null }
  return { cuisine: 'neutral', basis: 'default', word: p.word }
}

// ── Preference ────────────────────────────────────────────────────────────────
// Region (portions.regionFromTimezone: Asia/Kolkata, Asia/Calcutta or no timezone = IN, else US) -> cuisine.
export const regionCuisine = (region: Region): PreferredCuisine => (region === 'IN' ? 'in' : 'west')

// Which data to prefer for this log: the phrase's cuisine, or the region's when the phrase is neutral.
export function cuisinePreference(phrase: Cuisine, region: Region): PreferredCuisine {
  return phrase === 'neutral' ? regionCuisine(region) : phrase
}

// The cuisine of a matched food for portion decisions: the phrase decides, the row only when the phrase
// is neutral ("tea" matched to the chai row is Indian; "tea" matched to black tea stays neutral).
export function foodCuisine(phrase: Cuisine, row: Cuisine): Cuisine {
  return phrase === 'neutral' ? row : phrase
}

// ── Candidate order ───────────────────────────────────────────────────────────
// recalc: a 053/058 derived row; usda: a verified keyed USDA row; usda_local: a 055 row from
// search_usda_local; usda_api: a live FoodData Central result; other: ai_estimated, user_created, label.
export type SourceTier = 'recalc' | 'indb' | 'ifct' | 'usda' | 'usda_local' | 'usda_api' | 'other'
export interface CandidateRank { cuisine: Cuisine; tier: SourceTier }

export function candidateTier(c: { source?: string | null; derived?: boolean; local?: boolean; api?: boolean }): SourceTier {
  if (c.api) return 'usda_api'
  if (c.local) return 'usda_local'
  if (c.derived) return 'recalc'
  const s = String(c.source ?? '').toLowerCase()
  return s === 'indb' || s === 'ifct' || s === 'usda' ? s : 'other'
}

const TIER_ORDER: Readonly<Record<PreferredCuisine, ReadonlyArray<SourceTier>>> = {
  in: ['recalc', 'indb', 'ifct', 'usda', 'usda_local', 'usda_api', 'other'],
  west: ['usda', 'usda_local', 'usda_api', 'recalc', 'indb', 'ifct', 'other'],
}
// "An Indian value" for the hard rule: Indian data, not USDA data on an Indian dish.
const INDIAN_DATA_TIERS: ReadonlySet<SourceTier> = new Set(['recalc', 'indb', 'ifct'])

export interface OrderedCandidates<T> { ordered: T[]; dropped: T[] }

// Stable sort: cuisine match first, then neutral, then the other cuisine; within each, the preference's
// source order; ties keep their search order. Hard rule (founder m2, "055/056 never replace an Indian
// value"): with an Indian preference and at least one Indian-data candidate (recalc / indb / ifct tagged
// Indian), every local-USDA (055) candidate is dropped.
export function orderCandidates<T>(
  cands: ReadonlyArray<T>, pref: PreferredCuisine, rank: (c: T) => CandidateRank,
): OrderedCandidates<T> {
  const info = cands.map((c, i) => ({ c, i, r: rank(c) }))
  const indianValue = pref === 'in' && info.some(({ r }) => r.cuisine === 'in' && INDIAN_DATA_TIERS.has(r.tier))
  const kept: typeof info = []
  const dropped: typeof info = []
  for (const x of info) (indianValue && x.r.tier === 'usda_local' ? dropped : kept).push(x)
  const order = TIER_ORDER[pref]
  const tierPos = (t: SourceTier) => { const p = order.indexOf(t); return p < 0 ? order.length : p }
  const group = (cu: Cuisine) => (cu === pref ? 0 : cu === 'neutral' ? 1 : 2)
  kept.sort((a, b) => group(a.r.cuisine) - group(b.r.cuisine) || tierPos(a.r.tier) - tierPos(b.r.tier) || a.i - b.i)
  return { ordered: kept.map((x) => x.c), dropped: dropped.map((x) => x.c) }
}

// ── USDA household measures (056) vs founder / research portion rows ─────────
// Today (portions.ts demoteUsda): region IN and no size word -> USDA measures rank after the food's own
// category rows. WP6 makes it cuisine-aware (plan WP6 "Other files"; Q13: the (l)3 explicit-size
// exception applies to cafe drinks only):
//   Indian food            -> always demote, any region, any size word (dosa 60 g, not FNDDS 80 g)
//   Western food           -> never demote (USDA first)
//   neutral food, region IN -> demote, unless a size word was given for a cafe drink ("large cappuccino")
//   neutral food, region US -> never demote
export interface UsdaMeasureContext { cuisine: Cuisine; region: Region; sizeGiven: boolean; cafeDrink: boolean }
export function demotesUsdaMeasures(x: UsdaMeasureContext): boolean {
  if (x.cuisine === 'in') return true
  if (x.cuisine === 'west' || x.region !== 'IN') return false
  return !(x.sizeGiven && x.cafeDrink)
}
