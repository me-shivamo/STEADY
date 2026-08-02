// ── HTTP eval: hits the REAL deployed edge function ──────────────────────────
// Calls https://{project}.supabase.co/functions/v1/log-food-from-text exactly
// the way the Expo app does — same request parsing, same intent routing, same
// DB writes. Needs scripts/eval/.eval-session.json (run setup-user.ts first).
//
// Run:
//   npx tsx scripts/eval/run-http.ts [--dataset=dataset-v3.json] [--ids=a,b,c]
//
// Methodology notes (learned the hard way in earlier rounds):
// - Every case gets its OWN logged_date, so chat history never leaks between
//   cases. (History saturation is a real production concern, but it has its
//   own dedicated fix + test — this eval isolates macro accuracy.)
// - A case's `expected` bands are OPTIONAL per field. Calories is the primary
//   metric on every log case; protein/carbs/fat only where diagnostic. Our old
//   all-four-bands-required metric read 42% on a run the literature-standard
//   "calories within ±25%" metric scored 58-64% — pick metrics the field uses.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '.env.local') })

const SUPABASE_URL = process.env.SUPABASE_URL!
if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in scripts/eval/.env.local')
  process.exit(1)
}

const sessionPath = join(__dirname, '.eval-session.json')
if (!existsSync(sessionPath)) {
  console.error('No session found. Run: npx tsx scripts/eval/setup-user.ts first')
  process.exit(1)
}
const { accessToken } = JSON.parse(readFileSync(sessionPath, 'utf8')) as { accessToken: string }

// Sequential requests took ~8 min for 50 cases; 4 workers keeps a 100-case run
// inside a sane wall clock without hammering OpenRouter/USDA rate limits.
const CONCURRENCY = 4

type Band = [number, number]
interface DatasetExample {
  id: string
  type: 'log' | 'negative'
  text: string
  category?: string
  expected?: { calories?: Band; protein_g?: Band; carbs_g?: Band; fat_g?: Band }
  note?: string
}

interface HttpResult {
  id: string
  text: string
  type: 'log' | 'negative'
  category?: string
  status: 'pass' | 'fail' | 'error'
  responseType?: string
  predicted?: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  expected?: DatasetExample['expected']
  offFields: string[]
  foodNames?: string[]
  mealLogId?: string
  minConfidence?: number
  error?: string
}

// Unique past date per case (2026-04-01 + index) — keeps every request's chat
// history empty AND safely in the past so nothing shows up as "today" for the
// eval user.
function dateFor(index: number): string {
  const d = new Date(Date.UTC(2026, 3, 1))
  d.setUTCDate(d.getUTCDate() + index)
  return d.toISOString().slice(0, 10)
}

function inBand(value: number, [lo, hi]: Band): boolean {
  return value >= lo && value <= hi
}

async function callEdgeFunction(text: string, loggedDate: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/log-food-from-text`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      logged_date: loggedDate,
      logged_hour: 13, // fixed 1pm so meal_type inference stays stable
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`)
  return body
}

async function runExample(example: DatasetExample, index: number): Promise<HttpResult> {
  try {
    const response = await callEdgeFunction(example.text, dateFor(index))
    const responseType = response.type as string

    if (example.type === 'negative') {
      const passed = responseType !== 'log'
      return {
        id: example.id, text: example.text, type: example.type, category: example.category,
        status: passed ? 'pass' : 'fail', responseType,
        offFields: passed ? [] : ['intent'],
      }
    }

    if (responseType !== 'log') {
      return {
        id: example.id, text: example.text, type: example.type, category: example.category,
        status: 'fail', responseType, offFields: ['intent'],
        error: `Expected a food log but got intent="${responseType}"`,
      }
    }

    const totals = response.totals as Record<string, number>
    const foods = (response.foods as Array<Record<string, unknown>>) ?? []
    const offFields: string[] = []
    for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      const band = example.expected?.[field]
      if (band && !inBand(totals[field], band)) offFields.push(field)
    }

    return {
      id: example.id, text: example.text, type: example.type, category: example.category,
      status: offFields.length === 0 ? 'pass' : 'fail',
      responseType,
      predicted: {
        calories: totals.calories, protein_g: totals.protein_g,
        carbs_g: totals.carbs_g, fat_g: totals.fat_g,
      },
      expected: example.expected,
      offFields,
      // Lowest per-food confidence in the meal: if a clarification loop is ever
      // built, THIS is the number that would trigger it, so we capture it to
      // check whether it actually correlates with being wrong.
      minConfidence: foods.length
        ? Math.min(...foods.map((f) => Number(f.confidence ?? 1)))
        : undefined,
      foodNames: foods.map((f) => `${f.name}(${f.quantity_g}g)[${f.macro_source}]conf=${f.confidence}`),
      mealLogId: response.meal_log_id as string | undefined,
    }
  } catch (err) {
    return {
      id: example.id, text: example.text, type: example.type, category: example.category,
      status: 'error', offFields: [],
      error: (err as { message?: string })?.message ?? String(err),
    }
  }
}

async function main() {
  const datasetArg = process.argv.find((a) => a.startsWith('--dataset='))
  const datasetFile = datasetArg ? datasetArg.slice('--dataset='.length) : 'dataset-v2.json'
  const datasetPath = join(__dirname, datasetFile)
  let dataset: DatasetExample[] = JSON.parse(readFileSync(datasetPath, 'utf8'))

  const idsArg = process.argv.find((a) => a.startsWith('--ids='))
  if (idsArg) {
    const ids = new Set(idsArg.slice('--ids='.length).split(','))
    dataset = dataset.filter((e) => ids.has(e.id))
  }

  console.log(`Running HTTP eval: ${dataset.length} cases from ${datasetFile}, concurrency ${CONCURRENCY}\n`)

  const results: HttpResult[] = new Array(dataset.length)
  let next = 0
  async function worker() {
    while (next < dataset.length) {
      const i = next++
      results[i] = await runExample(dataset[i], i)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'ERROR'
    console.log(`[${icon}] ${r.id} (${r.category ?? r.type}) — "${r.text}"`)
    if (r.status !== 'pass') {
      if (r.error) console.log(`       error: ${r.error}`)
      if (r.predicted) {
        console.log(`       predicted: ${JSON.stringify(r.predicted)}`)
        console.log(`       expected:  ${JSON.stringify(r.expected)}`)
        console.log(`       off: ${r.offFields.join(', ')} | foods: ${r.foodNames?.join(' | ')}`)
      }
    }
  }

  writeReport(results, datasetFile)
}

function writeReport(results: HttpResult[], datasetFile: string) {
  const logs = results.filter((r) => r.type === 'log')
  const negatives = results.filter((r) => r.type === 'negative')
  const logsPassed = logs.filter((r) => r.status === 'pass').length
  const negPassed = negatives.filter((r) => r.status === 'pass').length
  const errored = results.filter((r) => r.status === 'error').length

  // Literature-standard calorie metrics against the band midpoint.
  const scored = logs.filter((r) => r.predicted && r.expected?.calories)
  const mid = (b: Band) => (b[0] + b[1]) / 2
  const inCalBand = scored.filter((r) => inBand(r.predicted!.calories, r.expected!.calories!)).length
  const within25 = scored.filter((r) =>
    Math.abs(r.predicted!.calories - mid(r.expected!.calories!)) / mid(r.expected!.calories!) <= 0.25
  ).length
  const apes = scored
    .map((r) => Math.abs(r.predicted!.calories - mid(r.expected!.calories!)) / mid(r.expected!.calories!))
    .sort((a, b) => a - b)
  const medianApe = apes.length ? apes[Math.floor(apes.length / 2)] : 0

  console.log('\n' + '─'.repeat(64))
  console.log(`STRICT (all declared bands): ${logsPassed}/${logs.length} logs passed (${((logsPassed / logs.length) * 100).toFixed(1)}%)`)
  console.log(`CALORIES IN BAND:            ${inCalBand}/${scored.length} (${((inCalBand / scored.length) * 100).toFixed(1)}%)`)
  console.log(`CALORIES WITHIN ±25% OF MID: ${within25}/${scored.length} (${((within25 / scored.length) * 100).toFixed(1)}%)  [literature-comparable]`)
  console.log(`MEDIAN CALORIE ERROR:        ${(medianApe * 100).toFixed(1)}%`)
  console.log(`NEGATIVES (no phantom log):  ${negPassed}/${negatives.length}`)
  console.log(`ERRORS: ${errored}`)
  console.log('─'.repeat(64))

  const categories = [...new Set(results.map((r) => r.category).filter(Boolean))] as string[]
  console.log('\nBy category (strict):')
  for (const cat of categories) {
    const inCat = results.filter((r) => r.category === cat)
    const passed = inCat.filter((r) => r.status === 'pass').length
    console.log(`  ${cat}: ${passed}/${inCat.length}`)
  }

  const fieldMisses = new Map<string, number>()
  for (const r of logs) for (const f of r.offFields) fieldMisses.set(f, (fieldMisses.get(f) ?? 0) + 1)
  console.log('\nField-level misses:')
  for (const [field, count] of fieldMisses) console.log(`  ${field}: ${count}`)

  const outPath = join(__dirname, `results-${basename(datasetFile, '.json')}.json`)
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results written to ${outPath}`)
}

main().catch((err) => {
  console.error('Eval run failed:', err)
  process.exit(1)
})
