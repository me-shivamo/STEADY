// Official chain-menu nutrition (v1.2 follow-up plan WP10, generator half): reads the QA'd brand CSV
// (scripts/data/brands/raw/_combined.csv) and the founder's choices (scripts/brands/decisions.json) and builds the
// rows of the `brand_items` table that scripts/brands/emit.ts renders into a pending migration.
//
// Rules (plan WP10 + the adversarial review that overrides it):
//   - brand rows live in their OWN table, never in food_items: no exact keys, invisible to fts and search_foods
//     (review #3). Nothing reads brand_items until the resolver half ships behind RESOLVER_BRAND.
//   - every number is kept exactly as the brand printed it (the CSV text is copied, never re-formatted). Only
//     labels are normalized: country "India" -> IN, veg_nonveg, and the "<2.0" sugar bounds.
//   - per-serving rows with no gram weight are served per serving; ml-only rows stay per ml. No weight is ever
//     invented and ml is never treated as grams (review #20, scripts/data/brands/README.md).
//   - error and conflict rows are held (review list), never served, unless a DECIDED founder choice resolves a
//     conflict. Every served row passes the Atwater gate (REPORT.md rule, tolerance from decisions.json).
//   - deterministic: ids are UUIDv5 of a content key; the same inputs give the same rows in the same order.
// Pure apart from reading the two input files: no network, no database, no clock.

import { readFileSync } from 'fs'
import { join } from 'path'

import { normText } from '../../supabase/functions/_shared/portionText'
import { parseCsv, REPO, uuid5 } from '../portions/lib'

export { REPO }
export const COMBINED_CSV = 'scripts/data/brands/raw/_combined.csv'
export const DECISIONS_JSON = 'scripts/brands/decisions.json'
/** Hashed into the generated files' headers (inputs_sha256). Imported helpers are covered by --check instead. */
export const INPUT_FILES = [COMBINED_CSV, DECISIONS_JSON, 'scripts/brands/lib.ts', 'scripts/brands/emit.ts'] as const

const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
export const NS_BRAND_ITEMS = uuid5(NAMESPACE_URL, 'https://steady.chat/ns/brand_items/v1')

export const CSV_COLUMNS = [
  'brand', 'country', 'item', 'variant_or_size', 'serving_desc', 'serving_g', 'serving_ml',
  'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'veg_nonveg',
  'source_url', 'source_title', 'source_date_or_version', 'page_or_section', 'notes',
  'brand_slug', 'source_row', 'basis', 'qa_severity', 'qa_flag',
] as const
export type RawRow = Record<(typeof CSV_COLUMNS)[number], string>

// ── Brands ────────────────────────────────────────────────────────────────────────────────────────────
// brand_key groups the files of one chain (McDonald's has two franchisee files). region: 'IN' unless the
// brand publishes regional values: McDonald's by franchisee, Behrouz by the city whose store page was read.
export const BRAND_BY_SLUG: Readonly<Record<string, { key: string; region: string }>> = {
  amul: { key: 'amul', region: 'IN' },
  barista: { key: 'barista', region: 'IN' },
  behrouz_biryani: { key: 'behrouz', region: 'by_city' },
  blue_tokai: { key: 'blue_tokai', region: 'IN' },
  burger_king_india: { key: 'burger_king', region: 'IN' },
  cafe_coffee_day: { key: 'ccd', region: 'IN' },
  dominos: { key: 'dominos', region: 'IN' },
  faasos: { key: 'faasos', region: 'IN' },
  haldirams: { key: 'haldirams', region: 'IN' },
  kfc_india: { key: 'kfc', region: 'IN' },
  lapinoz_pizza: { key: 'lapinoz', region: 'IN' },
  mcdonalds_india_north_east: { key: 'mcdonalds', region: 'IN-NE' },
  mcdonalds_india_west_south: { key: 'mcdonalds', region: 'IN-WS' },
  naturals_ice_cream: { key: 'naturals', region: 'IN' },
  pizza_hut: { key: 'pizza_hut', region: 'IN' },
  starbucks_india: { key: 'starbucks', region: 'IN' },
  subway_india: { key: 'subway', region: 'IN' },
  taco_bell_india: { key: 'taco_bell', region: 'IN' },
  theobroma: { key: 'theobroma', region: 'IN' },
  wow_momo: { key: 'wow_momo', region: 'IN' },
}
const CITY_REGION: ReadonlyArray<[RegExp, string]> = [[/\/bengaluru\//, 'IN-BLR'], [/\/gurgaon\//, 'IN-NCR'], [/\/hyderabad\//, 'IN-HYD']]

/**
 * The document's own date where it prints one (created / last-modified / cover date), else the date we read
 * it. Reviewed by hand from the 53 distinct source_date_or_version strings; every row must match exactly one.
 */
export const SOURCE_DATES: ReadonlyArray<{ slug: string; match: string; date: string; basis: 'document' | 'retrieved' }> = [
  { slug: 'amul', match: 'page fetched 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'barista', match: 'image uploaded 2026-08', date: '2026-08-01', basis: 'document' },
  { slug: 'behrouz_biryani', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'blue_tokai', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'burger_king_india', match: 'current as of 12 February 2026', date: '2026-02-12', basis: 'document' },
  { slug: 'cafe_coffee_day', match: 'dated 28-04-2022', date: '2022-04-28', basis: 'document' },
  { slug: 'cafe_coffee_day', match: 'dated 29-04-2022', date: '2022-04-29', basis: 'document' },
  { slug: 'dominos', match: 'Last-Modified 2026-10-28', date: '2026-10-28', basis: 'document' },
  { slug: 'faasos', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'haldirams', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'kfc_india', match: 'PDF created 2026-03-30', date: '2026-03-30', basis: 'document' },
  { slug: 'lapinoz_pizza', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
  { slug: 'mcdonalds_india_north_east', match: 'Last-Modified 24 Apr 2026', date: '2026-04-24', basis: 'document' },
  { slug: 'mcdonalds_india_north_east', match: 'Last-Modified 24 Dec 2025', date: '2025-12-24', basis: 'document' },
  { slug: 'mcdonalds_india_west_south', match: 'Last-Modified 10 Apr 2024', date: '2024-04-10', basis: 'document' },
  { slug: 'naturals_ice_cream', match: 'July 2024 Updated', date: '2024-07-01', basis: 'document' },
  { slug: 'naturals_ice_cream', match: 'July-Sept 2025', date: '2025-07-01', basis: 'document' },
  { slug: 'naturals_ice_cream', match: 'undated; HTTP Last-Modified 2024-12-11', date: '2024-12-11', basis: 'document' },
  { slug: 'pizza_hut', match: 'PDF created 2026-09-30', date: '2026-09-30', basis: 'document' },
  { slug: 'starbucks_india', match: "Created on 02-01-2023", date: '2023-01-02', basis: 'document' },
  { slug: 'subway_india', match: 'PDF created 2026-08-05', date: '2026-08-05', basis: 'document' },
  { slug: 'taco_bell_india', match: 'Sheet dated 01.04.26', date: '2026-04-01', basis: 'document' },
  { slug: 'theobroma', match: 'June 2026 (cover date)', date: '2026-06-01', basis: 'document' },
  { slug: 'wow_momo', match: 'retrieved 2026-11-13', date: '2026-11-13', basis: 'retrieved' },
]

// ── QA codes (scripts/data/brands/tools/qa_validate.py TIER, copied) ────────────────────────────────────────
export type Tier = 'caveat' | 'conflict' | 'error'
export const QA_TIER: Readonly<Record<string, Tier>> = {
  no_kcal: 'error', negative_value: 'error', atwater_mismatch: 'error', kcal_density_gt_900: 'error',
  macro_mass_gt_serving: 'error', sugar_gt_carbs: 'error', satfat_gt_fat: 'error', added_sugar_gt_sugar: 'error',
  possible_kj_as_kcal: 'error', sodium_exceeds_pure_salt: 'error', per100_kcal_mismatch: 'error', size_not_monotonic: 'error',
  sodium_implausibly_low: 'caveat', fails_steady_rules_v1: 'caveat', duplicate_exact: 'caveat', size_label_ambiguous: 'caveat',
  no_serving_size: 'caveat', per100_no_portion: 'caveat', macros_incomplete: 'caveat', nonnumeric_value: 'caveat',
  collector_noted: 'caveat',
  duplicate_conflict: 'conflict', name_collision: 'conflict', listed_twice_conflict: 'conflict',
}
const TIER_RANK: Readonly<Record<string, number>> = { clean: 0, caveat: 1, conflict: 2, error: 3 }

/**
 * "code: detail; code: detail" -> codes in order. A detail may itself contain "; " ("Atwater not checkable;
 * missing fat_g"), so a fragment that does not start with a known "code: " belongs to the previous detail.
 * Throws when the flag does not start with a known code.
 */
export function qaCodes(flag: string): string[] {
  if (flag === '') return []
  const codes: string[] = []
  for (const part of flag.split('; ')) {
    const m = /^([a-z0-9_]+): /.exec(part)
    if (m && m[1] in QA_TIER) codes.push(m[1])
    else if (codes.length === 0) throw new Error(`qa_flag does not start with a known code: ${JSON.stringify(flag.slice(0, 120))}`)
  }
  return codes
}

// ── Numbers: exact decimal text, compared as integer thousandths (no float rounding at the gate edges) ────────
const DEC = /^(\d+)(?:\.(\d{1,3}))?$/
export function milli(s: string): number {
  const m = DEC.exec(s)
  if (!m) throw new Error(`not a plain decimal with at most 3 places: ${JSON.stringify(s)}`)
  return Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'))
}

// ── Decisions ─────────────────────────────────────────────────────────────────────────────────────────────
export type DecisionStatus = 'PENDING FOUNDER' | 'DECIDED'
export interface Decision<T> { question: string; options: unknown[]; proposed: T; why: string; effect: string; status: DecisionStatus; chosen: T | null; source?: string }
export interface AtwaterRule { pct: number; kcal_slack: number }
export interface DominosRule { policy: 'hold_both' | 'keep_higher_kcal' | 'keep_rows'; keep_rows: number[] }
export interface DefaultSizeRule { single_row_is_default: boolean; brands: Record<string, string[]> }
export interface Decisions {
  atwater_rule: Decision<AtwaterRule>
  starbucks_guide: Decision<'linked_2023' | 'feb_2026'>
  mcdonalds_default_region: Decision<'IN-WS' | 'IN-NE'>
  behrouz_city: Decision<'IN-NCR' | 'IN-BLR' | 'none'>
  dominos_duplicates: Decision<DominosRule>
  dominos_mni_34_40: Decision<'transcribe_next_pass' | 'skip'>
  default_size: Decision<DefaultSizeRule>
  per100_no_portion: Decision<'stated_amount_only' | 'keep_unserved'>
  macros_incomplete: Decision<'keep_unserved' | 'omit_from_table'>
  brand_tier_precedence: Decision<'above_generic_key_when_brand_named' | 'below_generic_key'>
  mcchicken_live_key: Decision<'leave' | 'repoint'>
  ml_only_rows: Decision<'per_serving_no_density'>
  no_weight_rows: Decision<'per_serving'>
  amul_source: Decision<'keep'>
}
export type DecisionId = keyof Decisions
export interface Signoff { by: string; date: string; rows_checked: number; note?: string }
export interface DecisionsFile { decisions: Decisions; signoffs: Record<string, Signoff | null> }

export const DECISION_IDS: readonly DecisionId[] = [
  'atwater_rule', 'starbucks_guide', 'mcdonalds_default_region', 'behrouz_city', 'dominos_duplicates', 'dominos_mni_34_40',
  'default_size', 'per100_no_portion', 'macros_incomplete', 'brand_tier_precedence', 'mcchicken_live_key',
  'ml_only_rows', 'no_weight_rows', 'amul_source',
]
/** Decisions that change no row: copied into the header and manifest for the resolver half. */
export const RECORDED_ONLY: readonly DecisionId[] = ['dominos_mni_34_40', 'brand_tier_precedence', 'mcchicken_live_key']
/** Decisions that release held (conflict-tier) rows: they act only once DECIDED, never on a pending proposal. */
export const RELEASING: readonly DecisionId[] = ['behrouz_city', 'dominos_duplicates']

const ENUMS: Partial<Record<DecisionId, readonly string[]>> = {
  starbucks_guide: ['linked_2023', 'feb_2026'],
  mcdonalds_default_region: ['IN-WS', 'IN-NE'],
  behrouz_city: ['IN-NCR', 'IN-BLR', 'none'],
  dominos_mni_34_40: ['transcribe_next_pass', 'skip'],
  per100_no_portion: ['stated_amount_only', 'keep_unserved'],
  macros_incomplete: ['keep_unserved', 'omit_from_table'],
  brand_tier_precedence: ['above_generic_key_when_brand_named', 'below_generic_key'],
  mcchicken_live_key: ['leave', 'repoint'],
  ml_only_rows: ['per_serving_no_density'],
  no_weight_rows: ['per_serving'],
  amul_source: ['keep'],
}

function checkValue(id: DecisionId, v: unknown, brandKeys: ReadonlySet<string>): void {
  const bad = (why: string): never => { throw new Error(`decisions.json ${id}: ${why}: ${JSON.stringify(v)}`) }
  const en = ENUMS[id]
  if (en) { if (typeof v !== 'string' || !en.includes(v)) bad(`must be one of ${en.join(', ')}`); return }
  if (typeof v !== 'object' || v === null) bad('must be an object')
  const o = v as Record<string, unknown>
  if (id === 'atwater_rule') {
    const { pct, kcal_slack } = o
    if (!Number.isInteger(pct) || (pct as number) < 1 || (pct as number) > 50) bad('pct must be an integer percent 1..50')
    if (!Number.isInteger(kcal_slack) || (kcal_slack as number) < 0 || (kcal_slack as number) > 50) bad('kcal_slack must be an integer 0..50')
    if (Object.keys(o).sort().join() !== 'kcal_slack,pct') bad('only pct and kcal_slack')
  } else if (id === 'dominos_duplicates') {
    if (!['hold_both', 'keep_higher_kcal', 'keep_rows'].includes(o.policy as string)) bad('policy must be hold_both, keep_higher_kcal or keep_rows')
    if (!Array.isArray(o.keep_rows) || !o.keep_rows.every((n) => Number.isInteger(n) && n > 1)) bad('keep_rows must be source_row integers')
    if (o.policy !== 'keep_rows' && (o.keep_rows as unknown[]).length) bad('keep_rows is only used with policy keep_rows')
  } else if (id === 'default_size') {
    if (typeof o.single_row_is_default !== 'boolean') bad('single_row_is_default must be a boolean')
    const b = o.brands as Record<string, unknown>
    if (typeof b !== 'object' || b === null) bad('brands must be an object')
    for (const [k, labels] of Object.entries(b)) {
      if (!brandKeys.has(k)) bad(`unknown brand key ${k}`)
      if (!Array.isArray(labels) || !labels.every((l) => typeof l === 'string' && l === normText(l))) bad(`${k}: labels must be normalized strings`)
      const list = labels as string[]
      if (new Set(list).size !== list.length) bad(`${k}: duplicate label`)
    }
  } else bad('unexpected decision')
}

/** Reads and validates decisions.json. Unknown or missing ids, values outside the options, or a DECIDED entry without chosen all throw. */
export function parseDecisions(text: string): DecisionsFile {
  const j = JSON.parse(text) as { decisions?: Record<string, Decision<unknown>>; signoffs?: Record<string, unknown> }
  const ds = j.decisions ?? {}
  const ids = Object.keys(ds).sort()
  if (ids.join() !== [...DECISION_IDS].sort().join()) throw new Error(`decisions.json must hold exactly ${DECISION_IDS.join(', ')}; has ${ids.join(', ')}`)
  const brandKeys = new Set(Object.values(BRAND_BY_SLUG).map((b) => b.key))
  for (const id of DECISION_IDS) {
    const d = ds[id]
    for (const f of ['question', 'why', 'effect'] as const) if (typeof d[f] !== 'string' || !d[f]) throw new Error(`decisions.json ${id}: missing ${f}`)
    if (!Array.isArray(d.options) || d.options.length === 0) throw new Error(`decisions.json ${id}: missing options`)
    if (d.status !== 'PENDING FOUNDER' && d.status !== 'DECIDED') throw new Error(`decisions.json ${id}: status must be "PENDING FOUNDER" or "DECIDED"`)
    checkValue(id, d.proposed, brandKeys)
    if (d.status === 'DECIDED') {
      if (d.chosen === null || d.chosen === undefined) throw new Error(`decisions.json ${id}: DECIDED needs chosen`)
      checkValue(id, d.chosen, brandKeys)
    } else if (d.chosen !== null) throw new Error(`decisions.json ${id}: chosen must stay null while PENDING FOUNDER`)
  }
  const so = j.signoffs ?? {}
  const signoffs: Record<string, Signoff | null> = {}
  const slugs = Object.keys(so).filter((k) => k !== '_about').sort()
  if (slugs.join() !== Object.keys(BRAND_BY_SLUG).sort().join()) throw new Error('decisions.json signoffs must list every brand slug exactly once')
  for (const s of slugs) {
    const v = so[s]
    if (v === null) { signoffs[s] = null; continue }
    const o = v as Signoff
    if (typeof o !== 'object' || typeof o.by !== 'string' || !o.by || !/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !Number.isInteger(o.rows_checked) || o.rows_checked < 1) {
      throw new Error(`decisions.json signoffs.${s}: needs {by, date YYYY-MM-DD, rows_checked >= 1}`)
    }
    signoffs[s] = o
  }
  return { decisions: ds as unknown as Decisions, signoffs }
}
export const loadDecisions = (): DecisionsFile => parseDecisions(readFileSync(join(REPO, DECISIONS_JSON), 'utf8'))

/** The value the generator acts on: the founder's answer once DECIDED, else the proposed default. */
export function effective<K extends DecisionId>(ds: Decisions, id: K): Decisions[K]['proposed'] {
  const d = ds[id]
  return (d.status === 'DECIDED' ? d.chosen : d.proposed) as Decisions[K]['proposed']
}
export const pendingIds = (ds: Decisions): DecisionId[] => DECISION_IDS.filter((id) => ds[id].status === 'PENDING FOUNDER')

// ── Rows ──────────────────────────────────────────────────────────────────────────────────────────────────
export type Status = 'verified' | 'held' | 'unserved'
export type Basis = 'per_serving' | 'per_100g' | 'per_100ml'
export type AmountRule = 'serving' | 'stated_or_portion' | 'stated_only'
export const NUMERIC = ['serving_g', 'serving_ml', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'] as const
type NumCol = (typeof NUMERIC)[number]

export interface BrandItem {
  id: string
  brand_key: string
  brand: string
  country: string
  region: string
  is_default_region: boolean
  item: string
  item_norm: string
  variant: string | null
  variant_norm: string
  /** NULL for 21 Blue Tokai rows that describe no serving (one item as sold). */
  serving_desc: string | null
  serving_g: string | null
  serving_ml: string | null
  basis: Basis
  amount_rule: AmountRule
  kcal: string
  protein_g: string | null
  carbs_g: string | null
  fat_g: string | null
  fiber_g: string | null
  sugar_g: string | null
  /** A printed upper bound ("<2.0" -> "2.0"); sugar_g is then NULL. */
  sugar_lt_g: string | null
  sodium_mg: string | null
  /** NULL when P, C or F is not published (the check cannot run). */
  atwater_ok: boolean | null
  veg: 'veg' | 'nonveg' | 'vegan' | 'egg' | null
  is_default_size: boolean
  status: Status
  status_reason: string | null
  qa_severity: 'clean' | Tier
  qa_codes: string[]
  qa_flag: string | null
  /** The generator's own failing gates (gate:...), whatever the QA said. */
  gate_codes: string[]
  source_url: string
  source_title: string
  source_version: string
  source_date: string
  source_date_basis: 'document' | 'retrieved'
  page: string | null
  notes: string | null
  brand_slug: string
  source_row: number
  /** Not a column: the raw CSV row (tests compare numbers against it). */
  raw: RawRow
}

export function loadRaw(text = readFileSync(join(REPO, COMBINED_CSV), 'utf8')): RawRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('brand CSV is empty')
  const head = Object.keys(rows[0])
  if (head.join() !== CSV_COLUMNS.join()) throw new Error(`brand CSV header differs: ${head.join(',')}`)
  return rows as RawRow[]
}

const VEG: Readonly<Record<string, BrandItem['veg']>> = { veg: 'veg', 'non-veg': 'nonveg', vegan: 'vegan', egg: 'egg', '': null }
const BASIS: Readonly<Record<string, Basis>> = { per_serve: 'per_serving', per_100g: 'per_100g', per_100ml: 'per_100ml' }
const BOUND = /^<\s*(\d+(?:\.\d{1,3})?)$/

function numberText(r: RawRow, c: NumCol): string | null {
  const v = r[c]
  if (v === '') return null
  if (DEC.test(v)) return v
  throw new Error(`${r.brand_slug} row ${r.source_row}: ${c} ${JSON.stringify(v)} is not a plain number`)
}

function sourceDate(r: RawRow): { date: string; basis: 'document' | 'retrieved' } {
  const hits = SOURCE_DATES.filter((s) => s.slug === r.brand_slug && r.source_date_or_version.includes(s.match))
  if (hits.length !== 1) throw new Error(`${r.brand_slug} row ${r.source_row}: ${hits.length} SOURCE_DATES entries match ${JSON.stringify(r.source_date_or_version)}`)
  return { date: hits[0].date, basis: hits[0].basis }
}

/** Row normalization with no decisions applied yet (status verified, flags parsed). */
function normalizeRow(r: RawRow): BrandItem {
  const b = BRAND_BY_SLUG[r.brand_slug]
  if (!b) throw new Error(`unknown brand_slug ${r.brand_slug}`)
  let region = b.region
  if (region === 'by_city') {
    const hit = CITY_REGION.filter(([re]) => re.test(r.source_url))
    if (hit.length !== 1) throw new Error(`${r.brand_slug} row ${r.source_row}: no city in ${r.source_url}`)
    region = hit[0][1]
  }
  if (r.country !== 'IN' && r.country !== 'India') throw new Error(`${r.brand_slug} row ${r.source_row}: country ${r.country}`)
  if (!(r.veg_nonveg in VEG)) throw new Error(`${r.brand_slug} row ${r.source_row}: veg_nonveg ${r.veg_nonveg}`)
  const basis = BASIS[r.basis]
  if (!basis) throw new Error(`${r.brand_slug} row ${r.source_row}: basis ${r.basis}`)
  if (!/^https:\/\/\S+$/.test(r.source_url)) throw new Error(`${r.brand_slug} row ${r.source_row}: source_url ${r.source_url}`)
  if (!/^[1-9]\d*$/.test(r.source_row)) throw new Error(`${r.brand_slug}: source_row ${r.source_row}`)
  if (r.item.trim() === '' || r.source_title.trim() === '') throw new Error(`${r.brand_slug} row ${r.source_row}: blank item or source_title`)
  let sugar: string | null
  let sugarLt: string | null = null
  const sb = BOUND.exec(r.sugar_g)
  if (sb) { sugar = null; sugarLt = sb[1] } else sugar = numberText(r, 'sugar_g')
  const kcal = numberText(r, 'kcal')
  if (kcal === null) throw new Error(`${r.brand_slug} row ${r.source_row}: no kcal`)
  const codes = qaCodes(r.qa_flag)
  const sev = (r.qa_severity === '' ? 'clean' : r.qa_severity) as BrandItem['qa_severity']
  const want = codes.reduce((m, c) => (TIER_RANK[QA_TIER[c]] > TIER_RANK[m] ? QA_TIER[c] : m), 'clean' as string)
  if (sev !== want) throw new Error(`${r.brand_slug} row ${r.source_row}: qa_severity ${sev} but its codes say ${want}`)
  const sd = sourceDate(r)
  return {
    id: '',
    brand_key: b.key,
    brand: r.brand,
    country: 'IN',
    region,
    is_default_region: true,
    item: r.item,
    item_norm: normText(r.item),
    variant: r.variant_or_size === '' ? null : r.variant_or_size,
    variant_norm: normText(r.variant_or_size),
    serving_desc: r.serving_desc === '' ? null : r.serving_desc,
    serving_g: numberText(r, 'serving_g'),
    serving_ml: numberText(r, 'serving_ml'),
    basis,
    amount_rule: basis === 'per_serving' ? 'serving' : 'stated_or_portion',
    kcal,
    protein_g: numberText(r, 'protein_g'),
    carbs_g: numberText(r, 'carbs_g'),
    fat_g: numberText(r, 'fat_g'),
    fiber_g: numberText(r, 'fiber_g'),
    sugar_g: sugar,
    sugar_lt_g: sugarLt,
    sodium_mg: numberText(r, 'sodium_mg'),
    atwater_ok: null,
    veg: VEG[r.veg_nonveg],
    is_default_size: false,
    status: 'verified',
    status_reason: null,
    qa_severity: sev,
    qa_codes: codes,
    qa_flag: r.qa_flag === '' ? null : r.qa_flag,
    gate_codes: [],
    source_url: r.source_url,
    source_title: r.source_title,
    source_version: r.source_date_or_version,
    source_date: sd.date,
    source_date_basis: sd.basis,
    page: r.page_or_section === '' ? null : r.page_or_section,
    notes: r.notes === '' ? null : r.notes,
    brand_slug: r.brand_slug,
    source_row: Number(r.source_row),
    raw: r,
  }
}

// ── Gates (the generator's own checks; REPORT.md / qa_validate.py rules, exact integer arithmetic) ─────────
/** true = passes, false = fails, null = P, C or F not published. */
export function atwaterOk(it: Pick<BrandItem, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>, rule: AtwaterRule): boolean | null {
  if (it.protein_g === null || it.carbs_g === null || it.fat_g === null) return null
  const k = milli(it.kcal)
  const est = 4 * milli(it.protein_g) + 4 * milli(it.carbs_g) + 9 * milli(it.fat_g)
  const diff = Math.abs(k - est)
  const fails = k > 0 ? 100 * diff > rule.pct * k && diff > rule.kcal_slack * 1000 : est > rule.kcal_slack * 1000
  return !fails
}
/** sugar more than carbs, with the QA tolerance (2% + 0.5 g). A printed bound ("<2") cannot prove it. */
export function sugarGtCarbs(it: Pick<BrandItem, 'sugar_g' | 'carbs_g'>): boolean {
  if (it.sugar_g === null || it.carbs_g === null) return false
  return 100 * milli(it.sugar_g) > 102 * milli(it.carbs_g) + 50_000
}
/** qa_validate.section_of: "p.14, Beverage Core > Espresso" -> "beverage core > espresso". */
export function sectionOf(page: string): string {
  return page.toLowerCase().replace(/^\s*(?:p\.?\s*\d+|pdf page \d+[^-]*-?)\s*,?\s*/, '').trim()
}
/**
 * kcal must rise with size: within one brand file, item and veg flag, for rows of the same table (section)
 * with a published g (or ml) serve, a serve more than 5% bigger must have more kcal. Rows under 20 kcal are
 * ignored (near-zero drinks). Returns the indexes (into items) that fail.
 */
export function sizeNotMonotonic(items: readonly BrandItem[]): Set<number> {
  const out = new Set<number>()
  const groups = new Map<string, number[]>()
  items.forEach((it, i) => {
    const k = [it.brand_slug, it.item_norm, it.raw.veg_nonveg.trim().toLowerCase()].join('|')
    const g = groups.get(k)
    if (g) g.push(i); else groups.set(k, [i])
  })
  for (const idx of groups.values()) {
    for (const unit of ['serving_g', 'serving_ml'] as const) {
      const sized = idx.filter((i) => items[i].basis === 'per_serving' && items[i][unit] !== null && milli(items[i][unit] as string) > 0)
      sized.sort((a, b) => milli(items[a][unit] as string) - milli(items[b][unit] as string))   // stable (as Python's sort)
      for (let x = 0; x < sized.length; x++) {
        const a = items[sized[x]]
        for (let y = x + 1; y < sized.length; y++) {
          const b = items[sized[y]]
          if (sectionOf(a.page ?? '') !== sectionOf(b.page ?? '') || milli(a.kcal) < 20_000) continue
          // b > 1.05 a, in exact thousandths: 100 b > 105 a
          if (100 * milli(b[unit] as string) > 105 * milli(a[unit] as string) && milli(b.kcal) <= milli(a.kcal)) {
            out.add(sized[x]); out.add(sized[y])
          }
        }
      }
    }
  }
  return out
}

/** qa_validate's duplicate key: same brand file, item, size, veg flag, serving text and serve weight. */
function duplicateKey(it: BrandItem): string {
  return [it.brand_slug, it.item_norm, it.variant_norm, it.raw.veg_nonveg.trim().toLowerCase(), normText(it.raw.serving_desc),
    it.raw.serving_g.trim(), it.raw.serving_ml.trim()].join('|')
}
const nutrientTuple = (it: BrandItem): string => [it.raw.kcal, it.raw.protein_g, it.raw.carbs_g, it.raw.fat_g, it.raw.fiber_g, it.raw.sugar_g, it.raw.sodium_mg].map((s) => s.trim()).join('|')

/** Content key for the UUIDv5 id: stable when unrelated rows are added or re-ordered; '#n' separates exact repeats. */
function naturalKey(it: BrandItem): string {
  return [it.brand_slug, it.item_norm, it.variant_norm, normText(it.raw.serving_desc), it.raw.veg_nonveg.trim().toLowerCase(),
    it.serving_g ?? '', it.serving_ml ?? '', it.source_url, it.page ?? ''].join('|')
}

/** Does a default-size label pick this variant? Exact, or a longer variant starting with the label's words. */
export function labelMatches(label: string, variantNorm: string): boolean {
  return variantNorm === label || (label !== '' && variantNorm.startsWith(label + ' '))
}

export interface Build {
  items: BrandItem[]
  /** Rows left out of brand_items entirely by a decision (macros_incomplete = omit_from_table). */
  omitted: BrandItem[]
  defaults: { groups: number; withDefault: number; ambiguous: number; noMatch: number }
}

/** Every rule in one pass. Order of reasons: qa_error, qa_conflict, gate, decision, duplicate. */
export function buildItems(raw: readonly RawRow[], ds: Decisions): Build {
  const items = raw.map(normalizeRow)

  // ids
  const seen = new Map<string, number>()
  for (const it of items) {
    const k = naturalKey(it)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    it.id = uuid5(NS_BRAND_ITEMS, n === 1 ? k : `${k}#${n}`)
  }
  const ids = new Set(items.map((i) => i.id))
  if (ids.size !== items.length) throw new Error('brand_items ids collide')
  const rowKeys = new Set(items.map((i) => `${i.brand_slug}:${i.source_row}`))
  if (rowKeys.size !== items.length) throw new Error('duplicate (brand_slug, source_row)')

  const reasons: string[][] = items.map(() => [])
  const held = items.map(() => false)
  const unserved = items.map(() => false)

  // 1. QA error tier: always held. Conflict tier: held unless a DECIDED choice releases it (step 2).
  items.forEach((it, i) => {
    if (it.qa_severity === 'error') { held[i] = true; reasons[i].push(`qa_error:${it.qa_codes.filter((c) => QA_TIER[c] === 'error').join(',')}`) }
  })
  const released = new Set<number>()
  const cityLoser = new Set<number>()
  const conflictGroups = new Map<string, number[]>()
  items.forEach((it, i) => {
    if (!it.qa_codes.includes('duplicate_conflict')) return
    const k = duplicateKey(it)
    const g = conflictGroups.get(k)
    if (g) g.push(i); else conflictGroups.set(k, [i])
  })

  // 2. Releases by DECIDED founder choices.
  const behrouz = ds.behrouz_city
  if (behrouz.status === 'DECIDED' && behrouz.chosen !== 'none') {
    for (const g of conflictGroups.values()) {
      if (items[g[0]].brand_key !== 'behrouz') continue
      const mine = g.filter((i) => items[i].region === behrouz.chosen)
      for (const i of g) if (items[i].region !== behrouz.chosen) cityLoser.add(i)
      if (mine.length > 0 && new Set(mine.map((i) => nutrientTuple(items[i]))).size === 1) released.add(mine[0])
    }
  }
  const dom = ds.dominos_duplicates
  if (dom.status === 'DECIDED' && dom.chosen) {
    const domGroups = [...conflictGroups.values()].filter((g) => items[g[0]].brand_key === 'dominos')
    if (dom.chosen.policy === 'keep_higher_kcal') {
      for (const g of domGroups) {
        const top = Math.max(...g.map((i) => milli(items[i].kcal)))
        const best = g.filter((i) => milli(items[i].kcal) === top)
        if (best.length === 1) released.add(best[0])
      }
    } else if (dom.chosen.policy === 'keep_rows') {
      const want = new Set(dom.chosen.keep_rows)
      for (const n of want) {
        const g = domGroups.find((gg) => gg.some((i) => items[i].source_row === n))
        if (!g) throw new Error(`dominos_duplicates.keep_rows: row ${n} is not a Domino's duplicate_conflict row`)
        if (g.filter((i) => want.has(items[i].source_row)).length > 1) throw new Error(`dominos_duplicates.keep_rows: two rows kept from one conflict group (${n})`)
        released.add(g.find((i) => items[i].source_row === n) as number)
      }
    }
  }
  items.forEach((it, i) => {
    if (it.qa_severity !== 'conflict') return
    const codes = it.qa_codes.filter((c) => QA_TIER[c] === 'conflict')
    // only a pure duplicate_conflict can be resolved by a choice; listed_twice / name_collision stay held
    if (released.has(i) && codes.every((c) => c === 'duplicate_conflict')) {
      reasons[i].push(it.brand_key === 'behrouz' ? `decision:behrouz_city=${behrouz.chosen} released the conflict` : `decision:dominos_duplicates=${dom.chosen?.policy} released the conflict`)
      return
    }
    held[i] = true
    reasons[i].push(`qa_conflict:${codes.join(',')}`)
    if (cityLoser.has(i)) reasons[i].push(`decision:behrouz_city=${behrouz.chosen} (another city)`)
  })

  // 3. The generator's own gates, on every row.
  const rule = effective(ds, 'atwater_rule')
  const mono = sizeNotMonotonic(items)
  items.forEach((it, i) => {
    it.atwater_ok = atwaterOk(it, rule)
    if (it.atwater_ok === false) it.gate_codes.push('atwater_mismatch')
    if (sugarGtCarbs(it)) it.gate_codes.push('sugar_gt_carbs')
    if (mono.has(i)) it.gate_codes.push('size_not_monotonic')
    if (it.gate_codes.length) { held[i] = true; reasons[i].push(`gate:${it.gate_codes.join(',')}`) }
  })

  // 4. Decisions that withhold usable rows, and exact repeats (qa duplicate_exact marks every copy after the first).
  const guide = effective(ds, 'starbucks_guide')
  const p100 = effective(ds, 'per100_no_portion')
  const macros = effective(ds, 'macros_incomplete')
  const omit = new Set<number>()
  items.forEach((it, i) => {
    if (it.atwater_ok === null) {
      if (macros === 'omit_from_table') omit.add(i)
      unserved[i] = true; reasons[i].push(`decision:macros_incomplete=${macros} (Atwater not checkable)`)
    }
    if (it.brand_key === 'starbucks' && guide === 'feb_2026') { unserved[i] = true; reasons[i].push('decision:starbucks_guide=feb_2026 (not yet collected)') }
    if (it.qa_codes.includes('per100_no_portion')) {
      if (it.basis === 'per_serving') throw new Error(`${it.brand_slug} row ${it.source_row}: per100_no_portion on a per-serving row`)
      if (p100 === 'keep_unserved') { unserved[i] = true; reasons[i].push('decision:per100_no_portion=keep_unserved') } else it.amount_rule = 'stated_only'
    }
    if (it.qa_codes.includes('duplicate_exact')) { unserved[i] = true; reasons[i].push('duplicate_exact (an earlier row holds the same numbers)') }
  })
  items.forEach((it, i) => {
    it.status = held[i] ? 'held' : unserved[i] ? 'unserved' : 'verified'
    it.status_reason = reasons[i].length ? reasons[i].join('; ') : null
    if (it.status === 'verified' && it.atwater_ok !== true) throw new Error(`internal: verified row without Atwater pass (${it.brand_slug} ${it.source_row})`)
  })

  // 5. Default region.
  const mcd = effective(ds, 'mcdonalds_default_region')
  const city = effective(ds, 'behrouz_city')
  for (const it of items) {
    if (it.brand_key === 'mcdonalds') it.is_default_region = it.region === mcd
    else if (it.brand_key === 'behrouz') it.is_default_region = city === 'none' ? false : it.region === city
    else it.is_default_region = true
  }

  // 6. Default size, among served rows of one brand, region, item and veg flag.
  const size = effective(ds, 'default_size')
  const groups = new Map<string, BrandItem[]>()
  for (const it of items) {
    if (it.status !== 'verified') continue
    const k = [it.brand_key, it.region, it.item_norm, it.veg ?? ''].join('|')
    const g = groups.get(k)
    if (g) g.push(it); else groups.set(k, [it])
  }
  const stats = { groups: groups.size, withDefault: 0, ambiguous: 0, noMatch: 0 }
  for (const g of groups.values()) {
    if (g.length === 1) {
      if (size.single_row_is_default) { g[0].is_default_size = true; stats.withDefault++ } else stats.noMatch++
      continue
    }
    let done = false
    for (const label of size.brands[g[0].brand_key] ?? []) {
      const hits = g.filter((it) => labelMatches(label, it.variant_norm))
      if (hits.length === 0) continue
      if (hits.length === 1) { hits[0].is_default_size = true; stats.withDefault++ } else stats.ambiguous++
      done = true
      break
    }
    if (!done) stats.noMatch++
  }

  const kept = items.filter((_, i) => !omit.has(i))
  const omitted = items.filter((_, i) => omit.has(i))
  return { items: kept, omitted, defaults: stats }
}

// ── Counts for the header, manifest and tests ────────────────────────────────────────────────────────────
export interface BrandCounts { brand_slug: string; brand_key: string; rows: number; verified: number; held: number; unserved: number; omitted: number; served_no_weight: number; served_ml_only: number; served_per_100: number; default_size: number }
export function countsByBrand(b: Build): BrandCounts[] {
  const out = new Map<string, BrandCounts>()
  const row = (it: BrandItem): BrandCounts => {
    let c = out.get(it.brand_slug)
    if (!c) {
      c = { brand_slug: it.brand_slug, brand_key: it.brand_key, rows: 0, verified: 0, held: 0, unserved: 0, omitted: 0, served_no_weight: 0, served_ml_only: 0, served_per_100: 0, default_size: 0 }
      out.set(it.brand_slug, c)
    }
    return c
  }
  for (const it of b.items) {
    const c = row(it)
    c.rows++
    c[it.status]++
    if (it.status === 'verified') {
      if (it.basis !== 'per_serving') c.served_per_100++
      else if (it.serving_g === null && it.serving_ml === null) c.served_no_weight++
      else if (it.serving_g === null) c.served_ml_only++
      if (it.is_default_size) c.default_size++
    }
  }
  for (const it of b.omitted) { const c = row(it); c.rows++; c.omitted++ }
  return [...out.values()].sort((a, z) => (a.brand_slug < z.brand_slug ? -1 : 1))
}
