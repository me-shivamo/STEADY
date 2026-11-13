// Gate A (spec (h)): replay real users' amount phrases through the portion engine, offline.
//
//   npx tsx scripts/portions/replay.ts <export.csv> [--region=IN|US] [--out=replay.json]
//
// <export.csv> is a COUNTS-ONLY export (no user ids, eval account excluded) with the columns
//   food_item_id, fdc_id, food_name, quantity_label, n, median_g
// made by this read-only query (run with `npx supabase db query --linked -o csv "<query>"`, output kept OUTSIDE the repo):
//
//   SELECT fe.food_item_id, fi.fdc_id, fe.food_name, fe.quantity_label, count(*) AS n,
//          percentile_disc(0.5) WITHIN GROUP (ORDER BY fe.quantity_g) AS median_g
//     FROM public.food_entries fe
//     JOIN auth.users u ON u.id = fe.user_id
//     LEFT JOIN public.food_items fi ON fi.id = fe.food_item_id
//    WHERE u.email NOT LIKE '%@steadyapp.internal' AND fe.quantity_label IS NOT NULL
//    GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC, 3, 4;
//
// Each phrase is read with shadow mode's synonym table (portionFromDescription) and weighed with the engine on the
// seed 054 ships (scripts/portions/data; no database), keyed by the entry's own food row so founder rows apply. Data
// rows that live only in the database (056's USDA measures) are not in the seed: run after regenerating with them, or
// read this as "054 only". Nothing personal reaches the output: phrases, counts and grams only.
//
// Reported (spec (h) Gate A targets in brackets): unit/count phrases answered by data R1-R7 [>= 75% before 056],
// the source mix, R8 (fallback) phrases, condiment vessels above 80 g [0], founder-row phrases answered by their
// founder row [100%], and the shift against the grams the phrase was logged with (median and mean deviation). The
// research-default comparison (+-20%) needs the research table per phrase (spec (h)); the legacy grams are the
// reference here, so a large shift is a phrase to review, not by itself a failure.

import { readFileSync, writeFileSync } from 'fs'

import { buildSeed, engineTables } from './lib'
import { computePortion } from '../../supabase/functions/_shared/portions'
import { portionFromDescription } from '../../supabase/functions/_shared/portionText'

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(name.length + 3)
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field); field = ''
      if (cur.some((c) => c !== '')) rows.push(cur)
      cur = []
    } else field += ch
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

function main(): void {
  const file = process.argv[2]
  if (!file || file.startsWith('--')) { console.error('usage: replay.ts <export.csv> [--region=IN|US] [--out=replay.json]'); process.exit(2) }
  const region = (arg('region') ?? 'IN') as 'IN' | 'US'
  const seed = buildSeed()
  const { tables, foodRows } = engineTables(seed)
  const founderIds = new Set(seed.rows.filter((r) => r.source === 'founder').map((r) => r.food_item_id))
  const rows = parseCsv(readFileSync(file, 'utf8'))

  let phrases = 0, weighted = 0, unitPhrases = 0, byData = 0, r8 = 0, condimentOver80 = 0, founderPhrases = 0, founderHit = 0
  const sources = new Map<string, number>()
  const devs: Array<{ dev: number; n: number }> = []
  const changes: Array<{ phrase: string; n: number; legacy_g: number; table_g: number; source: string; ref: string }> = []
  for (const r of rows) {
    const n = Number(r.n) || 1
    const label = r.quantity_label ?? ''
    const name = r.food_name ?? ''
    const d = portionFromDescription(label.replace(/ · rough estimate$/, ''), name)
    phrases++
    weighted += n
    const parse = d
      ? { count: d.count, unit: d.unit, size: d.size, stated_amount: d.stated_amount, stated_unit: d.stated_unit, context: null, fallback_g: Number(r.median_g) || null }
      : { count: 1, unit: null, size: null, stated_amount: null, stated_unit: null, context: null, fallback_g: Number(r.median_g) || null }
    const id = r.food_item_id || null
    const res = computePortion(tables, {
      parse, phrase: name, row: { id, fdc_id: r.fdc_id ? Number(r.fdc_id) : null, status: 'verified', name },
      foodRows, region, proposed: false, channel: 'text',
    })
    if (!res) continue
    const src = res.portion.source
    sources.set(src, (sources.get(src) ?? 0) + n)
    if (d && (d.unit || d.stated_amount)) {
      unitPhrases += n
      if (src !== 'ai') byData += n
    }
    if (src === 'ai') r8 += n
    if (res.category === 'condiment' && ['katori', 'bowl', 'cup', 'glass', 'plate'].includes(String(res.portion.unit)) && res.portion.grams_per_unit > 80) condimentOver80 += n
    if (id && founderIds.has(id) && d?.unit) {
      founderPhrases += n
      if (res.portion.ref.includes('food F') || res.portion.ref.includes('serving unit')) founderHit += n
    }
    const legacy = Number(r.median_g)
    if (legacy > 0) {
      const dev = (res.grams - legacy) / legacy
      devs.push({ dev, n })
      if (Math.abs(dev) > 0.2) changes.push({ phrase: `${label} ${name}`.trim(), n, legacy_g: legacy, table_g: res.grams, source: src, ref: res.portion.ref })
    }
  }
  const expand = devs.flatMap((x) => new Array(x.n).fill(x.dev) as number[]).sort((a, b) => a - b)
  const median = expand.length ? expand[Math.floor(expand.length / 2)] : 0
  const mean = expand.length ? expand.reduce((s, x) => s + x, 0) / expand.length : 0
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-')
  const report = {
    region, phrases, entries: weighted,
    unit_phrases_by_data: `${byData}/${unitPhrases} (${pct(byData, unitPhrases)})`,
    r8_entries: `${r8}/${weighted} (${pct(r8, weighted)})`,
    condiment_vessels_over_80g: condimentOver80,
    founder_phrases_on_founder_rows: `${founderHit}/${founderPhrases} (${pct(founderHit, founderPhrases)})`,
    deviation_vs_logged: { median: Number((median * 100).toFixed(1)), mean: Number((mean * 100).toFixed(1)), within_20pct: pct(expand.filter((x) => Math.abs(x) <= 0.2).length, expand.length) },
    sources: Object.fromEntries([...sources].sort((a, b) => b[1] - a[1])),
    biggest_changes: changes.sort((a, b) => b.n - a.n || Math.abs(b.table_g - b.legacy_g) - Math.abs(a.table_g - a.legacy_g)).slice(0, 40),
  }
  console.log(JSON.stringify({ ...report, biggest_changes: report.biggest_changes.slice(0, 15) }, null, 1))
  const out = arg('out')
  if (out) writeFileSync(out, JSON.stringify(report, null, 1) + '\n')
}

main()
