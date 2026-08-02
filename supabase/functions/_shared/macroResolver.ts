// ── Macro resolver (RAG core) ─────────────────────────────────────────────────
// Replaces "the LLM invents macro numbers" with a grounded pipeline:
//
//   parsed foods → 1. exact cache hit (food_items, per-100g canonical rows)
//                → 2. fuzzy cache candidates (FTS; finds the INDB seed rows)
//                → 3. USDA search candidates for remaining misses
//                → 4. ONE cheap LLM call: pick best candidate per miss, or
//                     emit a per-100g estimate when nothing matches
//                → 5. upsert resolutions into food_items (read-through cache)
//                → 6. macros computed HERE in code: quantity_g × per100g / 100
//
// The LLM never outputs final macro numbers — identical input therefore
// resolves to identical macros, and repeat foods cost zero external calls.

import { searchUsda, UsdaUnavailableError, type UsdaCandidate, type UsdaPortion } from './usda.ts'
import { logAiCall } from './aiLogger.ts'

export interface ParsedFood {
  name: string
  quantity_description: string
  quantity_g: number
  confidence: number
  // Present only when the photo was of a nutrition label — these are the
  // label's own printed values, read verbatim by the vision model rather
  // than resolved from USDA/cache. See resolveLabelFoods() below.
  label_macros?: Partial<Per100gTotals>
  // The gram weight label_macros is FOR, as printed on the label (e.g. 100 for
  // "per 100g", or 40 for "1 serving (40g)"). quantity_g can differ from this
  // when the user states their own portion (e.g. "I ate 90g of this") — the
  // model reports the label's raw numbers unscaled, and resolveLabelFoods()
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
  food_item_id: string
  macro_source: MacroSource
}

export interface Totals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

interface ResolveOpts {
  openRouterKey: string
  fdcApiKey: string
  userId: string
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

// One retrieved candidate a miss can be matched against — either an existing
// cache row (carries its id) or a fresh USDA result (carries its fdcId).
interface Candidate {
  label: string
  per100g: Per100g
  cacheRowId?: string
  cacheSource?: MacroSource
  fdcId?: number
  // USDA's published household measures for this food ("1 item = 38g"). Used
  // to sanity-check the parse step's gram guess — see matchCall().
  portions?: UsdaPortion[]
}

// deno-lint-ignore no-explicit-any
export async function resolveFoods(
  supabase: any,
  parsed: ParsedFood[],
  opts: ResolveOpts,
): Promise<{ foods: ResolvedFood[]; totals: Totals }> {
  // Dedupe by normalized name so "milk" twice in one meal resolves once.
  const norms = parsed.map((p) => normalizeName(p.name))
  const uniqueNorms = [...new Set(norms)]

  // ── 1. Exact cache hits ──────────────────────────────────────────────────
  const { data: cacheRows } = await supabase
    .from('food_items')
    .select('id, source, normalized_name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, portions')
    .in('normalized_name', uniqueNorms)
    .not('calories_per_100g', 'is', null)

  // A cache hit deliberately skips matchCall — we already know this food's
  // macros, and paying for an LLM call would defeat the cache. But the parse
  // step's gram guess still needs checking, so we correct it here from the
  // portions stored on the row (migration 023), deterministically and for free.
  const exactHits = new Map<string, { id: string; source: MacroSource; per100g: Per100g; correctedG?: number }>()
  for (const row of cacheRows ?? []) {
    // Every parsed food sharing this normalized name; they can differ in how
    // the user phrased the amount, so correct per-food rather than per-row.
    const parsedForRow = parsed.filter((_, i) => norms[i] === row.normalized_name)
    const correctedG = parsedForRow.length === 1
      ? correctPortionFromMeasures(parsedForRow[0].quantity_description, row.portions) ?? undefined
      : undefined

    exactHits.set(row.normalized_name, {
      id: row.id,
      source: row.source as MacroSource,
      per100g: rowPer100g(row),
      correctedG,
    })
    console.log('[resolver] cache hit:', row.normalized_name, correctedG ? `(portion → ${correctedG}g)` : '')
  }

  const missNorms = uniqueNorms.filter((n) => !exactHits.has(n))

  // ── 2–4. Retrieve candidates + LLM match for the misses ─────────────────
  const resolvedMisses = new Map<string, { id: string; source: MacroSource; per100g: Per100g; correctedG?: number }>()

  if (missNorms.length > 0) {
    const missFoods = missNorms.map((n) => parsed[norms.indexOf(n)])

    const perMissCandidates: Candidate[][] = []
    const usdaDown: boolean[] = []

    await Promise.all(
      missFoods.map(async (food, i) => {
        const norm = missNorms[i]
        const candidates: Candidate[] = []

        // 2. fuzzy cache (this is how "poha" finds the seeded INDB row
        //    named e.g. "Poha (beaten rice, cooked)")
        const { data: fuzzy } = await supabase
          .from('food_items')
          .select('id, name, source, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g')
          .textSearch('name', norm, { type: 'websearch' })
          .not('calories_per_100g', 'is', null)
          .limit(3)

        for (const row of fuzzy ?? []) {
          candidates.push({
            label: `${row.name} [${row.source}]`,
            per100g: rowPer100g(row),
            cacheRowId: row.id,
            cacheSource: row.source as MacroSource,
          })
        }

        // 3. USDA. A missing key is a lasting configuration state, not an
        // outage — skip the lookup but keep genuine-miss semantics so the AI
        // estimate still gets cached and stays deterministic. Only a fetch
        // failure with a valid key marks usdaDown (transient → don't cache).
        usdaDown[i] = false
        if (opts.fdcApiKey) {
          try {
            const usda = await searchUsda(food.name, opts.fdcApiKey)
            for (const c of usda) {
              candidates.push({
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

        perMissCandidates[i] = candidates
      })
    )

    // 4. single match call for all misses
    const matches = await matchCall(supabase, opts.userId, missFoods, perMissCandidates, opts.openRouterKey)

    for (let i = 0; i < missFoods.length; i++) {
      const norm = missNorms[i]
      const food = missFoods[i]
      const match = matches[i]
      const candidates = perMissCandidates[i]
      const chosen = match.candidate_index !== null ? candidates[match.candidate_index] : undefined

      if (chosen?.cacheRowId) {
        // fuzzy cache row matched → reuse it, nothing to write
        resolvedMisses.set(norm, {
          id: chosen.cacheRowId,
          source: chosen.cacheSource!,
          per100g: chosen.per100g,
          correctedG: match.corrected_quantity_g ?? undefined,
        })
        continue
      }

      // The match prompt asks the model to always supply est_per_100g when it
      // rejects every candidate, but nothing enforces that at the schema
      // level — an LLM can (rarely) return null for both. Failing the WHOLE
      // request over one ambiguous ingredient is disproportionate: a user
      // logging "chole bhature" shouldn't lose the log entirely because one
      // component confused the match step. Fall back to a generic estimate
      // and keep going — this food just won't be as accurate as usual, but
      // the log still succeeds. This case is expected to be rare; log it so
      // it stays visible for future prompt tuning instead of silently
      // masking a pattern worth fixing at the source.
      let per100g = chosen?.per100g ?? match.est_per_100g
      let usedGenericFallback = false
      if (!per100g) {
        console.error(`[resolver] no match/estimate for "${food.name}" — using generic fallback`)
        per100g = { calories: 200, protein_g: 8, carbs_g: 25, fat_g: 8, fiber_g: 2 }
        usedGenericFallback = true
      }
      const source: MacroSource = chosen?.fdcId ? 'usda' : 'ai_estimated'

      // 5. write to cache — unless this is an AI stand-in that only exists
      // because USDA was briefly unreachable (don't immortalize outages), or
      // this specific row is the generic placeholder above (don't immortalize
      // a guess that was never actually about this food).
      const skipCanonicalCache = (source === 'ai_estimated' && usdaDown[i]) || usedGenericFallback

      const rowBase = {
        source,
        name: food.name,
        calories_per_100g: per100g.calories,
        protein_per_100g: per100g.protein_g,
        carbs_per_100g: per100g.carbs_g,
        fat_per_100g: per100g.fat_g,
        fiber_per_100g: per100g.fiber_g,
        // legacy per-serving columns filled per-100g for backward compat
        calories: per100g.calories,
        protein_g: per100g.protein_g,
        carbs_g: per100g.carbs_g,
        fat_g: per100g.fat_g,
        fiber_g: per100g.fiber_g,
        serving_size_g: 100,
        serving_size_description: '100 g',
        fdc_id: chosen?.fdcId ?? null,
        // Persist USDA's household measures so a future cache hit can correct
        // its portion without re-querying USDA (see correctPortionFromMeasures).
        portions: chosen?.portions?.length ? chosen.portions : null,
        created_by: null,
      }

      let rowId: string
      if (skipCanonicalCache) {
        // normalized_name NULL keeps it out of the canonical cache while still
        // giving food_entries a valid food_item_id to reference.
        const { data, error } = await supabase
          .from('food_items')
          .insert({ ...rowBase, created_by: opts.userId })
          .select('id')
          .single()
        if (error) throw error
        rowId = data.id
      } else {
        const { data, error } = await supabase
          .from('food_items')
          .upsert({ ...rowBase, normalized_name: norm }, { onConflict: 'normalized_name' })
          .select('id')
          .single()
        if (error) throw error
        rowId = data.id
      }

      resolvedMisses.set(norm, {
        id: rowId,
        source,
        per100g,
        correctedG: match.corrected_quantity_g ?? undefined,
      })
    }
  }

  // touch last_used_at for hits (fire-and-forget; failure is harmless)
  if (exactHits.size > 0) {
    supabase
      .from('food_items')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', [...exactHits.values()].map((h) => h.id))
      .then(() => {}, () => {})
  }

  // ── 6. deterministic compute ─────────────────────────────────────────────
  const foods: ResolvedFood[] = parsed.map((p, i) => {
    const hit = exactHits.get(norms[i]) ?? resolvedMisses.get(norms[i])
    if (!hit) throw new Error(`Unresolved food: ${p.name}`)
    // The parse step guessed grams from the user's words with no reference
    // data; the match step may have revised that against USDA's published
    // household measures (see matchCall). Prefer the revised figure — and
    // carry it on quantity_g too, not just into the macro math, so the entry
    // the user sees ("45 g") agrees with the numbers beside it.
    const quantityG = hit.correctedG ?? p.quantity_g
    if (hit.correctedG && hit.correctedG !== p.quantity_g) {
      console.log(`[resolver] portion corrected: "${p.name}" ${p.quantity_g}g → ${hit.correctedG}g (${p.quantity_description})`)
    }
    return {
      ...p,
      quantity_g: quantityG,
      ...computeMacros(quantityG, hit.per100g),
      food_item_id: hit.id,
      macro_source: hit.source,
    }
  })

  const r1 = (n: number) => Math.round(n * 10) / 10
  const totals: Totals = {
    calories: r1(foods.reduce((s, x) => s + x.calories, 0)),
    protein_g: r1(foods.reduce((s, x) => s + x.protein_g, 0)),
    carbs_g: r1(foods.reduce((s, x) => s + x.carbs_g, 0)),
    fat_g: r1(foods.reduce((s, x) => s + x.fat_g, 0)),
    fiber_g: r1(foods.reduce((s, x) => s + x.fiber_g, 0)),
  }

  return { foods, totals }
}

// Resolves foods the vision model read straight off a nutrition label.
// These skip cache/USDA/LLM-match entirely — the label's printed numbers are
// ground truth. We still cache them into food_items (source: 'label') so a
// repeat photo of the same product becomes a normal exact-cache hit next time.
export async function resolveLabelFoods(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  parsed: ParsedFood[],
): Promise<ResolvedFood[]> {
  return Promise.all(parsed.map(async (p) => {
    const label = p.label_macros!
    // label_macros is the label's raw printed values FOR label_serving_g grams
    // (e.g. "per 100g" or "1 serving (40g)") — not for quantity_g, which is
    // whatever the user actually ate/is logging. Fall back to quantity_g when
    // label_serving_g is missing (older client, or model omitted it) so this
    // degrades to "assume the label's serving equals the logged amount"
    // rather than dividing by zero or an undefined value.
    const servingG = p.label_serving_g ?? p.quantity_g
    const per100gScale = 100 / servingG
    const per100g: Per100g = {
      calories: (label.calories ?? 0) * per100gScale,
      protein_g: (label.protein_g ?? 0) * per100gScale,
      carbs_g: (label.carbs_g ?? 0) * per100gScale,
      fat_g: (label.fat_g ?? 0) * per100gScale,
      fiber_g: (label.fiber_g ?? 0) * per100gScale,
    }
    // Final totals for THIS log: label's raw values scaled from label_serving_g
    // to quantity_g. This is the deterministic version of what we used to ask
    // the model to compute itself — same pattern as the edit-entry rescale fix.
    const qtyScale = p.quantity_g / servingG
    const r1 = (n: number) => Math.round(n * qtyScale * 10) / 10

    const { data, error } = await supabase
      .from('food_items')
      .upsert({
        source: 'label',
        name: p.name,
        normalized_name: normalizeName(p.name),
        calories_per_100g: per100g.calories,
        protein_per_100g: per100g.protein_g,
        carbs_per_100g: per100g.carbs_g,
        fat_per_100g: per100g.fat_g,
        fiber_per_100g: per100g.fiber_g,
        calories: per100g.calories,
        protein_g: per100g.protein_g,
        carbs_g: per100g.carbs_g,
        fat_g: per100g.fat_g,
        fiber_g: per100g.fiber_g,
        serving_size_g: 100,
        serving_size_description: '100 g',
        fdc_id: null,
        created_by: null,
      }, { onConflict: 'normalized_name' })
      .select('id')
      .single()
    if (error) throw error

    return {
      ...p,
      calories: r1(label.calories ?? 0),
      protein_g: r1(label.protein_g ?? 0),
      carbs_g: r1(label.carbs_g ?? 0),
      fat_g: r1(label.fat_g ?? 0),
      fiber_g: r1(label.fiber_g ?? 0),
      food_item_id: data.id,
      macro_source: 'label' as MacroSource,
    }
  }))
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
  est_per_100g: Per100g | null
  // Grams, revised against USDA's published household measures for the matched
  // food. null = keep the parse step's original estimate.
  corrected_quantity_g: number | null
}

// One gpt-4o-mini call matching ALL missed foods against their retrieved
// candidates. Doubles as the AI fallback: when no candidate fits, the model
// supplies est_per_100g in the same response — never a separate call.
// deno-lint-ignore no-explicit-any
async function matchCall(
  supabase: any,
  userId: string,
  foods: ParsedFood[],
  perFoodCandidates: Candidate[][],
  openRouterKey: string,
): Promise<MatchResult[]> {
  const lines = foods.map((food, i) => {
    const cands = perFoodCandidates[i]
      .map((c, j) => {
        const base = `    ${j}: ${c.label} — per 100g: ${c.per100g.calories} kcal, ${c.per100g.protein_g}g protein, ${c.per100g.carbs_g}g carbs, ${c.per100g.fat_g}g fat`
        // Only a handful of measures — enough to anchor the common phrasings
        // ("1 piece", "1 cup") without flooding the prompt.
        const p = (c.portions ?? []).slice(0, 5)
        return p.length
          ? `${base}\n       USDA portions: ${p.map((m) => `${m.description} = ${m.gramWeight}g`).join('; ')}`
          : base
      })
      .join('\n')
    return `Food ${i}: "${food.name}" — user described the amount as "${food.quantity_description}", which we currently estimate as ${food.quantity_g}g\n${cands || '    (no candidates found)'}`
  }).join('\n\n')

  const prompt = `You match food descriptions to nutrition database candidates.

For each food below, pick the candidate that is genuinely the SAME food (preparation matters: raw vs cooked/soaked vs fried are different). Be strict — a candidate whose name merely CONTAINS the food's name is not automatically a match, in EITHER direction: a plain raw/base ingredient (e.g. "apple", "banana", "chicken", "salmon") is NOT the same food as a composite dish that features it as one component (e.g. "apple mousse", "banana bread", "chicken curry", "salmon sushi") — a composite dish has additional components (rice, batter, sauce, other ingredients) that meaningfully change the per-100g numbers, so matching to just one of its ingredients silently drops those components entirely. If no candidate is truly the same food, set candidate_index to null and provide your best per-100g estimate instead — a null match with a good estimate is better than a wrong match.

TWO TRAPS THAT PRODUCE LARGE, SILENT ERRORS — check both before accepting a candidate:

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
