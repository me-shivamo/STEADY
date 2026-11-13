// Shared by scripts/portions/emit054.ts (writes migration 054) and the jest
// tests (portionSeed.test.ts, portions.test.ts, gramHintsRetired.test.ts):
// reads the reviewed seed CSVs in scripts/portions/data/, parses 053's
// `_portion053` block, folds the live verified rows' USDA measures into fdc_id
// rows with the SAME classifyMeasure the resolver uses, and gives every row a
// stable UUIDv5 id. Pure apart from reading files; no network, no database.

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

import { classifyMeasure, measurePreference, UNITS, type RowUnit, type Size } from '../../supabase/functions/_shared/portionText'
import {
  CATEGORY_CONFIDENCE, FOOD_CONFIDENCE, GENERIC_CONFIDENCE,
  type CategoryWord, type PortionCategory, type PortionTables, type PortionUnitRow, type Region,
} from '../../supabase/functions/_shared/portions'

export const REPO = join(__dirname, '..', '..')
export const DATA = join(REPO, 'scripts', 'portions', 'data')
export const MIGRATION_053 = join(REPO, 'supabase', 'migrations', '053_recalc_indian_v1.sql')
export const INPUT_FILES = [
  'scripts/portions/data/categories.csv',
  'scripts/portions/data/category_words.csv',
  'scripts/portions/data/category_map.csv',
  'scripts/portions/data/portion_units_seed.csv',
  'scripts/portions/data/verified_portions_snapshot.csv',
  'scripts/portions/data/fold_in_review.csv',
  'supabase/migrations/053_recalc_indian_v1.sql',
  'supabase/functions/_shared/portionText.ts',
  'scripts/portions/lib.ts',
  'scripts/portions/emit054.ts',
] as const

// ── CSV (RFC 4180: quotes, doubled quotes, commas and newlines inside quotes) ──
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''))
  return body.map((r) => {
    if (r.length !== head.length) throw new Error(`CSV row has ${r.length} fields, header ${head.length}: ${r.join(',')}`)
    return Object.fromEntries(head.map((h, i) => [h, r[i]]))
  })
}
const readCsv = (name: string) => parseCsv(readFileSync(join(DATA, name), 'utf8'))

// ── UUIDv5 (RFC 4122 §4.3, SHA-1) ──────────────────────────────────────────────
function uuidBytes(u: string): Buffer { return Buffer.from(u.replace(/-/g, ''), 'hex') }
export function uuid5(namespace: string, name: string): string {
  const h = createHash('sha1').update(Buffer.concat([uuidBytes(namespace), Buffer.from(name, 'utf8')])).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
export const NS_PORTION_UNITS = uuid5(NAMESPACE_URL, 'https://steady.chat/ns/portion_units/v1')

// ── 053's founder portions ─────────────────────────────────────────────────────
export interface Portion053 { food_item_id: string; after: Array<{ description: string; gramWeight: number }>; approved_by: string }
export function parsePortion053(sql = readFileSync(MIGRATION_053, 'utf8')): Portion053[] {
  const start = sql.indexOf('INSERT INTO _portion053 VALUES')
  if (start < 0) throw new Error('053: no _portion053 block')
  const block = sql.slice(start, sql.indexOf(';\n', start))
  const re = /\('([0-9a-f-]{36})'::uuid, (?:NULL|'[0-9a-f-]{36}'::uuid), (?:NULL|'[^']*'::jsonb), '([^']*)'::jsonb, '([^']*)'\)/g
  const out: Portion053[] = []
  for (let m = re.exec(block); m; m = re.exec(block)) out.push({ food_item_id: m[1], after: JSON.parse(m[2]), approved_by: m[3] })
  if (out.length === 0) throw new Error('053: _portion053 parsed to nothing')
  return out
}
// How a founder portion text names its units: "1 bowl (1 cup)" is both a bowl and a cup.
export const FOUNDER_DESCRIPTION_UNITS: Readonly<Record<string, RowUnit[]>> = {
  '1 katori': ['katori'], '1 bowl (1 cup)': ['bowl', 'cup'], '1 cup': ['cup'], '1 plate': ['plate'],
  '1 cutting': ['cutting'], '1 mug': ['mug'], '1 piece': ['piece'],
}

// ── Rows ──────────────────────────────────────────────────────────────────────
export interface SeedRow extends PortionUnitRow {
  scope: 'generic' | 'category' | 'food' | 'fdc'
  approved_by: string | null
  source_text: string | null
  evidence: string
}

export function confidenceFor(scope: SeedRow['scope'], grade: string): number {
  const t = scope === 'generic' ? GENERIC_CONFIDENCE : scope === 'category' ? CATEGORY_CONFIDENCE : FOOD_CONFIDENCE
  const c = t[grade]
  if (c === undefined) throw new Error(`no confidence for ${scope}/${grade}`)
  return c
}

const num = (s: string): number | null => (s === '' ? null : Number(s))
const bool = (s: string): boolean => {
  if (s !== 'true' && s !== 'false') throw new Error(`not a boolean: ${s}`)
  return s === 'true'
}

export function naturalKey(r: Pick<SeedRow, 'scope' | 'food_item_id' | 'fdc_id' | 'category' | 'unit' | 'size' | 'context' | 'region' | 'status' | 'source_ref'>): string {
  const key = r.scope === 'food' ? r.food_item_id : r.scope === 'fdc' ? String(r.fdc_id) : r.category
  return [r.scope, key, r.unit, r.size, r.context ?? '', r.region ?? '', r.status === 'active' ? '' : `${r.status}:${r.source_ref}`].join('|')
}

function finishRow(r: Omit<SeedRow, 'id' | 'confidence'>): SeedRow {
  const row = { ...r, id: '', confidence: confidenceFor(r.scope, r.grade) } as SeedRow
  row.id = uuid5(NS_PORTION_UNITS, naturalKey(row))
  return row
}

export function loadSeedRows(): SeedRow[] {
  return readCsv('portion_units_seed.csv').map((c) => {
    const scope = c.scope as SeedRow['scope']
    if (!['generic', 'category', 'food'].includes(scope)) throw new Error(`seed scope ${scope}`)
    return finishRow({
      scope,
      food_item_id: scope === 'food' ? c.key : null,
      fdc_id: null,
      category: scope === 'food' ? null : c.key,
      unit: c.unit as RowUnit,
      size: c.size as Size,
      grams: num(c.grams),
      ml: num(c.ml),
      context: (c.context || null) as SeedRow['context'],
      region: (c.region || null) as Region | null,
      is_default: bool(c.is_default),
      is_unit_default: bool(c.is_unit_default),
      source: c.source,
      grade: c.grade,
      status: c.status as SeedRow['status'],
      approved_by: c.approved_by || null,
      source_ref: c.source_ref,
      source_text: c.source_text || null,
      evidence: c.evidence,
    })
  })
}

export interface FoldInReport { entries: number; classified: number; rows: number; dropped_review: number; dropped_unclassified: string[]; dropped_duplicate: number }

// The live verified rows' food_items.portions (snapshot) → fdc_id rows (grade U).
// One row per (fdc_id, unit, size): a text naming its size ("1 medium") beats
// one that does not ("1 stick"), a plain text beats a "chopped/diced" one, then
// the snapshot order (fdc_id, name, position) decides.
export function foldInRows(): { rows: SeedRow[]; used: Array<{ fdc_id: number; description: string; grams: number }>; report: FoldInReport } {
  const snap = readCsv('verified_portions_snapshot.csv')
  const review = readCsv('fold_in_review.csv')
  const drop = (fdc: string, desc: string) =>
    review.some((r) => r.action === 'drop' && r.fdc_id === fdc && (r.description === '*' || r.description === desc))
  const report: FoldInReport = { entries: snap.length, classified: 0, rows: 0, dropped_review: 0, dropped_unclassified: [], dropped_duplicate: 0 }
  const chosen = new Map<string, { row: SeedRow; rank: number; src: { fdc_id: number; description: string; grams: number } }>()
  for (const e of snap) {
    if (drop(e.fdc_id, e.description)) { report.dropped_review++; continue }
    const c = classifyMeasure(e.description, Number(e.gram_weight))
    if (!c) { report.dropped_unclassified.push(`${e.fdc_id} ${e.description}`); continue }
    report.classified++
    const fdc = Number(e.fdc_id)
    const key = `${fdc}|${c.unit}|${c.size}`
    const prev = chosen.get(key)
    const rank = measurePreference(c)
    if (prev && prev.rank >= rank) { report.dropped_duplicate++; continue }
    if (prev) report.dropped_duplicate++
    const row = finishRow({
      scope: 'fdc', food_item_id: null, fdc_id: fdc, category: null, unit: c.unit, size: c.size,
      grams: c.grams, ml: c.ml, context: null, region: null, is_default: c.isDefault, is_unit_default: false,
      source: 'food_items_portions', grade: 'U', status: 'active', approved_by: null,
      source_ref: `food_items_portions:${e.food_item_id}#${e.position}`, source_text: e.description,
      evidence: 'live verified row portions (migration 023), snapshot 2026-11-13; fdc-keyed in 054',
    })
    chosen.set(key, { row, rank, src: { fdc_id: fdc, description: e.description, grams: Number(e.gram_weight) } })
  }
  const rows = [...chosen.values()].map((v) => v.row)
  report.rows = rows.length
  return { rows, used: [...chosen.values()].map((v) => v.src), report }
}

export function loadCategories(): Array<PortionCategory & { kcal100_min: number | null; kcal100_max: number | null; note: string }> {
  return readCsv('categories.csv').map((c) => ({
    category: c.category,
    parent: c.parent || null,
    density_g_per_ml: num(c.density_g_per_ml),
    s_ratio: Number(c.s_ratio),
    l_ratio: Number(c.l_ratio),
    serving_unit: c.serving_unit || null,
    inherit_vessels: bool(c.inherit_vessels),
    kcal100_min: num(c.kcal100_min),
    kcal100_max: num(c.kcal100_max),
    note: c.note,
  }))
}
// fdc_ids whose every measure the founder review dropped (description '*'): no USDA measure for them anywhere, 056
// included (FDC 170959, the baby-food apple row 057 retires; fixer 2026-11-13)
export function reviewDroppedFdcIds(): Set<number> {
  return new Set(readCsv('fold_in_review.csv').filter((r) => r.action === 'drop' && r.description === '*').map((r) => Number(r.fdc_id)))
}
export function loadWords(): CategoryWord[] {
  return readCsv('category_words.csv').map((w) => {
    if (w.head_only !== 'true' && w.head_only !== 'false') throw new Error(`category_words.csv ${w.word}: head_only must be true or false`)
    return { word: w.word, category: w.category, priority: Number(w.priority), head_only: w.head_only === 'true' }
  })
}
export function loadCategoryMap(): Array<{ food_item_id: string; category: string; note: string }> {
  return readCsv('category_map.csv').map((m) => ({ food_item_id: m.food_item_id, category: m.category, note: m.note }))
}

// Everything 054 inserts, validated. Throws on any inconsistency (the emitter
// then writes nothing).
export interface Seed054 {
  categories: ReturnType<typeof loadCategories>
  words: CategoryWord[]
  map: ReturnType<typeof loadCategoryMap>
  rows: SeedRow[]                    // seed + fold-in, sorted by id
  foldIn: ReturnType<typeof foldInRows>
  portion053: Portion053[]
}

export function buildSeed(): Seed054 {
  const categories = loadCategories()
  const words = loadWords()
  const map = loadCategoryMap()
  const seed = loadSeedRows()
  const foldIn = foldInRows()
  const portion053 = parsePortion053()
  const rows = [...seed, ...foldIn.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  validateSeed({ categories, words, map, rows, foldIn, portion053 })
  return { categories, words, map, rows, foldIn, portion053 }
}

export function validateSeed(s: Seed054): void {
  const errs: string[] = []
  const cats = new Map(s.categories.map((c) => [c.category, c]))
  const unitList = new Set<string>([...UNITS, 'ml'])
  // categories: one root, every chain reaches generic
  for (const c of s.categories) {
    if (!/^[a-z][a-z_]*$/.test(c.category)) errs.push(`category name ${c.category}`)
    if ((c.parent === null) !== (c.category === 'generic')) errs.push(`category ${c.category}: only generic has no parent`)
    if (c.parent && !cats.has(c.parent)) errs.push(`category ${c.category}: parent ${c.parent} missing`)
    const seen = new Set<string>()
    let p: string | null = c.category
    while (p && !seen.has(p)) { seen.add(p); p = cats.get(p)?.parent ?? null }
    if (p) errs.push(`category ${c.category}: cycle`)
    if (!seen.has('generic')) errs.push(`category ${c.category}: does not reach generic`)
    if (c.serving_unit && !UNITS.includes(c.serving_unit as never)) errs.push(`category ${c.category}: serving_unit ${c.serving_unit}`)
  }
  const wordSet = new Set<string>()
  for (const w of s.words) {
    if (!cats.has(w.category)) errs.push(`word ${w.word}: category ${w.category} missing`)
    if (wordSet.has(w.word)) errs.push(`word ${w.word} twice`)
    wordSet.add(w.word)
    if (w.word !== w.word.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()) errs.push(`word ${w.word} not normalized`)
  }
  for (const m of s.map) if (!cats.has(m.category)) errs.push(`map ${m.food_item_id}: category ${m.category} missing`)
  // rows
  const ids = new Set<string>()
  const active = new Set<string>()
  const defaults = new Set<string>()
  const unitDefaults = new Set<string>()
  for (const r of s.rows) {
    if (ids.has(r.id)) errs.push(`duplicate id ${r.id} (${naturalKey(r)})`)
    ids.add(r.id)
    if (!unitList.has(r.unit)) errs.push(`row ${naturalKey(r)}: unit`)
    if (r.category && !cats.has(r.category)) errs.push(`row ${naturalKey(r)}: category missing`)
    if (r.grams === null && r.ml === null) errs.push(`row ${naturalKey(r)}: no grams or ml`)
    if (r.unit === 'ml' && (r.grams === null || r.ml === null)) errs.push(`row ${naturalKey(r)}: ml row needs both`)
    for (const v of [r.grams, r.ml]) if (v !== null && !(v > 0 && v <= 10000)) errs.push(`row ${naturalKey(r)}: value ${v}`)
    if (!r.source_ref) errs.push(`row ${naturalKey(r)}: no source_ref`)
    if (r.status === 'active' && !r.approved_by && !['food_items_portions', 'usda_foundation', 'usda_sr', 'usda_fndds'].includes(r.source)) {
      errs.push(`row ${naturalKey(r)}: active without approved_by`)
    }
    if (r.status !== 'active') continue
    const scopeKey = `${r.scope}|${r.food_item_id ?? r.fdc_id ?? r.category}`
    const k = `${scopeKey}|${r.unit}|${r.size}|${r.context ?? ''}|${r.region ?? ''}`
    if (active.has(k)) errs.push(`two active rows for ${k}`)
    active.add(k)
    if (r.is_default) {
      const d = `${scopeKey}|${r.region ?? ''}|${r.context ?? ''}`
      if (defaults.has(d)) errs.push(`two is_default rows for ${d}`)
      defaults.add(d)
    }
    if (r.is_unit_default) {
      const d = `${scopeKey}|${r.unit}|${r.region ?? ''}|${r.context ?? ''}`
      if (unitDefaults.has(d)) errs.push(`two is_unit_default rows for ${d}`)
      unitDefaults.add(d)
    }
    if (r.scope === 'generic' && ['piece', 'slice', 'packet', 'can', 'bottle'].includes(r.unit)) errs.push(`generic ${r.unit} row`)
  }
  // every serving_unit has an active row in its chain
  for (const c of s.categories) {
    if (!c.serving_unit) continue
    let p: string | null = c.category
    let ok = false
    while (p && !ok) {
      ok = s.rows.some((r) => r.status === 'active' && r.category === p && r.unit === c.serving_unit)
      p = cats.get(p)?.parent ?? null
    }
    if (!ok) errs.push(`category ${c.category}: serving_unit ${c.serving_unit} has no active row in its chain`)
  }
  // founder rows = 053's _portion053, exactly
  const expected = new Set<string>()
  for (const p of s.portion053) {
    for (const e of p.after) {
      const units = FOUNDER_DESCRIPTION_UNITS[e.description]
      if (!units) { errs.push(`053 portion text not mapped: ${e.description}`); continue }
      for (const u of units) expected.add(`${p.food_item_id}|${u}|${e.gramWeight}|${e.description}|${p.approved_by}`)
    }
  }
  const got = new Set(s.rows.filter((r) => r.source === 'founder').map((r) =>
    `${r.food_item_id}|${r.unit}|${r.grams}|${r.source_text}|${r.approved_by}`))
  for (const e of expected) if (!got.has(e)) errs.push(`founder row missing vs 053: ${e}`)
  for (const g of got) if (!expected.has(g)) errs.push(`founder row not in 053: ${g}`)
  if (errs.length) throw new Error(`054 seed invalid:\n  ${errs.join('\n  ')}`)
}

// The engine's view of the seed (tests use it; production reads the tables).
export function engineTables(seed: Seed054, opts: { includeFoodRows?: boolean } = {}): { tables: PortionTables; foodRows: PortionUnitRow[] } {
  const strip = (r: SeedRow): PortionUnitRow => ({
    id: r.id, food_item_id: r.food_item_id, fdc_id: r.fdc_id, category: r.category, unit: r.unit, size: r.size,
    grams: r.grams, ml: r.ml, context: r.context, region: r.region, is_default: r.is_default, is_unit_default: r.is_unit_default,
    source: r.source, grade: r.grade, confidence: r.confidence, source_ref: r.source_ref, status: r.status,
  })
  return {
    tables: {
      categories: new Map(seed.categories.map((c) => [c.category, {
        category: c.category, parent: c.parent, density_g_per_ml: c.density_g_per_ml, s_ratio: c.s_ratio,
        l_ratio: c.l_ratio, serving_unit: c.serving_unit, inherit_vessels: c.inherit_vessels,
      }])),
      words: seed.words,
      categoryMap: new Map(seed.map.map((m) => [m.food_item_id, m.category])),
      categoryRows: seed.rows.filter((r) => r.category !== null).map(strip),
    },
    foodRows: opts.includeFoodRows === false ? [] : seed.rows.filter((r) => r.category === null).map(strip),
  }
}
