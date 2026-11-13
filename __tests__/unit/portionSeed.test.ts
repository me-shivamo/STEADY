import { readFileSync } from 'fs'
import { join } from 'path'

import { buildSeed, FOUNDER_DESCRIPTION_UNITS, naturalKey, parsePortion053, REPO, uuid5 } from '../../scripts/portions/lib'
import { render } from '../../scripts/portions/emit054'

// The reviewed seed that migration 054 ships (spec (b) §9–§11, (e), (h)).

const seed = buildSeed()
const active = seed.rows.filter((r) => r.status === 'active')

describe('054 seed', () => {
  it('has one active row per (scope, unit, size, context, region)', () => {
    const keys = active.map((r) => `${r.scope}|${r.food_item_id ?? r.fdc_id ?? r.category}|${r.unit}|${r.size}|${r.context ?? ''}|${r.region ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('every category chain reaches generic, with no cycle', () => {
    const parent = new Map(seed.categories.map((c) => [c.category, c.parent]))
    for (const c of seed.categories) {
      const seen = new Set<string>()
      let p: string | null | undefined = c.category
      while (p && !seen.has(p)) { seen.add(p); p = parent.get(p) }
      expect(seen.has('generic')).toBe(true)
      expect(p ?? null).toBeNull()
    }
  })
  it('the founder rows are exactly 053\'s _portion053 (parsed from the SQL), keyed by 053\'s ids', () => {
    const fromSql = parsePortion053(readFileSync(join(REPO, 'supabase/migrations/053_recalc_indian_v1.sql'), 'utf8'))
    expect(fromSql).toHaveLength(36)
    const expected = fromSql.flatMap((p) => p.after.flatMap((e) =>
      FOUNDER_DESCRIPTION_UNITS[e.description].map((u) => `${p.food_item_id}|${u}|${e.gramWeight}|${p.approved_by}`))).sort()
    const got = seed.rows.filter((r) => r.source === 'founder').map((r) => `${r.food_item_id}|${r.unit}|${r.grams}|${r.approved_by}`).sort()
    expect(got).toEqual(expected)
    expect(seed.rows.filter((r) => r.source === 'founder').every((r) => r.grade === 'F' && r.status === 'active' && r.size === 'M')).toBe(true)
  })
  it('founder values the spec names: dal katori 150 / bowl 240, rice cup 158 / katori 130 / plate 250, chai 128 / 75 / 200, roti 40, phulka 30', () => {
    const g = (id: string, unit: string) => seed.rows.find((r) => r.food_item_id?.startsWith(id) && r.unit === unit && r.source === 'founder')?.grams
    expect([g('8cbd7524', 'katori'), g('8cbd7524', 'bowl'), g('8cbd7524', 'cup')]).toEqual([150, 240, 240])
    expect([g('d4043769', 'cup'), g('d4043769', 'katori'), g('d4043769', 'plate')]).toEqual([158, 130, 250])
    expect([g('e21a4369', 'cup'), g('e21a4369', 'cutting'), g('e21a4369', 'mug')]).toEqual([128, 75, 200])
    expect([g('2f9486f1', 'piece'), g('f1cf4b91', 'piece')]).toEqual([40, 30])
  })
  it('no generic piece, slice, packet, can or bottle row (container sizes are product facts)', () => {
    expect(seed.rows.filter((r) => r.category === 'generic' && ['piece', 'slice', 'packet', 'can', 'bottle'].includes(r.unit) && r.status === 'active')).toEqual([])
  })
  it('every row has a source_ref and evidence; every active research / hint / mapping row is approved', () => {
    for (const r of seed.rows) {
      expect(r.source_ref.trim()).not.toBe('')
      expect(r.evidence.trim()).not.toBe('')
      if (r.status === 'active' && ['research', 'legacy_hint', 'mapping'].includes(r.source)) expect(r.approved_by).toBeTruthy()
    }
  })
  it('the condiment mapping rows ship proposed (spec (e)); condiment never inherits the generic vessels', () => {
    const cond = seed.rows.filter((r) => r.category === 'condiment')
    expect(cond.length).toBeGreaterThan(0)
    expect(cond.every((r) => r.status === 'proposed')).toBe(true)
    expect(seed.categories.find((c) => c.category === 'condiment')!.inherit_vessels).toBe(false)
  })
  it('the fold-in drops the apple baby-food measures and keeps one row per fdc unit+size', () => {
    expect(seed.rows.some((r) => r.fdc_id === 170959)).toBe(false)
    const k = seed.foldIn.rows.map((r) => `${r.fdc_id}|${r.unit}|${r.size}`)
    expect(new Set(k).size).toBe(k.length)
    expect(seed.foldIn.rows.length).toBeGreaterThan(120)
    expect(seed.foldIn.rows.every((r) => r.grade === 'U' && r.region === null)).toBe(true)
  })
  it('ids are UUIDv5 of the natural key (stable across regenerations)', () => {
    expect(uuid5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')  // RFC 4122 example (DNS ns)
    for (const r of seed.rows.slice(0, 20)) expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(new Set(seed.rows.map((r) => naturalKey(r))).size).toBe(seed.rows.length)
  })
  it('confidence follows spec (d): food F .85 / U .80, category B .70 / C .60 / H .50, generic C .55 / H .45', () => {
    const c = (pred: (r: typeof seed.rows[number]) => boolean) => [...new Set(seed.rows.filter(pred).map((r) => r.confidence))]
    expect(c((r) => r.source === 'founder')).toEqual([0.85])
    expect(c((r) => r.scope === 'fdc')).toEqual([0.8])
    expect(c((r) => r.scope === 'category' && r.grade === 'C')).toEqual([0.6])
    expect(c((r) => r.scope === 'generic' && r.grade === 'H')).toEqual([0.45])
  })
})

describe('emit054 (the check command)', () => {
  it('regenerating gives the files on disk, byte for byte', () => {
    const out = render()
    expect(out.migration).toBe(readFileSync(join(REPO, 'supabase/migrations/054_portion_units.sql'), 'utf8'))
    expect(out.rollback).toBe(readFileSync(join(REPO, 'supabase/rollback/054_portion_units_down.sql'), 'utf8'))
  })
  it('the migration follows the CLI lessons: no top-level BEGIN/COMMIT/LOCK/SET LOCAL; locks in a DO block', () => {
    const sql = render().migration
    const topLevel = sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '')   // drop DO / function bodies
    expect(topLevel).not.toMatch(/^\s*(BEGIN|COMMIT|LOCK TABLE|SET LOCAL)\b/m)
    expect(sql).toMatch(/DO \$locks\$ BEGIN\n {2}LOCK TABLE public\.profiles/)
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
})
