// ── AI estimates with computed calories (v1.2 Phase 7, RESOLVER_AI_MACROS) ─────
// Spec .claude/plans/v1.2-phase5-7-spec.md (g) 8c. When no candidate matches, the matcher
// estimates a food per 100 g. In 'computed' mode it gives only protein, carbs, fat and fibre
// (plus alcohol for a drink the alcohol word list names), and THIS code computes the energy on
// 053's basis:
//
//   kcal = 4·P + 4·(C − fibre) + 2·fibre + 9·F + 7·alcohol
//
// then bounds it to the food's portion category range (portion_categories.kcal100_min / max,
// migration 054; that category only, not inherited; seeded from the matcher's own sanity anchors).
// The range applies only when the food name is a listed category word plus plain modifiers
// ("milk", "toned milk", "roasted peanuts"; portions.categoryForEnergyClamp): a head-noun guess is
// good enough to pick a portion, not to rewrite energy, so "coconut milk", "milk chocolate", "banana
// chips" and "paneer butter masala" are never clamped (fixer 2026-11-13).
// A bounded estimate has all its macros scaled by the same factor, so calories and macros keep
// agreeing (rules v1 would otherwise flag the pair). ai_confidence is capped at 0.4.
//
// legacy (unset, misspelt) = today's estimate path, byte for byte (the matcher prompt included).

import { ALCOHOL_RE, toNumber, type Per100g } from './validate.ts'
import { categoryForEnergyClamp, type PortionTables } from './portions.ts'
import { loadPortionTables } from './portionStore.ts'

export type AiMacrosMode = 'legacy' | 'eval_only' | 'computed'
export const aiMacrosModeFromEnv = (v: string | undefined): AiMacrosMode =>
  v === 'computed' || v === 'eval_only' ? v : 'legacy'
export const effectiveAiMacros = (m: AiMacrosMode, email?: string | null): 'legacy' | 'computed' =>
  m === 'computed' || (m === 'eval_only' && !!email && email.toLowerCase().endsWith('@steadyapp.internal')) ? 'computed' : 'legacy'

export const AI_COMPUTED_MAX_CONFIDENCE = 0.4

export interface KcalRange { min: number | null; max: number | null }
export interface AiMacroContext { tables: PortionTables | null; ranges: Map<string, KcalRange> }

const r2 = (x: number): number => Math.round(x * 100) / 100

/** 053's energy basis (FNP77: 4P + 9F + 4 available carbohydrate + 2 fibre) plus 7 kcal/g alcohol. */
export function computedKcal(p: number, c: number, f: number, fibre: number, alcohol: number): number {
  return 4 * p + 4 * Math.max(c - fibre, 0) + 2 * fibre + 9 * f + 7 * alcohol
}

export interface ComputedEstimate { per100g: Per100g; kcalRaw: number; category: string | null; bounded: 'min' | 'max' | null }

/**
 * The matcher's macros-only estimate → per-100 g numbers with computed energy, bounded by the
 * category range. null when protein, carbs or fat is missing or not a plain non-negative number
 * (the caller then treats it like an unusable estimate: one retry, then the rough path).
 */
export function computeEstimate(raw: unknown, name: string, ctx: AiMacroContext | null): ComputedEstimate | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const val = (x: unknown): number | null => {
    const v = toNumber(x)
    return v === null || Number.isNaN(v) || v < 0 ? null : v
  }
  const p = val(o.protein_g), c = val(o.carbs_g), f = val(o.fat_g)
  if (p === null || c === null || f === null) return null
  const fibre = Math.min(val(o.fiber_g) ?? 0, c)          // fibre is part of total carbohydrate
  const alcohol = ALCOHOL_RE.test(name) ? val(o.alcohol_g) ?? 0 : 0
  const kcalRaw = computedKcal(p, c, f, fibre, alcohol)
  let k = 1
  let bounded: ComputedEstimate['bounded'] = null
  const category = ctx?.tables ? categoryForEnergyClamp(ctx.tables, name) : null
  const range = category ? ctx?.ranges.get(category) : undefined
  if (range && kcalRaw > 0) {
    if (range.min !== null && kcalRaw < range.min) { k = range.min / kcalRaw; bounded = 'min' }
    else if (range.max !== null && kcalRaw > range.max) { k = range.max / kcalRaw; bounded = 'max' }
  }
  const P = r2(p * k), C = r2(c * k), F = r2(f * k), FB = r2(fibre * k), A = alcohol * k
  return {
    per100g: { calories: r2(computedKcal(P, C, F, FB, A)), protein_g: P, carbs_g: C, fat_g: F, fiber_g: FB },
    kcalRaw: r2(kcalRaw), category, bounded,
  }
}

// The category tables (054, cached by portionStore) and the kcal ranges, cached per function
// instance for 10 minutes like the tables. Best effort: an error means "no bounds".
const TTL_MS = 10 * 60 * 1000
let rangeCache: { at: number; ranges: Map<string, KcalRange> } | null = null
export function clearAiMacroCache(): void { rangeCache = null }

// deno-lint-ignore no-explicit-any
export async function loadAiMacroContext(supabase: any, now = Date.now()): Promise<AiMacroContext> {
  const tables = await loadPortionTables(supabase, now)
  if (!rangeCache || now - rangeCache.at >= TTL_MS) {
    try {
      const { data, error } = await supabase.from('portion_categories').select('category, kcal100_min, kcal100_max')
      if (error) throw new Error(error.message)
      const ranges = new Map<string, KcalRange>()
      for (const r of data ?? []) {
        const min = r.kcal100_min == null ? null : Number(r.kcal100_min)
        const max = r.kcal100_max == null ? null : Number(r.kcal100_max)
        if (min !== null || max !== null) ranges.set(String(r.category), { min, max })
      }
      rangeCache = { at: now, ranges }
    } catch (e) {
      console.error('[ai-macros] kcal ranges unavailable, estimates are not bounded:', (e as Error)?.message ?? e)
      return { tables, ranges: rangeCache?.ranges ?? new Map() }
    }
  }
  return { tables, ranges: rangeCache.ranges }
}
