// The USDA FoodData Central local import (v1.2 Phase 7): reads the three pinned bulk files from the
// gitignored cache, picks the 12,290-food subset, chooses each food's energy and macros, validates
// them with the shared rules (validate.ts), dedupes against the live verified base and across
// datasets, and builds the rows migrations 055 (foods) and 056 (portions) insert.
//
// Pure apart from reading files: no network (scripts/import-usda.ts `fetch` downloads), no database,
// no clock. Same inputs → same rows in the same order (ids are UUIDv5 of stable USDA codes).
// Spec: .claude/plans/v1.2-phase5-7-spec.md (a) 8, (b), (f), (j) 11/14/15, (k).

import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { inflateRawSync } from 'zlib'

import { classifyMeasure, measurePreference, normText, type ClassifiedMeasure, type RowUnit, type Size } from '../../supabase/functions/_shared/portionText'
import { FOOD_CONFIDENCE } from '../../supabase/functions/_shared/portions'
import { foodItemIssues, type IssueCode } from '../../supabase/functions/_shared/validate'
import { foldInRows, naturalKey, NS_PORTION_UNITS, parseCsv, REPO, reviewDroppedFdcIds, uuid5 } from '../portions/lib'

export { REPO }
export const USDA_DIR = join(REPO, 'scripts', 'usda')
export const USDA_DATA = join(USDA_DIR, 'data')
export const CACHE = join(REPO, '.cache', 'usda')

export type Dataset = 'foundation' | 'sr' | 'fndds'
export const DATASETS: readonly Dataset[] = ['foundation', 'sr', 'fndds']
/** Precedence when one description is in several datasets (spec (f) dedupe 2); also search_usda_local's tie-break. */
export const DATASET_RANK: Readonly<Record<Dataset, number>> = { foundation: 1, sr: 2, fndds: 3 }
export const PORTION_SOURCE: Readonly<Record<Dataset, string>> = { foundation: 'usda_foundation', sr: 'usda_sr', fndds: 'usda_fndds' }
export const DATASET_LABEL: Readonly<Record<Dataset, string>> = { foundation: 'Foundation', sr: 'SR Legacy', fndds: 'FNDDS' }

// ── Pinned sources ─────────────────────────────────────────────────────────────
export interface SourcePin { dataset: Dataset; release: string; format: 'json' | 'csv'; url: string; file: string; bytes: number; sha256: string }
export function loadPins(): Record<Dataset, SourcePin> {
  const j = JSON.parse(readFileSync(join(USDA_DIR, 'sources.json'), 'utf8'))
  const out = {} as Record<Dataset, SourcePin>
  for (const d of DATASETS) {
    const p = j[d]
    if (!p || p.dataset !== d || !/^[0-9a-f]{64}$/.test(p.sha256) || !p.url.startsWith('https://fdc.nal.usda.gov/')) {
      throw new Error(`sources.json: bad pin for ${d}`)
    }
    out[d] = p
  }
  return out
}
export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

/** The cached zip for a pin, re-hashed on every read. Throws (never guesses) when it is missing or differs. */
export function readPinnedZip(pin: SourcePin, cacheDir = CACHE): Buffer {
  const path = join(cacheDir, pin.file)
  if (!existsSync(path)) throw new Error(`${pin.file} is not in ${cacheDir}: run \`npx tsx scripts/import-usda.ts fetch\``)
  const buf = readFileSync(path)
  const h = sha256(buf)
  if (buf.length !== pin.bytes || h !== pin.sha256) {
    throw new Error(`${pin.file}: sha256 ${h} (${buf.length} bytes) differs from the pin ${pin.sha256} (${pin.bytes} bytes); refusing it`)
  }
  return buf
}

// ── A minimal zip reader (store + deflate, no zip64): enough for FDC's bulk zips ──
export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip: no end-of-central-directory record')
  const entries = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory entry')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const usize = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nlen)
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip: bad local header for ${name}`)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + csize)
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null
    if (!data) throw new Error(`zip: ${name} uses compression method ${method}`)
    if (data.length !== usize) throw new Error(`zip: ${name} inflated to ${data.length} bytes, expected ${usize}`)
    const base = name.slice(name.lastIndexOf('/') + 1)
    if (out.has(base)) throw new Error(`zip: two entries named ${base}`)
    out.set(base, data)
  }
  return out
}

// ── CSV: a streaming row reader (RFC 4180 quotes) for the large FDC tables ─────
export function forEachCsvRow(text: string, onRow: (get: (col: string) => string) => void): void {
  let i = 0
  const n = text.length
  const readRow = (): string[] | null => {
    if (i >= n) return null
    const row: string[] = []
    let field = ''
    let q = false
    while (i < n) {
      const ch = text.charCodeAt(i)
      if (q) {
        if (ch === 34) {
          if (text.charCodeAt(i + 1) === 34) { field += '"'; i += 2; continue }
          q = false; i++; continue
        }
        field += text[i]; i++; continue
      }
      if (ch === 34) { q = true; i++; continue }
      if (ch === 44) { row.push(field); field = ''; i++; continue }
      if (ch === 10 || ch === 13) {
        if (ch === 13 && text.charCodeAt(i + 1) === 10) i++
        i++
        row.push(field)
        return row
      }
      // fast path: copy a run of plain characters at once
      let j = i + 1
      while (j < n) { const c = text.charCodeAt(j); if (c === 34 || c === 44 || c === 10 || c === 13) break; j++ }
      field += text.slice(i, j); i = j
    }
    row.push(field)
    return row
  }
  const head = readRow()
  if (!head) return
  const idx = new Map(head.map((h, k) => [h.replace(/^﻿/, ''), k]))
  for (let row = readRow(); row; row = readRow()) {
    if (row.length === 1 && row[0] === '') continue
    if (row.length !== head.length) throw new Error(`CSV row has ${row.length} fields, header ${head.length}`)
    const r = row
    onRow((col) => {
      const k = idx.get(col)
      if (k === undefined) throw new Error(`CSV has no column ${col}`)
      return r[k]
    })
  }
}

// ── The bulk files → one food model ────────────────────────────────────────────
export interface Measure { text: string; grams: number; ref: string; order: number }
export interface Nutrients {
  energy: number | null; energyId: number | null
  protein: number | null; fat: number | null; carbs: number | null
  fiber: number | null; fiberId: number | null
}
export interface UsdaFood {
  dataset: Dataset
  fdcId: number
  code: string                 // NDB number (Foundation, SR) or FNDDS food code: stable across FDC releases
  description: string
  categoryCode: string | null  // SR / Foundation food group, FNDDS WWEIA category number
  category: string | null
  nutrients: Nutrients
  measures: Measure[]
}
export interface Bulk { foundation: UsdaFood[]; sr: UsdaFood[]; fndds: UsdaFood[]; srNdb: Map<string, number> }

const num = (s: unknown): number | null => {
  if (s === null || s === undefined || s === '') return null
  const x = typeof s === 'number' ? s : Number(s)
  return Number.isFinite(x) ? x : null
}
/** "2" → "2", "0.5" → "0.5", 1 → "1" (USDA's leading amount, printed the way the prototype printed it). */
const amountText = (x: number | null): string => (x === null ? '' : String(Number(x)))
const firstOf = (m: Map<number, number>, ids: number[]): [number | null, number | null] => {
  for (const id of ids) if (m.has(id)) return [m.get(id)!, id]
  return [null, null]
}

export function loadFoundation(zip: Map<string, Buffer>): UsdaFood[] {
  const name = [...zip.keys()].find((k) => k.endsWith('.json'))
  if (!name) throw new Error('foundation zip: no .json entry')
  const j = JSON.parse(zip.get(name)!.toString('utf8'))
  const foods: UsdaFood[] = []
  for (const x of j.FoundationFoods ?? []) {
    const m = new Map<number, number>()
    for (const fn of x.foodNutrients ?? []) {
      const id = fn?.nutrient?.id
      const a = num(fn?.amount)
      if (typeof id === 'number' && a !== null && !m.has(id)) m.set(id, a)
    }
    // spec (f): energy 2048 (Atwater specific) → 1008 → 2047 (Atwater general)
    const [energy, energyId] = firstOf(m, [2048, 1008, 2047])
    const [fiber, fiberId] = firstOf(m, [1079, 2033])
    const measures: Measure[] = []
    for (const p of x.foodPortions ?? []) {
      const unitName = String(p?.measureUnit?.name ?? '')
      const amount = num(p?.amount ?? p?.value)
      const text = [amountText(amount ?? 1), unitName && unitName !== 'undetermined' ? unitName : '', String(p?.modifier ?? '')]
        .map((s) => s.trim()).filter((s) => s !== '').join(' ')
      measures.push({ text, grams: num(p?.gramWeight) ?? 0, ref: `foundation:${x.fdcId}:${p?.id}`, order: num(p?.sequenceNumber) ?? 0 })
    }
    measures.sort((a, b) => a.order - b.order || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
    measures.forEach((mm, k) => { mm.order = k })
    foods.push({
      dataset: 'foundation', fdcId: Number(x.fdcId), code: String(x.ndbNumber ?? `fdc${x.fdcId}`), description: String(x.description),
      categoryCode: x.foodCategory?.code ?? null, category: x.foodCategory?.description ?? null,
      nutrients: {
        energy, energyId, protein: m.get(1003) ?? null, fat: m.get(1004) ?? m.get(1085) ?? null,
        carbs: m.get(1005) ?? m.get(1050) ?? null, fiber, fiberId,
      },
      measures,
    })
  }
  return foods.sort((a, b) => a.fdcId - b.fdcId)
}

function csvTables(zip: Map<string, Buffer>, names: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of names) {
    const b = zip.get(n)
    if (!b) throw new Error(`zip has no ${n}`)
    out[n] = b.toString('utf8')
  }
  return out
}

export function loadSr(zip: Map<string, Buffer>): { foods: UsdaFood[]; ndb: Map<string, number> } {
  const t = csvTables(zip, ['food.csv', 'food_category.csv', 'sr_legacy_food.csv', 'food_nutrient.csv', 'food_portion.csv'])
  const cats = new Map<string, string>()
  for (const r of parseCsv(t['food_category.csv'])) cats.set(r.id, r.description)
  const ndb = new Map<string, number>()
  const ndbOf = new Map<number, string>()
  for (const r of parseCsv(t['sr_legacy_food.csv'])) { ndb.set(r.NDB_number, Number(r.fdc_id)); ndbOf.set(Number(r.fdc_id), r.NDB_number) }
  const byId = new Map<number, UsdaFood>()
  forEachCsvRow(t['food.csv'], (g) => {
    const id = Number(g('fdc_id'))
    byId.set(id, {
      dataset: 'sr', fdcId: id, code: ndbOf.get(id) ?? `fdc${id}`, description: g('description'),
      categoryCode: g('food_category_id') || null, category: cats.get(g('food_category_id')) ?? null,
      nutrients: { energy: null, energyId: null, protein: null, fat: null, carbs: null, fiber: null, fiberId: null },
      measures: [],
    })
  })
  const want: Record<string, keyof Nutrients> = { '1008': 'energy', '1003': 'protein', '1004': 'fat', '1005': 'carbs', '1079': 'fiber' }
  forEachCsvRow(t['food_nutrient.csv'], (g) => {
    const k = want[g('nutrient_id')]
    if (!k) return
    const f = byId.get(Number(g('fdc_id')))
    if (!f) return
    const a = num(g('amount'))
    if (a === null || f.nutrients[k] !== null) return
    ;(f.nutrients as unknown as Record<string, number>)[k] = a
    if (k === 'energy') f.nutrients.energyId = 1008
    if (k === 'fiber') f.nutrients.fiberId = 1079
  })
  forEachCsvRow(t['food_portion.csv'], (g) => {
    const f = byId.get(Number(g('fdc_id')))
    if (!f) return
    const text = [amountText(num(g('amount'))), g('portion_description'), g('modifier')].map((s) => s.trim()).filter((s) => s !== '').join(' ')
    f.measures.push({ text, grams: num(g('gram_weight')) ?? 0, ref: `sr:${f.fdcId}:${g('id')}`, order: num(g('seq_num')) ?? 0 })
  })
  const foods = [...byId.values()].sort((a, b) => a.fdcId - b.fdcId)
  for (const f of foods) {
    f.measures.sort((a, b) => a.order - b.order || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
    f.measures.forEach((m, k) => { m.order = k })
  }
  return { foods, ndb }
}

export function loadFndds(zip: Map<string, Buffer>): UsdaFood[] {
  const t = csvTables(zip, ['food.csv', 'wweia_food_category.csv', 'survey_fndds_food.csv', 'food_nutrient.csv', 'food_portion.csv'])
  const cats = new Map<string, string>()
  for (const r of parseCsv(t['wweia_food_category.csv'])) cats.set(r.wweia_food_category, r.wweia_food_category_description)
  const code = new Map<number, string>()
  for (const r of parseCsv(t['survey_fndds_food.csv'])) code.set(Number(r.fdc_id), r.food_code)
  const byId = new Map<number, UsdaFood>()
  forEachCsvRow(t['food.csv'], (g) => {
    const id = Number(g('fdc_id'))
    byId.set(id, {
      dataset: 'fndds', fdcId: id, code: code.get(id) ?? `fdc${id}`, description: g('description'),
      categoryCode: g('food_category_id') || null, category: cats.get(g('food_category_id')) ?? null,
      nutrients: { energy: null, energyId: null, protein: null, fat: null, carbs: null, fiber: null, fiberId: null },
      measures: [],
    })
  })
  // FNDDS keys nutrients by the OLD nutrient numbers: 208 energy, 203 protein, 204 fat, 205 carbs, 291 fibre.
  const want: Record<string, keyof Nutrients> = { '208': 'energy', '203': 'protein', '204': 'fat', '205': 'carbs', '291': 'fiber' }
  forEachCsvRow(t['food_nutrient.csv'], (g) => {
    const k = want[g('nutrient_id')]
    if (!k) return
    const f = byId.get(Number(g('fdc_id')))
    if (!f) return
    const a = num(g('amount'))
    if (a === null || f.nutrients[k] !== null) return
    ;(f.nutrients as unknown as Record<string, number>)[k] = a
    if (k === 'energy') f.nutrients.energyId = 208
    if (k === 'fiber') f.nutrients.fiberId = 291
  })
  forEachCsvRow(t['food_portion.csv'], (g) => {
    const f = byId.get(Number(g('fdc_id')))
    if (!f) return
    f.measures.push({ text: g('portion_description').trim(), grams: num(g('gram_weight')) ?? 0, ref: `fndds:${f.fdcId}:${g('modifier')}`, order: num(g('seq_num')) ?? 0 })
  })
  const foods = [...byId.values()].sort((a, b) => a.fdcId - b.fdcId)
  for (const f of foods) {
    f.measures.sort((a, b) => a.order - b.order || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
    f.measures.forEach((m, k) => { m.order = k })
  }
  return foods
}

export function loadBulk(cacheDir = CACHE): Bulk {
  const pins = loadPins()
  const foundation = loadFoundation(unzip(readPinnedZip(pins.foundation, cacheDir)))
  const sr = loadSr(unzip(readPinnedZip(pins.sr, cacheDir)))
  const fndds = loadFndds(unzip(readPinnedZip(pins.fndds, cacheDir)))
  return { foundation, sr: sr.foods, fndds, srNdb: sr.ndb }
}

// ── Subset (spec (f): 12,290 foods = Foundation 374, SR 6,636, FNDDS 5,280) ─────
// The SR brand rule: a description that starts with an all-caps brand and a comma ("KELLOGG'S, …").
export const SR_BRAND_RE = /^[A-Z0-9][A-Z0-9 .'&-]{2,},/
const SR_EXCLUDED_GROUPS: Readonly<Record<string, string>> = {
  'Baby Foods': 'baby food',
  'American Indian/Alaska Native Foods': 'American Indian / Alaska Native food',
}
const SR_CHAIN_GROUPS = new Set(['Fast Foods', 'Restaurant Foods'])
export const FNDDS_EXCLUDED_RE = /baby|formula|human milk/i

export interface Excluded { food: UsdaFood; reason: string }
export interface Subset { kept: UsdaFood[]; excluded: Excluded[] }

export function selectSubset(b: Bulk): Subset {
  const kept: UsdaFood[] = []
  const excluded: Excluded[] = []
  const foundationWithEnergy = b.foundation.filter((f) => f.nutrients.energy !== null)
  for (const f of b.foundation) {
    if (f.nutrients.energy === null) excluded.push({ food: f, reason: 'Foundation food with no energy value' })
    else kept.push(f)
  }
  // An SR food whose NDB number a Foundation food (with energy) now carries is that food's older analysis.
  const superseded = new Set<number>()
  for (const f of foundationWithEnergy) { const sr = b.srNdb.get(f.code); if (sr !== undefined) superseded.add(sr) }
  for (const f of b.sr) {
    const group = SR_EXCLUDED_GROUPS[f.category ?? '']
    if (group) excluded.push({ food: f, reason: group })
    else if (SR_BRAND_RE.test(f.description) || SR_CHAIN_GROUPS.has(f.category ?? '')) excluded.push({ food: f, reason: 'fast food, restaurant or brand row' })
    else if (superseded.has(f.fdcId)) excluded.push({ food: f, reason: 'SR row replaced by a Foundation food with the same NDB number' })
    else kept.push(f)
  }
  for (const f of b.fndds) {
    if (FNDDS_EXCLUDED_RE.test(f.category ?? '')) excluded.push({ food: f, reason: 'baby food, infant formula or human milk' })
    else if (f.nutrients.energy === null) excluded.push({ food: f, reason: 'FNDDS food with no energy value' })
    else kept.push(f)
  }
  return { kept, excluded }
}

// ── Per-100 g values (spec (f) "Energy") ──────────────────────────────────────────
export interface Per100 { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
export interface Values { per100: Per100 | null; flags: string[]; missing: string[] }

export function valuesOf(f: UsdaFood): Values {
  const n = f.nutrients
  const flags: string[] = []
  const missing = (['energy', 'protein', 'fat', 'carbs'] as const).filter((k) => n[k] === null)
  if (missing.length) return { per100: null, flags, missing }
  let carbs = n.carbs!
  if (carbs < 0) { carbs = 0; flags.push('clamp:carbs') }              // Foundation carbs by difference can go negative
  let fiber = n.fiber
  if (fiber === null) { fiber = 0; flags.push('fibre:missing') }       // stored as 0, flagged
  else if (n.fiberId === 2033) flags.push('fibre:2033')                // Foundation: AOAC 2011.25 total fibre when 1079 is absent
  return { per100: { calories: n.energy!, protein_g: n.protein!, carbs_g: carbs, fat_g: n.fat!, fiber_g: fiber }, flags, missing }
}

// ── Ids ────────────────────────────────────────────────────────────────────────
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
export const NS_STEADY_USDA = uuid5(NAMESPACE_URL, 'https://steady.chat/ns/usda_import/v1')
export const foodId = (f: Pick<UsdaFood, 'dataset' | 'code'>): string => uuid5(NS_STEADY_USDA, `${f.dataset}:${f.code}`)
export const externalId = (f: Pick<UsdaFood, 'dataset' | 'code'>): string => (f.dataset === 'fndds' ? `fndds:${f.code}` : `ndb:${f.code}`)

// ── Snapshots and reviewed inputs (committed) ──────────────────────────────────
export interface VerifiedFdcRow { fdc_id: number; food_item_id: string; source: string; normalized_name: string; has_portions: boolean }
export function loadVerifiedSnapshot(): VerifiedFdcRow[] {
  return parseCsv(readFileSync(join(USDA_DATA, 'verified_fdc_snapshot.csv'), 'utf8')).map((r) => ({
    fdc_id: Number(r.fdc_id), food_item_id: r.food_item_id, source: r.source, normalized_name: r.normalized_name,
    has_portions: r.has_portions === 'true',
  }))
}
export function loadLiveKeys(): { keys: Set<string>; aliases: Set<string> } {
  const rows = parseCsv(readFileSync(join(USDA_DATA, 'live_keys_snapshot.csv'), 'utf8'))
  return { keys: new Set(rows.filter((r) => r.kind === 'key').map((r) => r.phrase)), aliases: new Set(rows.filter((r) => r.kind === 'alias').map((r) => r.phrase)) }
}
export interface CategoryMapping { dataset: Dataset; code: string; usda_category: string; category: string; note: string }
export function loadCategoryMap(): CategoryMapping[] {
  return parseCsv(readFileSync(join(USDA_DATA, 'category_map.csv'), 'utf8')).map((r) => ({
    dataset: r.dataset as Dataset, code: r.usda_category_code, usda_category: r.usda_category, category: r.portion_category, note: r.note,
  }))
}

// ── The plan ───────────────────────────────────────────────────────────────────
export interface FoodRow {
  id: string; dataset: Dataset; fdc_id: number; external_id: string; name: string
  calories: number; protein: number; carbs: number; fat: number; fiber: number
  status_reason: string; food: UsdaFood
}
export interface PortionRow {
  id: string; fdc_id: number; unit: RowUnit; size: Size; grams: number; ml: number | null; is_default: boolean
  source: string; grade: 'U'; confidence: number; source_ref: string; source_text: string; evidence: string
  target: 'import' | 'verified'; dataset: Dataset; own: boolean
}
export interface MapRow { food_item_id: string; category: string; note: string }
export interface Plan {
  pins: Record<Dataset, SourcePin>
  subset: Subset
  invalid: Array<{ food: UsdaFood; issues: IssueCode[] | string[] }>
  skippedVerified: UsdaFood[]          // dedupe 1: a verified row already has this fdc_id
  duplicates: Array<{ food: UsdaFood; winner: UsdaFood }>   // dedupe 2
  foods: FoodRow[]                     // sorted by id
  portions: PortionRow[]               // sorted by id
  portionReport: Record<string, number>
  map: MapRow[]                        // sorted by food_item_id
  verifiedNew: Array<{ fdc_id: number; rows: VerifiedFdcRow[]; portions: PortionRow[] }>
}

export const STATUS_REASON_PREFIX = 'rules_v1 import:055 '
export function statusReason(f: UsdaFood, release: string, flags: string[]): string {
  return [`rules_v1 import:055 ${f.dataset}:${release} energy:${f.nutrients.energyId}`, ...flags].join(' ')
}

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)
const MAX_GRAMS = 10000

// 1. validation (rules v1, the same code the resolver runs): any issue at all excludes the food
export function validateFoods(kept: UsdaFood[]): { valid: Array<{ food: UsdaFood; v: Values }>; invalid: Plan['invalid'] } {
  const invalid: Plan['invalid'] = []
  const valid: Array<{ food: UsdaFood; v: Values }> = []
  for (const f of kept) {
    const v = valuesOf(f)
    if (!v.per100) { invalid.push({ food: f, issues: v.missing.map((m) => `missing_${m}`) }); continue }
    const issues = foodItemIssues('usda', f.description, v.per100)
    if (issues.length) { invalid.push({ food: f, issues }); continue }
    valid.push({ food: f, v })
  }
  return { valid, invalid }
}

// 2. dedupe 1: a verified row already holds this fdc_id (its bulk portions still go to 056);
// 3. dedupe 2: one row per normalized description; Foundation > SR > FNDDS, then the lower fdc_id.
export function dedupeFoods<T extends { food: UsdaFood }>(valid: T[], verifiedFdc: ReadonlySet<number>): {
  winners: Array<T & { losers: UsdaFood[] }>; skippedVerified: UsdaFood[]; duplicates: Plan['duplicates']
} {
  const skippedVerified = valid.filter((x) => verifiedFdc.has(x.food.fdcId)).map((x) => x.food)
  const fresh = valid.filter((x) => !verifiedFdc.has(x.food.fdcId))
  const groups = new Map<string, T[]>()
  for (const x of fresh) {
    const k = normText(x.food.description)
    const g = groups.get(k)
    if (g) g.push(x); else groups.set(k, [x])
  }
  const winners: Array<T & { losers: UsdaFood[] }> = []
  const duplicates: Plan['duplicates'] = []
  for (const g of groups.values()) {
    g.sort((a, b) => DATASET_RANK[a.food.dataset] - DATASET_RANK[b.food.dataset] || a.food.fdcId - b.food.fdcId)
    const [w, ...rest] = g
    winners.push({ ...w, losers: rest.map((r) => r.food) })
    for (const r of rest) duplicates.push({ food: r.food, winner: w.food })
  }
  return { winners, skippedVerified, duplicates }
}

export function buildPlan(bulk: Bulk): Plan {
  const pins = loadPins()
  const subset = selectSubset(bulk)
  const verified = loadVerifiedSnapshot()
  const verifiedFdc = new Set(verified.map((v) => v.fdc_id))
  const { valid, invalid } = validateFoods(subset.kept)
  const { winners, skippedVerified, duplicates } = dedupeFoods(valid, verifiedFdc)
  const foods: FoodRow[] = winners.map(({ food: f, v }) => ({
    id: foodId(f), dataset: f.dataset, fdc_id: f.fdcId, external_id: externalId(f), name: f.description,
    calories: v.per100!.calories, protein: v.per100!.protein_g, carbs: v.per100!.carbs_g, fat: v.per100!.fat_g, fiber: v.per100!.fiber_g,
    status_reason: statusReason(f, pins[f.dataset].release, v.flags), food: f,
  })).sort((a, b) => cmp(a.id, b.id))
  const ids = new Set<string>()
  for (const r of foods) { if (ids.has(r.id)) throw new Error(`duplicate food id ${r.id} (${r.dataset}:${r.food.code})`); ids.add(r.id) }
  const fdcs = new Set<number>()
  for (const r of foods) { if (fdcs.has(r.fdc_id)) throw new Error(`duplicate fdc_id ${r.fdc_id}`); fdcs.add(r.fdc_id) }

  // 4. portions (056): every imported food (+ its duplicates' measures) and every live verified fdc_id
  const all = new Map<number, UsdaFood>()
  for (const f of [...bulk.foundation, ...bulk.sr, ...bulk.fndds]) {
    if (all.has(f.fdcId)) throw new Error(`fdc_id ${f.fdcId} in two datasets`)
    all.set(f.fdcId, f)
  }
  const targets: Array<{ fdc: number; kind: 'import' | 'verified'; foods: UsdaFood[] }> = []
  for (const w of winners) targets.push({ fdc: w.food.fdcId, kind: 'import', foods: [w.food, ...w.losers] })
  const reviewDropped = reviewDroppedFdcIds()
  for (const fdc of [...verifiedFdc].sort((a, b) => a - b)) {
    if (reviewDropped.has(fdc)) continue   // the founder review dropped every measure of this row (054's fold-in review)
    const f = all.get(fdc)
    if (f) targets.push({ fdc, kind: 'verified', foods: [f] })
  }
  // 054 already keys the live verified rows' measures (fold-in): never a second active row for the same slot
  const fold = foldInRows().rows
  const taken054 = new Set(fold.map((r) => `${r.fdc_id}|${r.unit}|${r.size}`))
  const default054 = new Set(fold.filter((r) => r.is_default).map((r) => r.fdc_id))
  const report: Record<string, number> = {
    measures: 0, unclassified: 0, same_unit_size: 0, covered_by_054: 0, over_10kg: 0, rows: 0,
    verified_targets_in_files: targets.filter((t) => t.kind === 'verified').length, verified_targets_not_in_files: verifiedFdc.size - targets.filter((t) => t.kind === 'verified').length,
  }
  const portions: PortionRow[] = []
  for (const t of targets) {
    const best = new Map<string, { c: ClassifiedMeasure; f: UsdaFood; m: Measure; rank: number[] }>()
    t.foods.forEach((f, fi) => {
      for (const m of f.measures) {
        report.measures++
        const c = classifyMeasure(m.text, m.grams)
        if (!c) { report.unclassified++; continue }
        const key = `${c.unit}|${c.size}`
        // FNDDS "Quantity not specified" first (it IS the default serving), then a size-named / plain text,
        // then the food's own measure over a duplicate's, then dataset precedence, then file order
        const rank = [c.isDefault ? 0 : 1, -measurePreference(c), fi === 0 ? 0 : 1, DATASET_RANK[f.dataset], fi, m.order]
        const prev = best.get(key)
        if (prev) {
          report.same_unit_size++
          const better = rank.findIndex((x, k) => x !== prev.rank[k])
          if (better < 0 || rank[better] > prev.rank[better]) continue
        }
        best.set(key, { c, f, m, rank })
      }
    })
    for (const [key, { c, f, m }] of [...best.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      if (taken054.has(`${t.fdc}|${key}`)) { report.covered_by_054++; continue }
      if (!(c.grams > 0) || c.grams > MAX_GRAMS || (c.ml !== null && c.ml > MAX_GRAMS)) { report.over_10kg++; continue }
      const row: PortionRow = {
        id: '', fdc_id: t.fdc, unit: c.unit, size: c.size, grams: c.grams, ml: c.ml,
        is_default: c.isDefault && !default054.has(t.fdc),
        source: PORTION_SOURCE[f.dataset], grade: 'U', confidence: FOOD_CONFIDENCE.U, source_ref: m.ref, source_text: m.text,
        evidence: `USDA ${DATASET_LABEL[f.dataset]} ${pins[f.dataset].release} measure` + (f.fdcId !== t.fdc ? ` of FDC ${f.fdcId} (same description)` : ''),
        target: t.kind, dataset: f.dataset, own: f.fdcId === t.fdc,
      }
      row.id = uuid5(NS_PORTION_UNITS, 'usda056|' + naturalKey({
        scope: 'fdc', food_item_id: null, fdc_id: t.fdc, category: null, unit: c.unit, size: c.size, context: null, region: null, status: 'active', source_ref: m.ref,
      }))
      portions.push(row)
    }
  }
  portions.sort((a, b) => cmp(a.id, b.id))
  report.rows = portions.length
  const pids = new Set<string>()
  for (const p of portions) { if (pids.has(p.id)) throw new Error(`duplicate portion id ${p.id}`); pids.add(p.id) }

  // 5. category map for imported foods: reviewed WWEIA / food-group mappings only
  const mapping = new Map(loadCategoryMap().map((m) => [`${m.dataset}|${m.code}`, m]))
  const map: MapRow[] = foods.flatMap((r) => {
    const m = mapping.get(`${r.dataset}|${r.food.categoryCode}`)
    if (!m) return []
    if (m.usda_category !== r.food.category) throw new Error(`category_map.csv: ${m.code} is "${r.food.category}" in the file, "${m.usda_category}" in the CSV`)
    return [{ food_item_id: r.id, category: m.category, note: `usda ${r.dataset} category ${m.code} ${m.usda_category} (scripts/usda/data/category_map.csv)` }]
  }).sort((a, b) => cmp(a.food_item_id, b.food_item_id))

  // 6. the live verified rows' NEW portions, listed for the founder's sign-off (spec (j) 14)
  const byFdc = new Map<number, VerifiedFdcRow[]>()
  for (const v of verified) { const l = byFdc.get(v.fdc_id); if (l) l.push(v); else byFdc.set(v.fdc_id, [v]) }
  const verifiedNew = [...byFdc.entries()].sort((a, b) => a[0] - b[0]).map(([fdc, rows]) => ({
    fdc_id: fdc, rows, portions: portions.filter((p) => p.target === 'verified' && p.fdc_id === fdc)
      .sort((a, b) => cmp(a.unit, b.unit) || cmp(a.size, b.size)),
  }))

  return { pins, subset, invalid, skippedVerified, duplicates, foods, portions, portionReport: report, map, verifiedNew }
}

// ── B's key plan (spec (f) outputs): proposed keys, never applied here ──────────
export interface ProposedKey { food_item_id: string; fdc_id: number; dataset: Dataset; name: string; proposed_key: string; words: number; flag: string }
export function proposedKeys(plan: Plan): ProposedKey[] {
  const { keys, aliases } = loadLiveKeys()
  return plan.foods.map((r) => {
    const k = normText(r.name)
    const words = k.split(' ').filter((w) => w !== '').length
    const flag = keys.has(k) ? 'collision:live_key' : aliases.has(k) ? 'collision:alias' : words <= 2 ? 'short:1-2 words' : 'ok'
    return { food_item_id: r.id, fdc_id: r.fdc_id, dataset: r.dataset, name: r.name, proposed_key: k, words, flag }
  }).sort((a, b) => cmp(a.proposed_key, b.proposed_key) || cmp(a.food_item_id, b.food_item_id))
}

// The inputs whose bytes decide the generated files (their sha256 goes in each header).
export const INPUT_FILES = [
  'scripts/usda/sources.json',
  'scripts/usda/data/verified_fdc_snapshot.csv',
  'scripts/usda/data/live_keys_snapshot.csv',
  'scripts/usda/data/category_map.csv',
  'scripts/usda/lib.ts',
  'scripts/usda/emit.ts',
  'scripts/import-usda.ts',
  'scripts/portions/lib.ts',
  'scripts/portions/data/verified_portions_snapshot.csv',
  'scripts/portions/data/fold_in_review.csv',
  'supabase/functions/_shared/portionText.ts',
  'supabase/functions/_shared/portions.ts',
  'supabase/functions/_shared/validate.ts',
] as const
export function inputsSha256(): string {
  const h = createHash('sha256')
  for (const f of INPUT_FILES) { h.update(f + '\0'); h.update(readFileSync(join(REPO, f))); h.update('\0') }
  return h.digest('hex')
}
