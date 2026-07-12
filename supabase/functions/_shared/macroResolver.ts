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

import { searchUsda, UsdaUnavailableError, type UsdaCandidate } from './usda.ts'

export interface ParsedFood {
  name: string
  quantity_description: string
  quantity_g: number
  confidence: number
}

export interface Per100g {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export type MacroSource = 'usda' | 'indb' | 'ai_estimated' | 'user_created'

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
- liquids: milk 1.03 g/ml, water 1.0 g/ml, juice 1.04 g/ml, oil 0.92 g/ml
- pieces: almond 1.2g, cashew 1.6g, walnut half 2g, large egg 50g, bread slice 25g,
  roti/chapati 40g, idli 40g, dosa 85g, banana 118g, apple 180g
- portions: 1 katori/small bowl ≈ 150g, 1 plate of a cooked dish ≈ 200g,
  1 cup cooked rice ≈ 160g, 1 tbsp ≈ 15g, 1 tsp ≈ 5g`

// lowercase → strip punctuation → collapse whitespace. Modifiers are kept on
// purpose: "soaked almonds" and "almonds" cache as separate canonical foods.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    .select('id, source, normalized_name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g')
    .in('normalized_name', uniqueNorms)
    .not('calories_per_100g', 'is', null)

  const exactHits = new Map<string, { id: string; source: MacroSource; per100g: Per100g }>()
  for (const row of cacheRows ?? []) {
    exactHits.set(row.normalized_name, {
      id: row.id,
      source: row.source as MacroSource,
      per100g: rowPer100g(row),
    })
    console.log('[resolver] cache hit:', row.normalized_name)
  }

  const missNorms = uniqueNorms.filter((n) => !exactHits.has(n))

  // ── 2–4. Retrieve candidates + LLM match for the misses ─────────────────
  const resolvedMisses = new Map<string, { id: string; source: MacroSource; per100g: Per100g }>()

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
    const matches = await matchCall(missFoods, perMissCandidates, opts.openRouterKey)

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
        })
        continue
      }

      const per100g = chosen?.per100g ?? match.est_per_100g
      if (!per100g) {
        throw new Error(`Could not resolve macros for "${food.name}"`)
      }
      const source: MacroSource = chosen?.fdcId ? 'usda' : 'ai_estimated'

      // 5. write to cache — unless this is an AI stand-in that only exists
      // because USDA was briefly unreachable (don't immortalize outages).
      const skipCanonicalCache = source === 'ai_estimated' && usdaDown[i]

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

      resolvedMisses.set(norm, { id: rowId, source, per100g })
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
    return {
      ...p,
      ...computeMacros(p.quantity_g, hit.per100g),
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
}

// One gpt-4o-mini call matching ALL missed foods against their retrieved
// candidates. Doubles as the AI fallback: when no candidate fits, the model
// supplies est_per_100g in the same response — never a separate call.
async function matchCall(
  foods: ParsedFood[],
  perFoodCandidates: Candidate[][],
  openRouterKey: string,
): Promise<MatchResult[]> {
  const lines = foods.map((food, i) => {
    const cands = perFoodCandidates[i]
      .map((c, j) => `    ${j}: ${c.label} — per 100g: ${c.per100g.calories} kcal, ${c.per100g.protein_g}g protein, ${c.per100g.carbs_g}g carbs, ${c.per100g.fat_g}g fat`)
      .join('\n')
    return `Food ${i}: "${food.name}" (${food.quantity_description})\n${cands || '    (no candidates found)'}`
  }).join('\n\n')

  const prompt = `You match food descriptions to nutrition database candidates.

For each food below, pick the candidate that is genuinely the SAME food (preparation matters: raw vs cooked/soaked vs fried are different). If no candidate is truly the same food, set candidate_index to null and provide your best per-100g estimate instead.

est_per_100g values MUST be per 100 GRAMS of the food itself — never per piece or per serving. Sanity anchors: nuts/seeds 500-650 kcal/100g, oils ~900, cooked grains/dals 100-200, milk 40-70, vegetables 20-100, meats 100-300, fried snacks 300-550.

${lines}

Return ONLY JSON:
{ "matches": [ { "food_index": 0, "candidate_index": 2 or null, "est_per_100g": null or { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 } } ] }
One entry per food, in order.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://steadyapp.io',
      'X-Title': 'STEADY-resolver',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenRouter (match): ${await res.text()}`)
  }

  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  const matches: MatchResult[] = foods.map((_, i) => {
    const m = (parsed.matches ?? [])[i] ?? {}
    const idx = typeof m.candidate_index === 'number' &&
      m.candidate_index >= 0 && m.candidate_index < perFoodCandidates[i].length
      ? m.candidate_index
      : null
    return { candidate_index: idx, est_per_100g: m.est_per_100g ?? null }
  })
  return matches
}
