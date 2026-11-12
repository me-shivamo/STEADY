// supabase/functions/_shared/validate.ts
// ── Food nutrient validation rules, v1 (v1.2 Phase 3) ───────────────────────────
//
// ONE rule set, TWO implementations that must agree code-for-code:
//   * this file .............................. Edge Functions (Deno), scripts (tsx), jest (Node)
//   * public.food_item_issues() in 050 ....... the database (relabel + audit parity)
// Same input row → same IssueCode[] in the same order. scripts/audit-food-items.ts --check
// exits 1 on any disagreement and __tests__/unit/validate.test.ts pins the fixtures.
// Change both together and bump RULES_VERSION.
//
// Pure module on purpose: no imports, no Deno/Node globals, no I/O, so the same file runs
// under Deno, tsx and jest (import it via a relative path, e.g.
// '../../supabase/functions/_shared/validate').
//
// All checks read per-100 g values only. Legacy per-serving columns are never validated.

export const RULES_VERSION = 1

export const REFERENCE_SOURCES: readonly string[] = ['usda', 'indb', 'ifct']

export type IssueCode =
  | 'missing_energy'       // blocking: no usable calories number
  | 'energy_out_of_range'  // blocking: kcal < 0 or > 900 per 100 g
  | 'macro_out_of_range'   // blocking: a macro < 0 or > 100 g per 100 g (or not a number)
  | 'macro_sum_over_100'   // blocking: protein + carbs + fat > 100.5 g per 100 g
  | 'atwater_mismatch'     // kcal disagrees with 4P + 4C + 9F beyond 20% + 20 kcal (fiber/alcohol aware)
  | 'fat_dominant_dish'    // INDB only: frying oil counted as dish mass (khasta kachori 713 kcal)
  | 'zero_energy'          // 0 kcal for something that is not water/tea/coffee/salt/diet/supplement
  | 'generic_placeholder'  // the old resolver's 200/8/25/8 stand-in

/** Codes are always emitted in this order (the SQL twin uses the same order). */
export const ISSUE_ORDER: readonly IssueCode[] = [
  'missing_energy', 'energy_out_of_range', 'macro_out_of_range', 'macro_sum_over_100',
  'atwater_mismatch', 'fat_dominant_dish', 'zero_energy', 'generic_placeholder',
]

/** Physically impossible numbers. Never logged as a food's numbers. */
export const BLOCKING: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'missing_energy', 'energy_out_of_range', 'macro_out_of_range', 'macro_sum_over_100',
])

export const LIMITS = Object.freeze({
  maxKcal: 900,
  maxMacroG: 100,
  maxPcfSumG: 100.5,          // protein + carbs + fat ONLY: USDA/INDB carbs already include fiber
  atwaterRel: 0.2,            // tolerance = 20% of stated kcal ...
  atwaterAbsKcal: 20,         // ... plus 20 kcal
  alcoholExtraKcal: 315,      // ≈45 g ethanol per 100 g × 7 kcal/g, allowed above the macro energy
  fatDishMinFatG: 30,
  fatDishMinFatShare: 0.85,   // 9·fat ≥ 85% of kcal
  fatDishMaxProtCarbG: 20,    // protein + carbs < 20 g (keeps nuts out of the rule)
  placeholder: Object.freeze({ calories: 200, protein_g: 8, carbs_g: 25, fat_g: 8 }),
})

// Word lists, copied VERBATIM into the SQL twin (there wrapped as \m(?:...)\M).
// The alcohol list also carries the drinks Indian users actually type ("Old Monk", "a peg of
// daru") and common cocktails: without them a correct 231/0/0/0 rum estimate fails the energy
// check, the retry hint ("calories must equal 4P + 4C + 9F") pushes the model to invent carbs
// or cut the calories, and that wrong retry is what gets remembered. A match only RAISES the
// upper energy bound, so a false hit ("virgin mojito", "margarita pizza") can only let an
// overstated number through, never flag a correct one (live data on 2026-11-12: no status changes).
export const ALCOHOL_WORDS =
  'wine|beer|whiske?y|vodka|rum|gin|brandy|liqueur|cocktail|sake|alcohol|cider|tequila|champagne|lager|ale|toddy|feni|scotch|bourbon|' +
  'peg|daru|old monk|mojito|margarita|martini|sangria|breezer|arrack|liquor|spirits?'
export const FAT_FOOD_WORDS =
  'oils?|ghee|butter|lard|vanaspati|dalda|makhan|makkhan|margarine|shortening|mayonnaise|mayo|dressing|aioli|baghar|tadka|tarka|tartare|thousand island'
export const ZERO_OK_WORDS =
  'water|pani|paani|tea|coffee|salt|soda|diet|zero|sugar.?free|vitamins?|multivitamin|tablets?|capsules?|creatine|ors|electrolytes?|sweetener|stevia|supplement'

// Postgres \m / \M treat letters, digits and underscore as word characters (Unicode-aware
// under the DB's ICU locale). JS \b is ASCII-only, so use explicit Unicode lookarounds.
const wordRe = (alternatives: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, 'iu')

export const ALCOHOL_RE = wordRe(ALCOHOL_WORDS)
export const FAT_FOOD_RE = wordRe(FAT_FOOD_WORDS)
export const ZERO_OK_RE = wordRe(ZERO_OK_WORDS)

export interface Per100g {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

/** Anything that might hold per-100 g numbers: an LLM estimate, a USDA candidate, a label read. */
export interface Per100gLike {
  calories?: unknown
  protein_g?: unknown
  carbs_g?: unknown
  fat_g?: unknown
  fiber_g?: unknown
}

/** A food_items row (or any object) carrying the *_per_100g columns. */
export interface Per100gRow {
  calories_per_100g?: unknown
  protein_per_100g?: unknown
  carbs_per_100g?: unknown
  fat_per_100g?: unknown
  fiber_per_100g?: unknown
}

// JS doubles vs Postgres numeric: treat values within EPS of a boundary as ON the boundary,
// which is what exact numeric arithmetic in SQL sees.
const EPS = 1e-9
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS

const NUMERIC_STRING = /^\s*-?\d+(?:\.\d+)?\s*$/

/**
 * Strict number parsing, never coercion: a finite number, or a plain decimal string such
 * as "12.5". null/undefined → null (treated as 0 for macros, like SQL coalesce(x, 0)).
 * Anything else (NaN, Infinity, "abc", {}, true) → NaN, which fails validation.
 */
export function toNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : NaN
  if (typeof x === 'string' && NUMERIC_STRING.test(x)) return Number(x)
  return NaN
}

/** Clean numbers to store/compute with, or null when they cannot be used at all. */
export function toPer100g(n: Per100gLike | null | undefined): Per100g | null {
  if (!n) return null
  const k = toNumber(n.calories)
  if (k === null || Number.isNaN(k)) return null
  const [protein_g, carbs_g, fat_g, fiber_g] =
    [n.protein_g, n.carbs_g, n.fat_g, n.fiber_g].map((v) => toNumber(v) ?? 0)
  if ([protein_g, carbs_g, fat_g, fiber_g].some((v) => Number.isNaN(v))) return null
  return { calories: k, protein_g, carbs_g, fat_g, fiber_g }
}

/** Adapter for food_items rows (calories_per_100g, …). */
export function fromRow(row: Per100gRow | null | undefined): Per100gLike | null {
  if (!row) return null
  return {
    calories: row.calories_per_100g,
    protein_g: row.protein_per_100g,
    carbs_g: row.carbs_per_100g,
    fat_g: row.fat_per_100g,
    fiber_g: row.fiber_per_100g,
  }
}

/**
 * The energy range the macros allow, whatever the source's fiber convention:
 *   lo = 4P + 9F + 4·max(C − fiber, 0)   (fiber inside carbs, worth 0 kcal)
 *   hi = 4P + 9F + 4C + 4·fiber          (fiber outside carbs, worth 4 kcal) [+315 for alcohol]
 * A row passes when lo − tol ≤ kcal ≤ hi + tol, tol = 20% of kcal + 20 kcal.
 */
export function atwaterBounds(
  kcal: number, protein: number, carbs: number, fat: number, fiber: number, name: string,
): { lo: number; hi: number; tol: number } {
  const base = 4 * protein + 9 * fat
  const lo = base + 4 * Math.max(carbs - fiber, 0)
  const hi = base + 4 * carbs + 4 * fiber + (ALCOHOL_RE.test(name) ? LIMITS.alcoholExtraKcal : 0)
  const tol = LIMITS.atwaterRel * kcal + LIMITS.atwaterAbsKcal
  return { lo, hi, tol }
}

/**
 * All rule violations for one food, in ISSUE_ORDER. [] means the numbers pass.
 * `source` is the food_items source the numbers come from / will be stored under;
 * `name` is the name stored on the row (word lists are matched against it).
 */
export function foodItemIssues(
  source: string | null | undefined,
  name: string | null | undefined,
  n: Per100gLike | null | undefined,
): IssueCode[] {
  const k = toNumber(n?.calories)
  if (k === null || Number.isNaN(k)) return ['missing_energy']

  const val = (x: unknown): number => toNumber(x) ?? 0     // SQL: coalesce(x, 0)
  const p = val(n?.protein_g), c = val(n?.carbs_g), f = val(n?.fat_g), fb = val(n?.fiber_g)
  const src = source ?? ''
  const nm = name ?? ''
  const out: IssueCode[] = []

  if (k < -EPS || k > LIMITS.maxKcal + EPS) out.push('energy_out_of_range')

  if ([p, c, f, fb].some((x) => Number.isNaN(x) || x < -EPS || x > LIMITS.maxMacroG + EPS)) {
    out.push('macro_out_of_range')
  }

  if (p + c + f > LIMITS.maxPcfSumG + EPS) out.push('macro_sum_over_100')

  const { lo, hi, tol } = atwaterBounds(k, p, c, f, fb, nm)
  if (k < lo - tol - EPS || k > hi + tol + EPS) out.push('atwater_mismatch')

  if (
    src === 'indb' &&
    f >= LIMITS.fatDishMinFatG - EPS &&
    k > EPS &&
    9 * f >= LIMITS.fatDishMinFatShare * k - EPS &&
    p + c < LIMITS.fatDishMaxProtCarbG - EPS &&
    !FAT_FOOD_RE.test(nm)
  ) {
    out.push('fat_dominant_dish')
  }

  if (near(k, 0) && !ZERO_OK_RE.test(nm)) out.push('zero_energy')

  const ph = LIMITS.placeholder
  if (near(k, ph.calories) && near(p, ph.protein_g) && near(c, ph.carbs_g) && near(f, ph.fat_g)) {
    out.push('generic_placeholder')
  }

  return out
}

export const isBlocking = (issues: readonly IssueCode[]): boolean => issues.some((i) => BLOCKING.has(i))

export const isReferenceSource = (source: string | null | undefined): boolean =>
  REFERENCE_SOURCES.includes(source ?? '')

/** Would these numbers be allowed into the shared verified base (rules only; provenance is the DB's job)? */
export const isShareable = (source: string | null | undefined, issues: readonly IssueCode[]): boolean =>
  isReferenceSource(source) && issues.length === 0

const HINTS: Record<IssueCode, string> = {
  missing_energy: 'give calories per 100 g as a plain number',
  energy_out_of_range: 'calories per 100 g must be between 0 and 900 (pure fat is 900)',
  macro_out_of_range: 'protein, carbs, fat and fiber must each be between 0 and 100 g per 100 g',
  macro_sum_over_100: 'protein + carbs + fat cannot exceed 100 g in 100 g of food',
  atwater_mismatch: 'calories must roughly equal 4×protein + 4×carbs + 9×fat per 100 g; your numbers disagree',
  fat_dominant_dish: 'fat looks like frying oil counted as food weight; give the dish as eaten',
  zero_energy: '0 kcal is only right for water, plain tea/coffee, salt, diet drinks or supplements',
  generic_placeholder: 'do not use a placeholder; estimate this specific food',
}

/** One short sentence per issue, fed into the single retry prompt. */
export function issueHints(issues: readonly IssueCode[]): string[] {
  return issues.map((i) => HINTS[i])
}

// ── Rough estimates (founder decision D5: "log the rest, flag the unknown") ─────────────────
// TS-only on purpose: this REPAIRS numbers, it does not judge them, so it has no SQL twin and
// changing it never needs a RULES_VERSION bump. What it must guarantee is that its output
// passes the rules above with no BLOCKING issue — validate.test.ts pins that.
//
// When the AI's per-100 g guess for one food fails the rules even after the retry with hints,
// we no longer refuse the whole meal. The rest of the meal logs normally and this food logs
// with the guess made physically possible:
//   * every macro parsed strictly; anything unusable (missing, "abc", NaN, negative) counts as 0
//     and each is capped at 100 g per 100 g;
//   * protein + carbs + fat scaled down together to 100 g when they add up to more, which is
//     the classic "per serving numbers given as per 100 g" slip (Parle-G 480/6/75/20);
//   * calories RECOMPUTED from the macros with Atwater (4P + 4C + 9F) whenever there are macros,
//     so they agree with each other by construction (and can never exceed 900);
//     only a guess with no macros at all keeps its stated calories, capped to 0..900.
// The caller stores it as a private, flagged row and never lets it into memory or the shared
// base. null means there is nothing usable left (no positive energy): leave the food out.
export function roughEstimate(n: Per100gLike | null | undefined): Per100g | null {
  if (!n) return null
  const usable = (x: unknown): number => {
    const v = toNumber(x)
    return v === null || Number.isNaN(v) || v < 0 ? 0 : Math.min(v, LIMITS.maxMacroG)
  }
  let p = usable(n.protein_g), c = usable(n.carbs_g), f = usable(n.fat_g)
  const fb = usable(n.fiber_g)
  const sum = p + c + f
  if (sum > LIMITS.maxMacroG) {
    const scale = LIMITS.maxMacroG / sum
    p *= scale; c *= scale; f *= scale
  }
  // Two decimals keeps stored numbers tidy; rounding before the Atwater sum keeps kcal and
  // macros consistent with each other exactly as stored.
  const r2 = (x: number): number => Math.round(x * 100) / 100
  p = r2(p); c = r2(c); f = r2(f)

  let kcal: number
  if (p + c + f > 0) {
    kcal = r2(Math.min(4 * p + 4 * c + 9 * f, LIMITS.maxKcal))
  } else {
    const stated = toNumber(n.calories)
    kcal = stated === null || Number.isNaN(stated) ? 0 : r2(Math.min(Math.max(stated, 0), LIMITS.maxKcal))
  }
  if (kcal <= 0) return null
  return { calories: kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: r2(fb) }
}
