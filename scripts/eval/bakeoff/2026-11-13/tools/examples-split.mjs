// node examples.mjs <model: mini|luna> [ids...]  -> split vs whole items per case (rep 0 + all-rep totals)
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const [m, ...ids] = process.argv.slice(2)
const load = (l) => { const p = join(here, 'runs', l, 'results.json'); return existsSync(p) ? new Map(JSON.parse(readFileSync(p, 'utf8')).map((x) => [x.id, x])) : new Map() }
const S = load(`${m}-split`), W = load(`${m}-whole`)
const fmt = (rep) => rep?.ok ? rep.items.map((i) => `${i.name} ${i.g}g=${Math.round(i.kcal)}(${i.res.replace('verified_', 'v_').replace('_estimate', '_est')})`).join(' + ') + ` → ${Math.round(rep.calories)}` : `ERR ${rep?.error ?? ''}`
for (const id of ids.length ? ids : [...S.keys()]) {
  const s = S.get(id), w = W.get(id)
  if (!s?.expected?.calories) continue
  const b = s.expected.calories
  const tag = (x) => x ? `${x.status === 'pass' ? 'PASS' : 'FAIL'} runs=[${(x.runCalories ?? []).map(Math.round).join(',')}]` : '-'
  console.log(`${id} "${s.text}" band ${b[0]}-${b[1]}`)
  console.log(`  split: ${tag(s)} | ${fmt(s.reps?.[0])}`)
  if (w) console.log(`  whole: ${tag(w)} | ${fmt(w.reps?.[0])}`)
}
