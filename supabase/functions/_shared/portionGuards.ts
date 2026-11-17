// ── Guards on the portion engine's input (Gate B fixes, 2026-11-17) ──────────
// Corrections to a parse that the engine (portions.ts) would otherwise weigh wrongly.
// They live here, not in portions.ts, because portions.ts is one of the hashed inputs
// of the generated USDA migrations (scripts/usda/lib.ts INPUT_FILES): any byte change
// there means regenerating those files. The resolver calls computePortionGuarded.
//
// Pure, no I/O, like the engine.

import {
  categoryChain, categoryOf, computePortion, legacyPortionRows,
  type EngineInput, type PortionResult, type PortionTables, type PortionUnitRow,
} from './portions.ts'

// "a masala omelette" parses as 1 piece. The omelette categories are served whole (serving_unit
// 'serving') and have no piece row, so the engine's chain walk borrowed the parent's piece row:
// egg piece M = 50 g, one egg. A piece or slice is one serving when:
//   - neither the food (its own, fdc or row-portion rows) nor the user (memory, calibration) has a
//     size for that unit, and
//   - walking up the category chain, a category with serving_unit 'serving' comes before any
//     category with a row for that unit (generic never counts).
// The count still multiplies ("2 omelettes" = 2 servings).
export function pieceIsServing(tables: PortionTables, input: EngineInput): boolean {
  const p = input.parse
  const u = p.unit
  if (u !== 'piece' && u !== 'slice') return false
  if (p.stated_amount != null && p.stated_amount > 0 && p.stated_unit) return false
  const usable = (r: PortionUnitRow) =>
    (r.status === 'active' || (r.status === 'proposed' && input.proposed)) && (r.region === null || r.region === input.region)
  const hasUnit = (rows: PortionUnitRow[]) => rows.some((r) => r.unit === u && usable(r))
  const row = input.row
  const foodRows = input.foodRows.filter((r) =>
    (row.id && r.food_item_id === row.id) || (row.fdc_id != null && r.fdc_id != null && Number(r.fdc_id) === Number(row.fdc_id)))
  if (hasUnit(foodRows)) return false
  if (row.status !== 'verified' && legacyPortionRows(row).some((r) => r.unit === u)) return false
  if ((input.memory ?? []).some((e) => e && e.unit === u && Number(e.grams) > 0)) return false
  const chain = categoryChain(tables, categoryOf(tables, row.id, input.phrase, row.name))
  // a piece calibration applies to the food, its own category (never a parent's) or any food
  if ((input.calibrations ?? []).some((c) => c && c.unit === u && (c.scope === 'any' ||
      (c.scope === 'food' && !!row.id && c.food_item_id === row.id) || (c.scope === 'category' && c.category === chain[0])))) return false
  for (const c of chain) {
    if (c === 'generic') return false
    if (hasUnit(tables.categoryRows.filter((r) => r.category === c))) return false
    if (tables.categories.get(c)?.serving_unit === 'serving') return true
  }
  return false
}

export function computePortionGuarded(tables: PortionTables, input: EngineInput): PortionResult | null {
  if (!pieceIsServing(tables, input)) return computePortion(tables, input)
  return computePortion(tables, { ...input, parse: { ...input.parse, unit: null } })
}
