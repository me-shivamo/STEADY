// ── Table-mode edits: which foods did the user actually change? (fixer 2026-11-13) ──
// An edit re-sends the whole meal ("1 bowl dal, 2 roti" → "1 bowl dal, 3 roti"). A food
// whose amount did not change must keep its stored grams and numbers: re-weighing it
// with today's tables would silently move a meal logged before the switch to table mode
// (live labels: "1 bowl" median 150 g vs the engine's 240 g for dal; "1 cup" 240 g vs 128 g
// for chai). Pure; jest-tested.

import { stripRoughMarker, type ParsedFood } from './macroResolver.ts'
import type { StoredEntry } from './portionCalibrationApi.ts'
import type { PortionInfo, PortionParse, PortionSource } from './portions.ts'
import { MASS_G, portionFromDescription, VOLUME_ML, type DescribedPortion } from './portionText.ts'

interface AmountKey { count: number; unit: string; size: string; stated: string }
const r3 = (n: number) => Math.round(n * 1000) / 1000

function keyOf(p: Pick<DescribedPortion, 'count' | 'unit' | 'size' | 'stated_amount' | 'stated_unit'>): AmountKey {
  // a stated amount is compared in base units (g or ml), so "0.25 kg" = "250 g"
  let stated = ''
  if (p.stated_amount != null && p.stated_unit) {
    const f = MASS_G[p.stated_unit] ?? VOLUME_ML[p.stated_unit]
    const kind = MASS_G[p.stated_unit] !== undefined ? 'g' : 'ml'
    if (f !== undefined) stated = `${r3(p.stated_amount * f)}${kind}`
  }
  return {
    count: stated ? 1 : r3(p.count),
    unit: stated ? '' : p.unit && p.unit !== 'serving' ? p.unit : 'serving',
    size: stated ? '' : p.size ?? '',
    stated,
  }
}

// true = the new parse names the same amount the stored entry was logged with. Compares against the
// entry's own label (what the app put in the edit text), read by the same synonym table as shadow mode.
// Unknown (no stored entry, no label) = false: the food is weighed as before.
export function sameAmount(parse: PortionParse | undefined, stored: StoredEntry | undefined, foodName: string): boolean {
  if (!parse || !stored) return false
  const label = typeof stored.quantity_label === 'string' ? stripRoughMarker(stored.quantity_label).trim() : ''
  if (!label) return false
  const old = portionFromDescription(label, stored.food_name ?? foodName)
  if (!old) return false
  const a = keyOf(old)
  const b = keyOf(parse)
  return a.count === b.count && a.unit === b.unit && a.size === b.size && a.stated === b.stated
}

const SOURCES: ReadonlySet<string> = new Set([
  'stated', 'memory', 'user_calibration', 'food', 'category', 'volume', 'serving_default', 'ai', 'label', 'edit_rescale', 'rule', 'legacy',
])
// The portion of a kept (unchanged) food: the stored entry's own columns when it has them, so the
// re-inserted entry carries them again; for an entry logged before table mode, 'legacy'.
export function keptPortion(stored: StoredEntry | undefined, grams: number): PortionInfo & { needs_follow_up: boolean } {
  const unit = stored?.portion_unit ?? null
  const count = Number(stored?.portion_count) > 0 ? Number(stored!.portion_count) : 1
  const source = (stored?.portion_source && SOURCES.has(stored.portion_source) ? stored.portion_source : 'legacy') as PortionSource
  const conf = Number(stored?.portion_confidence)
  return {
    unit: unit as PortionInfo['unit'],
    size: (stored?.portion_size ?? null) as PortionInfo['size'],
    count,
    grams_per_unit: Math.round((grams / count) * 100) / 100,
    source,
    ref: 'unchanged in the edit: the stored grams are kept',
    confidence: Number.isFinite(conf) && conf > 0 ? conf : 0.5,
    needs_follow_up: false,
  }
}

// The parse a lesson's data default is weighed with: one of the previous unit, no personal sources.
export function unitParse(unit: PortionParse['unit'], size: PortionParse['size']): PortionParse {
  return { count: 1, unit, size, stated_amount: null, stated_unit: null, stated_per_unit: null, context: null, fallback_g: null }
}

export type EditableFood = Pick<ParsedFood, 'name' | 'portion_parse'>
