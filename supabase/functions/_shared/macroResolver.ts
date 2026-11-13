// ── Macro resolver (RAG core) ─────────────────────────────────────────────────
// Replaces "the LLM invents macro numbers" with a grounded pipeline:
//
//   parsed foods → 1. the user's memory + the shared verified exact hit (+ a curated
//                     alias in ranked mode) (user_food_memory → food_items; precedence in step 1)
//                → 2. DB candidates from the VERIFIED base: ranked search_foods (exact
//                     aliases + trigram, migration 052) when RESOLVER_SEARCH says so, else
//                     the old FTS query. Ranked trigram rows must pass gateCandidate
//                     (food identity + preparation state) before the matcher sees them
//                → 3. USDA search candidates for remaining misses (in parallel with step 2)
//                → 4. ONE cheap LLM call: pick best candidate per miss, or
//                     emit a per-100g estimate when nothing matches. Every
//                     estimate is checked against validate.ts; doubtful ones
//                     get ONE retry told which rule they broke
//                → 5. private rows + the user's memory; shared rows change only in migrations
//                → 6. macros computed HERE in code: quantity_g × per100g / 100
//
// The LLM never outputs final macro numbers — identical input therefore
// resolves to identical macros, and repeat foods cost zero external calls.
//
// Trust model since migration 050 (v1.2 Phase 3, "stop the bleeding"):
//   * food_items rows are verified (the shared reference base: USDA/INDB/IFCT
//     rows that passed the rules), unverified (private: AI estimates, label
//     scans, personal USDA picks) or quarantined (numbers judged wrong, served
//     to nobody). Only verified rows hold the shared exact-hit key.
//   * This code never creates a shared row. What it learns for a user goes into
//     that user's private rows and their user_food_memory pointers, so one
//     user's guess can no longer become everyone's number ("chutney" → sweet
//     chutney for everybody was the failure that started this).
//   * The generic 200 kcal stand-in is gone. A food whose estimate still fails
//     the rules after the retry is logged as a flagged ROUGH estimate (private
//     row, low confidence, never remembered; an impossible guess is repaired
//     first); only a food with no usable number at all is left out, and the rest
//     of the meal still logs (founder decision D5, "log the rest, flag the unknown").
//   * The installed app never shows coach_note, so the flag also rides where it
//     CAN be seen: the entry's quantity_label ("1 plate · rough estimate", shown
//     on the meal card) and a separate chat row (see entryQuantityLabel).

import { searchUsda, UsdaUnavailableError, type UsdaCandidate, type UsdaPortion } from './usda.ts'
import { logAiCall } from './aiLogger.ts'
import {
  foodItemIssues, fromRow, isBlocking, issueHints, roughEstimate, toNumber, toPer100g, RULES_VERSION,
  type IssueCode, type Per100gLike,
} from './validate.ts'

export interface ParsedFood {
  name: string
  quantity_description: string
  quantity_g: number
  confidence: number
  // Present only when the photo was of a nutrition label — these are the
  // label's own printed values, read verbatim by the vision model rather
  // than resolved from USDA/cache. See planLabelFoods() below.
  label_macros?: Partial<Per100gTotals>
  // The gram weight label_macros is FOR, as printed on the label (e.g. 100 for
  // "per 100g", or 40 for "1 serving (40g)"). quantity_g can differ from this
  // when the user states their own portion (e.g. "I ate 90g of this") — the
  // model reports the label's raw numbers unscaled, and planLabelFoods()
  // does the quantity_g/label_serving_g scaling in code, deterministically,
  // rather than trusting the model to do that arithmetic itself.
  label_serving_g?: number
}

export interface Per100g {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

// Same fields as Per100g, but these are already-scaled totals for the food's
// stated quantity_g — not per-100g figures — hence the separate name.
export type Per100gTotals = Per100g

export type MacroSource = 'usda' | 'indb' | 'ifct' | 'ai_estimated' | 'user_created' | 'label'

export interface ResolvedFood extends ParsedFood {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  // null only when an edit kept the numbers of an entry logged before the
  // resolver existed (food_entries.food_item_id is nullable; see
  // log-food-from-text). Everything resolveFoods returns carries a real row.
  food_item_id: string | null
  macro_source: MacroSource
  // HOW the numbers were found (macro_source says where they came from).
  // Optional so older call sites and saved payloads stay valid; the eval
  // tallies it to see which tier each food took.
  resolution?: Resolution
  // True when the numbers are a flagged rough estimate (D5): set for
  // resolution 'rough_estimate', and kept by an edit that rescales one, so the
  // flag survives a quantity change. Drives the note, the label marker and the
  // confidence cap.
  rough?: boolean
  // Ranked search only: 1 for a verified exact/alias hit, search_foods' score for
  // a reference_match. A raw signal for Phase 8 calibration, not a confidence.
  // Never stored (the food_entries inserts map their fields one by one).
  match_score?: number
}

export interface Totals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export type Resolution =
  | 'memory'          // the user's own user_food_memory pointer
  | 'verified_exact'  // the shared verified row with this exact normalized name
  | 'verified_alias'  // a curated food_aliases phrase → its verified row (migration 052); skips the matcher
  | 'reference_match' // the matcher picked a verified row from fuzzy search
  | 'usda_match'      // the matcher picked a USDA search result
  | 'ai_estimate'     // the matcher's own per-100 g estimate
  | 'rough_estimate'  // an estimate that failed the rules twice, repaired and flagged (D5)
  | 'label_scan'      // read off a nutrition label photo
  | 'edit_rescale'    // an edit kept the previous entry's numbers, rescaled (log-food-from-text)

// Same values as the CHECK on user_food_memory.origin (migration 050).
export type MemoryOrigin = 'history' | 'reference_match' | 'usda_match' | 'ai_estimate' | 'label' | 'correction' | 'manual'

// Origins the USER taught us. These outrank the shared verified exact hit;
// machine-learned ones do not (founder decision D6).
const USER_TAUGHT: ReadonlySet<string> = new Set(['label', 'correction', 'manual'])

export type MemoryMode = 'on' | 'write_only' | 'off'

// A food we could not put a single usable number on, so it was left out of the
// log (the rest of the meal still logs). `index` is its position in the list
// the caller passed in — see placeFoods().
export interface UnresolvedFood {
  index: number
  name: string
  reason: 'no_estimate' | 'invalid_estimate' | 'label_serving_missing'
  issues: IssueCode[]
}

export interface ResolveResult {
  // The caller's order, with unresolved foods left out.
  foods: ResolvedFood[]
  totals: Totals
  unresolved: UnresolvedFood[]
}

// Upper bound on food_entries.ai_confidence for a rough estimate (D5), so it
// can never read as a confident number however sure the parse step was.
export const ROUGH_MAX_CONFIDENCE = 0.3

export const capRoughConfidence = (c: unknown): number =>
  typeof c === 'number' && Number.isFinite(c) ? Math.min(c, ROUGH_MAX_CONFIDENCE) : ROUGH_MAX_CONFIDENCE

// D5's flag, put where the INSTALLED app shows it. No app build reads
// coach_note (HomeScreen even filters the confirmation rows out of its
// history), but MealCard prints every entry's quantity_label next to its name,
// so a rough entry reads "Zorblax (1 plate · rough estimate · 200 g)".
// The marker is stripped before it is (re)applied: the card's edit text is
// built from these labels, so an edit sends "1 plate · rough estimate" back to
// the parse step, and it must neither double up nor stick to a food whose
// numbers are no longer rough. food_name is never touched — the edit rescale
// matches previous entries by normalizeName(food_name).
const ROUGH_MARKER = 'rough estimate'
const ROUGH_MARKER_RE = /\s*·?\s*\(?\s*rough estimate\s*\)?/gi

export function stripRoughMarker(s: string): string {
  return s.replace(ROUGH_MARKER_RE, '').trim()
}

export function entryQuantityLabel(f: { quantity_description?: string | null; rough?: boolean }): string | null {
  const desc = typeof f.quantity_description === 'string' ? f.quantity_description : null
  const base = desc === null ? '' : stripRoughMarker(desc)
  if (f.rough) return base ? `${base} · ${ROUGH_MARKER}` : ROUGH_MARKER
  if (desc === null) return null
  return base === desc.trim() ? desc : (base || null)
}

export interface ResolveOpts {
  openRouterKey: string
  fdcApiKey: string
  userId: string
  // 'on' (default) reads and writes user_food_memory; 'write_only' learns but
  // never serves (a cautious way to roll memory out); 'off' is the kill switch
  // and what the eval uses so every run starts cold. RESOLVER_MEMORY secret.
  memory?: MemoryMode
  // false = write NOTHING: no rows, no memory, no last_used_at touches. For the
  // in-process eval, which must never write to production.
  persist?: boolean
  // How step 2 finds DB candidates. 'fts' (default) is the pre-Phase-4 query,
  // unchanged. 'ranked' reads curated aliases in step 1 and asks search_foods
  // (migration 052) for a deterministic, ranked candidate list. The callers
  // decide per request from the RESOLVER_SEARCH secret (see effectiveSearch).
  search?: 'fts' | 'ranked'
}

export const memoryModeFromEnv = (v: string | undefined): MemoryMode =>
  v === 'off' || v === 'write_only' ? v : 'on'

// RESOLVER_SEARCH secret: 'fts' (default: today's query), 'eval_only' (ranked
// for the internal eval accounts only), 'ranked' (everyone). Same kill-switch
// pattern as RESOLVER_MEMORY: flipping it needs no deploy, and an unset or
// misspelt value falls back to the old behaviour rather than the new one.
// eval_only is how the ranked path meets real traffic first: the deployed
// function, real latency, real data, but only the eval user's requests.
export type SearchMode = 'fts' | 'eval_only' | 'ranked'
export const searchModeFromEnv = (v: string | undefined): SearchMode =>
  v === 'ranked' || v === 'eval_only' ? v : 'fts'
export const effectiveSearch = (m: SearchMode, email?: string | null): 'fts' | 'ranked' =>
  m === 'ranked' || (m === 'eval_only' && !!email && email.toLowerCase().endsWith('@steadyapp.internal')) ? 'ranked' : 'fts'

// "a", "a and b", "a, b and c" — deduped, each quoted.
function quoteList(names: string[]): string {
  const seen = new Set<string>()
  const unique = names.filter((n) => {
    const k = normalizeName(n)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const q = unique.map((n) => `"${n}"`)
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}

// The reply when NOTHING in the message could be logged (every food unusable).
// Nothing was written; the user is asked for the detail that would fix it.
export function unsureReply(names: string[], channel: 'text' | 'photo'): string {
  const list = quoteList(names)
  return channel === 'text'
    ? `I couldn't find reliable nutrition numbers for ${list}, so I haven't logged this meal yet. What's in it — the main ingredients, or the brand? Send the whole meal again with that detail and I'll log it.`
    : `I couldn't find reliable nutrition numbers for ${list} in this photo, so I haven't logged it yet. Could you type the meal here in the chat with a bit more detail?`
}

// D5's one-line flag, appended to the meal's coach note when a meal logged
// with a rough estimate in it, or with a food left out. '' when neither.
// The food rows on the card are not tappable; the way to fix a number is the
// card's ⋮ menu → "Adjust Calories & Macros", so the copy points there.
export function estimateNote(roughNames: string[], leftOutNames: string[]): string {
  const parts: string[] = []
  if (roughNames.length > 0) {
    const many = new Set(roughNames.map(normalizeName)).size > 1
    parts.push(many
      ? `${quoteList(roughNames)} are rough estimates — adjust them from the meal's ⋮ menu.`
      : `${quoteList(roughNames)} is a rough estimate — adjust it from the meal's ⋮ menu.`)
  }
  if (leftOutNames.length > 0) {
    const many = new Set(leftOutNames.map(normalizeName)).size > 1
    parts.push(`I couldn't estimate ${quoteList(leftOutNames)} — add ${many ? 'them' : 'it'} manually.`)
  }
  return parts.join(' ')
}

// Callers often resolve only SOME of a meal's foods (label scans and edit
// rescales take other paths) and merge the results back by position. Because
// resolveFoods leaves unresolved foods out of `foods`, a plain foods[j] lookup
// would shift every later food by one; this puts each resolved food back at
// target[positions[j]] and leaves unresolved positions undefined.
export function placeFoods(
  target: Array<ResolvedFood | undefined>,
  positions: number[],
  result: Pick<ResolveResult, 'foods' | 'unresolved'>,
): void {
  const left = new Set(result.unresolved.map((u) => u.index))
  let next = 0
  positions.forEach((pos, j) => {
    if (!left.has(j)) target[pos] = result.foods[next++]
  })
}

// Injected into the parse prompts so gram estimates stay anchored to the same
// reference points on every call (temperature 0 makes them repeatable).
export const GRAM_HINTS_PROMPT = `Gram estimation reference (use these consistently):
- liquids: milk 1.03 g/ml, water 1.0 g/ml, juice 1.04 g/ml, oil 0.92 g/ml, beer/most drinks ~1.0 g/ml
- volumes: 1 pint = 568ml (UK/standard) or 473ml (US), 1 US cup = 240ml, 1 can = 330-355ml,
  1 glass = 240-250ml, 1 grande (Starbucks) = 473ml, 1 tall = 354ml, 1 venti = 591ml —
  when a count precedes a volume unit (e.g. "2 pints", "3 cans"), multiply the unit's ml by
  that count before converting to grams
- pieces: almond 1.2g, cashew 1.6g, walnut half 2g, large egg 50g, bread slice 25g,
  roti/chapati 40g, paratha 80g, idli 40g, plain dosa 85g, banana 118g, apple 180g,
  samosa 50g, vada pav 130g, oreo/similar biscuit 11g, chicken nugget 16g,
  french toast slice 65g, medjool date 24g, slice of pizza 110g
- a stuffed or loaded version of a dish weighs much more than the plain one — a
  masala dosa (potato-filled) is ~200g, not the 85g of a plain dosa; the same goes
  for stuffed parathas vs plain, or a loaded sandwich vs a plain one
- portions: 1 katori/small bowl ≈ 150g, 1 plate of a single cooked dish ≈ 200g,
  1 cup cooked rice ≈ 160g, 1 tbsp ≈ 15g, 1 tsp ≈ 5g
- but a FULL MAIN-COURSE PLATE — a rice-based meal (biryani, pulao, fried rice,
  rajma/chole chawal, curd rice as a meal) or a thali-style combination — is
  350-450g TOTAL, not 200g. Split that larger total across its components rather
  than splitting a 200g plate, or the whole meal lands ~40% short.
- ADDITIVES IN DRINKS are a splash or a spoonful, NOT a second full serving.
  "coffee/tea with milk" = one ~240ml cup TOTAL, of which milk is only ~30g —
  never 240g of coffee plus 240g of milk. A "spoon" of sugar/honey means a
  teaspoon (~5g) unless they say tablespoon, so "2 spoons of sugar" ≈ 10g.
  Water, black coffee, black/green tea, lemon water and soda water carry
  essentially no calories — log the additive (milk, sugar, honey), and let the
  water itself be just water, not a caloric ingredient.
- when a single mixed dish (e.g. "a plate of chicken biryani", "paneer butter masala")
  is broken into components per the logging rule below, the portion weight (e.g. that
  same ≈200g plate) is the TOTAL across all its components, not each component's own
  weight — split it proportionally (e.g. biryani ≈ 45% rice, 35% chicken, 20% sauce/spices
  by weight) rather than assigning the full plate weight to every component`

// lowercase → strip punctuation → collapse whitespace. Modifiers are kept on
// purpose: "soaked almonds" and "almonds" cache as separate canonical foods.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Household-measure words users actually type, mapped to the vocabulary USDA
// publishes in its portion descriptions. "a bowl of cereal" has to become
// "1 cup" before we can look up what it weighs.
// Plurals matter here: users type "3 cups", not "3 cup", and a bare \bcup\b
// fails against "cups" because the trailing s is still a word character.
const UNIT_SYNONYMS: Array<{ match: RegExp; usda: RegExp }> = [
  { match: /\b(bowls?|cups?|glass(es)?|mugs?)\b/i, usda: /\bcups?\b/i },
  { match: /\b(pieces?|slices?|items?|pcs?)\b/i, usda: /\b(pieces?|items?|slices?)\b/i },
  { match: /\b(tbsps?|tablespoons?)\b/i, usda: /\b(tbsps?|tablespoons?)\b/i },
  { match: /\b(tsps?|teaspoons?)\b/i, usda: /\b(tsps?|teaspoons?)\b/i },
]

// Leading count in a portion phrase: "2 samosas" → 2, "half a plate" → 0.5,
// "a bowl"/"an apple" → 1. Returns null when the phrase names no count at all.
function parseCount(desc: string): number | null {
  const d = desc.toLowerCase().trim()
  if (/^(half|1\/2)\b/.test(d)) return 0.5
  if (/^(quarter|1\/4)\b/.test(d)) return 0.25
  const num = d.match(/^(\d+(?:\.\d+)?)/)
  if (num) return parseFloat(num[1])
  if (/^(a|an|one|some)\b/.test(d)) return 1
  return null
}

// Deterministic portion lookup for foods served straight from the food_items
// cache, which never reach the LLM match step (that's the point of a cache) and
// so would otherwise keep the parse step's unchecked gram guess forever.
// Returns null whenever it can't answer confidently — callers keep their
// original estimate rather than accept a shaky correction.
export function correctPortionFromMeasures(
  quantityDescription: string,
  portions: UsdaPortion[] | null | undefined,
): number | null {
  if (!portions?.length || !quantityDescription) return null

  // An explicit weight or volume is the user's own measurement — authoritative,
  // never second-guess it ("100g of rice", "250 ml milk").
  if (/\d\s*(g|gram|grams|kg|ml|l|litre|liter|oz|ounce|ounces)\b/i.test(quantityDescription)) return null

  const count = parseCount(quantityDescription)
  if (count === null) return null

  const syn = UNIT_SYNONYMS.find((s) => s.match.test(quantityDescription))
  if (!syn) return null

  const portion = portions.find((p) => syn.usda.test(p.description) && p.gramWeight > 0)
  if (!portion) return null

  // A published measure carries its own amount — USDA lists cereal as
  // "1.5 cup (1 NLEA serving) = 32g", not "1 cup = 32g". Divide it back out to
  // a per-unit weight before scaling by the user's count, or "a bowl" would
  // silently inherit a one-and-a-half-cup weight.
  const portionAmount = parseCount(portion.description) ?? 1
  if (portionAmount <= 0) return null
  const perUnit = portion.gramWeight / portionAmount

  const grams = Math.round(count * perUnit * 10) / 10
  return grams > 0 ? grams : null
}

export function computeMacros(quantityG: number, per100g: Per100g) {
  const f = (per100: number) => Math.round((quantityG * per100) / 100 * 10) / 10
  return {
    calories: f(per100g.calories),
    protein_g: f(per100g.protein_g),
    carbs_g: f(per100g.carbs_g),
    fat_g: f(per100g.fat_g),
    fiber_g: f(per100g.fiber_g),
  }
}

// How many ranked DB candidates each miss offers the matcher (search_foods' k).
// The FTS path offered 3; ranked rows are ordered best-first, so 5 costs a few
// prompt lines and catches a right row that a near-tie pushed to 4th or 5th.
const SEARCH_K = 5

// ── Ranked-search candidate gate (v1.2 Phase 4.1) ─────────────────────────────
// strict_word_similarity gives 1.0 to ANY row that contains the query's word, so
// search_foods surfaces longer, different dishes and other states of the food:
// "oats" → "Oats burfi", "chicken" → "Chicken curry", "bhindi" → "Okra fry (Bhindi
// sabzi)". Those rows carry portions and come first in the matcher's list, and
// the matcher took the near-miss over the USDA row or its own estimate. The gate
// drops them BEFORE the matcher sees them. It combines two ideas:
//   * Intake24's missing/extra-word penalty: a row whose name is mostly words the
//     user did not say, or that lacks most of the words they did, is another food;
//   * FAO/INFOODS food matching: food identity AND preparation state must both
//     match, so a row that names a state or form the user did not (curry,
//     porridge, juice, raw…) is another food.
// Calibrated on 611 labelled search_foods rows (139 miss phrases: real-user
// phrases, eval account excluded, and the dev set dataset-v3), never the held-out
// set. On that calibration set it keeps 53/61 right rows and drops 348/550
// near-misses; 7/46 phrases lose every right row (USDA or an estimate then serves
// them). A second labelled batch of 55 organic phrases (223 rows: 31/31 kept,
// 107/192 dropped) is NOT held out: it was labelled before the doubled-letter
// squeeze was added and informed both that and the usual-preparation rule below.
// There is no independent organic check; the held-out eval run is the real test.
// The word lists and thresholds are the calibrated ones; change them only with a
// new labelled run. Pure and deterministic: same words, same verdict.
// Exact and alias rows are verified keys and are never gated (keepSearchRow).
const GATE_MAX_EXTRA = 0.6     // share of the row's name words the user did not say
const GATE_MAX_MISSING = 0.6   // share of the user's words the row's name lacks

// Python-style split on runs of whitespace, no empty strings.
const gateSplit = (s: string): string[] => s.split(/\s+/).filter((w) => w !== '')

// A plural stripped from the word as written (-ies → -y, -oes → -o, -s), THEN
// doubled letters squeezed (daal = dal, moong = mong) and y folded to i, and a
// final -ie to -i: eggs → egg → eg = egg; chillies → chilly → chili = chilli;
// cookies → cooky → coki = cookie; curries = curry. Squeezing first broke the
// length check ("eggs" → "egs" kept its s). Applied to the word lists too.
function gateStem(t: string): string {
  let s = t
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y'
  else if (s.length > 4 && s.endsWith('oes')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  s = s.replace(/(.)\1+/g, '$1').replace(/y/g, 'i')
  return s.length > 2 && s.endsWith('ie') ? s.slice(0, -1) : s
}
const gateVocab = (words: string): ReadonlySet<string> => new Set(gateSplit(words).map(gateStem))

// Words that never decide identity: function words (English and Hinglish), and
// amount, serving, cut or garnish words, which change grams, not per-100 g.
const GATE_IGNORED = gateVocab(
  'a an the of with and or in on to for at from by into ki ka ke kay ki saath aur ' +
  'handful piece pieces slice slices small large medium big bowl cup cups glass katori plate serving portion ' +
  'diced chopped sliced julienned grated minced shredded cubed cubes florets garnish dollop pat side another used label ' +
  'fresh plain homemade home made regular',
)
// Preparation-state and dish-form words: each one changes the per-100 g numbers.
const GATE_STATE = gateVocab(
  'raw cooked boiled fried fry roasted baked grilled steamed stuffed bharwa dry dried scrambled mashed sweetened unsweetened ' +
  'curry gravy korma stew sabzi sabji subji porridge kheer halwa burfi barfi ladoo chikki smoothie milkshake shake ' +
  'juice powder oil flour seeds seed leaves soup sauce chutney pickle achaar raita salad sandwich pulao biryani ' +
  'paratha parantha roti cake pie pudding biscuit cookies icing dip dressing jam murabba marmalade pizza taco burger ' +
  'tikka kebab mousse tart souffle gateau',
)
// Spellings of one form: sabzi/sabji/subji/gravy are all a curry, fry = fried,
// bharwa = stuffed ("Stuffed okra (Bharwa bhindi)" is stuffed in both names)…
const GATE_SAME_FORM: ReadonlyMap<string, string> = new Map(
  Object.entries({ sabzi: 'curry', sabji: 'curry', subji: 'curry', gravy: 'curry', fry: 'fried', barfi: 'burfi', parantha: 'paratha', bharwa: 'stuffed' })
    .map(([k, v]) => [gateStem(k), gateStem(v)]),
)
const gateForm = (t: string): string => GATE_SAME_FORM.get(t) ?? t
// A food's USUAL preparation: the state it is eaten in when nobody says otherwise
// ("cooked instant noodles", "boiled corn", "Raisins, dried"). On a row it is a
// conflict only when the user said raw, or named a state or form the row lacks
// outside the word's own class: boiled rice = cooked rice, fried rice ≠ cooked
// rice, chicken curry ≠ "Chicken, cooked". Every other state word is a conflict
// whenever the user did not say it, and a row saying raw still always is (IFCT's
// "(raw)" also labels foods eaten as they are: "Beet root (raw)", "Rice puffed
// (raw)"; USDA's rows still reach the matcher for those).
const GATE_USUAL_CLASS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ...[...gateVocab('cooked boiled steamed')].map((w) => [w, gateVocab('cooked boiled steamed')] as const),
  [gateStem('dried'), gateVocab('dried dry')] as const,
])
const GATE_RAW = gateStem('raw')

// Lowercase, punctuation → space, drop 1-letter tokens, stem.
const gateTokens = (s: string): string[] =>
  gateSplit(s.toLowerCase().replace(/[^0-9a-z\s]/g, ' ')).filter((t) => t.length > 1).map(gateStem)

// t is one of the tokens, or two adjacent tokens written together, in either
// order ("beetroot" = "beet root"; "babycorn" = IFCT's inverted "Corn, Baby").
function gateCovered(t: string, tokens: string[]): boolean {
  if (tokens.includes(t)) return true
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] + tokens[i + 1] === t || tokens[i + 1] + tokens[i] === t) return true
  }
  return false
}

export interface GateVerdict {
  keep: boolean
  extra: number        // share of the best-matching name's words the user did not say
  missing: number      // share of the user's words the row's full name lacks
  states: string[]     // conflicting state/form words: the row names them, the user did not (stemmed)
  rawMissing: boolean  // the user said raw and the row does not
}

// `query` is the normalized phrase search_foods was asked for; `name` the row's
// name. A row's names are the text before the first comma (outside brackets)
// plus each bracketed name ("Okra fry (Bhindi sabzi)" has two); spellings joined
// by "/" fill one word slot ("Bhindi sabzi/sabji/subji").
export function gateCandidate(query: string, name: string): GateVerdict {
  const qt = gateTokens(query).filter((t) => !GATE_IGNORED.has(t))
  const full = gateTokens(name)
  const outside = name.replace(/\([^)]*\)/g, ' ')
  const bracketed = (name.match(/\([^)]*\)/g) ?? []).map((m) => m.slice(1, -1))
  const commaQualifiers = outside.split(',').slice(1)

  // Each name → its word slots; a slot is the set of spellings for one word.
  const names: Array<Array<Set<string>>> = []
  for (const g of [outside.split(',')[0], ...bracketed]) {
    const slots: Array<Set<string>> = []
    for (const w of gateSplit(g)) {
      const opts = new Set(
        gateSplit(w.toLowerCase().replace(/[^0-9a-z/\s]/g, ' ').replace(/\//g, ' '))
          .filter((t) => t.length > 1).map(gateStem).filter((o) => o !== '' && !GATE_IGNORED.has(o)),
      )
      if (opts.size > 0) slots.push(opts)
    }
    if (slots.length > 0) names.push(slots)
  }

  // Extra words: the name (of the row's names) with the smallest share of slots
  // the query does not cover. Ties keep the first name.
  const qset = new Set(qt)
  const joinedQ = new Set<string>()
  for (let i = 0; i < qt.length - 1; i++) joinedQ.add(qt[i] + qt[i + 1])
  let extra = 1
  let best: Array<Set<string>> = names[0] ?? []
  let bestHit: boolean[] = []
  for (const slots of names) {
    const hit = slots.map((s) => [...s].some((o) => qset.has(o) || joinedQ.has(o) || gateCovered(o, qt) ||
      // a query word that is this word joined to another word of the row, either
      // order: "babycorn" covers "Corn" in "Corn, Baby"
      full.some((f) => f !== o && (qset.has(o + f) || qset.has(f + o)))))
    // "bhelpuri" / "cornflakes" in the query covers two adjacent name slots.
    for (let i = 0; i < slots.length - 1; i++) {
      if ([...slots[i]].some((a) => [...slots[i + 1]].some((b) => qset.has(a + b)))) hit[i] = hit[i + 1] = true
    }
    const share = hit.filter((h) => !h).length / slots.length
    if (share < extra) { extra = share; best = slots; bestHit = hit }
  }
  const missing = qt.length > 0 ? qt.filter((t) => !gateCovered(t, full)).length / qt.length : 0

  // State veto: state words in the best-matching name, plus those in qualifiers.
  // A comma qualifier always counts ("Chicken, curry style" → curry); a bracketed
  // one only when it is nothing but state words ("Beet root (raw)"), because the
  // others are alternate names ("Okra fry (Bhindi sabzi)"). A slot the user's word
  // already matched adds no state: its other spellings are that same word
  // ("Chapati/Roti" for chapati is not a roti-form of chapati).
  const qStates = new Set(qt.filter((t) => GATE_STATE.has(t)).map(gateForm))
  const rowStates = new Set<string>()
  best.forEach((s, i) => { if (!bestHit[i]) for (const t of s) if (GATE_STATE.has(t)) rowStates.add(gateForm(t)) })
  for (const g of [...commaQualifiers, ...bracketed]) {
    const cont = gateTokens(g).filter((t) => !GATE_IGNORED.has(t))
    if (cont.length > 0 && cont.every((t) => GATE_STATE.has(t))) cont.forEach((t) => rowStates.add(gateForm(t)))
    else if (commaQualifiers.includes(g)) cont.filter((t) => GATE_STATE.has(t)).forEach((t) => rowStates.add(gateForm(t)))
  }
  // A usual preparation (GATE_USUAL_CLASS) the user did not contradict is no conflict.
  const qOnly = [...qStates].filter((s) => !rowStates.has(s))
  const usual = (s: string): boolean => {
    const cls = GATE_USUAL_CLASS.get(s)
    return !!cls && !qStates.has(GATE_RAW) && qOnly.every((q) => cls.has(q))
  }
  const states = [...rowStates].filter((s) => !qStates.has(s) && !usual(s)).sort()
  const rawMissing = qset.has(GATE_RAW) && !full.includes(GATE_RAW)

  return {
    keep: extra <= GATE_MAX_EXTRA && missing <= GATE_MAX_MISSING && states.length === 0 && !rawMissing,
    extra, missing, states, rawMissing,
  }
}

// The ranked path's verdict on one search_foods row (`norm` = the phrase it was
// asked for). Exact and alias rows are verified keys for the whole phrase: kept.
// A row scoring under 0.3 can only come from 052's TAIL SLOT (the trigram branch
// admits nothing below 0.3). If its key is not the last word itself, that word
// reached it as an ALIAS ("amul curd": curd → dahi), so the gate also reads the
// alias as one of the row's names; otherwise "dahi" shares no word with the
// phrase and could never pass. Every other row, an exact-key tail row included
// ("stir fried idli" → Idli), is judged on its own name: the labelled tail rows
// are mostly one part of a meal ("palak paneer with roti" → roti) or a variant.
export function keepSearchRow(
  norm: string,
  row: { name?: unknown; match_kind?: unknown; score?: unknown; matched_key?: unknown },
): boolean {
  if (row.match_kind === 'exact' || row.match_kind === 'alias') return true
  const name = String(row.name ?? '')
  const sp = norm.lastIndexOf(' ')
  const tail = sp > 0 ? norm.slice(sp + 1) : undefined
  const viaTailAlias = tail !== undefined && Number(row.score) < 0.3 && row.matched_key !== tail
  return gateCandidate(norm, viaTailAlias ? `${name} (${tail})` : name).keep
}

// Ranked mode only: added to the matcher prompt (the fts prompt is unchanged).
// The gate leaves rows that are a SUBSET of the query ("mango lassi" → lassi,
// "coffee latte" → coffee) or a VARIANT of a generic one ("tea" → Iced tea,
// "sandwich" → Salami sandwich); only the matcher can judge those, and the old
// prompt guarded one direction only (a composite dish named after an ingredient).
const RANKED_IDENTITY_RULE = 'IDENTITY AND STATE MUST BOTH MATCH. Every food word the user said must be true of the candidate (latte, mango, juice, fried, butter, bhurji), and the candidate must not add a food, flavour or variant they did not say (iced, mango, salami, quinoa). Same preparation and form: raw vs cooked, dry vs porridge, plain vs curry, fruit vs juice, ripe vs raw/green. If no candidate passes both checks, prefer a USDA candidate that does, otherwise set candidate_index to null and estimate. A near-miss database row is worse than an estimate. List order is not a signal.'

// One retrieved candidate a miss can be matched against — either an existing
// cache row (carries its id) or a fresh USDA result (carries its fdcId).
interface Candidate {
  label: string
  per100g: Per100g
  cacheRowId?: string
  cacheSource?: MacroSource
  fdcId?: number
  // Household measures for this food ("1 item = 38g"): USDA's published ones,
  // or the portions stored on a verified row (ranked search only). Used to
  // sanity-check the parse step's gram guess — see matchCall().
  portions?: UsdaPortion[]
  // search_foods' raw signals (ranked mode only). Never shown to the matcher:
  // a number in the prompt would anchor its pick, and these are not calibrated.
  score?: number
  matchKind?: 'exact' | 'alias' | 'trgm'
}

// deno-lint-ignore no-explicit-any
export async function resolveFoods(
  supabase: any,
  parsed: ParsedFood[],
  opts: ResolveOpts,
): Promise<ResolveResult> {
  const memoryMode = opts.memory ?? 'on'
  const persist = opts.persist !== false
  if (parsed.length === 0) return { foods: [], totals: sumTotals([]), unresolved: [] }

  // Dedupe by normalized name so "milk" twice in one meal resolves once.
  const norms = parsed.map((p) => normalizeName(p.name))
  const uniqueNorms = [...new Set(norms)]

  // ── 1. The user's memory + the shared verified exact hit, read together ──
  // Independent reads, so they run in parallel. Memory is a pointer only
  // (user, phrase) → food_items row; the numbers always come from food_items,
  // so a later quarantine of that row reaches the user immediately.
  // In ranked mode a third read joins the same round trip: the curated aliases
  // (migration 052, "curd" → the verified dahi row). An alias is a verified key
  // under another name, so it is read here with the exact hit, not searched.
  const ranked = opts.search === 'ranked'
  const [memRes, exactRes, aliasRes] = await Promise.all([
    memoryMode === 'off'
      ? Promise.resolve({ data: [] as any[], error: null })
      : supabase
          .from('user_food_memory')
          .select('normalized_name, origin, food_items!inner(id, source, status, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, portions)')
          // The Edge Functions use the service role, which bypasses RLS: this
          // filter IS the security boundary between one user's memory and another's.
          .eq('user_id', opts.userId)
          .in('normalized_name', uniqueNorms),
    supabase
      .from('food_items')
      .select('id, source, normalized_name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, portions')
      .in('normalized_name', uniqueNorms)
      // Since 050 only verified rows hold normalized_name, so this filter is
      // belt-and-braces — but it keeps the query honest if a key ever slips through.
      .eq('status', 'verified')
      .not('calories_per_100g', 'is', null),
    ranked
      ? supabase
          .from('food_aliases')
          .select('alias, food_items!inner(id, source, status, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, portions)')
          .in('alias', uniqueNorms)
          // Filtered here AND re-checked below: an alias whose target was later
          // quarantined must stop serving, not serve a bad row under a good name.
          .eq('food_items.status', 'verified')
          .not('food_items.calories_per_100g', 'is', null)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  // A failed exact read used to look exactly like "every food is a miss",
  // which silently paid for LLM calls and wrote rows for foods we already had.
  if (exactRes.error) throw exactRes.error
  // Not fatal, unlike the exact read: an alias read error (e.g. this code deployed
  // before 052, so the table is missing) means "no alias". The food is searched
  // instead, which is what happened to it before aliases existed.
  if (aliasRes.error) console.error('[resolver] alias read failed, continuing without aliases:', aliasRes.error.message)
  // deno-lint-ignore no-explicit-any
  const aliasByNorm = new Map<string, any>()
  for (const a of aliasRes.error ? [] : aliasRes.data ?? []) {
    const t = embedded(a.food_items)
    if (t?.status === 'verified' && t.calories_per_100g != null) aliasByNorm.set(a.alias, t)
  }
  // Memory is an accelerator, not a requirement: without it we resolve the way
  // a brand-new user would. But we also stop WRITING memory for this request,
  // because we no longer know which existing rows are user-taught and must not
  // be overwritten (see rememberFoods).
  const memoryWritable = memoryMode !== 'off' && !memRes.error
  if (memRes.error) console.error('[resolver] memory read failed, continuing without it:', memRes.error.message)

  const memOrigin = new Map<string, string>()
  // deno-lint-ignore no-explicit-any
  const memUsable = new Map<string, { origin: string; row: any }>()
  for (const m of memRes.data ?? []) {
    const t = embedded(m.food_items)
    // Re-validated on every read: a pointer is only as good as the row it
    // points at, and rows can be quarantined by a migration long after the
    // user taught us the food.
    const ok = !!t && t.status !== 'quarantined' && t.calories_per_100g != null &&
      !isBlocking(foodItemIssues(t.source, '', fromRow(t)))
    // Only a USABLE pointer protects its origin from being overwritten. A dead
    // one (its target quarantined) must be replaceable by today's resolution,
    // or a quarantined label scan would send this food to the matcher forever.
    if (ok) memOrigin.set(m.normalized_name, m.origin)
    if (ok && memoryMode === 'on') memUsable.set(m.normalized_name, { origin: m.origin, row: t })
    else if (!ok) console.warn('[resolver] ignoring unusable memory row:', m.normalized_name)
  }
  // deno-lint-ignore no-explicit-any
  const exactByNorm = new Map<string, any>((exactRes.data ?? []).map((r: any) => [r.normalized_name, r]))

  // Precedence (founder decision D6):
  //   1. what the user TAUGHT us (label scan, correction, manual entry)
  //   2. the shared verified exact hit
  //   3. a curated alias (ranked mode; migration 052): a verified row under
  //      another name, so it outranks machine memory exactly as a verified
  //      exact hit does, but never the row that holds the words themselves
  //   4. what we LEARNED for this user (history, matches, AI estimates)
  // A label the user photographed is ground truth for them and must beat the
  // generic reference row; an old machine guess must not beat a verified row.
  //
  // An alias hit behaves like an exact hit in every other way: it touches the
  // row's last_used_at, is never written to memory (fixing an alias in a
  // migration reaches every user at once), and gets its grams corrected from
  // the row's portions.
  //
  // A hit deliberately skips matchCall — we already know this food's macros,
  // and paying for an LLM call would defeat the cache. But the parse step's
  // gram guess still needs checking, so we correct it here from the portions
  // stored on the row (migration 023), deterministically and for free.
  const hits = new Map<string, Hit>()
  const memHitNorms: string[] = []
  const sharedHitIds: string[] = []
  for (const norm of uniqueNorms) {
    const m = memUsable.get(norm)
    const exact = exactByNorm.get(norm)
    const e = exact ?? aliasByNorm.get(norm)          // an alias = a verified key under another name
    const useMem = m !== undefined && (USER_TAUGHT.has(m.origin) || !e)
    const row = useMem ? m.row : e
    if (!row) continue

    // Every parsed food sharing this normalized name; they can differ in how
    // the user phrased the amount, so correct per-food rather than per-row.
    const parsedForRow = parsed.filter((_, i) => norms[i] === norm)
    const correctedG = parsedForRow.length === 1
      ? correctPortionFromMeasures(parsedForRow[0].quantity_description, row.portions) ?? undefined
      : undefined

    hits.set(norm, {
      id: row.id,
      source: row.source as MacroSource,
      per100g: rowPer100g(row),
      correctedG,
      resolution: useMem ? 'memory' : exact ? 'verified_exact' : 'verified_alias',
      ...(ranked && !useMem ? { matchScore: 1 } : {}),
    })
    if (useMem) memHitNorms.push(norm)
    else sharedHitIds.push(row.id)
    console.log(`[resolver] ${useMem ? `memory hit (${m.origin})` : exact ? 'verified hit' : 'alias hit'}:`, norm, correctedG ? `(portion → ${correctedG}g)` : '')
  }

  const missNorms = uniqueNorms.filter((n) => !hits.has(n))

  // ── 2–4. Retrieve candidates + LLM match for the misses ─────────────────
  const resolvedMisses = new Map<string, Hit>()
  const leftOut = new Map<string, Omit<UnresolvedFood, 'index' | 'name'>>()

  if (missNorms.length > 0) {
    const missFoods = missNorms.map((n) => parsed[norms.indexOf(n)])

    const perMissCandidates: Candidate[][] = []
    const usdaDown: boolean[] = []

    await Promise.all(
      missFoods.map(async (food, i) => {
        const norm = missNorms[i]

        // 2. DB candidates from the VERIFIED base, started now and awaited only
        //    after USDA, so the two lookups overlap instead of queueing (the DB
        //    call no longer delays step 3). Candidate ORDER is unchanged: DB rows
        //    first, then USDA. Both paths are verified-only, so decide() may keep
        //    trusting cacheRowId; without that status filter this once searched
        //    other users' private AI guesses — a proven cross-user leak.
        //    ranked (052): search_foods, a total order (exact > alias > trigram
        //    word match > head noun > not raw > similarity > source > id, last
        //    slot kept for the query's last word: "butter naan" -> Naan), so the
        //    same words always offer the matcher the same rows in the same order.
        //    Trigram rows then pass gateCandidate or are DROPPED (not demoted below
        //    USDA, where the matcher could still pick them); exact/alias rows are
        //    verified keys and always kept, and a tail row an alias reached is
        //    also named by that alias (keepSearchRow). Survivors keep SQL's order,
        //    DB first.
        //    A miss whose rows all fail is offered USDA only, then an estimate.
        //    Not fatal: on error or rejection (PGRST202 = function missing, a
        //    timeout, a dropped socket) the matcher sees USDA only, exactly as
        //    when FTS finds nothing, and the failure is logged.
        //    fts: today's query, unchanged, until the cleanup migration drops it.
        //    config 'english' matches food_items_fts_idx so the index is used;
        //    order('id') keeps its 3 candidates stable.
        const dbCandidates: Promise<Candidate[]> = ranked
          ? Promise.resolve(supabase.rpc('search_foods', { q: norm, k: SEARCH_K })).then(
              // deno-lint-ignore no-explicit-any
              ({ data, error }: any) => {
                if (error) {
                  console.error('[resolver] search failed, continuing with USDA only:', norm, error.message)
                  return []
                }
                // deno-lint-ignore no-explicit-any
                const rows: any[] = data ?? []
                const kept = rows.map((r) => keepSearchRow(norm, r))
                if (rows.length) {
                  // "(gated)" marks a row the gate dropped; no row names are logged.
                  console.log('[resolver] search:', norm, rows.map((r, j) => `${r.match_kind}:${Number(r.score).toFixed(2)}${kept[j] ? '' : '(gated)'}`).join(' '))
                }
                return rows.filter((_, j) => kept[j]).map((row): Candidate => ({
                  label: `${row.name} [${row.source}]`,   // same label shape as the FTS path
                  per100g: rowPer100g(row),
                  cacheRowId: row.id,
                  cacheSource: row.source as MacroSource,
                  // A verified row's stored measures (USDA's, or a katori for an
                  // INDB dish) anchor the matcher's gram check as USDA's do.
                  portions: Array.isArray(row.portions) && row.portions.length ? row.portions : undefined,
                  score: Number(row.score),
                  matchKind: row.match_kind,
                }))
              },
              (err: unknown) => {
                console.error('[resolver] search failed, continuing with USDA only:', norm, (err as Error)?.message ?? err)
                return []
              },
            )
          : Promise.resolve(
              supabase
                .from('food_items')
                .select('id, name, source, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g')
                .textSearch('name', norm, { type: 'websearch', config: 'english' })
                .eq('status', 'verified')
                .not('calories_per_100g', 'is', null)
                .order('id')
                .limit(3),
            ).then(
              // deno-lint-ignore no-explicit-any
              ({ data: fuzzy, error: fuzzyErr }: any) => {
                if (fuzzyErr) console.error('[resolver] fuzzy search failed, continuing with USDA only:', norm, fuzzyErr.message)
                // deno-lint-ignore no-explicit-any
                return (fuzzy ?? []).map((row: any): Candidate => ({
                  label: `${row.name} [${row.source}]`,
                  per100g: rowPer100g(row),
                  cacheRowId: row.id,
                  cacheSource: row.source as MacroSource,
                }))
              },
              // A rejection (not an { error } result) used to surface as a logged 500
              // when this query was awaited inline; now it is not fatal, but it must
              // still leave a trace, exactly like the ranked path's.
              (err: unknown) => {
                console.error('[resolver] fuzzy search failed, continuing with USDA only:', norm, (err as Error)?.message ?? err)
                return []
              },
            )
        const usdaCandidates: Candidate[] = []

        // 3. USDA. A missing key is a lasting configuration state, not an
        // outage — skip the lookup but keep genuine-miss semantics so the AI
        // estimate is still remembered and stays deterministic. Only a fetch
        // failure with a valid key marks usdaDown (transient → don't remember).
        usdaDown[i] = false
        if (opts.fdcApiKey) {
          try {
            const usda = await searchUsda(food.name, opts.fdcApiKey)
            for (const c of usda) {
              // USDA has its own broken rows (branded entries with per-serving
              // numbers in per-100 g fields). Never offer the matcher a
              // candidate that is physically impossible.
              const issues = foodItemIssues('usda', c.description, c.per100g)
              if (isBlocking(issues)) {
                console.warn('[resolver] skipping impossible USDA candidate:', c.fdcId, c.description, issues.join(','))
                continue
              }
              usdaCandidates.push({
                label: `${c.description} [USDA ${c.dataType}]`,
                per100g: c.per100g,
                fdcId: c.fdcId,
                portions: c.portions,
              })
            }
          } catch (err) {
            if (err instanceof UsdaUnavailableError) {
              console.error('[resolver] USDA unavailable:', err.message)
              usdaDown[i] = true
            } else {
              throw err
            }
          }
        }

        perMissCandidates[i] = [...(await dbCandidates), ...usdaCandidates]
      })
    )

    // 4. single match call for all misses
    //    (ranked adds RANKED_IDENTITY_RULE to the prompt; the retry below offers no
    //    candidates, so it keeps the shared prompt)
    const matches = await matchCall(supabase, opts.userId, missFoods, perMissCandidates, opts.openRouterKey, undefined, ranked)

    // Decide EVERY food before writing ANYTHING. The old code wrote rows as it
    // went, so a bad answer for the third food left the first two committed.
    const lastIssues: IssueCode[][] = missFoods.map(() => [])
    const decide = (i: number, m: MatchResult, final: boolean): Decision | null => {
      const c = m.candidate_index !== null ? perMissCandidates[i][m.candidate_index] : undefined
      if (c?.cacheRowId) return { kind: 'reference_match', id: c.cacheRowId, source: c.cacheSource!, per100g: c.per100g, score: c.score }
      if (c?.fdcId) {
        return { kind: 'usda_match', cand: c, per100g: c.per100g, issues: foodItemIssues('usda', missFoods[i].name, c.per100g) }
      }
      const est = toPer100g(m.est_per_100g)
      const issues = foodItemIssues('ai_estimated', missFoods[i].name, est ?? m.est_per_100g)
      lastIssues[i] = issues
      if (!est || isBlocking(issues)) return null
      if (issues.length === 0) return { kind: 'ai_estimate', per100g: est, issues }
      if (!final) return null                           // any doubt → one retry with hints (D11)
      // Still doubtful after the retry (a 200/8/25/8 placeholder twice, 0 kcal
      // for a real food, kcal that disagree with the macros). The validator
      // itself rejects these numbers, so D5 applies: log them FLAGGED, not as
      // a plain estimate at full confidence. They are physically possible, so
      // they are kept as the model gave them rather than Atwater-repaired —
      // that would turn a drink whose energy is alcohol into ~0 kcal.
      return { kind: 'rough_estimate', per100g: est, issues }
    }

    const decisions: Array<Decision | null> = matches.map((m, i) => decide(i, m, false))
    const retryIdx = decisions.flatMap((d, i) => (d ? [] : [i]))
    if (retryIdx.length) {
      // ONE retry for all doubtful foods together, each told exactly which
      // rule its numbers broke. No candidates this time: the model already
      // turned them down, and we want its corrected estimate.
      let retry: MatchResult[]
      try {
        retry = await matchCall(
          supabase, opts.userId,
          retryIdx.map((i) => missFoods[i]),
          retryIdx.map(() => []),
          opts.openRouterKey,
          retryIdx.map((i) => issueHints(lastIssues[i])),
        )
      } catch (err) {
        // The retry is a second chance, not a requirement: if it fails we fall
        // back to the first answers below instead of failing the whole meal.
        console.error('[resolver] retry match call failed, using the first answers:', (err as Error)?.message ?? err)
        retry = retryIdx.map(() => ({ candidate_index: null, est_per_100g: null, corrected_quantity_g: null }))
      }

      retryIdx.forEach((i, j) => {
        const first = matches[i]
        const again: MatchResult = { ...retry[j], candidate_index: null, corrected_quantity_g: first.corrected_quantity_g }
        // Best available estimate, in order:
        //   a. the retry's answer if it is clean — the only plain ai_estimate;
        //   b. the retry's, else the first, answer with only a non-blocking
        //      doubt, kept as given but flagged as a rough estimate (D5);
        //   c. founder decision D5, "log the rest, flag the unknown": the guess
        //      made physically possible (validate.ts roughEstimate) and logged
        //      as a private, low-confidence, clearly-flagged rough estimate.
        // Only when neither answer holds a single usable number is the food
        // left out — and the rest of the meal still logs.
        let d = decide(i, again, true) ?? decide(i, { ...first, candidate_index: null }, true)
        if (!d) {
          for (const raw of [retry[j].est_per_100g, first.est_per_100g]) {
            const rough = roughEstimate(raw)
            if (rough) {
              d = { kind: 'rough_estimate', per100g: rough, issues: foodItemIssues('ai_estimated', missFoods[i].name, raw) }
              break
            }
          }
        }
        if (!d) {
          const nothing = retry[j].est_per_100g == null && first.est_per_100g == null
          leftOut.set(missNorms[i], {
            reason: nothing ? 'no_estimate' : 'invalid_estimate',
            issues: foodItemIssues('ai_estimated', missFoods[i].name, retry[j].est_per_100g ?? first.est_per_100g),
          })
          console.error(`[resolver] no usable estimate for "${missFoods[i].name}" after retry — leaving it out`)
        }
        decisions[i] = d
      })
    }

    // ── 5. Commit: private rows + the user's memory ─────────────────────────
    // The shared base changes only through reviewed migrations (050's guard
    // enforces that), so nothing here ever creates a shared row or key.
    //
    // A USDA pick reuses an existing VERIFIED row for the same fdc_id when one
    // exists (same food, same numbers, and the shared row stays the single
    // source of truth); otherwise it becomes the user's own private row
    // (founder decision D1). The oldest row wins so the choice is stable.
    const fdcIds = [...new Set(decisions.flatMap((d) => (d?.kind === 'usda_match' && d.cand.fdcId != null ? [d.cand.fdcId] : [])))]
    // deno-lint-ignore no-explicit-any
    const verifiedUsda = new Map<number, any>()
    if (fdcIds.length > 0) {
      const { data, error } = await supabase
        .from('food_items')
        .select('id, fdc_id, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g')
        .eq('source', 'usda')
        .eq('status', 'verified')
        .in('fdc_id', fdcIds)
        .not('calories_per_100g', 'is', null)
        .order('created_at')
        .order('id')
      // Not fatal: without the lookup each pick just becomes a private row.
      if (error) console.error('[resolver] verified USDA lookup failed, using private rows:', error.message)
      for (const r of data ?? []) {
        const key = Number(r.fdc_id)
        if (!verifiedUsda.has(key)) verifiedUsda.set(key, r)
      }
    }

    // deno-lint-ignore no-explicit-any
    const newRows: any[] = []
    const memWrites: MemoryWrite[] = []
    missFoods.forEach((food, i) => {
      const norm = missNorms[i]
      const d = decisions[i]
      if (!d) return
      const correctedG = matches[i].corrected_quantity_g ?? undefined
      // A memory hit skips the matcher, so the next log of this phrase gets
      // only the portion fix correctPortionFromMeasures can make from the row
      // (none at all for INDB/IFCT rows, which carry no portions). If the
      // matcher changed the grams THIS time, remembering the food would make the
      // second log of identical text weigh, and so count, differently from the
      // first. Such a food is not remembered; it goes back through the matcher
      // (temperature 0, same answer) until personal portions land in memory
      // (Phase 5/6, user_food_memory.portions).
      const gramsCorrected = correctedG !== undefined && correctedG !== food.quantity_g
      const remember = (w: MemoryWrite) => { if (!gramsCorrected) memWrites.push(w) }

      if (d.kind === 'reference_match') {
        // fuzzy verified row matched → reuse it, no row to write
        resolvedMisses.set(norm, { id: d.id, source: d.source, per100g: d.per100g, correctedG, resolution: 'reference_match', matchScore: d.score })
        remember({ norm, displayName: food.name, foodItemId: d.id, origin: 'reference_match' })
        return
      }

      if (d.kind === 'usda_match') {
        const shared = verifiedUsda.get(d.cand.fdcId!)
        if (shared) {
          resolvedMisses.set(norm, { id: shared.id, source: 'usda', per100g: rowPer100g(shared), correctedG, resolution: 'usda_match' })
          remember({ norm, displayName: food.name, foodItemId: shared.id, origin: 'usda_match' })
          return
        }
      }

      // A new PRIVATE row: owned by this user, no shared key, never served to
      // anyone else. food_entries still gets a real food_item_id to reference.
      const source: MacroSource = d.kind === 'usda_match' ? 'usda' : 'ai_estimated'
      const rough = d.kind === 'rough_estimate'
      // A rough row stores the numbers it is logged with (repaired, or the
      // doubtful ones kept as given), so its status is judged on those; its
      // reason keeps what the original guess failed, for review.
      const storedIssues = rough ? foodItemIssues(source, food.name, d.per100g) : d.issues
      const id = crypto.randomUUID()
      newRows.push(privateFoodRow({
        id,
        source,
        name: food.name,
        per100g: d.per100g,
        userId: opts.userId,
        status: storedIssues.length > 0 ? 'quarantined' : 'unverified',
        statusReason: rough
          ? `rough_v${RULES_VERSION}:${d.issues.join(',')}`
          : d.issues.length > 0 ? `auto_v${RULES_VERSION}:${d.issues.join(',')}` : 'private',
        fdcId: d.kind === 'usda_match' ? d.cand.fdcId ?? null : null,
        // Persist USDA's household measures so a later memory hit can correct
        // its portion without re-querying USDA (see correctPortionFromMeasures).
        portions: d.kind === 'usda_match' && d.cand.portions?.length ? d.cand.portions : null,
      }))
      resolvedMisses.set(norm, { id, source, per100g: d.per100g, correctedG, resolution: d.kind })

      // Memory only for clean numbers. A doubtful pick or estimate is logged
      // once but never becomes the user's sticky number; neither does an AI
      // stand-in that only exists because USDA was briefly unreachable (don't
      // immortalize outages), and a rough estimate NEVER does (D5).
      if (d.kind === 'usda_match' && d.issues.length === 0) {
        remember({ norm, displayName: food.name, foodItemId: id, origin: 'usda_match' })
      }
      if (d.kind === 'ai_estimate' && d.issues.length === 0 && !usdaDown[i]) {
        remember({ norm, displayName: food.name, foodItemId: id, origin: 'ai_estimate' })
      }
    })

    if (persist) {
      if (newRows.length > 0) {
        // One batched insert. Ids are generated here, so no read-back is needed.
        const { error } = await supabase.from('food_items').insert(newRows)
        if (error) throw error
      }
      // After the insert, so every pointer's target already exists.
      if (memoryWritable) await rememberFoods(supabase, opts.userId, memWrites, memOrigin)
    }
  }

  // touch last_used_at (fire-and-forget; failure is harmless). 050's guard
  // lets service_role change exactly this one column on a shared row.
  if (persist) {
    const now = new Date().toISOString()
    if (sharedHitIds.length > 0) {
      supabase.from('food_items').update({ last_used_at: now }).in('id', sharedHitIds).then(() => {}, () => {})
    }
    if (memHitNorms.length > 0) {
      supabase
        .from('user_food_memory')
        .update({ last_used_at: now })
        .eq('user_id', opts.userId)
        .in('normalized_name', memHitNorms)
        .then(() => {}, () => {})
    }
  }

  // ── 6. deterministic compute ─────────────────────────────────────────────
  // `foods` keeps the caller's order with left-out foods removed; callers that
  // merge by position use placeFoods() so nothing shifts.
  const foods: ResolvedFood[] = []
  const unresolved: UnresolvedFood[] = []
  parsed.forEach((p, i) => {
    const hit = hits.get(norms[i]) ?? resolvedMisses.get(norms[i])
    if (!hit) {
      const out = leftOut.get(norms[i])
      if (!out) throw new Error(`Unresolved food: ${p.name}`)   // unreachable: every miss is decided or left out
      unresolved.push({ index: i, name: p.name, ...out })
      return
    }
    // The parse step guessed grams from the user's words with no reference
    // data; the match step may have revised that against USDA's published
    // household measures (see matchCall). Prefer the revised figure — and
    // carry it on quantity_g too, not just into the macro math, so the entry
    // the user sees ("45 g") agrees with the numbers beside it.
    const quantityG = hit.correctedG ?? p.quantity_g
    if (hit.correctedG && hit.correctedG !== p.quantity_g) {
      console.log(`[resolver] portion corrected: "${p.name}" ${p.quantity_g}g → ${hit.correctedG}g (${p.quantity_description})`)
    }
    const rough = hit.resolution === 'rough_estimate'
    foods.push({
      ...p,
      quantity_g: quantityG,
      ...computeMacros(quantityG, hit.per100g),
      // A rough estimate must never look like a confident number: confidence
      // becomes food_entries.ai_confidence, which is what a later "check
      // these" UI keys off.
      confidence: rough ? capRoughConfidence(p.confidence) : p.confidence,
      food_item_id: hit.id,
      macro_source: hit.source,
      resolution: hit.resolution,
      ...(rough ? { rough: true } : {}),
      ...(hit.matchScore !== undefined ? { match_score: hit.matchScore } : {}),
    })
  })

  return { foods, totals: sumTotals(foods), unresolved }
}

// ── Nutrition-label foods ──────────────────────────────────────────────────
// Foods the vision model read straight off a nutrition label skip memory,
// USDA and the matcher entirely — the label's printed numbers are ground
// truth. Split into a pure plan and a commit so a photo can be fully decided
// before anything is written.

export interface LabelPlan {
  index: number          // position in the list given to planLabelFoods
  food: ParsedFood       // quantity_g normalised to a usable gram weight
  norm: string
  per100g: Per100g
  issues: IssueCode[]
  totals: Totals         // the label's own numbers scaled to quantity_g — what gets logged
}

export function planLabelFoods(parsed: ParsedFood[]): { plans: LabelPlan[]; unresolved: UnresolvedFood[] } {
  const plans: LabelPlan[] = []
  const unresolved: UnresolvedFood[] = []
  // A value the label doesn't print counts as 0, exactly as before — labels
  // are never blocked for a missing optional macro (the vision prompt tells
  // the model to OMIT values that aren't printed). Unreadable values count as
  // 0 too, instead of turning the whole entry into NaN.
  const num = (x: unknown): number => {
    const v = toNumber(x)
    return v === null || Number.isNaN(v) ? 0 : v
  }

  parsed.forEach((p, index) => {
    const label = p.label_macros ?? {}
    // label_macros is the label's raw printed values FOR label_serving_g grams
    // (e.g. "per 100g" or "1 serving (40g)") — not for quantity_g, which is
    // whatever the user actually ate/is logging. Fall back to quantity_g when
    // label_serving_g is missing (older client, or model omitted it) so this
    // degrades to "assume the label's serving equals the logged amount".
    // The old `?? quantity_g` let a 0 through and divided by it; with no
    // positive gram weight at all there is nothing to scale by, so the food is
    // left out (and named in the reply) rather than logged as NaN.
    const servingRaw = num(p.label_serving_g)
    const quantityRaw = num(p.quantity_g)
    const servingG = servingRaw > 0 ? servingRaw : quantityRaw > 0 ? quantityRaw : null
    if (servingG === null) {
      unresolved.push({ index, name: p.name, reason: 'label_serving_missing', issues: [] })
      return
    }
    const quantityG = quantityRaw > 0 ? quantityRaw : servingG

    const printed = {
      calories: num(label.calories),
      protein_g: num(label.protein_g),
      carbs_g: num(label.carbs_g),
      fat_g: num(label.fat_g),
      fiber_g: num(label.fiber_g),
    }
    const per100gScale = 100 / servingG
    const per100g: Per100g = {
      calories: printed.calories * per100gScale,
      protein_g: printed.protein_g * per100gScale,
      carbs_g: printed.carbs_g * per100gScale,
      fat_g: printed.fat_g * per100gScale,
      fiber_g: printed.fiber_g * per100gScale,
    }
    // Final totals for THIS log: label's raw values scaled from label_serving_g
    // to quantity_g. This is the deterministic version of what we used to ask
    // the model to compute itself — same pattern as the edit-entry rescale fix.
    const qtyScale = quantityG / servingG
    const r1 = (n: number) => Math.round(n * qtyScale * 10) / 10

    plans.push({
      index,
      food: { ...p, quantity_g: quantityG },
      norm: normalizeName(p.name),
      per100g,
      issues: foodItemIssues('label', p.name, per100g),
      totals: {
        calories: r1(printed.calories),
        protein_g: r1(printed.protein_g),
        carbs_g: r1(printed.carbs_g),
        fat_g: r1(printed.fat_g),
        fiber_g: r1(printed.fiber_g),
      },
    })
  })

  return { plans, unresolved }
}

// Writes the planned label foods: one PRIVATE source:'label' row per product
// (owned by the user, no shared key — a label scan is one user's packet, not a
// reference food for everyone), plus a user-taught 'label' memory pointer so
// the same product typed or scanned again resolves to the same numbers.
// The logged numbers are always the label's own (plan.totals), so a doubtful
// label still logs exactly what the user photographed; it is just stored as
// quarantined and never remembered.
export async function commitLabelFoods(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  plans: LabelPlan[],
  opts: { userId: string; memory?: MemoryMode; persist?: boolean },
): Promise<ResolvedFood[]> {
  if (plans.length === 0) return []
  const memoryMode = opts.memory ?? 'on'
  const persist = opts.persist !== false
  const norms = [...new Set(plans.map((p) => p.norm).filter((n) => n !== ''))]

  // Re-scanning the same packet should not mint a new row every time: if the
  // user's 'label' memory already points at a row with identical per-100 g
  // numbers, reuse it. Different numbers (a reformulated product, a misread)
  // get a fresh row and the memory moves to it.
  const memOrigin = new Map<string, string>()
  const reusable = new Map<string, { id: string; per100g: Per100g }>()
  let memoryWritable = memoryMode !== 'off'
  if (memoryMode !== 'off' && norms.length > 0) {
    const { data, error } = await supabase
      .from('user_food_memory')
      .select('normalized_name, origin, food_items!inner(id, status, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g)')
      .eq('user_id', opts.userId)
      .in('normalized_name', norms)
    if (error) {
      console.error('[resolver] label memory read failed, continuing without it:', error.message)
      memoryWritable = false
    }
    for (const m of data ?? []) {
      const t = embedded(m.food_items)
      const usable = !!t && t.status !== 'quarantined' && t.calories_per_100g != null
      if (!usable) continue   // a dead pointer may be replaced (see resolveFoods)
      memOrigin.set(m.normalized_name, m.origin)
      if (m.origin === 'label') reusable.set(m.normalized_name, { id: t.id, per100g: rowPer100g(t) })
    }
  }

  // deno-lint-ignore no-explicit-any
  const newRows: any[] = []
  const memWrites: MemoryWrite[] = []
  const reusedNorms: string[] = []
  const minted = new Map<string, string>()   // same product twice in one photo → one row
  const ids = plans.map((plan) => {
    const prior = reusable.get(plan.norm)
    if (prior && samePer100g(prior.per100g, plan.per100g)) {
      reusedNorms.push(plan.norm)
      return prior.id
    }
    const mintKey = `${plan.norm}|${plan.per100g.calories}|${plan.per100g.protein_g}|${plan.per100g.carbs_g}|${plan.per100g.fat_g}|${plan.per100g.fiber_g}`
    const already = minted.get(mintKey)
    if (already) return already

    const id = crypto.randomUUID()
    minted.set(mintKey, id)
    newRows.push(privateFoodRow({
      id,
      source: 'label',
      name: plan.food.name,
      per100g: plan.per100g,
      userId: opts.userId,
      status: plan.issues.length > 0 ? 'quarantined' : 'unverified',
      statusReason: plan.issues.length > 0 ? `auto_v${RULES_VERSION}:${plan.issues.join(',')}` : 'private',
      fdcId: null,
      portions: null,
    }))
    if (plan.issues.length === 0) {
      memWrites.push({ norm: plan.norm, displayName: plan.food.name, foodItemId: id, origin: 'label' })
    }
    return id
  })

  if (persist) {
    if (newRows.length > 0) {
      const { error } = await supabase.from('food_items').insert(newRows)
      if (error) throw error
    }
    if (memoryWritable) {
      await rememberFoods(supabase, opts.userId, memWrites, memOrigin)
      if (reusedNorms.length > 0) {
        supabase
          .from('user_food_memory')
          .update({ last_used_at: new Date().toISOString() })
          .eq('user_id', opts.userId)
          .in('normalized_name', reusedNorms)
          .then(() => {}, () => {})
      }
    }
  }

  return plans.map((plan, j) => ({
    ...plan.food,
    ...plan.totals,
    food_item_id: ids[j],
    macro_source: 'label' as MacroSource,
    resolution: 'label_scan' as Resolution,
  }))
}

// ── Memory writes ──────────────────────────────────────────────────────────
interface MemoryWrite {
  norm: string
  displayName: string
  foodItemId: string
  origin: MemoryOrigin
}

// How much a memory row is worth keeping. A write may replace an existing row
// only at the same or a higher rank: a machine guess never overwrites what the
// user taught us, and (D7) a correction outranks a label scan.
const ORIGIN_RANK: Record<string, number> = {
  history: 0, reference_match: 0, usda_match: 0, ai_estimate: 0,
  label: 1,
  correction: 2, manual: 2,
}

// Upserts the user's memory pointers. NEVER throws: memory is an accelerator,
// and a failed write (e.g. the target-check trigger rejecting one row) must not
// cost the user their log — the meal is already decided and its rows written.
async function rememberFoods(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  writes: MemoryWrite[],
  existingOrigins: Map<string, string>,
): Promise<void> {
  try {
    const byNorm = new Map<string, MemoryWrite>()
    for (const w of writes) {
      if (!w.norm) continue
      const existing = existingOrigins.get(w.norm)
      if (existing !== undefined && (ORIGIN_RANK[existing] ?? 0) > (ORIGIN_RANK[w.origin] ?? 0)) continue
      byNorm.set(w.norm, w)
    }
    if (byNorm.size === 0) return

    const now = new Date().toISOString()
    const rows = [...byNorm.values()].map((w) => ({
      user_id: userId,
      normalized_name: w.norm,
      display_name: w.displayName,
      food_item_id: w.foodItemId,
      origin: w.origin,
      last_used_at: now,
    }))
    const { error } = await supabase.from('user_food_memory').upsert(rows, { onConflict: 'user_id,normalized_name' })
    if (!error) return

    // One bad row fails the whole batch; retry individually so the good ones land.
    console.error('[resolver] memory write failed, retrying row by row:', error.message)
    const results = await Promise.allSettled(rows.map(async (row) => {
      const { error: rowErr } = await supabase.from('user_food_memory').upsert(row, { onConflict: 'user_id,normalized_name' })
      if (rowErr) throw rowErr
    }))
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('[resolver] memory write failed:', rows[i].normalized_name, (r.reason as { message?: string })?.message ?? r.reason)
      }
    })
  } catch (err) {
    console.error('[resolver] memory write failed:', (err as Error)?.message ?? err)
  }
}

// ── Small helpers ──────────────────────────────────────────────────────────

// One resolved food per key, as the resolver tracks it before computing macros.
interface Hit {
  id: string
  source: MacroSource
  per100g: Per100g
  correctedG?: number
  resolution: Resolution
  matchScore?: number   // ResolvedFood.match_score (ranked mode only)
}

// What the resolver decided for one miss, before anything is written.
type Decision =
  | { kind: 'reference_match'; id: string; source: MacroSource; per100g: Per100g; score?: number }
  | { kind: 'usda_match'; cand: Candidate; per100g: Per100g; issues: IssueCode[] }
  | { kind: 'ai_estimate'; per100g: Per100g; issues: IssueCode[] }
  | { kind: 'rough_estimate'; per100g: Per100g; issues: IssueCode[] }   // issues = what the ORIGINAL guess failed

// A private food_items row (050: owned by the user, no shared key). Legacy
// per-serving columns are filled per-100g for backward compat, as before.
function privateFoodRow(r: {
  id: string
  source: MacroSource
  name: string
  per100g: Per100g
  userId: string
  status: 'unverified' | 'quarantined'
  statusReason: string
  fdcId: number | null
  portions: UsdaPortion[] | null
}) {
  return {
    id: r.id,
    source: r.source,
    name: r.name,
    calories_per_100g: r.per100g.calories,
    protein_per_100g: r.per100g.protein_g,
    carbs_per_100g: r.per100g.carbs_g,
    fat_per_100g: r.per100g.fat_g,
    fiber_per_100g: r.per100g.fiber_g,
    calories: r.per100g.calories,
    protein_g: r.per100g.protein_g,
    carbs_g: r.per100g.carbs_g,
    fat_g: r.per100g.fat_g,
    fiber_g: r.per100g.fiber_g,
    serving_size_g: 100,
    serving_size_description: '100 g',
    fdc_id: r.fdcId,
    portions: r.portions,
    created_by: r.userId,
    status: r.status,
    status_reason: r.statusReason,
  }
}

// PostgREST returns a many-to-one embed as an object; tolerate an array too.
// deno-lint-ignore no-explicit-any
function embedded(x: any): any {
  return Array.isArray(x) ? x[0] : x
}

function samePer100g(a: Per100g, b: Per100g): boolean {
  const eq = (x: number, y: number) => Math.abs(x - y) <= 1e-6
  return eq(a.calories, b.calories) && eq(a.protein_g, b.protein_g) && eq(a.carbs_g, b.carbs_g) &&
    eq(a.fat_g, b.fat_g) && eq(a.fiber_g, b.fiber_g)
}

function sumTotals(foods: Totals[]): Totals {
  const r1 = (n: number) => Math.round(n * 10) / 10
  return {
    calories: r1(foods.reduce((s, x) => s + x.calories, 0)),
    protein_g: r1(foods.reduce((s, x) => s + x.protein_g, 0)),
    carbs_g: r1(foods.reduce((s, x) => s + x.carbs_g, 0)),
    fat_g: r1(foods.reduce((s, x) => s + x.fat_g, 0)),
    fiber_g: r1(foods.reduce((s, x) => s + x.fiber_g, 0)),
  }
}

// deno-lint-ignore no-explicit-any
function rowPer100g(row: any): Per100g {
  return {
    calories: Number(row.calories_per_100g),
    protein_g: Number(row.protein_per_100g ?? 0),
    carbs_g: Number(row.carbs_per_100g ?? 0),
    fat_g: Number(row.fat_per_100g ?? 0),
    fiber_g: Number(row.fiber_per_100g ?? 0),
  }
}

interface MatchResult {
  candidate_index: number | null
  // Whatever the model sent, unparsed: validate.ts (toPer100g / foodItemIssues)
  // decides whether it is usable, so a string or a missing field can't slip
  // through as if it were a number.
  est_per_100g: Per100gLike | null
  // Grams, revised against USDA's published household measures for the matched
  // food. null = keep the parse step's original estimate.
  corrected_quantity_g: number | null
}

// One gpt-4o-mini call matching ALL missed foods against their retrieved
// candidates. Doubles as the AI fallback: when no candidate fits, the model
// supplies est_per_100g in the same response — never a separate call.
// `hints` is only passed on the single retry: hints[i] lists, in plain words,
// which rules food i's previous estimate broke (validate.ts issueHints).
// `ranked` adds RANKED_IDENTITY_RULE; without it the prompt is the fts one, byte for byte.
// deno-lint-ignore no-explicit-any
async function matchCall(
  supabase: any,
  userId: string,
  foods: ParsedFood[],
  perFoodCandidates: Candidate[][],
  openRouterKey: string,
  hints?: string[][],
  ranked = false,
): Promise<MatchResult[]> {
  const lines = foods.map((food, i) => {
    const cands = perFoodCandidates[i]
      .map((c, j) => {
        const base = `    ${j}: ${c.label} — per 100g: ${c.per100g.calories} kcal, ${c.per100g.protein_g}g protein, ${c.per100g.carbs_g}g carbs, ${c.per100g.fat_g}g fat`
        // Only a handful of measures — enough to anchor the common phrasings
        // ("1 piece", "1 cup") without flooding the prompt.
        const p = (c.portions ?? []).slice(0, 5)
        // Ranked search hands verified rows their stored portions too; those are
        // not USDA's for an INDB/IFCT row, so the label says whose they are.
        // The search score is deliberately NOT shown (see Candidate.score).
        return p.length
          ? `${base}\n       ${c.fdcId != null || c.cacheSource === 'usda' ? 'USDA portions' : 'Portions'}: ${p.map((m) => `${m.description} = ${m.gramWeight}g`).join('; ')}`
          : base
      })
      .join('\n')
    const hint = hints?.[i]?.length
      ? `\n    Your previous estimate for this food was rejected (${hints[i].join('; ')}). Give a corrected est_per_100g.`
      : ''
    return `Food ${i}: "${food.name}" — user described the amount as "${food.quantity_description}", which we currently estimate as ${food.quantity_g}g${hint}\n${cands || '    (no candidates found)'}`
  }).join('\n\n')

  const prompt = `You match food descriptions to nutrition database candidates.

For each food below, pick the candidate that is genuinely the SAME food (preparation matters: raw vs cooked/soaked vs fried are different). Be strict — a candidate whose name merely CONTAINS the food's name is not automatically a match, in EITHER direction: a plain raw/base ingredient (e.g. "apple", "banana", "chicken", "salmon") is NOT the same food as a composite dish that features it as one component (e.g. "apple mousse", "banana bread", "chicken curry", "salmon sushi") — a composite dish has additional components (rice, batter, sauce, other ingredients) that meaningfully change the per-100g numbers, so matching to just one of its ingredients silently drops those components entirely. If no candidate is truly the same food, set candidate_index to null and provide your best per-100g estimate instead — a null match with a good estimate is better than a wrong match.

${ranked ? `${RANKED_IDENTITY_RULE}\n\n` : ''}TWO TRAPS THAT PRODUCE LARGE, SILENT ERRORS — check both before accepting a candidate:

1. RAW/DRY vs COOKED. Database entries labelled "raw", "dry", "uncooked", "mature seeds" or "dehydrated" are measured BEFORE cooking, when the food holds no water. The user ate the cooked form. Because grams are applied to the per-100g figure afterwards, accepting a raw entry for a cooked dish overstates energy roughly by the food's water uptake. Reject those candidates and estimate the COOKED per-100g instead, using these yield factors (cooked weight per unit raw weight):
   - dry legumes/beans/dals (rajma, chana, lentils): absorb ~2.5x → cooked ≈ raw/2.5, so ~110-160 kcal/100g cooked (NOT the ~330-350 of the dry seed)
   - dry rice/pasta: absorb ~2.5-3x → cooked ≈ 110-160 kcal/100g (NOT ~350 dry)
   - meat/fish: LOSE ~25% water → cooked ≈ raw/0.75, slightly denser
   Only accept a "raw" entry when the user genuinely ate it raw (salads, fruit, nuts, sashimi).

2. WRONG PRODUCT VARIANT. Databases carry diet/sugar-free/light variants under the same name. If the user did not say "diet", "sugar-free", "zero" or "light", they mean the REGULAR product — a candidate reading near-zero calories for something normally sugary (a cola, an energy drink, a sweetened juice) is the diet variant and is the wrong match. Regular full-sugar soft/energy drinks are ~40-50 kcal/100g, never ~0-5.

est_per_100g values MUST be per 100 GRAMS of the food itself — never per piece or per serving. Sanity anchors: nuts/seeds 500-650 kcal/100g, oils/pure fats ~900 (but a "sauce"/"gravy"/"masala" is diluted with water, tomato, dairy, or vegetables even when butter/cream-based — it is NEVER 100g fat per 100g; treat curry/gravy/sauce as 100-250 kcal/100g, richest cream-based ones up to ~350), cooked grains/dals 100-200, milk 40-70, milk-based coffee drinks (latte/cappuccino/flat white, with or without a shot of flavored syrup) 40-90 — mostly steamed milk by volume, do NOT price like a dessert just because it's flavored, vegetables 20-100, raw fruit 30-90, meats 100-300, fried snacks 300-550, beer/light alcoholic drinks 35-55.

ALSO CHECK THE PORTION SIZE. Our gram estimate came from reading the user's words alone, with no reference data, and it is the single largest source of error in this system — a perfect per-100g figure multiplied by a wrong gram weight still produces a wrong meal. Where a candidate lists USDA portions, use them as ground truth to sanity-check our estimate:
- Map the user's phrasing onto the closest listed portion ("a bowl" ≈ 1 cup, "a piece"/"a slice" ≈ 1 piece/1 item), multiply by any count they gave ("2 samosas" = 2 × the 1-piece weight), and return that as corrected_quantity_g.
- Watch for light, bulky, dry foods especially — cereal, oats, popcorn, chips, puffed snacks. A bowl of these weighs FAR less than a bowl of something dense like rice or curry (a bowl of dry cereal is ~30-50g, not the ~150g a bowl of cooked rice would be). Over-estimating these is our most common failure.
- For a drink with a small additive ("coffee with milk", "tea with milk"), the additive is a splash — roughly 20-50g — not a second full serving of milk.
- Respect explicit amounts the user gave. If they said "100g" or "2 pints", that is authoritative; do not override it.
- If the listed portions do not fit the description, or there are none, return null and we keep our original estimate.

${lines}

Return ONLY JSON:
{ "matches": [ { "food_index": 0, "candidate_index": 2 or null, "est_per_100g": null or { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 }, "corrected_quantity_g": null or 45 } ] }
One entry per food, in order.`

  const requestBody = {
    model: 'openai/gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  }

  const { response: data } = await logAiCall(supabase, {
    userId,
    source: 'macro-resolver',
    model: requestBody.model,
    requestPayload: requestBody,
    run: async () => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://steadyapp.io',
          'X-Title': 'STEADY-resolver',
        },
        body: JSON.stringify(requestBody),
      })

      if (!res.ok) {
        throw new Error(`OpenRouter (match): ${await res.text()}`)
      }

      const json = await res.json()
      return {
        response: json,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      }
    },
  })

  // deno-lint-ignore no-explicit-any
  const parsed = JSON.parse((data as any).choices[0].message.content)
  const matches: MatchResult[] = foods.map((food, i) => {
    const m = (parsed.matches ?? [])[i] ?? {}
    const idx = typeof m.candidate_index === 'number' &&
      m.candidate_index >= 0 && m.candidate_index < perFoodCandidates[i].length
      ? m.candidate_index
      : null

    // Accept a correction only if it's a sane positive number within 20x of the
    // original guess. The correction exists to fix estimates that are off by
    // 2-4x; anything wilder than 20x is far likelier to be a model slip (a
    // per-100g figure echoed back as grams, a decimal dropped) than a real
    // portion, and silently trusting it would swap a mild error for a huge one.
    const raw = m.corrected_quantity_g
    const corrected =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0 &&
      food.quantity_g > 0 &&
      raw / food.quantity_g <= 20 && food.quantity_g / raw <= 20
        ? raw
        : null

    return { candidate_index: idx, est_per_100g: m.est_per_100g ?? null, corrected_quantity_g: corrected }
  })
  return matches
}
