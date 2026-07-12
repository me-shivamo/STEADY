// ── USDA FoodData Central client ──────────────────────────────────────────────
// Searches the free USDA nutrition database (api.nal.usda.gov) and returns
// candidates with lab-measured per-100g nutrient values. Used by the macro
// resolver as the second lookup tier (after our own food_items cache).
//
// Foundation and SR Legacy datasets report nutrients per 100g directly.
// Survey (FNDDS) covers mixed/prepared dishes, also per 100g.

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
  // Prefer lab-measured generic foods; fall back to survey data (mixed dishes)
  // only when the strict search finds nothing.
  const strict = await search(query, apiKey, 'Foundation,SR Legacy')
  if (strict.length > 0) return strict
  return search(query, apiKey, 'Survey (FNDDS),Foundation,SR Legacy')
}

async function search(query: string, apiKey: string, dataType: string): Promise<UsdaCandidate[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    pageSize: '5',
    dataType,
  })

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
  }
}
