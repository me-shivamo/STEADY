// WP4 drink sizes: a PROPOSED delta on top of migration 054's seed (research:
// docs/research/reports/Indian drink sizes.md). 054 is live and runs once, and its
// inputs (portion_units_seed.csv, category_words.csv, categories.csv, portionText.ts,
// lib.ts, emit054.ts) are hashed into its header (`emit054 --check`), so none of them is
// edited here (plan review #14). The delta lives in its own CSVs:
//
//   data/drinks_delta_units.csv       new portion_units rows, every one status 'proposed'
//   data/drinks_delta_categories.csv  new portion_categories, neutral on insert
//   data/drinks_delta_words.csv       category-word re-points / inserts, and unit-word vocabulary
//
// Nothing in production reads these files. Tests (portionDrinkDelta.test.ts) merge them
// into the engine's tables to show, phrase by phrase, what resolves wrongly today and what
// the delta would give (plan review #15: prove each gap before adding a row). A later,
// founder-approved migration (number assigned at push time) inserts them; promotion to
// 'active' is a separate reviewed migration (fixer (m)3, plan Q12).

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  normalizeUnitWord, normText, SIZE_WORDS, UNITS, type RowUnit, type Size, type Unit, type UnitWordResult,
} from '../../supabase/functions/_shared/portionText'
import type { CategoryWord, Region } from '../../supabase/functions/_shared/portions'
import {
  confidenceFor, DATA, engineTables, INPUT_FILES, naturalKey, NS_PORTION_UNITS, parseCsv, uuid5,
  type Seed054, type SeedRow,
} from './lib'

export const DELTA_FILES = [
  'scripts/portions/data/drinks_delta_units.csv',
  'scripts/portions/data/drinks_delta_categories.csv',
  'scripts/portions/data/drinks_delta_words.csv',
] as const
export const RESEARCH_REPORT = 'docs/research/reports/Indian drink sizes.md'

type Category = Seed054['categories'][number]
export interface CategoryWordDelta { word: string; category: string; priority: number; head_only: boolean; replaces: string | null; note: string }
export interface UnitWordDelta { word: string; unit: Unit; size: Size | null; count: number | null; note: string }
export interface DrinkDelta {
  rows: SeedRow[]
  categories: Category[]
  words: CategoryWordDelta[]
  unitWords: UnitWordDelta[]
}

const readCsv = (name: string) => parseCsv(readFileSync(join(DATA, name), 'utf8'))
const num = (s: string): number | null => (s === '' ? null : Number(s))
const bool = (s: string, where: string): boolean => {
  if (s !== 'true' && s !== 'false') throw new Error(`${where}: not a boolean: ${s}`)
  return s === 'true'
}

export function loadDrinkDelta(): DrinkDelta {
  const rows = readCsv('drinks_delta_units.csv').map((c, i): SeedRow => {
    const where = `drinks_delta_units.csv row ${i + 2}`
    const scope = c.scope as SeedRow['scope']
    if (scope !== 'category' && scope !== 'food') throw new Error(`${where}: scope ${c.scope} (category or food only)`)
    const r = {
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
      is_default: bool(c.is_default, where),
      is_unit_default: bool(c.is_unit_default, where),
      source: c.source,
      grade: c.grade,
      status: c.status as SeedRow['status'],
      approved_by: c.approved_by || null,
      source_ref: c.source_ref,
      source_text: c.source_text || null,
      evidence: c.evidence,
      id: '',
      confidence: confidenceFor(scope, c.grade),
    } as SeedRow
    r.id = uuid5(NS_PORTION_UNITS, naturalKey(r))
    return r
  })
  const categories = readCsv('drinks_delta_categories.csv').map((c): Category => ({
    category: c.category,
    parent: c.parent || null,
    density_g_per_ml: num(c.density_g_per_ml),
    s_ratio: Number(c.s_ratio),
    l_ratio: Number(c.l_ratio),
    serving_unit: c.serving_unit || null,
    inherit_vessels: bool(c.inherit_vessels, `drinks_delta_categories.csv ${c.category}`),
    kcal100_min: num(c.kcal100_min),
    kcal100_max: num(c.kcal100_max),
    note: c.note,
  }))
  const words: CategoryWordDelta[] = []
  const unitWords: UnitWordDelta[] = []
  for (const w of readCsv('drinks_delta_words.csv')) {
    if (w.kind === 'category_word') {
      words.push({
        word: w.word, category: w.target, priority: Number(w.priority), head_only: bool(w.head_only, `word ${w.word}`),
        replaces: w.replaces || null, note: w.note,
      })
    } else if (w.kind === 'unit_word') {
      unitWords.push({ word: w.word, unit: w.target as Unit, size: (w.size || null) as Size | null, count: num(w.count), note: w.note })
    } else throw new Error(`drinks_delta_words.csv ${w.word}: kind ${w.kind}`)
  }
  return { rows, categories, words, unitWords }
}

// Throws on anything a later migration would trip over, or that would make the delta
// change real users' grams on insert. Rules:
//  - every row is 'proposed' with no approved_by (never active here), has a source_ref and cites the report;
//  - no id or natural key collides with 054's rows; promoting every row to active later violates none of
//    054's unique indexes (one active row per key; one is_default / is_unit_default per scope);
//  - new categories are new names, children of an existing category, and NEUTRAL: no density, the parent's
//    S/L ratios and inherit_vessels, no serving unit and no kcal clamp, so a chain through them weighs
//    exactly as the parent does until rows are promoted;
//  - a category-word re-point names the word's current 054 category (compare-and-swap); an insert is a new word;
//  - every unit word is one 054's vocabulary does NOT know today (otherwise it is no gap).
export function validateDrinkDelta(seed: Seed054, d: DrinkDelta): void {
  const errs: string[] = []
  const baseCats = new Map(seed.categories.map((c) => [c.category, c]))
  const allCats = new Map([...baseCats, ...d.categories.map((c) => [c.category, c] as const)])
  const unitList = new Set<string>([...UNITS, 'ml'])
  const SOURCES = ['research', 'mapping', 'legacy_hint']

  for (const c of d.categories) {
    if (!/^[a-z][a-z_]*$/.test(c.category)) errs.push(`category name ${c.category}`)
    if (baseCats.has(c.category)) errs.push(`category ${c.category} already in 054`)
    const p = c.parent ? baseCats.get(c.parent) : undefined
    if (!p) { errs.push(`category ${c.category}: parent ${c.parent} not in 054`); continue }
    if (c.density_g_per_ml !== null) errs.push(`category ${c.category}: density must be empty on insert (neutral)`)
    if (c.s_ratio !== p.s_ratio || c.l_ratio !== p.l_ratio) errs.push(`category ${c.category}: ratios must equal ${p.category}'s (neutral)`)
    if (c.inherit_vessels !== p.inherit_vessels) errs.push(`category ${c.category}: inherit_vessels must equal ${p.category}'s`)
    if (c.serving_unit !== null) errs.push(`category ${c.category}: serving_unit must be empty on insert (neutral)`)
    if (c.kcal100_min !== null || c.kcal100_max !== null) errs.push(`category ${c.category}: no kcal clamp on insert (neutral)`)
    if (!c.note.trim()) errs.push(`category ${c.category}: note`)
  }

  const baseWords = new Map(seed.words.map((w) => [w.word, w]))
  const seenWords = new Set<string>()
  for (const w of d.words) {
    if (w.word !== normText(w.word)) errs.push(`word ${w.word} not normalized`)
    if (seenWords.has(w.word)) errs.push(`word ${w.word} twice`)
    seenWords.add(w.word)
    if (!allCats.has(w.category)) errs.push(`word ${w.word}: category ${w.category} missing`)
    const cur = baseWords.get(w.word)
    if (w.replaces) {
      if (!cur) errs.push(`word ${w.word}: re-point of a word 054 does not have`)
      else if (cur.category !== w.replaces) errs.push(`word ${w.word}: 054 has it in ${cur.category}, not ${w.replaces}`)
    } else if (cur) errs.push(`word ${w.word}: already in 054 (${cur.category}); a change must name replaces`)
  }

  const seenUnitWords = new Set<string>()
  for (const u of d.unitWords) {
    if (u.word !== normText(u.word)) errs.push(`unit word ${u.word} not normalized`)
    if (seenUnitWords.has(u.word)) errs.push(`unit word ${u.word} twice`)
    seenUnitWords.add(u.word)
    if (!(UNITS as readonly string[]).includes(u.unit)) errs.push(`unit word ${u.word}: unit ${u.unit}`)
    if (u.count !== null && !(u.count > 0 && u.count <= 10)) errs.push(`unit word ${u.word}: count ${u.count}`)
    if (normalizeUnitWord(u.word) !== null) errs.push(`unit word ${u.word}: 054's vocabulary already reads it (no gap)`)
  }

  const ids = new Set(seed.rows.map((r) => r.id))
  const keys = new Set(seed.rows.map((r) => naturalKey(r)))
  const scopeKey = (r: SeedRow) => `${r.scope}|${r.food_item_id ?? r.fdc_id ?? r.category}`
  // the indexes as they would stand if every delta row were promoted next to 054's active rows
  const active = new Set<string>()
  const defaults = new Set<string>()
  const unitDefaults = new Set<string>()
  const index = (r: SeedRow, label: string) => {
    const k = `${scopeKey(r)}|${r.unit}|${r.size}|${r.context ?? ''}|${r.region ?? ''}`
    if (active.has(k)) errs.push(`${label}: two active rows for ${k} after promotion`)
    active.add(k)
    if (r.is_default) {
      const dk = `${scopeKey(r)}|${r.region ?? ''}|${r.context ?? ''}`
      if (defaults.has(dk)) errs.push(`${label}: two is_default rows for ${dk} after promotion`)
      defaults.add(dk)
    }
    if (r.is_unit_default) {
      const uk = `${scopeKey(r)}|${r.unit}|${r.region ?? ''}|${r.context ?? ''}`
      if (unitDefaults.has(uk)) errs.push(`${label}: two is_unit_default rows for ${uk} after promotion`)
      unitDefaults.add(uk)
    }
  }
  for (const r of seed.rows) if (r.status === 'active') index(r, '054')
  for (const r of d.rows) {
    const label = `delta ${naturalKey(r)}`
    if (ids.has(r.id)) errs.push(`${label}: id collides with 054`)
    if (keys.has(naturalKey(r))) errs.push(`${label}: natural key collides`)
    ids.add(r.id)
    keys.add(naturalKey(r))
    if (r.status !== 'proposed') errs.push(`${label}: status ${r.status} (the delta ships proposed only)`)
    if (r.approved_by) errs.push(`${label}: approved_by set (the founder's sign-off goes in the promotion migration)`)
    if (!SOURCES.includes(r.source)) errs.push(`${label}: source ${r.source}`)
    if (!r.source_ref.trim()) errs.push(`${label}: no source_ref`)
    if (!r.evidence.includes(RESEARCH_REPORT)) errs.push(`${label}: evidence must cite ${RESEARCH_REPORT}`)
    if (!unitList.has(r.unit)) errs.push(`${label}: unit`)
    if (!['S', 'M', 'L'].includes(r.size)) errs.push(`${label}: size`)
    if (r.region !== null && r.region !== 'IN' && r.region !== 'US') errs.push(`${label}: region`)
    if (r.context !== null && r.context !== 'home' && r.context !== 'restaurant') errs.push(`${label}: context`)
    if (r.category && !allCats.has(r.category)) errs.push(`${label}: category missing`)
    if (r.scope === 'food' && !/^[0-9a-f-]{36}$/.test(r.food_item_id ?? '')) errs.push(`${label}: food key`)
    if (r.grams === null && r.ml === null) errs.push(`${label}: no grams or ml`)
    if (r.unit === 'ml' && (r.grams === null || r.ml === null)) errs.push(`${label}: ml row needs both`)
    for (const v of [r.grams, r.ml]) if (v !== null && !(v > 0 && v <= 10000)) errs.push(`${label}: value ${v}`)
    if (r.category === 'generic' && ['piece', 'slice', 'packet', 'can', 'bottle'].includes(r.unit)) errs.push(`${label}: generic ${r.unit} row`)
    index(r, label)
  }
  // the delta must not be an 054 input: adding it can never change 054's inputs_sha256
  for (const f of DELTA_FILES) if ((INPUT_FILES as readonly string[]).includes(f)) errs.push(`${f} is an 054 input`)
  if (errs.length) throw new Error(`drink delta invalid:\n  ${errs.join('\n  ')}`)
}

// 054's seed with the delta applied: new categories added, re-pointed words moved, new words and rows added.
export function mergeDrinkDelta(seed: Seed054, d: DrinkDelta): Seed054 {
  const repoint = new Map(d.words.filter((w) => w.replaces).map((w) => [w.word, w]))
  const words: CategoryWord[] = seed.words.map((w) => {
    const r = repoint.get(w.word)
    return r ? { word: w.word, category: r.category, priority: r.priority, head_only: r.head_only } : w
  })
  for (const w of d.words) if (!w.replaces) words.push({ word: w.word, category: w.category, priority: w.priority, head_only: w.head_only })
  const rows = [...seed.rows, ...d.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { ...seed, categories: [...seed.categories, ...d.categories], words, rows }
}

export function drinkDeltaTables(seed: Seed054, d: DrinkDelta = loadDrinkDelta()) {
  validateDrinkDelta(seed, d)
  return engineTables(mergeDrinkDelta(seed, d))
}

// The delta's unit vocabulary in front of 054's (normalizeUnitWord): what the parse validator
// would read for a user's unit word once a later package wires it in. Exact phrase match after
// normText, with leading size words read as normalizeUnitWord does ("small kulhad" = cup S).
export function unitWordWithDelta(word: unknown, d: DrinkDelta = loadDrinkDelta()): UnitWordResult | null {
  if (typeof word !== 'string') return null
  const toks = normText(word).split(' ').filter((t) => t !== '' && t !== 'of')
  const map = new Map(d.unitWords.map((u) => [u.word, u]))
  let size: Size | null = null
  for (let start = 0; start < toks.length; start++) {
    const hit = map.get(toks.slice(start).join(' '))
    if (hit) return { unit: hit.unit, size: hit.size ?? size, count: hit.count, stated_amount: null, stated_unit: null }
    const sz = SIZE_WORDS.get(toks[start])
    if (sz === undefined) break
    size = sz
  }
  return normalizeUnitWord(word)
}
