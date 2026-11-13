// ── Portion data access (v1.2 Phase 5) ────────────────────────────────────────
// The PORTION_MODE flag, the per-instance cache of the reference tables
// (migration 054), the one batched read of a request's food rows, the user's
// calibrations and region. All reads are best-effort: an error means "no portion
// data" (the caller then keeps legacy grams or falls back to R8), never a 500.

import type { Calibration, PortionTables, PortionUnitRow, Region } from './portions.ts'
import { regionFromTimezone } from './portions.ts'
import { UNITS, type Size, type Unit } from './portionText.ts'

// ── Flag (same kill-switch pattern as RESOLVER_SEARCH) ────────────────────────
// legacy (default; unset or misspelt) | shadow (log the table grams, serve legacy)
// | eval_only (table for @steadyapp.internal accounts, proposed rows included) | table.
export type PortionMode = 'legacy' | 'shadow' | 'eval_only' | 'table'
export const portionModeFromEnv = (v: string | undefined): PortionMode =>
  v === 'shadow' || v === 'eval_only' || v === 'table' ? v : 'legacy'

export interface EffectivePortion { mode: 'legacy' | 'shadow' | 'table'; proposed: boolean }
export const LEGACY_PORTION: EffectivePortion = Object.freeze({ mode: 'legacy', proposed: false }) as EffectivePortion
export function effectivePortion(m: PortionMode, email?: string | null): EffectivePortion {
  if (m === 'table') return { mode: 'table', proposed: false }
  if (m === 'shadow') return { mode: 'shadow', proposed: false }
  if (m === 'eval_only' && !!email && email.toLowerCase().endsWith('@steadyapp.internal')) return { mode: 'table', proposed: true }
  return { mode: 'legacy', proposed: false }
}

// ── Reference tables, cached per function instance ────────────────────────────
const TTL_MS = 10 * 60 * 1000
export const PORTION_ROW_COLUMNS =
  'id, food_item_id, fdc_id, category, unit, size, grams, ml, context, region, is_default, is_unit_default, source, grade, confidence, source_ref, status'
let cache: { at: number; tables: PortionTables } | null = null
export function clearPortionCache(): void { cache = null }

// deno-lint-ignore no-explicit-any
const toRow = (r: any): PortionUnitRow => ({
  id: String(r.id), food_item_id: r.food_item_id ?? null, fdc_id: r.fdc_id == null ? null : Number(r.fdc_id),
  category: r.category ?? null, unit: r.unit, size: r.size, grams: r.grams == null ? null : Number(r.grams),
  ml: r.ml == null ? null : Number(r.ml), context: r.context ?? null, region: r.region ?? null,
  is_default: !!r.is_default, is_unit_default: !!r.is_unit_default, source: r.source, grade: r.grade,
  confidence: Number(r.confidence), source_ref: r.source_ref ?? '', status: r.status,
})

// deno-lint-ignore no-explicit-any
export async function loadPortionTables(supabase: any, now = Date.now()): Promise<PortionTables | null> {
  if (cache && now - cache.at < TTL_MS) return cache.tables
  try {
    const [cats, words, map, rows] = await Promise.all([
      supabase.from('portion_categories').select('category, parent, density_g_per_ml, s_ratio, l_ratio, serving_unit, inherit_vessels'),
      supabase.from('portion_category_words').select('word, category, priority, head_only'),
      supabase.from('portion_category_map').select('food_item_id, category'),
      supabase.from('portion_units').select(PORTION_ROW_COLUMNS).not('category', 'is', null).in('status', ['active', 'proposed']),
    ])
    const err = cats.error ?? words.error ?? map.error ?? rows.error
    if (err) throw new Error(err.message ?? String(err))
    const tables: PortionTables = {
      // deno-lint-ignore no-explicit-any
      categories: new Map((cats.data ?? []).map((c: any) => [c.category, {
        category: c.category, parent: c.parent ?? null,
        density_g_per_ml: c.density_g_per_ml == null ? null : Number(c.density_g_per_ml),
        s_ratio: Number(c.s_ratio), l_ratio: Number(c.l_ratio), serving_unit: c.serving_unit ?? null,
        inherit_vessels: c.inherit_vessels !== false,
      }])),
      // deno-lint-ignore no-explicit-any
      words: (words.data ?? []).map((w: any) => ({ word: w.word, category: w.category, priority: Number(w.priority), head_only: w.head_only === true })),
      // deno-lint-ignore no-explicit-any
      categoryMap: new Map((map.data ?? []).map((m: any) => [m.food_item_id, m.category])),
      categoryRows: (rows.data ?? []).map(toRow),
    }
    if (tables.categories.size === 0) throw new Error('portion_categories is empty')
    cache = { at: now, tables }
    return tables
  } catch (e) {
    console.error('[portions] reference tables unavailable:', (e as Error)?.message ?? e)
    return cache?.tables ?? null   // a stale copy beats none
  }
}

// The one batched read per request: every portion_units row keyed by these ids.
// deno-lint-ignore no-explicit-any
export async function loadFoodPortionRows(supabase: any, foodItemIds: string[], fdcIds: number[], proposed: boolean): Promise<PortionUnitRow[]> {
  const ids = [...new Set(foodItemIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].sort()
  const fdcs = [...new Set(fdcIds.filter((x) => Number.isInteger(x) && x > 0))].sort((a, b) => a - b)
  if (ids.length === 0 && fdcs.length === 0) return []
  const parts = [
    ...(ids.length ? [`food_item_id.in.(${ids.join(',')})`] : []),
    ...(fdcs.length ? [`fdc_id.in.(${fdcs.join(',')})`] : []),
  ]
  try {
    const { data, error } = await supabase.from('portion_units').select(PORTION_ROW_COLUMNS)
      .in('status', proposed ? ['active', 'proposed'] : ['active'])
      .or(parts.join(','))
    if (error) throw new Error(error.message)
    return (data ?? []).map(toRow)
  } catch (e) {
    console.error('[portions] food portion rows unavailable:', (e as Error)?.message ?? e)
    return []
  }
}

// ── The user's own calibrations (active only). The user_id filter IS the
// security boundary: the functions use service_role, which bypasses RLS.
const CAL_COLUMNS = 'id, scope, category, food_item_id, unit, size, grams, ml, as_size, origin, source_text, created_at'
// deno-lint-ignore no-explicit-any
export async function loadCalibrations(supabase: any, userId: string): Promise<Calibration[]> {
  try {
    const { data, error } = await supabase.from('user_portion_calibrations').select(CAL_COLUMNS)
      .eq('user_id', userId).is('revoked_at', null)
    if (error) throw new Error(error.message)
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((c: any) => ({
      id: c.id, scope: c.scope, category: c.category ?? null, food_item_id: c.food_item_id ?? null, unit: c.unit,
      size: c.size, grams: c.grams == null ? null : Number(c.grams), ml: c.ml == null ? null : Number(c.ml), as_size: c.as_size ?? null,
      origin: c.origin ?? undefined,
    }))
  } catch (e) {
    console.error('[portions] calibrations unavailable:', (e as Error)?.message ?? e)
    return []
  }
}

export interface CalibrationView {
  id: string; scope: string; category: string | null; food_item_id: string | null; unit: string; size: string
  grams: number | null; ml: number | null; as_size: string | null; origin: string; source_text: string | null; created_at: string
}
// deno-lint-ignore no-explicit-any
export async function listCalibrations(supabase: any, userId: string): Promise<CalibrationView[]> {
  const { data, error } = await supabase.from('user_portion_calibrations').select(CAL_COLUMNS)
    .eq('user_id', userId).is('revoked_at', null).order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export interface CalibrationWrite {
  scope: 'any' | 'category' | 'food'
  category?: string | null
  food_item_id?: string | null
  unit: Unit
  size?: Size | null
  grams?: number | null
  ml?: number | null
  as_size?: Size | null
  origin: CalibrationOrigin
  // the canonical description (describeCalibration), never the user's raw message (chat_messages holds that)
  source_text?: string | null
}
export const CALIBRATION_ORIGINS = ['statement', 'edit', 'edit_confirmed', 'chip', 'follow_up'] as const
export type CalibrationOrigin = typeof CALIBRATION_ORIGINS[number]

// Validates the shape before the database's own CHECKs do (a clear error for an API caller).
export function calibrationWriteIssues(c: Partial<CalibrationWrite>): string[] {
  const out: string[] = []
  if (!c.unit || !(UNITS as readonly string[]).includes(c.unit)) out.push('unit')
  if (c.size != null && !['S', 'M', 'L'].includes(c.size)) out.push('size')
  if (c.as_size != null && !['S', 'M', 'L'].includes(c.as_size)) out.push('as_size')
  const vals = [c.grams, c.ml, c.as_size].filter((v) => v !== null && v !== undefined)
  if (vals.length !== 1) out.push('exactly_one_of_grams_ml_as_size')
  for (const v of [c.grams, c.ml]) if (v != null && !(typeof v === 'number' && v > 0 && v <= 10000)) out.push('amount')
  if (c.as_size != null && c.size != null && c.size !== 'M') out.push('as_size_needs_unsized')
  if (c.scope === 'any' && (c.category || c.food_item_id)) out.push('scope')
  if (c.scope === 'category' && (!c.category || c.food_item_id)) out.push('scope')
  if (c.scope === 'food' && (!c.food_item_id || c.category)) out.push('scope')
  if (!c.scope || !['any', 'category', 'food'].includes(c.scope)) out.push('scope')
  if (!c.origin || !(CALIBRATION_ORIGINS as readonly string[]).includes(c.origin)) out.push('origin')
  return [...new Set(out)]
}

// deno-lint-ignore no-explicit-any
export async function setCalibration(supabase: any, userId: string, c: CalibrationWrite): Promise<string> {
  const issues = calibrationWriteIssues(c)
  if (issues.length) throw new Error(`calibration invalid: ${issues.join(',')}`)
  const { data, error } = await supabase.rpc('set_portion_calibration', {
    p_user_id: userId, p_scope: c.scope, p_category: c.category ?? null, p_food_item_id: c.food_item_id ?? null,
    p_unit: c.unit, p_size: c.size ?? 'M', p_grams: c.grams ?? null, p_ml: c.ml ?? null, p_as_size: c.as_size ?? null,
    p_origin: c.origin, p_source_text: c.source_text ?? null,
  })
  if (error) throw new Error(error.message)
  return String(data)
}

// `scope` narrows an undo to one food or category ("forget my chai cup size"); without it a unit's
// calibrations go in every scope ("forget my cup size").
export interface RevokeBy {
  id?: string
  unit?: Unit
  all?: boolean
  scope?: { scope: 'category'; category: string } | { scope: 'food'; food_item_id: string }
}
// deno-lint-ignore no-explicit-any
export async function revokeCalibrations(supabase: any, userId: string, by: RevokeBy): Promise<number> {
  const { data, error } = await supabase.rpc('revoke_portion_calibrations', {
    p_user_id: userId, p_id: by.id ?? null, p_unit: by.unit ?? null, p_all: !!by.all,
    p_scope: by.scope?.scope ?? null,
    p_category: by.scope?.scope === 'category' ? by.scope.category : null,
    p_food_item_id: by.scope?.scope === 'food' ? by.scope.food_item_id : null,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

// ── Region (profiles.timezone) ────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export async function loadRegion(supabase: any, userId: string): Promise<Region> {
  try {
    const { data, error } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    return regionFromTimezone(data?.timezone ?? null)
  } catch (e) {
    console.error('[portions] region unavailable, using IN:', (e as Error)?.message ?? e)
    return 'IN'
  }
}
