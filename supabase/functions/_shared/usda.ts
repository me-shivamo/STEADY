// ── USDA FoodData Central client ──────────────────────────────────────────────
// Searches the free USDA nutrition database (api.nal.usda.gov) and returns
// candidates with lab-measured per-100g nutrient values. Used by the macro
// resolver as the second lookup tier (after our own food_items cache).
//
// Foundation and SR Legacy datasets report nutrients per 100g directly.
// Survey (FNDDS) covers mixed/prepared dishes, also per 100g.

// One "household measure" USDA publishes for a food — e.g. "1 item" = 38g for
// idli, "1 piece" = 30g for sushi, "1 cup, dry, yields" = 485g for oatmeal.
// This is the authoritative answer to "how many grams is a <bowl/piece/cup> of
// this?", which is otherwise the single biggest source of error in the pipeline
// (a correct per-100g figure times a wrong gram weight is still a wrong meal).
export interface UsdaPortion {
  description: string
  gramWeight: number
}

export interface UsdaCandidate {
  fdcId: number
  description: string
  dataType: string
  per100g: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }
  portions: UsdaPortion[]
}

// Thrown when USDA itself is unreachable (network/5xx/timeout) — the resolver
// treats this differently from a genuine "no match" result: it still computes
// macros via AI fallback but does NOT cache them permanently.
export class UsdaUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsdaUnavailableError'
  }
}

// Nutrient numbers per USDA's schema: 1008 Energy (kcal), 1003 Protein,
// 1005 Carbohydrate by difference, 1004 Total fat, 1079 Fiber.
const NUTRIENT_IDS = {
  calories: 1008,
  protein_g: 1003,
  carbs_g: 1005,
  fat_g: 1004,
  fiber_g: 1079,
} as const

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const TIMEOUT_MS = 4000

export async function searchUsda(query: string, apiKey: string): Promise<UsdaCandidate[]> {
  // Three tiers, most trustworthy first:
  //   1. Foundation/SR Legacy — lab-measured generic foods
  //   2. Survey (FNDDS)       — prepared & mixed dishes
  //   3. Branded              — ~1.9M manufacturer-submitted packaged products
  //
  // Branded is deliberately LAST. It's the only tier carrying real packaged
  // goods (searching it finds 3,217 Maggi entries where the other tiers find
  // none), but its descriptions are noisy marketing text — "amul butter"
  // surfaces "BUTTER BALLS, BUTTER" — so letting it compete with the curated
  // tiers would trade good generic matches for bad branded ones. Reaching it
  // at all means the first two found nothing, where a noisy real product still
  // beats the LLM inventing numbers from scratch.
  const strict = await search(query, apiKey, ['Foundation', 'SR Legacy'])
  if (strict.length > 0) return strict

  const prepared = await search(query, apiKey, ['Survey (FNDDS)', 'Foundation', 'SR Legacy'])
  if (prepared.length > 0) return prepared

  return search(query, apiKey, ['Branded'])
}

// dataTypes go on the URL as REPEATED params (?dataType=A&dataType=B), never as
// one comma-joined value. Joining them puts `Survey (FNDDS)` — parentheses and
// all — inside a single param value, and USDA's gateway rejects that request
// with a 400 roughly two times in three (measured: 2/6 success comma-joined vs
// 6/6 repeated). That silently broke the ENTIRE FNDDS tier, which is the only
// tier covering prepared/composite dishes: they'd miss tier 1 (raw ingredients
// only), 400 on tier 2, get flagged usdaDown, fall through to a pure LLM guess,
// and — because usdaDown also sets skipCanonicalCache — never get cached, so
// every repeat log of the same dish re-rolled a fresh guess.
async function search(query: string, apiKey: string, dataTypes: string[]): Promise<UsdaCandidate[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    pageSize: '5',
  })
  for (const dt of dataTypes) params.append('dataType', dt)

  let res: Response
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new UsdaUnavailableError(`USDA fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!res.ok) {
    throw new UsdaUnavailableError(`USDA responded ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const foods: Array<Record<string, unknown>> = data.foods ?? []

  return foods
    .map(toCandidate)
    .filter((c): c is UsdaCandidate => c !== null)
}

function toCandidate(food: Record<string, unknown>): UsdaCandidate | null {
  const nutrients = (food.foodNutrients ?? []) as Array<Record<string, unknown>>

  const value = (id: number): number | null => {
    const n = nutrients.find(
      (x) => x.nutrientId === id || Number(x.nutrientNumber) === id
    )
    return n && typeof n.value === 'number' ? n.value : null
  }

  const calories = value(NUTRIENT_IDS.calories)
  if (calories === null) return null // no energy value → useless candidate

  // foodMeasures rides along in the same search response — no extra request.
  // "Quantity not specified" is USDA's placeholder for an unstated portion and
  // carries no household meaning, so it's dropped rather than offered as if it
  // were a real measure.
  const measures = (food.foodMeasures ?? []) as Array<Record<string, unknown>>
  const portions: UsdaPortion[] = measures
    .filter((m) =>
      typeof m.gramWeight === 'number' &&
      m.gramWeight > 0 &&
      typeof m.disseminationText === 'string' &&
      !/quantity not specified/i.test(m.disseminationText)
    )
    .map((m) => ({
      description: m.disseminationText as string,
      gramWeight: m.gramWeight as number,
    }))

  return {
    fdcId: food.fdcId as number,
    description: food.description as string,
    dataType: food.dataType as string,
    per100g: {
      calories,
      protein_g: value(NUTRIENT_IDS.protein_g) ?? 0,
      carbs_g: value(NUTRIENT_IDS.carbs_g) ?? 0,
      fat_g: value(NUTRIENT_IDS.fat_g) ?? 0,
      fiber_g: value(NUTRIENT_IDS.fiber_g) ?? 0,
    },
    portions,
  }
}
