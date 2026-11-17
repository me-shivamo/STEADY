// Builders for scripts/cuisine/emit.ts (and the jest test that regenerates its outputs in memory).
//
// Inputs (reviewed, DRAFT until the founder signs them off, plan Q15):
//   scripts/cuisine/data/indian_vocab.csv, western_vocab.csv, neutral_list.csv
//   scripts/usda/data/verified_fdc_snapshot.csv (live verified rows that carry an fdc_id, 2026-11-13, after 053)
// Outputs (generated, never hand-edited):
//   supabase/functions/_shared/cuisineVocab.ts     the compiled vocabulary cuisine.ts reads at run time
//   scripts/cuisine/data/usda_key_cuisine.csv       every key in the snapshot, classified by the vocabulary
//   scripts/cuisine/data/usda_indian_keys.csv       its Indian subset: the Indian keys held by rows that carry
//                                                   USDA data (review #16: "build the list from the snapshot
//                                                   by vocabulary, not by hand")
// Deterministic: rows sorted by byte order, nothing reads the clock.

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

import { phraseCuisine, type Cuisine, type VocabEntry } from '../../supabase/functions/_shared/cuisine'
import { normText } from '../../supabase/functions/_shared/portionText'
import { parseCsv } from '../portions/lib'

export const REPO = join(__dirname, '..', '..')
export const DATA = join(REPO, 'scripts', 'cuisine', 'data')
export const SNAPSHOT = join(REPO, 'scripts', 'usda', 'data', 'verified_fdc_snapshot.csv')
export const OUT_VOCAB = join(REPO, 'supabase', 'functions', '_shared', 'cuisineVocab.ts')
export const OUT_ALL_KEYS = join(DATA, 'usda_key_cuisine.csv')
export const OUT_INDIAN_KEYS = join(DATA, 'usda_indian_keys.csv')

export const VOCAB_FILES: ReadonlyArray<{ file: string; cuisine: Cuisine; header: string }> = [
  { file: 'indian_vocab.csv', cuisine: 'in', header: 'phrase,role,basis,status,note' },
  { file: 'western_vocab.csv', cuisine: 'west', header: 'phrase,role,basis,status,note' },
  { file: 'neutral_list.csv', cuisine: 'neutral', header: 'phrase,portion_category,basis,status,note' },
]
// founder: named in a founder decision; plan: in WP6's backfill list or review #16; indb: inside an INDB
// dish name (scripts/data/indb.json); live_key: inside a live key or alias (live_keys_snapshot.csv);
// ifct: an IFCT name; common: reviewer judgement only (needs the founder's eye first)
export const BASIS_TAGS: ReadonlySet<string> = new Set(['founder', 'plan', 'indb', 'live_key', 'ifct', 'common'])
export const STATUSES: ReadonlySet<string> = new Set(['draft', 'approved'])
// A phrase holding one of these never matches whole (cuisine.ts cuts the phrase there); "and" is allowed
// ("mac and cheese"), because a dish name joined by "and" keeps its full phrase.
const CUT_WORDS_NOT_AND: ReadonlySet<string> = new Set(['with', 'without', 'in', 'on', 'plus', 'topped', 'served'])

export interface VocabRow { file: string; phrase: string; cuisine: Cuisine; marker: boolean; basis: string[]; status: string }
export interface Vocab { rows: VocabRow[]; entries: VocabEntry[]; sha256: string }

const read = (path: string) => readFileSync(path, 'utf8')

export function loadVocab(dataDir: string = DATA): Vocab {
  const hash = createHash('sha256')
  const rows: VocabRow[] = []
  const seen = new Map<string, string>()
  for (const { file, cuisine, header } of VOCAB_FILES) {
    const text = read(join(dataDir, file))
    hash.update(`${file}\0${text}\0`)
    const first = text.split(/\r?\n/, 1)[0]
    if (first !== header) throw new Error(`${file}: header must be "${header}", got "${first}"`)
    for (const r of parseCsv(text)) {
      const phrase = r.phrase
      if (!phrase || normText(phrase) !== phrase) throw new Error(`${file}: "${phrase}" is not normalized (normText gives "${normText(phrase ?? '')}")`)
      const bad = phrase.split(' ').find((t) => CUT_WORDS_NOT_AND.has(t))
      if (bad) throw new Error(`${file}: "${phrase}" holds the cut word "${bad}" and could never match whole`)
      const prev = seen.get(phrase)
      if (prev) throw new Error(`${file}: "${phrase}" is already listed in ${prev}`)
      seen.set(phrase, file)
      const role = cuisine === 'neutral' ? 'word' : r.role
      if (role !== 'word' && role !== 'marker') throw new Error(`${file}: "${phrase}" role must be word or marker, got "${role}"`)
      const basis = r.basis.split(';').filter(Boolean)
      if (!basis.length || basis.some((b) => !BASIS_TAGS.has(b))) throw new Error(`${file}: "${phrase}" basis "${r.basis}" (allowed: ${[...BASIS_TAGS].join(', ')})`)
      if (!STATUSES.has(r.status)) throw new Error(`${file}: "${phrase}" status must be draft or approved, got "${r.status}"`)
      rows.push({ file, phrase, cuisine, marker: role === 'marker', basis, status: r.status })
    }
  }
  rows.sort((a, b) => (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0))
  const entries: VocabEntry[] = rows.map((r) => (r.marker ? [r.phrase, r.cuisine, true] : [r.phrase, r.cuisine]))
  return { rows, entries, sha256: hash.digest('hex') }
}

// ── supabase/functions/_shared/cuisineVocab.ts ────────────────────────────────
export function vocabModule(v: Vocab): string {
  const drafts = v.rows.filter((r) => r.status === 'draft').length
  const n = (c: Cuisine) => v.rows.filter((r) => r.cuisine === c).length
  const L: string[] = [
    '// GENERATED by scripts/cuisine/emit.ts from scripts/cuisine/data/{indian_vocab,western_vocab,neutral_list}.csv.',
    '// Do not edit: change the CSVs and run `npx tsx scripts/cuisine/emit.ts` (`--check` verifies this file).',
    `// ${v.rows.length} phrases (${n('in')} Indian, ${n('west')} Western, ${n('neutral')} neutral); ${drafts} still DRAFT (founder sign-off, plan Q15).`,
    '// Read only by cuisine.ts, which nothing in the resolver imports yet (WP6, RESOLVER_REGION default off).',
    '',
    "// [phrase (normText-normalized), cuisine, marker?]: a marker (Hindi grammar word) can tip a phrase but is never its head.",
    "export type VocabEntry = readonly [phrase: string, cuisine: 'in' | 'west' | 'neutral', marker?: true]",
    '',
    `export const CUISINE_VOCAB_SHA256 = '${v.sha256}'`,
    `export const CUISINE_VOCAB_DRAFT_ROWS = ${drafts}`,
    '',
    'export const CUISINE_VOCAB: ReadonlyArray<VocabEntry> = [',
    // phrases are normText output (letters, digits, spaces), so a plain quote is safe
    ...v.entries.map((e) => `  ['${e[0]}', '${e[1]}'${e[2] ? ', true' : ''}],`),
    ']',
    '',
  ]
  return L.join('\n')
}

// ── The snapshot's keys, classified ───────────────────────────────────────────
export const KEY_LIST_HEADER = 'normalized_name,food_item_id,fdc_id,source,has_portions,key_cuisine,matched_word,via'

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

interface KeyRow {
  normalized_name: string; food_item_id: string; fdc_id: string; source: string; has_portions: string
  key_cuisine: Cuisine; matched_word: string; via: string
}

export function keyLists(v: Vocab, snapshotPath: string = SNAPSHOT): { all: string; indian: string; counts: Record<Cuisine, number> } {
  const rows: KeyRow[] = parseCsv(read(snapshotPath)).map((r) => {
    const p = phraseCuisine(r.normalized_name, v.entries)
    return {
      normalized_name: r.normalized_name, food_item_id: r.food_item_id, fdc_id: r.fdc_id, source: r.source,
      has_portions: r.has_portions, key_cuisine: p.cuisine, matched_word: p.word ?? '', via: p.via,
    }
  })
  rows.sort((a, b) => (a.normalized_name < b.normalized_name ? -1 : a.normalized_name > b.normalized_name ? 1
    : a.food_item_id < b.food_item_id ? -1 : a.food_item_id > b.food_item_id ? 1 : 0))
  const line = (r: KeyRow) => [r.normalized_name, r.food_item_id, r.fdc_id, r.source, r.has_portions,
    r.key_cuisine, r.matched_word, r.via].map(csvField).join(',')
  const counts: Record<Cuisine, number> = { in: 0, west: 0, neutral: 0 }
  for (const r of rows) counts[r.key_cuisine]++
  return {
    all: [KEY_LIST_HEADER, ...rows.map(line), ''].join('\n'),
    indian: [KEY_LIST_HEADER, ...rows.filter((r) => r.key_cuisine === 'in').map(line), ''].join('\n'),
    counts,
  }
}

// Everything emit.ts writes, keyed by absolute path.
export function generate(): Map<string, string> {
  const v = loadVocab()
  const k = keyLists(v)
  return new Map([[OUT_VOCAB, vocabModule(v)], [OUT_ALL_KEYS, k.all], [OUT_INDIAN_KEYS, k.indian]])
}
