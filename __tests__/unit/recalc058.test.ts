import { readFileSync } from 'fs'
import { join } from 'path'

import { buildSeed, engineTables } from '../../scripts/portions/lib'
import { correctPortionFromMeasures, normalizeName } from '../../supabase/functions/_shared/macroResolver'
import { computePortion, type PortionParse, type PortionUnitRow } from '../../supabase/functions/_shared/portions'
import { foodItemIssues } from '../../supabase/functions/_shared/validate'

// Migration 058 (recalculated Indian dishes, batch 2) inserts verified reference rows whose numbers come from
// scripts/recalc/batch2.py (Python). The migration's own self-check runs the SQL twins (food_item_issues() and a
// normalizeName twin) on the database; this test runs the TypeScript originals on exactly the same rows and
// phrases, read from the generated scripts/recalc/out/derivations_v2.json (`python3 -I scripts/recalc/batch2.py
// check` proves it is current). So the resolver's own normalizeName, not a copy of it, decides that each approved
// phrase reaches its exact key.

interface Row {
  id: string
  name: string
  source: string
  key: string
  variant: string
  method: string
  fdc_id: number | null
  derivation_id: string
  per100g: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
  portions: { description: string; gramWeight: number }[]
  predecessor: string | null
  fallback: string | null
  kind: 'successor' | 'key_copy' | 'new_key'
  food_default: boolean
  category: string
}
interface Phrase { phrase: string; key: string; id: string }
interface Unit {
  id: string; food_item_id: string; unit: string; size: string; grams: number; ml: number | null; context: string | null
  is_default: boolean; source_ref: string; approved_by: string
}

const out = JSON.parse(readFileSync(join(__dirname, '../../scripts/recalc/out/derivations_v2.json'), 'utf8')) as {
  rows: Row[]
  phrases: Phrase[]
  portion_units: Unit[]
  category_map: { food_item_id: string; category: string }[]
  aliases: { alias: string; kind: string }[]
}
const byKey = new Map(out.rows.map((r) => [r.key, r]))

describe('migration 058 generated rows', () => {
  it('has the rows the founder approved (spec (i)1 and (i)6)', () => {
    for (const k of ['rajma', 'rajma curry', 'aloo sabzi', 'aloo ki sabzi', 'aloo sabji', 'aalu ki sabzi', 'bhindi sabzi',
      'bhindi ki sabzi', 'bhindi sabji', 'upma', 'rava upma', 'biryani', 'chicken biryani', 'pizza', 'poha',
      'dal makhani', 'dal makhni', 'daal makhani']) {
      expect(byKey.has(k)).toBe(true)
    }
  })

  it('dal makhani is the home value 110.40 on all three spellings (spec (i)6)', () => {
    for (const k of ['dal makhani', 'dal makhni', 'daal makhani']) {
      expect(byKey.get(k)!.per100g).toEqual({ kcal: 110.4, protein: 4.74, carbs: 11.38, fat: 4.38, fiber: 3.25 })
      expect(correctPortionFromMeasures('1 bowl', byKey.get(k)!.portions)).toBe(240)
    }
    expect(byKey.get('dal makhani')!.predecessor).toBe('6afbebf2-7c87-49ae-b9cc-32d74bc214ed')
  })

  it.each(out.rows.map((r) => [`${r.variant} · ${r.key}`, r] as const))('%s passes rules v1', (_label, r) => {
    expect(
      foodItemIssues(r.source, r.name, {
        calories: r.per100g.kcal,
        protein_g: r.per100g.protein,
        carbs_g: r.per100g.carbs,
        fat_g: r.per100g.fat,
        fiber_g: r.per100g.fiber,
      }),
    ).toEqual([])
  })

  it.each(out.phrases.map((p) => [p.phrase, p] as const))('normalizeName(%j) is its exact key', (_label, p) => {
    expect(normalizeName(p.phrase)).toBe(p.key)
    expect(byKey.get(p.key)?.id).toBe(p.id)
  })

  it('recalculated rows store kcal = 4P + 9F + 4C + 2 fibre', () => {
    for (const r of out.rows.filter((x) => x.method === 'recipe_edit')) {
      const e = 4 * r.per100g.protein + 9 * r.per100g.fat + 4 * r.per100g.carbs + 2 * r.per100g.fiber
      expect(Math.abs(r.per100g.kcal - e)).toBeLessThanOrEqual(0.5)
    }
  })

  it('no row carries an fdc_id, so fdc-keyed USDA units cannot attach (pizza: no 897 g "1 pizza")', () => {
    expect(out.rows.every((r) => r.fdc_id === null)).toBe(true)
    const pizza = byKey.get('pizza')!
    expect(out.portion_units.filter((u) => u.food_item_id === pizza.id).map((u) => [u.unit, u.grams])).toEqual([['slice', 110]])
  })

  it('legacy-mode portions: a pizza slice is 110 g; "1 pizza" names no unit (the parser guess stands)', () => {
    const pizza = byKey.get('pizza')!
    expect(correctPortionFromMeasures('1 slice', pizza.portions)).toBe(110)
    expect(correctPortionFromMeasures('2 slices', pizza.portions)).toBe(220)
    expect(correctPortionFromMeasures('1 pizza', pizza.portions)).toBeNull()
    const rajma = byKey.get('rajma')!
    expect(correctPortionFromMeasures('1 bowl', rajma.portions)).toBe(240)
  })

  it('every row has one no-context default, except key copies whose source has none (the category serves them)', () => {
    for (const r of out.rows) {
      const defaults = out.portion_units.filter((u) => u.food_item_id === r.id && u.is_default && u.context === null)
      expect(defaults).toHaveLength(r.food_default ? 1 : 0)
    }
    expect(out.rows.filter((r) => !r.food_default).map((r) => r.key).sort()).toEqual(
      ['aalu ki sabzi', 'aloo ki sabzi', 'aloo sabji', 'aloo sabzi', 'bhindi ki sabzi', 'bhindi sabji', 'bhindi sabzi'])
  })

  it('poha is the fat rule\'s result, pinned until the founder confirms it (spec (i)2)', () => {
    expect(byKey.get('poha')!.per100g).toEqual({ kcal: 155.05, protein: 4.14, carbs: 23.84, fat: 4.23, fiber: 2.53 })
  })

  it('every new row has a rollback fallback (no memory pointer is dropped by the down script)', () => {
    for (const r of out.rows) expect(r.fallback).not.toBeNull()
    expect(byKey.get('upma')!.fallback).toBe('137f6250-64aa-5339-a2d7-baa92e0ea192')
    expect(byKey.get('chicken biryani')!.fallback).toBe('a6958211-43b7-446c-a785-262846a37ae0')
    expect(byKey.get('dal makhni')!.fallback).toBe('6afbebf2-7c87-49ae-b9cc-32d74bc214ed')
  })

  it('portion source_ref cites each unit\'s own approval date (dal makhani: 2026-11-15)', () => {
    for (const u of out.portion_units) {
      expect(u.source_ref).toBe(u.approved_by.startsWith('founder 2026-11-15') ? 'founder:2026-11-15' : 'founder:2026-11-13')
    }
    const dm = byKey.get('dal makhani')!
    expect(new Set(out.portion_units.filter((u) => u.food_item_id === dm.id).map((u) => u.source_ref))).toEqual(new Set(['founder:2026-11-15']))
  })
})

// Table mode (054's engine, PORTION_MODE=table) on 054's real seed plus 058's rows: a key copy must serve exactly what its
// source row serves, and a no-amount log of aloo / bhindi sabzi keeps 054's founder 150 g sabzi serving (portions.test.ts).
describe('migration 058 rows in the 054 portion engine', () => {
  const seed = buildSeed()
  const { tables, foodRows } = engineTables(seed)
  const rows058: PortionUnitRow[] = out.portion_units.map((u) => ({
    id: u.id, food_item_id: u.food_item_id, fdc_id: null, category: null, unit: u.unit as PortionUnitRow['unit'],
    size: u.size as PortionUnitRow['size'], grams: u.grams, ml: u.ml, context: u.context as PortionUnitRow['context'],
    region: null, is_default: u.is_default, is_unit_default: false, source: 'founder', grade: 'F', confidence: 0.85,
    source_ref: u.source_ref, status: 'active',
  }))
  const allRows = [...foodRows, ...rows058]
  const tbl = { ...tables, categoryMap: new Map([...tables.categoryMap, ...out.category_map.map((c) => [c.food_item_id, c.category] as [string, string])]) }
  const P = (count: number, unit: PortionParse['unit'], extra: Partial<PortionParse> = {}): PortionParse =>
    ({ count, unit, size: null, stated_amount: null, stated_unit: null, context: null, fallback_g: null, ...extra })
  const grams = (key: string, p: PortionParse) => {
    const r = byKey.get(key)!
    return computePortion(tbl, { parse: p, phrase: key, row: { id: r.id, fdc_id: null, status: 'verified', name: r.name },
      foodRows: allRows, region: 'IN', proposed: false, channel: 'text' })?.grams
  }
  const source = (id: string, name: string, p: PortionParse) => computePortion(tbl, { parse: p, phrase: name,
    row: { id, fdc_id: null, status: 'verified', name }, foodRows: allRows, region: 'IN', proposed: false, channel: 'text' })?.grams

  it('aloo / bhindi sabzi with no amount: 150 g, exactly as their source rows', () => {
    for (const k of ['aloo sabzi', 'aloo ki sabzi', 'aloo sabji', 'aalu ki sabzi']) expect(grams(k, P(1, null))).toBe(150)
    for (const k of ['bhindi sabzi', 'bhindi ki sabzi', 'bhindi sabji']) expect(grams(k, P(1, null))).toBe(150)
    expect(source('1abbe3e2-6f5c-50ac-81b7-f79909d6c43a', 'Potato curry (Aloo ki sabzi)', P(1, null))).toBe(150)
    expect(source('cd15763a-7373-54fe-860c-ba3d2e8c4c1c', 'Okra fry', P(1, null))).toBe(150)
  })

  it('their katori is still the founder unit (aloo 120 g, bhindi 110 g)', () => {
    expect(grams('aloo sabzi', P(1, 'katori'))).toBe(120)
    expect(grams('bhindi sabzi', P(2, 'katori'))).toBe(220)
  })

  it('rows with their own default serve it with no amount', () => {
    expect(grams('rajma', P(1, null))).toBe(150)
    expect(grams('dal makhani', P(1, null))).toBe(150)
    expect(grams('upma', P(1, null))).toBe(150)
    expect(grams('biryani', P(1, null))).toBe(300)
    expect(grams('pizza', P(2, 'slice'))).toBe(220)
  })
})

describe('migration 058 aliases', () => {
  it('aliases equal to a 058 key retire', () => {
    const retired = out.aliases.filter((a) => a.kind === 'retire').map((a) => a.alias).sort()
    expect(retired).toEqual(['aalu ki sabzi', 'aloo sabji', 'bhindi ki sabzi', 'rajma', 'upma'])
    for (const a of retired) expect(byKey.has(a)).toBe(true)
  })
})
