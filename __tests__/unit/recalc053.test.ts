import { readFileSync } from 'fs'
import { join } from 'path'

import { correctPortionFromMeasures, GRAM_HINTS_PROMPT } from '../../supabase/functions/_shared/macroResolver'
import { foodItemIssues } from '../../supabase/functions/_shared/validate'

// Migration 053 (recalculated Indian dishes) inserts verified reference rows whose numbers come from
// scripts/recalc (Python). The migration's own self-check runs the SQL twin, food_item_issues(), on the
// database; this test runs the TypeScript rules on exactly the same rows, so the two rule sets cannot
// disagree about a row 053 ships. The rows are read from the generated scripts/recalc/out/derivations.json,
// which `python3 -I scripts/recalc/recalc.py check` proves is current.
//
// The founder's portions (2026-11-13: dal katori / bowl, rice cup / katori / plate, chai cup / cutting / mug,
// roti and phulka pieces) only help if the resolver can read them. On an exact / alias / memory hit the grams
// come from correctPortionFromMeasures(); the generator states what each quantity phrase resolves to (its
// Python twin, in the review report) and portion_matching carries that table. This test runs every line
// through the REAL function, so the report cannot claim a match the resolver does not make.

interface Row {
  id: string
  name: string
  source: string
  key: string
  variant: string
  derivation_id: string
  per100g: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
}
interface Derivation { id: string; method_sql: string; variant_key: string }
interface Alias { alias: string; kind: string; target: string }
interface PortionMatch {
  family: string
  key: string
  phrase: string
  portions: { description: string; gramWeight: number }[]
  grams: number | null
}

const out = JSON.parse(readFileSync(join(__dirname, '../../scripts/recalc/out/derivations.json'), 'utf8')) as {
  rows: Row[]
  derivations: Derivation[]
  aliases: Alias[]
  portion_matching: PortionMatch[]
}

describe('migration 053 generated rows', () => {
  it('has the rows the plan describes', () => {
    expect(out.rows.length).toBeGreaterThan(40)
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

  it('stores kcal = 4P + 9F + 4C + 2fib (±0.5) for every recalculated row', () => {
    const recalc = new Set(out.derivations.filter((d) => d.method_sql === 'recipe_recalc').map((d) => d.id))
    for (const r of out.rows.filter((x) => recalc.has(x.derivation_id))) {
      const p = r.per100g
      expect(Math.abs(p.kcal - (4 * p.protein + 9 * p.fat + 4 * p.carbs + 2 * p.fiber))).toBeLessThanOrEqual(0.5)
    }
  })

  it.each(out.portion_matching.map((m) => [`${m.family} · "${m.phrase}"`, m] as const))(
    '%s resolves as the review report says',
    (_label, m) => {
      expect(correctPortionFromMeasures(m.phrase, m.portions)).toBe(m.grams)
    },
  )

  it('reaches the founder portions the resolver can reach (2026-11-13)', () => {
    const at = (key: string, phrase: string) =>
      out.portion_matching.find((m) => m.key === key && m.phrase === phrase)!
    const dal = at('dal', '1 bowl').portions
    expect(correctPortionFromMeasures('1 bowl', dal)).toBe(240)
    expect(correctPortionFromMeasures('1 katori', dal)).toBeNull()   // not a unit yet: the parser's guess stands
    const chai = at('tea', '1 cup').portions
    expect(correctPortionFromMeasures('1 cup', chai)).toBe(128)
    expect(correctPortionFromMeasures('1 mug', chai)).toBe(128)      // mug folds into cup (Phase 5 follow-up)
    expect(correctPortionFromMeasures('1 cup', at('cooked rice', '1 cup').portions)).toBe(158)
    expect(correctPortionFromMeasures('2 pieces', at('phulka', '1 piece').portions)).toBe(60)
    expect(correctPortionFromMeasures('2 pieces', at('roti', '1 piece').portions)).toBe(80)
    // The parser usually keeps the food's own word ("2 rotis"): no unit, so its gram guess stands and the
    // 30 g phulka piece is reached only by "N pieces" (Phase 5 follow-up in the review report).
    for (const ph of ['2 roti', '2 rotis', '3 chapati']) {
      expect(correctPortionFromMeasures(ph, at('roti', '1 piece').portions)).toBeNull()
    }
    expect(correctPortionFromMeasures('2 phulka', at('phulka', '1 piece').portions)).toBeNull()
  })

  it('relies on the parser hints the review report quotes (roti/chapati 40g; no phulka hint yet)', () => {
    // The report says "2 rotis" keeps the parser's 40 g a roti and "2 phulka" most likely logs 40 g too.
    // When Phase 5 adds a phulka hint this fails: update scripts/recalc/emit53.py portion_section and re-emit.
    expect(GRAM_HINTS_PROMPT).toContain('roti/chapati 40g')
    expect(GRAM_HINTS_PROMPT).not.toMatch(/phulka/i)
  })

  it('never makes an alias equal to a key it ships', () => {
    const keys = new Set(out.rows.map((r) => r.key))
    expect(out.aliases.filter((a) => a.kind === 'insert' && keys.has(a.alias))).toEqual([])
    expect(new Set(out.rows.map((r) => r.key)).size).toBe(out.rows.length)
  })
})
