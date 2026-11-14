// node analyze.mjs [labels...]  -> split-vs-whole metrics (overall + composite subsets)
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const labels = process.argv.slice(2).length ? process.argv.slice(2) : ['mini-split', 'mini-whole', 'luna-split', 'luna-whole']

export const INDIAN = ['i01','i02','i03','i04','i05','i06','i07','i08','i09','i10','i11','i12','i13','i14','i15','i16','i17','i19','i20','v01','v09']
export const OTHER = ['b01','b02','b05','b06','b07','b13','b15','w05','w06','w08','w09','w12','d08','d11','d12','e08','v02','v03','v05','v07','v10']
const COMPOSITE = [...INDIAN, ...OTHER]

const mid = (b) => (b[0] + b[1]) / 2
const signed = (p, b) => (p - mid(b)) / Math.max(mid(b), 1)
const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
const inBand = (v, b) => v >= b[0] && v <= b[1]
const DB = new Set(['verified_exact', 'verified_alias', 'reference_match', 'usda_match', 'memory'])

function load(label) {
  const dir = join(here, 'runs', label)
  if (!existsSync(join(dir, 'results.json'))) return null
  return JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
}

function metrics(results, ids) {
  const set = ids ? new Set(ids) : null
  const rs = results.filter((x) => !set || set.has(x.id))
  const logs = rs.filter((x) => x.expected?.calories)
  // first run (the harness convention)
  const firstIn = logs.filter((x) => x.predicted && inBand(x.predicted.calories, x.expected.calories)).length
  const cErr = logs.filter((x) => x.predicted).map((x) => signed(x.predicted.calories, x.expected.calories))
  const pErr = logs.filter((x) => x.predicted && x.expected.protein_g).map((x) => signed(x.predicted.protein_g, x.expected.protein_g))
  // all reps (3x the sample, less noise)
  const allReps = []
  for (const x of logs) for (const rep of x.reps ?? []) if (rep.ok) allReps.push({ x, rep })
  const allIn = allReps.filter(({ x, rep }) => inBand(rep.calories, x.expected.calories)).length
  const allErr = allReps.map(({ x, rep }) => signed(rep.calories, x.expected.calories))
  const nItems = allReps.map(({ rep }) => rep.items.length)
  let kcalDb = 0, kcalAll = 0, itemsDb = 0, itemsAll = 0
  for (const { rep } of allReps) for (const it of rep.items) { kcalAll += it.kcal; itemsAll++; if (DB.has(it.res)) { kcalDb += it.kcal; itemsDb++ } }
  const cons = logs.filter((x) => x.consistent !== undefined)
  return {
    cases: rs.length, log_cases: logs.length,
    strict_pass_pct: pct(rs.filter((x) => x.status === 'pass').length, rs.length),
    strict_pass: `${rs.filter((x) => x.status === 'pass').length}/${rs.length}`,
    errored: rs.filter((x) => x.status === 'error').length,
    cal_in_band_first_pct: pct(firstIn, logs.length),
    cal_in_band_allreps_pct: pct(allIn, allReps.length), allreps_n: allReps.length,
    cal_median_abs_err_pct: r1(median(cErr.map(Math.abs)) * 100),
    cal_median_abs_err_allreps_pct: r1(median(allErr.map(Math.abs)) * 100),
    cal_signed_lean_pct: r1(median(cErr) * 100),
    cal_signed_lean_allreps_pct: r1(median(allErr) * 100),
    above_below: `${cErr.filter((e) => e > 0).length}/${cErr.filter((e) => e < 0).length}`,
    protein_median_abs_err_pct: pErr.length ? r1(median(pErr.map(Math.abs)) * 100) : null, protein_n: pErr.length,
    protein_signed_pct: pErr.length ? r1(median(pErr) * 100) : null,
    consistency: `${cons.filter((x) => x.consistent).length}/${cons.length}`,
    consistency_pct: pct(cons.filter((x) => x.consistent).length, cons.length),
    foods_per_log_mean: nItems.length ? Math.round((nItems.reduce((a, b) => a + b, 0) / nItems.length) * 100) / 100 : null,
    kcal_from_db_pct: pct(kcalDb, kcalAll), items_from_db_pct: pct(itemsDb, itemsAll),
    ai_estimate_items: allReps.reduce((s, { rep }) => s + rep.items.filter((i) => i.res === 'ai_estimate').length, 0),
    rough_items: allReps.reduce((s, { rep }) => s + rep.items.filter((i) => i.res === 'rough_estimate').length, 0),
    unsure_logs: allReps.filter(({ rep }) => rep.unresolved?.length).length,
  }
}

const data = Object.fromEntries(labels.map((l) => [l, load(l)]).filter(([, v]) => v))
const out = {}
for (const [l, rs] of Object.entries(data)) {
  out[l] = { all: metrics(rs), composite: metrics(rs, COMPOSITE), indian: metrics(rs, INDIAN), other_composite: metrics(rs, OTHER) }
}
// cases whose first-run item names changed between split and whole (same model)
const norm = (rep) => (rep?.items ?? []).map((i) => i.name.toLowerCase().trim()).sort().join(' + ')
for (const m of ['mini', 'luna']) {
  const a = data[`${m}-split`], b = data[`${m}-whole`]
  if (!a || !b) continue
  const bi = new Map(b.map((x) => [x.id, x]))
  const changed = a.filter((x) => x.expected?.calories && bi.get(x.id) && norm(x.reps?.[0]) !== norm(bi.get(x.id).reps?.[0])).map((x) => x.id)
  out[`${m}-changed-ids`] = changed
  out[`${m}-split@changed`] = metrics(a, changed)
  out[`${m}-whole@changed`] = metrics(b, changed)
}
out.subsets = { INDIAN, OTHER }
console.log(JSON.stringify(out, null, 2))
