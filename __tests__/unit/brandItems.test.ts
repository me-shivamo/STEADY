import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import {
  atwaterOk, BRAND_BY_SLUG, buildItems, CSV_COLUMNS, DECISION_IDS, labelMatches, loadDecisions, loadRaw, milli, parseDecisions,
  qaCodes, sectionOf, sizeNotMonotonic, sugarGtCarbs, type BrandItem, type Build, type DecisionId, type Decisions, type DecisionsFile, type RawRow,
} from '../../scripts/brands/lib'
import { pathsFor, renderAll } from '../../scripts/brands/emit'

// v1.2 follow-up plan WP10 (generator half): the brand_items generator. Real-data tests run on the committed
// scripts/data/brands/raw/_combined.csv and scripts/brands/decisions.json; synthetic tests pin the gate edges.

const REPO = join(__dirname, '..', '..')
const DECISIONS_TEXT = readFileSync(join(REPO, 'scripts/brands/decisions.json'), 'utf8')

let raw: RawRow[]
let file: DecisionsFile
let base: Build
const qaHas = (r: RawRow, code: string): boolean => qaCodes(r.qa_flag).includes(code)
const key = (it: { brand_slug: string; source_row: number | string }): string => `${it.brand_slug}:${it.source_row}`

function decided(ds: Decisions, id: DecisionId, value: unknown): Decisions {
  return { ...ds, [id]: { ...ds[id], status: 'DECIDED', chosen: value } } as Decisions
}
function byRow(b: Build): Map<string, BrandItem> {
  return new Map(b.items.map((it) => [key(it), it]))
}

beforeAll(() => {
  raw = loadRaw()
  file = loadDecisions()
  base = buildItems(raw, file.decisions)
})

describe('real data, proposed decisions', () => {
  it('keeps every CSV row, in CSV order, with unique deterministic UUIDv5 ids', () => {
    expect(raw).toHaveLength(3741)
    expect(base.items).toHaveLength(3741)
    expect(base.omitted).toHaveLength(0)
    expect(base.items.map(key)).toEqual(raw.map(key))
    const ids = base.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(buildItems(raw, file.decisions).items.map((i) => i.id)).toEqual(ids)
  })

  it('holds exactly the QA error and conflict rows (nothing is released while decisions are pending)', () => {
    const held = new Set(base.items.filter((i) => i.status === 'held').map(key))
    const qaBad = new Set(raw.filter((r) => r.qa_severity === 'error' || r.qa_severity === 'conflict').map(key))
    expect(qaBad.size).toBe(167 + 172)
    expect(held).toEqual(qaBad)
    const counts = { verified: 0, held: 0, unserved: 0 }
    for (const it of base.items) counts[it.status]++
    expect(counts).toEqual({ verified: 3261, held: 339, unserved: 141 })
  })

  it("the generator's own gates agree with the QA flags row for row", () => {
    const gate = (code: string) => new Set(base.items.filter((i) => i.gate_codes.includes(code)).map(key))
    const qa = (code: string) => new Set(raw.filter((r) => qaHas(r, code)).map(key))
    expect(gate('atwater_mismatch')).toEqual(qa('atwater_mismatch'))
    expect(gate('atwater_mismatch').size).toBe(78)
    expect(gate('sugar_gt_carbs')).toEqual(qa('sugar_gt_carbs'))
    expect(gate('sugar_gt_carbs').size).toBe(44)
    expect(gate('size_not_monotonic')).toEqual(qa('size_not_monotonic'))
    expect(gate('size_not_monotonic').size).toBe(37)
  })

  it('every served row passes Atwater (independent float check, REPORT rule), has full macros and no QA error or conflict', () => {
    const served = base.items.filter((i) => i.status === 'verified')
    expect(served).toHaveLength(3261)
    const bad = served.filter((it) => {
      const k = Number(it.kcal)
      const est = 4 * Number(it.protein_g) + 4 * Number(it.carbs_g) + 9 * Number(it.fat_g)
      const d = Math.abs(k - est)
      return it.protein_g === null || it.carbs_g === null || it.fat_g === null || !(d <= 0.15 * k + 1e-9 || d <= 15 + 1e-9) ||
        it.atwater_ok !== true || !['clean', 'caveat'].includes(it.qa_severity) || it.gate_codes.length > 0 || it.status_reason !== null
    })
    expect(bad.map(key)).toEqual([])
  })

  it('copies every number exactly as printed and never invents a weight (review #20)', () => {
    const changed: string[] = []
    for (const it of base.items) {
      const r = it.raw
      for (const c of ['serving_g', 'serving_ml', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg'] as const) {
        if (it[c] !== (r[c] === '' ? null : r[c])) changed.push(`${key(it)} ${c}`)
      }
      const sugarOk = r.sugar_g.startsWith('<') ? it.sugar_g === null && `<${it.sugar_lt_g}` === r.sugar_g.replace(/\s/g, '') : it.sugar_g === (r.sugar_g === '' ? null : r.sugar_g) && it.sugar_lt_g === null
      if (!sugarOk) changed.push(`${key(it)} sugar_g`)
    }
    expect(changed).toEqual([])
    const servedPerServing = base.items.filter((i) => i.status === 'verified' && i.basis === 'per_serving')
    // per-serving rows with no weight are served (Domino's slices, Faasos wraps) with both columns NULL
    expect(servedPerServing.filter((i) => i.serving_g === null && i.serving_ml === null).length).toBe(642)
    // ml-only rows stay ml-only: no 1 g/ml
    expect(servedPerServing.filter((i) => i.serving_g === null && i.serving_ml !== null).length).toBe(991)
    for (const it of servedPerServing) expect(it.amount_rule).toBe('serving')
  })

  it("serves the founder's probe item McAloo Tikki at the printed 339.52 kcal and holds Starbucks Short/Tall Cappuccino (104 = 104)", () => {
    const aloo = base.items.find((i) => i.brand_key === 'mcdonalds' && i.region === 'IN-WS' && i.item === 'McAloo Tikki Burger®') as BrandItem
    expect([aloo.status, aloo.kcal, aloo.serving_g, aloo.protein_g, aloo.carbs_g, aloo.fat_g]).toEqual(['verified', '339.52', '146', '8.50', '50.27', '11.31'])
    expect(aloo.is_default_size && aloo.is_default_region).toBe(true)
    const capp = base.items.filter((i) => i.brand_key === 'starbucks' && i.item_norm === 'cappuccino')
    expect(capp.map((i) => [i.variant, i.status, i.serving_ml, i.serving_g])).toEqual([
      ['Short', 'held', '237', null], ['Tall', 'held', '354', null], ['Grande', 'verified', '473', null], ['Venti', 'verified', '591', null],
    ])
    // the Tall default is held, so the group has no default: the resolver must ask rather than guess Grande
    expect(capp.some((i) => i.is_default_size)).toBe(false)
  })

  it('normalizes labels only: country, veg flag, "<2" sugar bounds', () => {
    expect(raw.filter((r) => r.country === 'India')).toHaveLength(240)
    expect(new Set(base.items.map((i) => i.country))).toEqual(new Set(['IN']))
    expect(base.items.filter((i) => i.veg === null)).toHaveLength(287)
    expect(new Set(base.items.map((i) => i.veg))).toEqual(new Set(['veg', 'nonveg', 'vegan', 'egg', null]))
    expect(base.items.filter((i) => i.sugar_lt_g !== null).map((i) => i.brand_slug)).toEqual(Array(7).fill('theobroma'))
  })

  it('regions: McDonald\'s by franchisee, Behrouz by city, everyone else IN; default region follows the decision', () => {
    const seen = new Map<string, number>()
    for (const it of base.items) {
      const k = `${it.brand_key}:${it.region}:${it.is_default_region}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    expect([...seen.keys()].filter((k) => k.startsWith('mcdonalds') || k.startsWith('behrouz')).sort()).toEqual([
      'behrouz:IN-BLR:false', 'behrouz:IN-HYD:false', 'behrouz:IN-NCR:true', 'mcdonalds:IN-NE:false', 'mcdonalds:IN-WS:true'])
    expect([...seen.keys()].filter((k) => !k.startsWith('mcdonalds') && !k.startsWith('behrouz')).every((k) => k.endsWith(':IN:true'))).toBe(true)
    expect(seen.get('mcdonalds:IN-WS:true')).toBe(192)
    expect(seen.get('mcdonalds:IN-NE:false')).toBe(121)
  })

  it('default size: at most one per item group, only on served rows, picked by the brand label order', () => {
    const groups = new Map<string, BrandItem[]>()
    for (const it of base.items.filter((i) => i.is_default_size)) {
      expect(it.status).toBe('verified')
      const k = [it.brand_key, it.region, it.item_norm, it.veg ?? ''].join('|')
      groups.set(k, [...(groups.get(k) ?? []), it])
    }
    for (const g of groups.values()) expect(g).toHaveLength(1)
    const def = (brand: string, item: string, region = 'IN') =>
      base.items.find((i) => i.brand_key === brand && i.region === region && i.item_norm === item && i.is_default_size)?.variant_norm
    expect(def('starbucks', 'latte')).toBe('tall')
    expect(def('kfc', 'popcorn')).toBe('regular')
    expect(def('subway', 'chicken n cheese')).toBe('6 inch')
    expect(def('mcdonalds', 'fries', 'IN-WS')).toBe('regular')   // N&E fries are kcal-only, so unserved
    expect(def('mcdonalds', 'coca cola', 'IN-WS')).toBe('medium')
    expect(def('mcdonalds', 'cappuccino', 'IN-WS')).toBe('regular r')
    expect(def('burger_king', 'fries')).toBe('regular')
    expect(base.defaults).toEqual({ groups: 2204, withDefault: 2154, ambiguous: 8, noMatch: 38, defaultNotServed: 4 })
  })

  it('default size is picked over the whole listing: a held size never hands the default to another size', () => {
    const grp = (brand: string, item: string) => base.items.filter((i) => i.brand_key === brand && i.region === 'IN' && i.item_norm === item)
    // Starbucks prints Short, Tall and Grande; Tall (the default label) and Grande are held, Short is served:
    // the served Short must not become the default just because it is the only served row.
    const nitro = grp('starbucks', 'salted caramel nitro cold brew')
    expect(nitro.map((i) => [i.variant_norm, i.status])).toEqual([['short', 'verified'], ['tall', 'held'], ['grande', 'held']])
    expect(nitro.some((i) => i.is_default_size)).toBe(false)
    // Domino's prints Caprese Medium (served) and Large (held), no Regular: no label matches, so no default.
    expect(grp('dominos', 'caprese').some((i) => i.is_default_size)).toBe(false)
    // Pizza Hut 7 UP 250 ml (unserved) and 330 ml (served): two sizes and no label, so no default.
    expect(grp('pizza_hut', '7 up').some((i) => i.is_default_size)).toBe(false)
    // an exact repeat (duplicate_exact) counts once: La Pino'z Veg Hawaiian is still listed once
    const haw = grp('lapinoz', 'veg hawaiian pizza')
    expect(haw.map((i) => [i.status, i.is_default_size])).toEqual([['verified', true], ['unserved', false]])
  })

  it('collector SUSPECT rows that pass every gate are withheld while collector_suspect is pending (proposed withhold)', () => {
    const sus = base.items.filter((i) => i.qa_codes.includes('collector_noted') && /\bsuspect\b/i.test(i.notes ?? ''))
    expect(sus).toHaveLength(40)
    expect(sus.every((i) => i.status !== 'verified')).toBe(true)
    const withheld = sus.filter((i) => i.status === 'unserved').map(key).sort()
    expect(withheld).toEqual(['amul:34', 'haldirams:5', 'naturals_ice_cream:138', 'theobroma:115'])
    for (const it of sus) expect(it.status_reason).toContain('decision:collector_suspect=withhold')
    // 'serve' releases exactly those 4; the 36 held ones stay held
    const served = byRow(buildItems(raw, decided(file.decisions, 'collector_suspect', 'serve')))
    expect(sus.filter((i) => served.get(key(i))?.status === 'verified').map(key).sort()).toEqual(withheld)
    expect(sus.filter((i) => i.status === 'held').every((i) => served.get(key(i))?.status === 'held')).toBe(true)
  })

  it('per-100 rows: scaled by an amount; La Pino\'z (no portion) only by a stated amount', () => {
    const lap = base.items.filter((i) => i.brand_key === 'lapinoz')
    expect(lap.filter((i) => i.status === 'verified' && i.amount_rule === 'stated_only')).toHaveLength(197)
    for (const it of base.items.filter((i) => i.basis !== 'per_serving')) expect(['stated_or_portion', 'stated_only']).toContain(it.amount_rule)
  })

  it('kcal-only rows are kept but never served (Atwater not checkable)', () => {
    const kOnly = base.items.filter((i) => i.atwater_ok === null)
    expect(kOnly).toHaveLength(139)
    for (const it of kOnly) expect(it.status).not.toBe('verified')
    expect(base.items.filter((i) => i.brand_key === 'ccd').every((i) => i.status === 'unserved')).toBe(true)
  })
})

describe('decisions take effect only as documented', () => {
  it('a DECIDED Behrouz city releases that city\'s conflict rows only; pending releases nothing', () => {
    const b = byRow(buildItems(raw, decided(file.decisions, 'behrouz_city', 'IN-NCR')))
    const conflicts = raw.filter((r) => r.brand_slug === 'behrouz_biryani' && qaHas(r, 'duplicate_conflict'))
    expect(conflicts).toHaveLength(50)
    const released = conflicts.filter((r) => b.get(key(r))?.status === 'verified')
    expect(released.length).toBeGreaterThan(0)
    for (const r of released) {
      const it = b.get(key(r)) as BrandItem
      expect(it.region).toBe('IN-NCR')
      expect(it.status_reason).toMatch(/^decision:behrouz_city=IN-NCR released the conflict$/)
    }
    for (const r of conflicts.filter((x) => b.get(key(x))?.region === 'IN-BLR')) {
      expect(b.get(key(r))?.status).toBe('held')
      expect(b.get(key(r))?.status_reason).toContain('decision:behrouz_city=IN-NCR (another city)')
    }
    // the pending proposal (also IN-NCR) releases nothing
    expect(conflicts.every((r) => byRow(base).get(key(r))?.status === 'held')).toBe(true)
    // 'none' keeps all held
    const none = byRow(buildItems(raw, decided(file.decisions, 'behrouz_city', 'none')))
    expect(conflicts.every((r) => none.get(key(r))?.status === 'held')).toBe(true)
  })

  it("Domino's: keep_higher_kcal releases one row per group; keep_rows releases exactly the listed rows and refuses bad lists", () => {
    const dom = raw.filter((r) => r.brand_slug === 'dominos' && qaHas(r, 'duplicate_conflict'))
    expect(dom).toHaveLength(68)
    const hi = byRow(buildItems(raw, decided(file.decisions, 'dominos_duplicates', { policy: 'keep_higher_kcal', keep_rows: [] })))
    const rel = dom.filter((r) => hi.get(key(r))?.status === 'verified')
    expect(rel.length).toBeGreaterThan(0)
    expect(rel.length).toBeLessThanOrEqual(34)
    const pick = dom.find((r) => r.qa_severity === 'conflict') as RawRow   // conflict tier = no QA error, so no gate fails either
    const one = Number(pick.source_row)
    const kr = byRow(buildItems(raw, decided(file.decisions, 'dominos_duplicates', { policy: 'keep_rows', keep_rows: [one] })))
    expect(dom.filter((r) => kr.get(key(r))?.status === 'verified').map((r) => Number(r.source_row))).toEqual([one])
    const partner = dom.find((r) => r !== pick && r.item === pick.item && r.variant_or_size === pick.variant_or_size && r.serving_desc === pick.serving_desc) as RawRow
    expect(() => buildItems(raw, decided(file.decisions, 'dominos_duplicates', { policy: 'keep_rows', keep_rows: [one, Number(partner.source_row)] }))).toThrow(/two rows kept from one conflict group/)
    const clean = raw.find((r) => r.brand_slug === 'dominos' && r.qa_severity !== 'conflict') as RawRow
    expect(() => buildItems(raw, decided(file.decisions, 'dominos_duplicates', { policy: 'keep_rows', keep_rows: [Number(clean.source_row)] }))).toThrow(/not a Domino's duplicate_conflict row/)
  })

  it("a released double-listed size is one listing again: its default size applies (the losing copy is not a second 'Regular')", () => {
    const hi = buildItems(raw, decided(file.decisions, 'dominos_duplicates', { policy: 'keep_higher_kcal', keep_rows: [] }))
    const rel = hi.items.filter((i) => i.brand_key === 'dominos' && i.qa_severity === 'conflict' && i.status === 'verified')
    expect(rel).toHaveLength(34)
    // Domino's charts these pizzas twice; once a copy of each size is released, the brand's first label (new hand
    // tossed regular) matches one listing, not two, so the released Regular is the default
    for (const item of ['double cheese margherita', 'cheese tomato', 'cheese corn', 'peppy paneer']) {
      const d = hi.items.filter((i) => i.brand_key === 'dominos' && i.item_norm === item && i.is_default_size)
      expect(d.map((i) => [i.variant_norm, i.status, i.qa_severity])).toEqual([['new hand tossed regular', 'verified', 'conflict']])
    }
    expect(hi.defaults.ambiguous).toBeLessThan(base.defaults.ambiguous)
    // while the decision is pending both copies are held and still count twice: no default is guessed
    expect(base.items.some((i) => i.brand_key === 'dominos' && i.item_norm === 'double cheese margherita' && i.is_default_size)).toBe(false)
  })

  it('feb_2026 withholds every Starbucks row; IN-NE flips the McDonald\'s default region', () => {
    const sb = buildItems(raw, decided(file.decisions, 'starbucks_guide', 'feb_2026'))
    const rows = sb.items.filter((i) => i.brand_key === 'starbucks')
    expect(rows).toHaveLength(976)
    expect(rows.some((i) => i.status === 'verified')).toBe(false)
    const ne = buildItems(raw, decided(file.decisions, 'mcdonalds_default_region', 'IN-NE'))
    for (const it of ne.items.filter((i) => i.brand_key === 'mcdonalds')) expect(it.is_default_region).toBe(it.region === 'IN-NE')
  })

  it('a pure 15% Atwater rule fails more rows than the REPORT rule (15% and 15 kcal)', () => {
    const pure = buildItems(raw, decided(file.decisions, 'atwater_rule', { pct: 15, kcal_slack: 0 }))
    expect(pure.items.filter((i) => i.atwater_ok === false)).toHaveLength(78 + 30)
  })

  it('per100_no_portion keep_unserved and macros_incomplete omit_from_table', () => {
    const k = buildItems(raw, decided(file.decisions, 'per100_no_portion', 'keep_unserved'))
    expect(k.items.filter((i) => i.brand_key === 'lapinoz' && i.status === 'verified')).toHaveLength(0)
    const om = buildItems(raw, decided(file.decisions, 'macros_incomplete', 'omit_from_table'))
    expect(om.omitted).toHaveLength(139)
    expect(om.items).toHaveLength(3741 - 139)
    expect(om.items.some((i) => i.atwater_ok === null)).toBe(false)
  })
})

describe('decisions.json', () => {
  const edit = (f: (j: any) => void): string => { const j = JSON.parse(DECISIONS_TEXT); f(j); return JSON.stringify(j) }

  it('lists every decision with a proposed default; the open ones are PENDING FOUNDER with chosen null', () => {
    const f = parseDecisions(DECISIONS_TEXT)
    expect(Object.keys(f.decisions).sort()).toEqual([...DECISION_IDS].sort())
    const pending = DECISION_IDS.filter((id) => f.decisions[id].status === 'PENDING FOUNDER')
    expect(pending).toEqual(['atwater_rule', 'starbucks_guide', 'mcdonalds_default_region', 'behrouz_city', 'dominos_duplicates', 'dominos_mni_34_40',
      'default_size', 'per100_no_portion', 'macros_incomplete', 'collector_suspect', 'brand_tier_precedence', 'mcchicken_live_key'])
    for (const id of pending) expect(f.decisions[id].chosen).toBeNull()
    expect(Object.keys(f.signoffs).sort()).toEqual(Object.keys(BRAND_BY_SLUG).sort())
  })

  it('refuses malformed files', () => {
    expect(() => parseDecisions(edit((j) => { delete j.decisions.behrouz_city }))).toThrow(/must hold exactly/)
    expect(() => parseDecisions(edit((j) => { j.decisions.extra = j.decisions.amul_source }))).toThrow(/must hold exactly/)
    expect(() => parseDecisions(edit((j) => { j.decisions.starbucks_guide.status = 'DECIDED' }))).toThrow(/DECIDED needs chosen/)
    expect(() => parseDecisions(edit((j) => { j.decisions.starbucks_guide.chosen = 'feb_2026' }))).toThrow(/chosen must stay null/)
    expect(() => parseDecisions(edit((j) => { j.decisions.starbucks_guide.proposed = 'latest' }))).toThrow(/must be one of/)
    expect(() => parseDecisions(edit((j) => { j.decisions.ml_only_rows.chosen = 'assume_1g_per_ml' }))).toThrow(/must be one of per_serving_no_density/)
    expect(() => parseDecisions(edit((j) => { j.decisions.atwater_rule.proposed = { pct: 0.15, kcal_slack: 15 } }))).toThrow(/integer percent/)
    expect(() => parseDecisions(edit((j) => { j.decisions.default_size.proposed.brands.nandos = ['regular'] }))).toThrow(/unknown brand key nandos/)
    expect(() => parseDecisions(edit((j) => { j.decisions.default_size.proposed.brands.starbucks = ['Tall'] }))).toThrow(/normalized/)
    expect(() => parseDecisions(edit((j) => { j.decisions.dominos_duplicates.proposed = { policy: 'hold_both', keep_rows: [12] } }))).toThrow(/only used with policy keep_rows/)
    expect(() => parseDecisions(edit((j) => { j.signoffs.kfc_india = { by: 'x', date: '13 Nov', rows_checked: 10 } }))).toThrow(/signoffs.kfc_india/)
    expect(() => parseDecisions(edit((j) => { delete j.signoffs.kfc_india }))).toThrow(/every brand slug/)
    // sign-off text lands in SQL comment lines: a newline would turn the rest of the note into SQL
    expect(() => parseDecisions(edit((j) => { j.signoffs.kfc_india = { by: 'x', date: '2026-11-20', rows_checked: 10, note: 'ok\nDROP TABLE public.food_items;' } }))).toThrow(/single-line/)
    expect(() => parseDecisions(edit((j) => { j.signoffs.kfc_india = { by: 'x\u2028y', date: '2026-11-20', rows_checked: 10 } }))).toThrow(/single-line/)
    expect(parseDecisions(edit((j) => { j.signoffs.kfc_india = { by: 'founder', date: '2026-11-20', rows_checked: 10, note: '10/10 match p.3-p.20' } })).signoffs.kfc_india?.rows_checked).toBe(10)
    expect(() => parseDecisions(edit((j) => { j.decisions.collector_suspect.proposed = 'hold' }))).toThrow(/must be one of withhold, serve/)
    // a DECIDED entry says who decided (the header prints it, so a review rule never reads as a founder answer)
    expect(() => parseDecisions(edit((j) => { Object.assign(j.decisions.starbucks_guide, { status: 'DECIDED', chosen: 'linked_2023' }) }))).toThrow(/DECIDED needs source/)
    expect(() => parseDecisions(edit((j) => { delete j.decisions.ml_only_rows.source }))).toThrow(/DECIDED needs source/)
    expect(() => parseDecisions(edit((j) => { Object.assign(j.decisions.starbucks_guide, { status: 'DECIDED', chosen: 'linked_2023', source: 'founder\nDROP TABLE x;' }) }))).toThrow(/source must be single-line/)
    expect(parseDecisions(edit((j) => { Object.assign(j.decisions.starbucks_guide, { status: 'DECIDED', chosen: 'linked_2023', source: 'founder, 2026-11-20' }) })).decisions.starbucks_guide.chosen).toBe('linked_2023')
  })
})

describe('rendered files', () => {
  it('the committed generated files are byte-identical to a fresh run (the --check)', () => {
    const files = renderAll()
    expect(Object.keys(files).sort()).toEqual(['scripts/brands/out/manifest.json', 'scripts/brands/out/review_list.csv', 'supabase/pending/brand_items.sql', 'supabase/rollback/brand_items_down.sql'])
    for (const [rel, text] of Object.entries(files)) {
      expect(existsSync(join(REPO, rel))).toBe(true)
      expect(readFileSync(join(REPO, rel), 'utf8') === text).toBe(true)
    }
  })

  it('the migration waits in pending/, creates only brand_items, read-only, and touches no food table', () => {
    const sql = readFileSync(join(REPO, 'supabase/pending/brand_items.sql'), 'utf8')
    expect(existsSync(join(REPO, 'supabase/migrations')) && readdirSync(join(REPO, 'supabase/migrations')).some((f) => f.includes('brand_items'))).toBe(false)
    // DDL and checks only: not comment lines, row data or COMMENT ON text
    const code = sql.split('\n').filter((l) => !l.startsWith('--') && !l.startsWith("('")).join('\n').replace(/COMMENT ON [\s\S]*?';\n/g, '')
    expect(code).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP)\s+public\.(?!brand_items\b)/i)
    expect(code).not.toMatch(/food_items|food_aliases|food_item_issues|search_foods/)
    expect(code).toMatch(/ALTER TABLE public\.brand_items ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(/REVOKE ALL ON public\.brand_items FROM PUBLIC, anon, authenticated, service_role;/)
    expect(code.match(/\bGRANT\b[^;]*;/g)).toEqual(['GRANT SELECT ON public.brand_items TO authenticated, service_role;'])
    expect(code).toMatch(/FOR SELECT TO authenticated USING \(status = 'verified'\);/)
    expect(code).not.toMatch(/\bBEGIN;|\bCOMMIT;/)
    // the per-brand count check compares against a code-point-ordered string, so its ORDER BY must not follow the database collation
    expect(code).toContain('ORDER BY brand_slug COLLATE "C", status COLLATE "C"')
    expect(sql).toMatch(/^-- brand_items\.sql — GENERATED by scripts\/import-brands\.ts; inputs_sha256 [0-9a-f]{64}; do not edit\n/)
    expect(sql).toContain('-- MIGRATION NUMBER: not assigned.')
    expect(sql).toContain('--   starbucks_guide: PENDING FOUNDER; using proposed "linked_2023"\n')
    // rules fixed by the review, not by the founder, say so
    expect(sql).toContain('--   ml_only_rows: DECIDED; chosen "per_serving_no_density" (source: plan adversarial review #20;')
    expect(sql).toContain('--   mcdonalds_india_west_south   NOT SIGNED')
  })

  it('the review list holds exactly the rows that are not served', () => {
    const csv = readFileSync(join(REPO, 'scripts/brands/out/review_list.csv'), 'utf8').trim().split('\n')
    expect(csv.length - 1).toBe(339 + 141)
    const ids = new Set(csv.slice(1).map((l) => (l.match(/"([0-9a-f-]{36})"$/) as RegExpMatchArray)[1]))
    expect(ids).toEqual(new Set(base.items.filter((i) => i.status !== 'verified').map((i) => i.id)))
  })

  it('--number refuses while decisions are pending or served brands are unsigned, and numbers the files once they are not', () => {
    expect(() => renderAll({ number: '065' })).toThrow(/PENDING FOUNDER/)
    expect(() => pathsFor('65')).toThrow(/three digits/)
    const j = JSON.parse(DECISIONS_TEXT)
    for (const id of DECISION_IDS) {
      if (j.decisions[id].status === 'DECIDED') continue
      Object.assign(j.decisions[id], { status: 'DECIDED', chosen: j.decisions[id].proposed, source: 'founder, 2026-11-20 (test)' })
    }
    expect(() => renderAll({ number: '065', raw, decisions: parseDecisions(JSON.stringify(j)), sha: '0'.repeat(64) })).toThrow(/no sign-off: amul, behrouz_biryani/)
    for (const s of Object.keys(BRAND_BY_SLUG)) j.signoffs[s] = { by: 'founder', date: '2026-11-20', rows_checked: 10 }
    const files = renderAll({ number: '065', raw, decisions: parseDecisions(JSON.stringify(j)), sha: '0'.repeat(64) })
    expect(Object.keys(files)).toContain('supabase/migrations/065_brand_items.sql')
    expect(Object.keys(files)).toContain('supabase/rollback/065_brand_items_down.sql')
    expect(files['supabase/migrations/065_brand_items.sql']).toContain('-- MIGRATION NUMBER: 065, assigned at push time')
    expect(files['supabase/rollback/065_brand_items_down.sql']).toContain('supabase migration repair --status reverted 065')
    // a number another migration already holds (applied, or waiting in pending/ with its number) is refused
    const ready = parseDecisions(JSON.stringify(j))
    expect(() => renderAll({ number: '054', raw, decisions: ready, sha: '0'.repeat(64) })).toThrow(/054 is already used by supabase\/migrations\/054_portion_units\.sql/)
    expect(() => renderAll({ number: '055', raw, decisions: ready, sha: '0'.repeat(64) })).toThrow(/055 is already used by supabase\/pending\/055_usda_local_foods\.sql/)
  })

  it('no PDF or image from the collection is in the tree (numbers and attribution only)', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
    const bad = walk(join(REPO, 'scripts/data/brands')).filter((p) => /\.(pdf|png|jpe?g|webp|gif|tiff?)$/i.test(p))
    expect(bad).toEqual([])
  })
})

describe('gates and helpers (synthetic)', () => {
  const R = { pct: 15, kcal_slack: 15 }
  const it4 = (kcal: string, p: string | null, c: string | null, f: string | null) => ({ kcal, protein_g: p, carbs_g: c, fat_g: f })

  it('Atwater: 15% and 15 kcal, both must be exceeded to fail; kcal 0 fails above the slack', () => {
    expect(atwaterOk(it4('100', '0', '28.75', '0'), R)).toBe(true)        // est 115: diff exactly 15 kcal and 15%
    expect(atwaterOk(it4('100', '0', '28.751', '0'), R)).toBe(false)      // est 115.004
    expect(atwaterOk(it4('50', '0', '16.25', '0'), R)).toBe(true)         // est 65: 30% off but only 15 kcal
    expect(atwaterOk(it4('50', '0', '16.251', '0'), R)).toBe(false)
    expect(atwaterOk(it4('0', '0', '3.75', '0'), R)).toBe(true)           // est 15
    expect(atwaterOk(it4('0', '0', '3.751', '0'), R)).toBe(false)
    expect(atwaterOk(it4('4', '0', '0.6', '0.3'), { pct: 15, kcal_slack: 0 })).toBe(false)   // BK espresso under pure 15%
    expect(atwaterOk(it4('4', '0', '0.6', '0.3'), R)).toBe(true)
    expect(atwaterOk(it4('100', null, '25', '0'), R)).toBeNull()
  })

  it('sugar above carbs needs more than 2% + 0.5 g; exact decimal parsing', () => {
    expect(sugarGtCarbs({ sugar_g: '10.7', carbs_g: '10' })).toBe(false)
    expect(sugarGtCarbs({ sugar_g: '10.701', carbs_g: '10' })).toBe(true)
    expect(sugarGtCarbs({ sugar_g: null, carbs_g: '0' })).toBe(false)
    expect(milli('0.5')).toBe(500)
    expect(milli('339.52')).toBe(339520)
    expect(() => milli('1.2345')).toThrow()
    expect(() => milli('-1')).toThrow()
    expect(() => milli('<2.0')).toThrow()
  })

  it('qa codes: a detail may contain "; "; unknown leading codes are refused', () => {
    expect(qaCodes('macros_incomplete: Atwater not checkable; missing carbs_g,fat_g; no_serving_size: per-serve values')).toEqual(['macros_incomplete', 'no_serving_size'])
    expect(qaCodes('')).toEqual([])
    expect(() => qaCodes('mystery_code: x')).toThrow(/known code/)
  })

  it('size labels match whole words; sections drop the page prefix', () => {
    expect(labelMatches('personal', 'personal pan pizza')).toBe(true)
    expect(labelMatches('personal', 'personalized pizza')).toBe(false)
    expect(labelMatches('', '')).toBe(true)
    expect(labelMatches('', 'tall')).toBe(false)
    expect(sectionOf('p.14, Beverage Core > Espresso')).toBe('beverage core > espresso')
    expect(sectionOf('p 3 Hot drinks')).toBe('hot drinks')
  })

  it('kcal must rise with size within one table; small drinks and other tables are ignored', () => {
    const blank = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])) as RawRow
    const mk = (row: number, ml: string, kcal: string, page = 'p.1, Espresso', item = 'Latte'): RawRow => ({
      ...blank, brand: 'Starbucks India (Tata Starbucks)', country: 'IN', item, variant_or_size: ml, serving_desc: `${ml} ml`, serving_ml: ml,
      kcal, protein_g: '0', carbs_g: String(Number(kcal) / 4), fat_g: '0', source_url: 'https://www.starbucks.in/x.pdf', source_title: 't',
      source_date_or_version: "Created on 02-01-2023", page_or_section: page, brand_slug: 'starbucks_india', source_row: String(row),
      basis: 'per_serve', qa_severity: 'clean',
    })
    const items = buildItems([mk(2, '237', '104'), mk(3, '354', '104'), mk(4, '473', '173'), mk(5, '237', '10', 'p.1, Tea', 'Tea'), mk(6, '354', '10', 'p.1, Tea', 'Tea'),
      mk(7, '473', '90', 'p.2, Other', 'Latte')], file.decisions).items
    expect([...sizeNotMonotonic(items)].sort()).toEqual([0, 1])
    // 237 and 354 ml both at 104 kcal fail; 473 ml is fine; the 10 kcal tea is ignored; another table is not compared
    expect(items.map((i) => i.status)).toEqual(['held', 'held', 'verified', 'verified', 'verified', 'verified'])
  })
})
