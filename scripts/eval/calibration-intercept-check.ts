// Calibration-statement intercept check (v1.2 follow-up build, WP0; review corrections #34 and #4).
//
//   npx tsx scripts/eval/calibration-intercept-check.ts                # offline gate, no network, no API cost
//   npx tsx scripts/eval/calibration-intercept-check.ts --real-users   # read-only replay on live, counts only
//
// WHY. The text endpoint runs parseCalibrationStatement() on each new (non-edit) message BEFORE the parse
// model (log-food-from-text/index.ts, the `tableMode && !editMealLogId` block). A match is answered as a
// calibration ("saved: your cup is 350 ml") and is never logged. Today that runs in table mode only, which no
// real user is on; WP3 (personalization in every mode) puts it in front of every legacy user. A false match on
// a food log silently loses that log, so the parser must stay narrow. This script measures that on every text
// we hold, before WP3 ships and after any change to _shared/portionCalibration.ts.
//
// Offline mode (the WP0/WP3 gate; also enforced in jest by __tests__/unit/calibrationInterceptCheck.test.ts)
//   Runs the parser over the `text` of every case in dataset-intent.json, dataset-v3.json, dataset-edge.json
//   and dataset-smoke-phase3.json. PASS = 0 intercepts (exit 0); any intercept lists the case id, kind and
//   text (synthetic, safe to print) and exits 1. A case with no string `text` fails too, so a format change
//   cannot skip cases silently. dataset-v4.json is the held-out set: this script never reads it and refuses it.
//
// --real-users (review #34: real legacy users are the population going live; Gate A style)
//   Runs `npx supabase db query --linked -o csv -f scripts/eval/calibration-intercept-real-users.sql` from the
//   repo root (needs the CLI login and the linked project; read-only SELECT). That returns real users' own chat
//   messages (role 'user', @steadyapp.internal accounts excluded). The output is held in memory only: it is
//   never written to disk, never printed, and no error path echoes it. The script prints COUNTS ONLY: messages
//   and users read, how many of them became food logs (a check that the `logged` column works), how many
//   would be intercepted (and from how many users), by kind, and how many of those were sent as food logs.
//   Exit 0 when no message that became a food log would be intercepted, 1 when at least one would (each one is
//   a real log the intercept would have answered instead; someone with live access reviews those rows by
//   hand), 2 when the query fails or its output has an unexpected shape.
//   Counts are an upper bound on what the endpoint would answer: handleCalibrationStatement() can still
//   decline a match (an unknown food word, an implausible amount), and edit texts are counted although the
//   intercept skips edits.
//
// Kinds: set_amount ("my cup is 350 ml"), set_size_word ("my katori is small"), set_piece ("my roti is 50 g"),
// revoke_unit ("forget my cup size"), revoke_all ("forget my portion sizes"), list ("what are my portion sizes").

import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { basename, join } from 'path'

import { parseCalibrationStatement } from '../../supabase/functions/_shared/portionCalibration'

export const DATASETS = ['dataset-intent.json', 'dataset-v3.json', 'dataset-edge.json', 'dataset-smoke-phase3.json'] as const
export const EVAL_DIR = __dirname
const REPO = join(__dirname, '..', '..')
export const REAL_USERS_SQL = join(__dirname, 'calibration-intercept-real-users.sql')
const HELD_OUT = /dataset-v4/i

export const KINDS = ['set_amount', 'set_size_word', 'set_piece', 'revoke_unit', 'revoke_all', 'list'] as const
export type InterceptKind = (typeof KINDS)[number]

// What the endpoint's intercept would do with this message: null = goes on to the parse model as usual.
export function interceptKind(text: unknown): InterceptKind | null {
  const i = parseCalibrationStatement(text)
  if (!i) return null
  if (i.kind === 'list') return 'list'
  if (i.kind === 'revoke') return i.all ? 'revoke_all' : 'revoke_unit'
  if (i.pieceOfFood) return 'set_piece'
  return i.as_size ? 'set_size_word' : 'set_amount'
}

// ── Offline: the synthetic datasets ───────────────────────────────────────────
export interface DatasetHit { file: string; id: string; kind: InterceptKind | 'no_text'; text: string }
export interface DatasetReport { perFile: Array<{ file: string; texts: number; intercepted: number }>; texts: number; hits: DatasetHit[] }

export function checkDatasets(files: readonly string[] = DATASETS, dir: string = EVAL_DIR): DatasetReport {
  for (const f of files) if (HELD_OUT.test(basename(f))) throw new Error(`${basename(f)} is the held-out set: this check never reads it`)
  const perFile: DatasetReport['perFile'] = []
  const hits: DatasetHit[] = []
  for (const f of files) {
    const cases: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (!Array.isArray(cases)) throw new Error(`${f}: expected a JSON array of cases`)
    let texts = 0
    let intercepted = 0
    for (const c of cases as Array<{ id?: unknown; text?: unknown }>) {
      const id = String(c?.id ?? '?')
      if (typeof c?.text !== 'string') { hits.push({ file: f, id, kind: 'no_text', text: '' }); intercepted++; continue }
      texts++
      const kind = interceptKind(c.text)
      if (kind) { hits.push({ file: f, id, kind, text: c.text }); intercepted++ }
    }
    perFile.push({ file: f, texts, intercepted })
  }
  return { perFile, texts: perFile.reduce((s, p) => s + p.texts, 0), hits }
}

// ── --real-users: counts only ─────────────────────────────────────────────────
export interface RealUserReport {
  messages: number
  users: number
  loggedMessages: number   // all messages that became food logs: a sanity check that the logged column works
  intercepted: number
  interceptedUsers: number
  byKind: Record<InterceptKind, number>
  interceptedLogged: number
  interceptedNotLogged: number
}

// RFC 4180, as the CLI writes it: quoted fields may hold commas, doubled quotes and newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Rows are [u, logged, text] without the header. The result holds numbers only, never any text, and no error
// message quotes a cell.
export function countRealUsers(rows: readonly string[][]): RealUserReport {
  const users = new Set<string>()
  const hitUsers = new Set<string>()
  const byKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<InterceptKind, number>
  let intercepted = 0
  let interceptedLogged = 0
  let loggedMessages = 0
  for (const [n, r] of rows.entries()) {
    if (r.length !== 3) throw new Error(`unexpected query output: data row ${n + 1} has ${r.length} columns, expected 3`)
    const [u, logged, text] = r
    if (!['true', 'false', 't', 'f'].includes(logged)) throw new Error(`unexpected query output: data row ${n + 1} has a non-boolean logged column`)
    users.add(u)
    const wasLog = logged === 'true' || logged === 't'
    if (wasLog) loggedMessages++
    const kind = interceptKind(text)
    if (!kind) continue
    intercepted++
    hitUsers.add(u)
    byKind[kind]++
    if (wasLog) interceptedLogged++
  }
  return {
    messages: rows.length, users: users.size, loggedMessages, intercepted, interceptedUsers: hitUsers.size, byKind,
    interceptedLogged, interceptedNotLogged: intercepted - interceptedLogged,
  }
}

function readRealUserRows(): string[][] {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'csv', '-f', REAL_USERS_SQL], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch (e) {
    // Never print the error object: it carries the captured stdout, which is user text.
    throw new Error(`supabase db query failed (exit ${(e as { status?: number }).status ?? '?'}); the CLI's own message is above`)
  }
  const rows = parseCsv(out)
  const head = rows.shift()
  if (!head || head.join(',') !== 'u,logged,text') {
    throw new Error(`unexpected query output: the header has ${head?.length ?? 0} columns, expected u,logged,text`)
  }
  return rows
}

const KIND_LABEL: Record<InterceptKind, string> = {
  set_amount: 'set: an amount for a unit',
  set_size_word: 'set: a size word',
  set_piece: 'set: grams for a piece of food',
  revoke_unit: 'revoke: one unit',
  revoke_all: 'revoke: everything',
  list: 'list',
}

export function formatRealUsers(r: RealUserReport): string {
  const pad = (s: string) => s.padEnd(36)
  const lines = [
    'Calibration-statement intercept replay on real users (read-only, live; counts only, no text printed)',
    `  ${pad('user messages read')}${r.messages}  (from ${r.users} users; eval accounts excluded)`,
    `  ${pad('of all messages, sent as a food log')}${r.loggedMessages}`,
    `  ${pad('would be intercepted')}${r.intercepted}  (from ${r.interceptedUsers} users)`,
    ...KINDS.map((k) => `    ${KIND_LABEL[k].padEnd(34)}${r.byKind[k]}`),
    `  ${pad('of those, sent as a food log')}${r.interceptedLogged}`,
    `  ${pad('of those, not a food log')}${r.interceptedNotLogged}`,
    'Upper bound: the endpoint can still decline a match (unknown food word, implausible amount), and edits are counted.',
    r.interceptedLogged === 0
      ? 'RESULT: PASS (no message that became a food log would be intercepted)'
      : `RESULT: REVIEW (${r.interceptedLogged} message(s) that became food logs would be answered as calibration statements instead; review those rows by hand with live access, this script never prints them)`,
  ]
  return lines.join('\n')
}

export function formatDatasets(r: DatasetReport): string {
  const width = Math.max(...r.perFile.map((p) => p.file.length), 5) + 2
  const total = r.hits.length
  return [
    'Calibration-statement intercept check (offline: parseCalibrationStatement over the synthetic sets)',
    ...r.perFile.map((p) => `  ${p.file.padEnd(width)}${String(p.texts).padStart(4)} texts  ${p.intercepted} intercepted`),
    `  ${'total'.padEnd(width)}${String(r.texts).padStart(4)} texts  ${total} intercepted`,
    ...r.hits.map((h) => `  FAIL ${h.file} ${h.id} ${h.kind}${h.text ? `  ${JSON.stringify(h.text)}` : ''}`),
    total === 0 ? 'PASS: 0 intercepts (dataset-v4.json is held out and was not read)' : `FAIL: ${total} intercept(s)`,
  ].join('\n')
}

function main(): void {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--real-users')
  if (unknown.length) {
    console.error('usage: npx tsx scripts/eval/calibration-intercept-check.ts [--real-users]')
    process.exit(2)
  }
  if (args.includes('--real-users')) {
    let report: RealUserReport
    try {
      report = countRealUsers(readRealUserRows())
    } catch (e) {
      console.error(`calibration-intercept-check --real-users: ${(e as Error).message}`)
      process.exit(2)
    }
    console.log(formatRealUsers(report))
    process.exit(report.interceptedLogged === 0 ? 0 : 1)
  }
  const report = checkDatasets()
  console.log(formatDatasets(report))
  process.exit(report.hits.length === 0 ? 0 : 1)
}

if (require.main === module) main()
