// ── food_items audit (v1.2 Phase 3) ──────────────────────────────────────────
// One read-only tool for the three moments the trust migration (050) needs:
//
//   npx tsx scripts/audit-food-items.ts --pre
//       BEFORE 050. Recomputes, in TypeScript, the status 050 §4 would give
//       every row and every self-check 050 §10 would run, so a migration that
//       would abort is caught before anyone types `db push`.
//       Expected on 2026-11-12 data: verified ≈1635, quarantined ≈177,
//       unverified ≈381, memory backfill ≈165.
//
//   npx tsx scripts/audit-food-items.ts --check [--since=<iso>]
//       AFTER 050. Exits 1 on any failure:
//         1. parity — every row 050 or the resolver judged is re-judged by
//            validate.ts and must land in the same status with the same codes;
//         2. fixture parity — the 40 shared fixtures through the DATABASE's
//            food_item_issues() must equal validate.ts (the two rule sets agree);
//         3. invariants — no keyed non-verified row, no owned/non-reference
//            verified row, no memory pointer at a quarantined or foreign row,
//            no rough estimate in memory; and with --since, no new ownerless
//            row, no new key, no new 200/8/25/8 placeholder.
//
//   npx tsx scripts/audit-food-items.ts --report [--since=<iso>] [--out=docs/audits]
//       AFTER 050. Writes docs/audits/food-items-YYYY-MM-DD.md (counts, and
//       names of reference data only, safe to commit) and
//       scripts/audit/out/*.json (gitignored, full names). The review queue
//       for the follow-up curation migration.
//
// No flag = --report. Flags combine (--check --report).
//
// Ground rules:
//   * Read-only. Service-role client, .select() and the read-only
//     food_item_issues() RPC only. (050's guard would block a write anyway.)
//   * Never prints a secret, an email or a user id. User ids live only in
//     memory, as set members and counts; created_by becomes `private` at once.
//   * The markdown (which git tracks) names only reference data: ownerless
//     usda/indb/ifct rows, i.e. public datasets. Every other row's name is
//     something a user typed or photographed (a private estimate, a label
//     scan, a personal USDA pick, or an AI row created from a user's phrase),
//     so it appears there as `<id8> (user text)`; full names stay in the
//     gitignored JSON.
//   * Every read is paged (PostgREST caps a response at 1,000 rows).
//
// Reads scripts/eval/.env.local, like the eval scripts (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY). Optional EXCLUDE_USER_IDS=<uuid>,<uuid> adds test
// accounts to the @steadyapp.internal ones (founder decision D4: only the eval
// account is excluded by default).

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'

import {
  atwaterBounds, foodItemIssues, fromRow, isBlocking, isReferenceSource, toNumber, REFERENCE_SOURCES, RULES_VERSION,
  ISSUE_ORDER, type IssueCode,
} from '../supabase/functions/_shared/validate.ts'
import { normalizeName } from '../supabase/functions/_shared/macroResolver.ts'
import { ISSUE_FIXTURES } from './audit/validate-fixtures.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, 'eval', '.env.local') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in scripts/eval/.env.local.')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const flag = (name: string) => process.argv.includes(`--${name}`)
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const PRE = flag('pre')
const CHECK = flag('check')
const REPORT = flag('report') || (!PRE && !CHECK)
const SINCE = arg('since')
const OUT_DIR = arg('out') ?? 'docs/audits'
if (SINCE && Number.isNaN(Date.parse(SINCE))) {
  console.error(`--since must be an ISO timestamp (got "${SINCE}")`)
  process.exit(1)
}

// 050 §4's reviewed list (founder decision D3), mirrored so --pre predicts it.
const MANUAL_050: Record<string, string> = {
  '3d077dc1-6de5-4f70-8a56-673b3b888f8d': 'water_mass_counted',
  '3fe307de-24b4-4fd9-8149-7c6e5fda855c': 'dry_basis',
  'a211eb87-02ab-46cc-94ab-6d3e2ff56bba': 'dry_basis',
  'd5788ae3-bce1-4302-9351-6ea892e50efc': 'dry_basis',
  'f5b01048-cb53-41f7-99e7-02dabc75f960': 'implausibly_low',
  '9fbdbb65-3ecf-4c20-ade2-97692286ccab': 'implausibly_low',
  'd7712913-933b-422e-8ab3-54f33374eb72': 'implausibly_low',
  'afb89caa-339b-492f-b288-9aad155cb528': 'dry_mix_suspected',
}
const KACHORI_ID = '5e470c02-c05c-4081-8577-9c7d0d7c5c85'

// ── Types (only the columns the audit needs) ────────────────────────────────
interface ItemRow {
  id: string
  source: string | null
  name: string
  normalized_name: string | null
  created_by: string | null
  created_at: string | null
  calories_per_100g: number | null
  protein_per_100g: number | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
  fiber_per_100g: number | null
  fdc_id: number | null
  portions: unknown
  // 050 columns (absent before it)
  status?: string
  status_reason?: string | null
  parked_normalized_name?: string | null
}
interface EntryRow { food_item_id: string | null; user_id: string; macro_source: string | null; created_at: string | null }
interface MemoryRow { user_id: string; normalized_name: string; food_item_id: string; origin: string }

// ── Reads ───────────────────────────────────────────────────────────────────
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

// food_items rows a reviewed migration derived (053+): the ids in public.food_derivation_items. Empty before 053
// created the table (the read fails with "relation does not exist", which is not an audit failure).
// (Not fetchAll: that orders by id, and this table's key is food_item_id.)
async function derivedItemIds(): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('food_derivation_items').select('food_item_id')
      .order('food_item_id').range(from, from + 999)
    if (error) {
      console.log(`(food_derivation_items not readable, so no row is exempt as migration-derived: ${error.message})`)
      return new Set()
    }
    for (const r of (data ?? []) as { food_item_id: string }[]) out.add(r.food_item_id)
    if (!data || data.length < 1000) return out
  }
}

async function has050(): Promise<boolean> {
  const { error } = await supabase.from('food_items').select('status').limit(1)
  return !error
}

async function testAccountIds(): Promise<Set<string>> {
  const ids = new Set<string>((process.env.EXCLUDE_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    for (const u of data.users) if ((u.email ?? '').toLowerCase().endsWith('@steadyapp.internal')) ids.add(u.id)
    if (data.users.length < 1000) return ids
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────
const isRef = (s: string | null) => REFERENCE_SOURCES.includes(s ?? '')
const issuesOf = (r: ItemRow) => foodItemIssues(r.source, r.name, fromRow(r))
const id8 = (id: string) => id.slice(0, 8)
const num = (x: unknown) => {
  const v = toNumber(x)
  return v === null || Number.isNaN(v) ? 0 : v
}
const fmt = (x: unknown, d = 1) => (x === null || x === undefined ? '–' : num(x).toFixed(d).replace(/\.0+$/, ''))
const median = (xs: number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return m
}
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
const reasonCodes = (reason: string | null | undefined) =>
  (reason ?? '').includes(':') ? (reason ?? '').slice((reason ?? '').indexOf(':') + 1).split(',').filter(Boolean) : []

// Usage of every food_items row by REAL users (test accounts excluded).
function usage(entries: EntryRow[], test: Set<string>) {
  const byItem = new Map<string, { entries: number; users: Set<string> }>()
  for (const e of entries) {
    if (!e.food_item_id || test.has(e.user_id)) continue
    const u = byItem.get(e.food_item_id) ?? { entries: 0, users: new Set<string>() }
    u.entries++
    u.users.add(e.user_id)
    byItem.set(e.food_item_id, u)
  }
  return (id: string) => {
    const u = byItem.get(id)
    return { entries: u?.entries ?? 0, users: u?.users.size ?? 0 }
  }
}

// ── --pre: predict 050 ──────────────────────────────────────────────────────
// Same CASE, same order as 050 §4.
function proposed(r: ItemRow): { status: string; reason: string } {
  const iss = issuesOf(r)
  const why = MANUAL_050[r.id]
  const keyedRef = isRef(r.source) && r.created_by === null && r.normalized_name !== null
  if (r.calories_per_100g === null) return { status: 'unverified', reason: 'legacy_per_serving' }
  if (why) return { status: 'quarantined', reason: `manual_050:${why}` }
  if (iss.length > 0) return { status: 'quarantined', reason: `auto_050:${iss.join(',')}` }
  if (keyedRef) return { status: 'verified', reason: 'rules_v1_pass' }
  if (r.normalized_name !== null) return { status: 'unverified', reason: 'unshared_050' }
  return { status: 'unverified', reason: 'private' }
}

async function runPre(): Promise<boolean> {
  if (await has050()) console.warn('Note: food_items already has a status column — 050 looks applied. Predicting from current keys anyway.\n')
  const [items, entries, profiles, test] = await Promise.all([
    fetchAll<ItemRow>('food_items',
      'id, source, name, normalized_name, created_by, created_at, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, fdc_id, portions'),
    fetchAll<EntryRow & { id: string }>('food_entries', 'id, food_item_id, user_id, macro_source, created_at'),
    fetchAll<{ id: string }>('profiles', 'id'),
    testAccountIds(),
  ])
  const plan = new Map(items.map((r) => [r.id, proposed(r)]))
  const byStatus = countBy(items, (r) => plan.get(r.id)!.status)
  const bySourceStatus = countBy(items, (r) => `${r.source ?? 'null'} × ${plan.get(r.id)!.status}`)
  const byReason = countBy(items, (r) => plan.get(r.id)!.reason.split(':')[0])

  // 050 §9: (user, parked key) pairs from entries whose numbers came from an
  // un-shared AI/label row; real users with a profile only; ON CONFLICT
  // (user_id, normalized_name) DO NOTHING keeps the first per pair.
  const profileIds = new Set(profiles.map((p) => p.id))
  const itemById = new Map(items.map((r) => [r.id, r]))
  const pairs = new Set<string>()
  const memUsers = new Set<string>()
  const memItems = new Set<string>()
  for (const e of entries) {
    const fi = e.food_item_id ? itemById.get(e.food_item_id) : undefined
    if (!fi || plan.get(fi.id)!.reason !== 'unshared_050') continue
    if (!['ai_estimated', 'label'].includes(fi.source ?? '') || e.macro_source !== fi.source) continue
    if (!fi.normalized_name || test.has(e.user_id) || !profileIds.has(e.user_id)) continue
    pairs.add(`${e.user_id}|${fi.normalized_name}`)
    memUsers.add(e.user_id)
    memItems.add(fi.id)
  }

  console.log(`food_items: ${items.length} rows (rules v${RULES_VERSION}, ${test.size} test account(s) excluded)\n`)
  console.log('Proposed status (050 §4):')
  for (const s of ['verified', 'quarantined', 'unverified']) console.log(`  ${s.padEnd(12)} ${byStatus.get(s) ?? 0}`)
  console.log('  expected on 2026-11-12: verified 1635, quarantined 177, unverified 381\n')
  console.log('By source × status:')
  for (const [k, n] of [...bySourceStatus].sort()) console.log(`  ${k.padEnd(28)} ${n}`)
  console.log('\nBy reason:')
  for (const [k, n] of [...byReason].sort()) console.log(`  ${k.padEnd(20)} ${n}`)
  console.log(`\nMemory backfill (050 §9): ~${pairs.size} rows, ${memUsers.size} users, ${memItems.size} food_items  (expected ~165 / 18 / 135)`)

  // 050 §10's self-checks, predicted.
  const fails: string[] = []
  const verified = byStatus.get('verified') ?? 0
  if (verified < 1500) fails.push(`only ${verified} verified rows (050 aborts below 1500)`)
  const kachori = plan.get(KACHORI_ID)
  if (kachori?.status !== 'quarantined') fails.push(`INDB Khasta kachori would be ${kachori?.status ?? 'missing'} (050 expects quarantined)`)
  if (pairs.size < 100) fails.push(`memory backfill would write only ${pairs.size} rows (050 aborts below 100)`)
  const missingManual = Object.keys(MANUAL_050).filter((id) => !itemById.has(id))
  if (missingManual.length) console.warn(`\nNote: ${missingManual.length} manual-list id(s) no longer exist: ${missingManual.map(id8).join(', ')}`)

  if (fails.length) {
    console.error('\nPRE-FLIGHT FAILED — 050 would abort and roll back:')
    for (const f of fails) console.error(`  ✗ ${f}`)
    return false
  }
  console.log('\nPre-flight OK: every 050 §10 self-check would pass.')
  return true
}

// ── --check: parity + invariants ────────────────────────────────────────────
async function runCheck(items: ItemRow[], memory: MemoryRow[]): Promise<boolean> {
  const fails: string[] = []
  const fail = (msg: string, examples: string[] = []) =>
    fails.push(examples.length ? `${msg}: ${examples.slice(0, 5).join('; ')}${examples.length > 5 ? ` (+${examples.length - 5} more)` : ''}` : msg)

  // 1. Parity: re-judge every row 050 or the resolver judged by the rules.
  const parity: string[] = []
  const roughBad: string[] = []
  const passReasonBad: string[] = []
  for (const r of items) {
    const reason = r.status_reason ?? ''
    const iss = issuesOf(r)
    if (reason === 'rules_v1_pass' || reason.startsWith('auto_050:') || reason.startsWith(`auto_v${RULES_VERSION}:`)) {
      const keyedRef = isRef(r.source) && r.created_by === null && r.normalized_name !== null
      const expected = keyedRef && iss.length === 0 ? 'verified' : 'quarantined'
      if (r.status !== expected || !sameSet(iss, reasonCodes(reason))) {
        parity.push(`${id8(r.id)} ${r.name} [${r.source}] is ${r.status}/${reason}, rules say ${expected}/${iss.join(',') || 'pass'}`)
      }
    } else if (reason.startsWith('rough_v')) {
      // D5 rough estimates: the stored numbers (repaired, or a doubtful guess
      // kept as given) must be possible and private, and the status must
      // reflect those STORED numbers.
      const expected = iss.length > 0 ? 'quarantined' : 'unverified'
      if (isBlocking(iss) || r.created_by === null || r.normalized_name !== null || r.status !== expected) {
        roughBad.push(`${id8(r.id)} ${r.name} ${r.status} [${iss.join(',') || 'pass'}]`)
      }
    } else if ((reason === 'private' || reason === 'unshared_050') && r.calories_per_100g !== null) {
      // 050 quarantined every failing row first, and the resolver marks only
      // clean rows 'private', so these must all pass.
      if (iss.length > 0 || r.status !== 'unverified') passReasonBad.push(`${id8(r.id)} ${r.name} ${r.status} [${iss.join(',')}]`)
    }
  }
  if (parity.length) fail(`${parity.length} row(s) disagree with rules v${RULES_VERSION}`, parity)
  if (roughBad.length) fail(`${roughBad.length} rough-estimate row(s) are impossible, shared or mislabelled`, roughBad)
  if (passReasonBad.length) fail(`${passReasonBad.length} private/unshared row(s) fail the rules`, passReasonBad)

  // 2. Fixture parity with the DATABASE's rules.
  const fxBad: string[] = []
  for (const f of ISSUE_FIXTURES) {
    const { data, error } = await supabase.rpc('food_item_issues', {
      p_source: f.source, p_name: f.name, p_kcal: f.kcal,
      p_protein: f.protein, p_carbs: f.carbs, p_fat: f.fat, p_fiber: f.fiber,
    })
    if (error) { fail(`food_item_issues() RPC failed: ${error.message}`); break }
    const sql = (data ?? []) as string[]
    const ts = foodItemIssues(f.source, f.name, { calories: f.kcal, protein_g: f.protein, carbs_g: f.carbs, fat_g: f.fat, fiber_g: f.fiber })
    if (JSON.stringify(sql) !== JSON.stringify(ts) || JSON.stringify(ts) !== JSON.stringify(f.expected)) {
      fxBad.push(`#${f.id} ${f.name}: sql ${JSON.stringify(sql)} ts ${JSON.stringify(ts)} expected ${JSON.stringify(f.expected)}`)
    }
  }
  if (fxBad.length) fail(`${fxBad.length} fixture(s) differ between SQL and TS`, fxBad)

  // 3. Invariants.
  const keyedBad = items.filter((r) => r.normalized_name !== null && (r.status !== 'verified' || !isRef(r.source)))
  if (keyedBad.length) fail(`${keyedBad.length} non-verified or non-reference row(s) hold a shared key`, keyedBad.map((r) => `${id8(r.id)} ${r.name}`))
  const verifiedBad = items.filter((r) => r.status === 'verified' && (!isRef(r.source) || r.created_by !== null || r.calories_per_100g === null))
  if (verifiedBad.length) fail(`${verifiedBad.length} verified row(s) are owned, non-reference or per-serving`, verifiedBad.map((r) => `${id8(r.id)} ${r.name}`))

  const itemById = new Map(items.map((r) => [r.id, r]))
  const memBad: string[] = []
  for (const m of memory) {
    const t = itemById.get(m.food_item_id)
    const ok = t && t.status !== 'quarantined' && t.calories_per_100g !== null && (
      t.status === 'verified' || t.created_by === m.user_id ||
      (t.created_by === null && !!t.parked_normalized_name && ['ai_estimated', 'label'].includes(t.source ?? ''))
    )
    if (!ok) memBad.push(`${m.origin} → ${t ? `${id8(t.id)} ${t.name} (${t.status})` : 'missing row'}`)
    if (t && (t.status_reason ?? '').startsWith('rough_v')) memBad.push(`${m.origin} → rough estimate ${id8(t.id)} ${t.name}`)
  }
  if (memBad.length) fail(`${memBad.length} memory pointer(s) target an unusable row`, memBad)

  if (SINCE) {
    const t0 = Date.parse(SINCE)
    // Rows a reviewed migration created on purpose are not "new rows" in this sense: migration 053 inserts
    // verified, ownerless, keyed reference rows (recalculated Indian dishes, status_reason
    // 'reviewed:053:recalc_v1:<variant>'; after its down script they stay, quarantined, as
    // 'reviewed:rollback_053'), which is exactly what the checks below forbid the resolver to create.
    // The exemption is keyed on public.food_derivation_items, not on status_reason: 050's guard keeps the API
    // roles off the status columns on UPDATE, but an API-role INSERT of an unverified or quarantined row keeps
    // the status_reason it supplies, so a prefix alone could be forged. food_derivation_items is written by
    // migrations only (053 revokes every API-role privilege on it), and the rows must also be ownerless. Before
    // 053 the table does not exist and nothing is exempt. Every invariant above still covers these rows.
    const derived = await derivedItemIds()
    const reviewed = (r: ItemRow) => derived.has(r.id) && r.created_by === null &&
      /^reviewed:(053:|rollback_053$)/.test(r.status_reason ?? '')
    const created = items.filter((r) => r.created_at && Date.parse(r.created_at) > t0)
    const fresh = created.filter((r) => !reviewed(r))
    const exempt = created.length - fresh.length
    if (exempt) console.log(`Since ${SINCE}: ${exempt} row(s) created by migration 053 (in food_derivation_items), exempt from the new-row checks.`)
    const ownerless = fresh.filter((r) => r.created_by === null)
    if (ownerless.length) fail(`${ownerless.length} row(s) created since ${SINCE} have no owner`, ownerless.map((r) => `${id8(r.id)} ${r.name}`))
    const keyed = fresh.filter((r) => r.normalized_name !== null)
    if (keyed.length) fail(`${keyed.length} row(s) created since ${SINCE} hold a shared key`, keyed.map((r) => `${id8(r.id)} ${r.name}`))
    const freshVerified = fresh.filter((r) => r.status === 'verified')
    if (freshVerified.length) fail(`${freshVerified.length} row(s) created since ${SINCE} are verified`, freshVerified.map((r) => `${id8(r.id)} ${r.name}`))
    const placeholder = fresh.filter((r) => issuesOf(r).includes('generic_placeholder'))
    if (placeholder.length) fail(`${placeholder.length} placeholder row(s) (200/8/25/8) since ${SINCE}`, placeholder.map((r) => `${id8(r.id)} ${r.name}`))
    console.log(`Since ${SINCE}: ${fresh.length} new row(s) checked.`)
  } else {
    console.log('(No --since given: the new-row invariants were skipped.)')
  }

  if (fails.length) {
    console.error(`\nCHECK FAILED (${fails.length}):`)
    for (const f of fails) console.error(`  ✗ ${f}`)
    return false
  }
  console.log(`\nCheck OK: ${items.length} rows, ${memory.length} memory pointers, ${ISSUE_FIXTURES.length} fixtures — SQL and TS agree.`)
  return true
}

// ── --report ────────────────────────────────────────────────────────────────
function runReport(
  items: ItemRow[], entries: EntryRow[], memory: MemoryRow[],
  savedItemIds: Set<string>, test: Set<string>,
): void {
  const use = usage(entries, test)
  const itemById = new Map(items.map((r) => [r.id, r]))
  const md: string[] = []
  const json: Record<string, unknown> = { generated_at: new Date().toISOString(), rules_version: RULES_VERSION, since: SINCE ?? null }
  const table = (head: string[], rows: Array<Array<string | number>>) => {
    if (!rows.length) { md.push('_none_', ''); return }
    md.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`)
    for (const r of rows) md.push(`| ${r.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`)
    md.push('')
  }
  const kcalRange = (r: ItemRow) => {
    const { lo, hi, tol } = atwaterBounds(num(r.calories_per_100g), num(r.protein_per_100g), num(r.carbs_per_100g),
      num(r.fat_per_100g), num(r.fiber_per_100g), r.name)
    return `${Math.round(lo - tol)}–${Math.round(hi + tol)}`
  }
  const macros = (r: ItemRow) =>
    `${fmt(r.protein_per_100g)}/${fmt(r.carbs_per_100g)}/${fmt(r.fat_per_100g)}/${fmt(r.fiber_per_100g)}`
  const verified = items.filter((r) => r.status === 'verified')
  const byUse = (a: ItemRow, b: ItemRow) => use(b.id).entries - use(a.id).entries || a.name.localeCompare(b.name)
  // What the committable markdown may print as a row's name (see Ground rules).
  const shownName = (r: ItemRow) =>
    isReferenceSource(r.source) && r.created_by === null ? r.name : `${id8(r.id)} (user text)`

  md.push(`# food_items audit — ${new Date().toISOString().slice(0, 10)}`, '',
    `Rules v${RULES_VERSION}. ${items.length} rows, ${memory.length} memory pointers. Usage counts exclude ${test.size} test account(s).`,
    'Generated by `npx tsx scripts/audit-food-items.ts --report`. Counts, and names of reference data only; ' +
    'rows named from user text show as `<id> (user text)` (full names: scripts/audit/out/, gitignored).', '')

  // 1. Overview
  md.push('## 1. Overview', '', '### Source × status × reason', '')
  const ssr = countBy(items, (r) => `${r.source ?? 'null'}\t${r.status}\t${(r.status_reason ?? 'null').split(':')[0]}`)
  table(['source', 'status', 'reason', 'rows'], [...ssr].sort().map(([k, n]) => [...k.split('\t'), n]))
  md.push('### Memory pointers by origin', '')
  table(['origin', 'rows'], [...countBy(memory, (m) => m.origin)].sort().map(([k, n]) => [k, n]))
  json.overview = Object.fromEntries(ssr)
  if (SINCE) {
    const t0 = Date.parse(SINCE)
    const fresh = items.filter((r) => r.created_at && Date.parse(r.created_at) > t0)
    md.push(`### Growth since ${SINCE}`, '')
    table(['source', 'status', 'new rows'], [...countBy(fresh, (r) => `${r.source}\t${r.status}`)].sort().map(([k, n]) => [...k.split('\t'), n]))
  }

  // 2. Quarantined rows by code, real-user usage first
  md.push('## 2. Quarantined rows', '')
  const quarantined = items.filter((r) => r.status === 'quarantined').sort(byUse)
  for (const code of [...ISSUE_ORDER, 'manual'] as Array<IssueCode | 'manual'>) {
    const rows = quarantined.filter((r) => code === 'manual'
      ? (r.status_reason ?? '').startsWith('manual_')
      : reasonCodes(r.status_reason).includes(code))
    if (!rows.length) continue
    md.push(`### ${code} (${rows.length})`, '')
    table(['id', 'name', 'source', 'kcal', 'P/C/F/fiber', 'allowed kcal', 'entries', 'users', 'saved'],
      rows.map((r) => [id8(r.id), shownName(r), r.source ?? '', fmt(r.calories_per_100g), macros(r), kcalRange(r),
        use(r.id).entries, use(r.id).users, savedItemIds.has(r.id) ? 'yes' : '']))
  }
  json.quarantined = quarantined.map((r) => ({ id: r.id, name: r.name, source: r.source, reason: r.status_reason, ...use(r.id), saved: savedItemIds.has(r.id) }))

  // 3. Review candidates (report only; these stay verified — D10)
  md.push('## 3. Review candidates (still verified)', '')
  const kcal = (r: ItemRow) => num(r.calories_per_100g)
  const head = (r: ItemRow) => normalizeName(r.name).split(' ')[0] ?? ''
  const families = new Map<string, ItemRow[]>()
  for (const r of verified) {
    const h = head(r)
    if (h.length < 3) continue
    families.set(h, [...(families.get(h) ?? []), r])
  }
  const density: Array<[ItemRow, number]> = []
  for (const fam of families.values()) {
    if (fam.length < 3) continue
    const med = median(fam.map(kcal))
    for (const r of fam) if (med > 0 && (kcal(r) > 2 * med || kcal(r) < 0.5 * med)) density.push([r, med])
  }
  md.push('### Density outliers (>2× or <0.5× the median of verified rows sharing the head word, families ≥ 3)', '')
  table(['id', 'name', 'source', 'kcal', 'family median', 'entries'],
    density.sort((a, b) => byUse(a[0], b[0])).slice(0, 100).map(([r, med]) => [id8(r.id), r.name, r.source ?? '', fmt(kcal(r)), fmt(med), use(r.id).entries]))

  const nearFat = verified.filter((r) => num(r.fat_per_100g) >= 25 && kcal(r) > 0 && 9 * num(r.fat_per_100g) >= 0.75 * kcal(r))
  md.push('### Near-misses on the fat rule (fat ≥ 25 g and ≥ 75% of energy)', '')
  table(['id', 'name', 'source', 'kcal', 'P/C/F/fiber', 'entries'],
    nearFat.sort(byUse).map((r) => [id8(r.id), r.name, r.source ?? '', fmt(kcal(r)), macros(r), use(r.id).entries]))

  md.push('### Zero-energy verified rows', '')
  table(['id', 'name', 'source', 'entries'], verified.filter((r) => kcal(r) === 0).sort(byUse).map((r) => [id8(r.id), r.name, r.source ?? '', use(r.id).entries]))

  // Cross-source: a short USDA phrase row vs the INDB/IFCT rows containing all its words.
  const tokens = (r: ItemRow) => new Set(normalizeName(r.name).split(' ').filter(Boolean))
  const local = verified.filter((r) => r.source === 'indb' || r.source === 'ifct').map((r) => [r, tokens(r)] as const)
  const cross: Array<Array<string | number>> = []
  for (const u of verified.filter((r) => r.source === 'usda')) {
    const want = [...tokens(u)]
    if (!want.length) continue
    const peers = local.filter(([, t]) => want.every((w) => t.has(w))).map(([r]) => r)
    if (!peers.length) continue
    const med = median(peers.map(kcal))
    if (med > 0 && Math.abs(kcal(u) - med) / Math.max(kcal(u), med) > 0.4) {
      cross.push([id8(u.id), u.name, fmt(kcal(u)), fmt(med), peers.length, peers.slice(0, 2).map((p) => p.name).join('; '), use(u.id).entries])
    }
  }
  md.push('### Cross-source disagreement over 40% (USDA phrase row vs INDB/IFCT rows containing its words)', '')
  table(['id', 'usda row', 'usda kcal', 'local median', 'local rows', 'e.g.', 'entries'], cross.slice(0, 100))

  const byFdc = new Map<number, ItemRow[]>()
  for (const r of verified.filter((x) => x.source === 'usda' && x.fdc_id !== null)) byFdc.set(Number(r.fdc_id), [...(byFdc.get(Number(r.fdc_id)) ?? []), r])
  md.push('### USDA phrase rows sharing one fdc_id (one food serving several phrases)', '')
  table(['fdc_id', 'phrases', 'kcal', 'entries'],
    [...byFdc].filter(([, rs]) => new Set(rs.map((r) => r.normalized_name)).size >= 2)
      .map(([fdc, rs]) => [fdc, rs.map((r) => r.name).join('; '), fmt(kcal(rs[0])), rs.reduce((s, r) => s + use(r.id).entries, 0)]))

  md.push('### Top 50 verified rows by entries', '')
  table(['id', 'name', 'source', 'kcal', 'P/C/F/fiber', 'entries', 'users'],
    [...verified].sort(byUse).slice(0, 50).map((r) => [id8(r.id), r.name, r.source ?? '', fmt(kcal(r)), macros(r), use(r.id).entries, use(r.id).users]))

  // 4. Provenance drift (D12: report only)
  md.push('## 4. Provenance drift', '', '### Entries whose macro_source differs from their row\'s source', '')
  const drift = countBy(entries.filter((e) => {
    const fi = e.food_item_id ? itemById.get(e.food_item_id) : undefined
    return fi && !test.has(e.user_id) && e.macro_source !== fi.source
  }), (e) => `${e.macro_source}\t${itemById.get(e.food_item_id!)!.source}`)
  table(['entry macro_source', 'row source', 'entries'], [...drift].sort().map(([k, n]) => [...k.split('\t'), n]))
  md.push('### Non-USDA rows carrying fdc_id or portions', '')
  table(['id', 'name', 'source', 'fdc_id', 'portions', 'status'],
    items.filter((r) => r.source !== 'usda' && (r.fdc_id !== null || (Array.isArray(r.portions) && r.portions.length > 0)))
      .map((r) => [id8(r.id), shownName(r), r.source ?? '', r.fdc_id ?? '', Array.isArray(r.portions) ? r.portions.length : '', r.status ?? '']))

  // 5. Un-shared AI/label rows
  md.push('## 5. AI/label rows un-shared by 050, with usage and memory coverage', '')
  const memByItem = countBy(memory, (m) => m.food_item_id)
  const unshared = items.filter((r) => r.status_reason === 'unshared_050').sort(byUse)
  table(['id', 'name', 'source', 'kcal', 'entries', 'users', 'memory pointers'],
    unshared.slice(0, 200).map((r) => [id8(r.id), shownName(r), r.source ?? '', fmt(kcal(r)), use(r.id).entries, use(r.id).users, memByItem.get(r.id) ?? 0]))
  json.unshared = unshared.map((r) => ({ id: r.id, name: r.name, source: r.source, ...use(r.id), memory: memByItem.get(r.id) ?? 0 }))

  // 6. Promotion candidates
  md.push('## 6. Promotion candidates: private USDA rows with one fdc_id used by ≥ 2 users', '')
  const privUsda = new Map<number, { rows: ItemRow[]; users: Set<string> }>()
  const usersOf = new Map<string, Set<string>>()
  for (const e of entries) {
    if (!e.food_item_id || test.has(e.user_id)) continue
    usersOf.set(e.food_item_id, (usersOf.get(e.food_item_id) ?? new Set()).add(e.user_id))
  }
  for (const r of items.filter((x) => x.source === 'usda' && x.created_by !== null && x.fdc_id !== null)) {
    const k = Number(r.fdc_id)
    const g = privUsda.get(k) ?? { rows: [], users: new Set<string>() }
    g.rows.push(r)
    if (!test.has(r.created_by!)) g.users.add(r.created_by!)
    for (const u of usersOf.get(r.id) ?? []) g.users.add(u)
    privUsda.set(k, g)
  }
  const promo = [...privUsda].filter(([, g]) => g.users.size >= 2).sort((a, b) => b[1].users.size - a[1].users.size)
  table(['fdc_id', 'names', 'kcal', 'private rows', 'users'],
    promo.map(([fdc, g]) => [fdc, [...new Set(g.rows.map(shownName))].slice(0, 4).join('; '), fmt(kcal(g.rows[0])), g.rows.length, g.users.size]))
  json.promotion = promo.map(([fdc, g]) => ({ fdc_id: fdc, rows: g.rows.map((r) => r.id), users: g.users.size }))

  // 7. Templates for the reviewed follow-up migration (never run by this script)
  md.push('## 7. Follow-up migration templates', '',
    'Copy into the next migration after review. Back up first, then demote; the guard does not restrict migrations.', '',
    '```sql',
    '-- CREATE TABLE IF NOT EXISTS backup._backup_food_items_<nnn> AS',
    "--   SELECT * FROM public.food_items WHERE id IN ('<uuid>', ...);",
    '-- UPDATE public.food_items',
    "--    SET status = 'quarantined', status_reason = 'reviewed:<why>', status_changed_at = now(),",
    '--        parked_normalized_name = coalesce(normalized_name, parked_normalized_name), normalized_name = NULL',
    "--  WHERE id IN ('<uuid>', ...);",
    '-- CREATE INDEX IF NOT EXISTS food_entries_food_item_id_idx ON public.food_entries (food_item_id);  -- in its OWN migration (lock order)',
    '```', '')

  const day = new Date().toISOString().slice(0, 10)
  mkdirSync(OUT_DIR, { recursive: true })
  const mdPath = join(OUT_DIR, `food-items-${day}.md`)
  writeFileSync(mdPath, md.join('\n'))
  const jsonDir = join(__dirname, 'audit', 'out')
  mkdirSync(jsonDir, { recursive: true })
  const jsonPath = join(jsonDir, `food-items-${day}.json`)
  writeFileSync(jsonPath, JSON.stringify(json, null, 2))
  console.log(`Report written to ${mdPath} and ${jsonPath}`)
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  let ok = true
  if (PRE) ok = (await runPre()) && ok
  if (CHECK || REPORT) {
    if (!(await has050())) {
      console.error('food_items has no status column yet: migration 050 is not applied. Use --pre.')
      process.exit(1)
    }
    const [items, memory] = await Promise.all([
      fetchAll<ItemRow>('food_items',
        'id, source, name, normalized_name, created_by, created_at, calories_per_100g, protein_per_100g, carbs_per_100g, ' +
        'fat_per_100g, fiber_per_100g, fdc_id, portions, status, status_reason, parked_normalized_name'),
      fetchAll<MemoryRow & { id: string }>('user_food_memory', 'id, user_id, normalized_name, food_item_id, origin'),
    ])
    if (CHECK) ok = (await runCheck(items, memory)) && ok
    if (REPORT) {
      const [entries, saved, test] = await Promise.all([
        fetchAll<EntryRow & { id: string }>('food_entries', 'id, food_item_id, user_id, macro_source, created_at'),
        fetchAll<{ id: string; entries: unknown }>('saved_entries', 'id, entries'),
        testAccountIds(),
      ])
      const savedItemIds = new Set<string>()
      for (const s of saved) {
        for (const e of Array.isArray(s.entries) ? s.entries : []) {
          const id = (e as { food_item_id?: unknown })?.food_item_id
          if (typeof id === 'string') savedItemIds.add(id)
        }
      }
      runReport(items, entries, memory, savedItemIds, test)
    }
  }
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error('Audit failed:', (err as Error)?.message ?? err)
  process.exit(1)
})
