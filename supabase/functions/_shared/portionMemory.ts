// user_food_memory.portions: a user's own weight per (unit, size) for one phrase
// (spec (b) §5). TypeScript twin of migration 054's public.portion_memory_ok():
// both must accept exactly the same values — memoryPortions.test.ts runs both on
// one fixture set (scripts/portions/tests/memory_portions_fixtures.json, whose
// `sql` column was produced by the SQL function on a local copy of live).
//
// Shape: an array of at most 24 {unit, size, grams, origin, at}; (unit, size)
// unique; unit is a parsed unit (never 'ml'); 0 < grams <= 10000; origin is
// correction | calibration | manual | label; at is a real YYYY-MM-DD date.

import { UNITS, type Size, type Unit } from './portionText.ts'
import type { MemoryPortion } from './portions.ts'

export const MEMORY_PORTION_ORIGINS = ['correction', 'calibration', 'manual', 'label'] as const
export type MemoryPortionOrigin = typeof MEMORY_PORTION_ORIGINS[number]
const KEYS = new Set(['unit', 'size', 'grams', 'origin', 'at'])
const MAX_ENTRIES = 24

function validDate(s: string): boolean {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  if (y < 1) return false
  const mo = Number(m[2])
  const d = Number(m[3])
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate()   // day 0 of the next month = last day of this one
  return d <= days
}

export function isPortionMemoryOk(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (!Array.isArray(v) || v.length > MAX_ENTRIES) return false
  const seen = new Set<string>()
  for (const e of v) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return false
    const o = e as Record<string, unknown>
    if (Object.keys(o).some((k) => !KEYS.has(k))) return false
    if (typeof o.unit !== 'string' || !(UNITS as readonly string[]).includes(o.unit)) return false
    if (o.size !== 'S' && o.size !== 'M' && o.size !== 'L') return false
    if (typeof o.grams !== 'number' || !Number.isFinite(o.grams) || !(o.grams > 0 && o.grams <= 10000)) return false
    if (typeof o.origin !== 'string' || !(MEMORY_PORTION_ORIGINS as readonly string[]).includes(o.origin)) return false
    if (typeof o.at !== 'string' || !validDate(o.at)) return false
    const k = `${o.unit}|${o.size}`
    if (seen.has(k)) return false
    seen.add(k)
  }
  return true
}

// Memory portions as the engine reads them: a value that fails the validator is
// ignored as a whole (it cannot be in the database, but a read of an older
// shape must never throw).
export function readMemoryPortions(v: unknown): MemoryPortion[] | null {
  return Array.isArray(v) && v.length > 0 && isPortionMemoryOk(v) ? (v as MemoryPortion[]) : null
}

// Phase 6 hook (spec (g)9; the type lands now, Phase 6 wires it): merge one
// entry into a phrase's portions — the same (unit, size) is replaced, the
// array stays at most 24 entries (the oldest `at` goes first).
export function mergeMemoryPortion(
  existing: unknown,
  entry: { unit: Unit; size: Size; grams: number; origin: MemoryPortionOrigin; at: string },
): MemoryPortion[] {
  const cur = readMemoryPortions(existing) ?? []
  const next = cur.filter((e) => !(e.unit === entry.unit && e.size === entry.size))
  next.push({ unit: entry.unit, size: entry.size, grams: Math.round(entry.grams * 10) / 10, origin: entry.origin, at: entry.at })
  next.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return next.slice(-MAX_ENTRIES)
}
