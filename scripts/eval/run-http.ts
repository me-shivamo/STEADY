// ── HTTP eval: hits the REAL deployed edge function ──────────────────────────
// Calls https://{project}.supabase.co/functions/v1/<function> exactly the way
// the Expo app does — same request parsing, same intent routing, same DB
// writes. Needs scripts/eval/.eval-session.json (run setup-user.ts first).
//
// Run:
//   npx tsx scripts/eval/run-http.ts [--dataset=dataset-v4.json] [--ids=a,b,c]
//                                    [--function=log-food-from-text] [--repeat=1]
//                                    [--memory=cold|warm]
//
//   --function  which deployed function to test, so the new pipeline
//               (log-food-v2) can be scored against the old one on the same data
//   --repeat    run every case N times; reports how many give the identical
//               number every time (the "same meal, same number" promise)
//   --memory    cold (default): delete the eval user's user_food_memory rows
//               before every request, so each one measures the pipeline the way
//               a new user meets it and stays comparable with the pre-050
//               baseline. Needs SUPABASE_SERVICE_ROLE_KEY in .env.local.
//               warm: keep memory, to measure what returning users get.
//               (With 4 workers a concurrent case can still write a pointer
//               another case reads; the RESOLUTION tally shows any 'memory'
//               hits in a cold run, so leakage is visible, not silent.)
//
// Methodology notes (learned the hard way in earlier rounds):
// - Every request gets its OWN logged_date, so chat history never leaks between
//   cases or repeats. (History saturation is a real production concern, but it
//   has its own dedicated fix + test — this eval isolates macro accuracy.)
// - A case's `expected` bands are OPTIONAL per field. Calories is the primary
//   metric on every log case; protein/carbs/fat only where diagnostic. Our old
//   all-four-bands-required metric read 42% on a run the literature-standard
//   "calories within ±25%" metric scored 58-64% — pick metrics the field uses.
// - Size and direction of error are reported separately: users said numbers
//   run HIGH, and a small median error can hide a pipeline that leans high on
//   most meals. Pass/fail and "predicted" use the FIRST run of each case, so
//   results stay comparable with earlier reports.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { config as loadEnv } from 'dotenv'
import {
  type Band,
  type TokenRow,
  costUsd,
  isConsistent,
  median,
  mid,
  percentile,
  signedError,
  summarizeErrors,
} from './metrics.ts'

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
const { accessToken, userId } = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
  accessToken: string
  userId: string
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(name.length + 3)
}

const FUNCTION_NAME = arg('function') ?? 'log-food-from-text'
const REPEAT = Math.max(1, Number(arg('repeat') ?? 1))
const MEMORY = arg('memory') ?? 'cold'
if (MEMORY !== 'cold' && MEMORY !== 'warm') {
  console.error(`--memory must be cold or warm (got "${MEMORY}")`)
  process.exit(1)
}
// Read once (also used for the ai_logs cost query). Never printed.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (MEMORY === 'cold' && !SERVICE_KEY) {
  console.error('--memory=cold needs SUPABASE_SERVICE_ROLE_KEY in scripts/eval/.env.local (to clear the eval user\'s memory). Use --memory=warm to run without it.')
  process.exit(1)
}

// Sequential requests took ~8 min for 50 cases; 4 workers keeps a 100-case run
// inside a sane wall clock without hammering OpenRouter/USDA rate limits.
const CONCURRENCY = 4

interface DatasetExample {
  id: string
  type: 'log' | 'negative'
  text: string
  category?: string
  expected?: { calories?: Band; protein_g?: Band; carbs_g?: Band; fat_g?: Band }
  note?: string
}

interface Totals { calories: number; protein_g: number; carbs_g: number; fat_g: number }

interface RunResult {
  latencyMs: number
  responseType?: string
  totals?: Totals
  // foods[].resolution for this run (memory, verified_exact, ai_estimate, …)
  resolutions?: string[]
  // foods the function left out of the log (founder decision D5)
  leftOut?: string[]
  error?: string
}

interface HttpResult {
  id: string
  text: string
  type: 'log' | 'negative'
  category?: string
  status: 'pass' | 'fail' | 'error'
  responseType?: string
  predicted?: Totals
  expected?: DatasetExample['expected']
  offFields: string[]
  foodNames?: string[]
  mealLogId?: string
  minConfidence?: number
  error?: string
  runs: RunResult[]
  consistent?: boolean
  // First run asked for clarification instead of logging, or logged with a
  // food left out. Either way the user had to do something by hand.
  unsure?: boolean
}

// Unique past date per request (2025-01-01 + index). Each case owns REPEAT
// consecutive dates, so a 100-case × 5-repeat run still ends well in the past
// and nothing ever shows up as "today" for the eval user.
function dateFor(index: number): string {
  const d = new Date(Date.UTC(2025, 0, 1))
  d.setUTCDate(d.getUTCDate() + index)
  return d.toISOString().slice(0, 10)
}

function inBand(value: number, [lo, hi]: Band): boolean {
  return value >= lo && value <= hi
}

// One stuck request must not stall a 300-request run, so each call gets a hard
// limit. 60s is far beyond any healthy log (p95 is a few seconds); hitting it
// is recorded as an error for that run, not retried.
const REQUEST_TIMEOUT_MS = 60_000

async function callEdgeFunction(text: string, loggedDate: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  // An expired session fails every request identically; stop at the first one
  // instead of recording a whole run of "errors" that measure nothing.
  if (res.status === 401) {
    console.error('\nHTTP 401: the eval session has expired (JWTs last ~1h). Run: npx tsx scripts/eval/setup-user.ts')
    process.exit(2)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`)
  return body
}

// Cold memory: wipe the eval user's user_food_memory pointers (and only
// theirs — the filter is the eval session's own user id) before a request.
async function clearEvalMemory(): Promise<void> {
  if (!userId) {
    console.error('No userId in .eval-session.json; refusing to clear memory without a user filter.')
    process.exit(1)
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_food_memory?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  })
  if (!res.ok) {
    console.error(`Could not clear the eval user's memory (HTTP ${res.status}); a cold run would not be cold.`)
    process.exit(1)
  }
}

// A text log with nothing loggable comes back as a chat answer flagged
// needs_clarification; a photo uses the same flag as its type.
function responseKind(response: Record<string, unknown>): string {
  return response.needs_clarification === true ? 'needs_clarification' : (response.type as string)
}

async function runExample(example: DatasetExample, caseIndex: number): Promise<HttpResult> {
  const base = { id: example.id, text: example.text, type: example.type, category: example.category }
  const runs: RunResult[] = []
  let first: Record<string, unknown> | undefined

  for (let r = 0; r < REPEAT; r++) {
    if (MEMORY === 'cold') await clearEvalMemory()
    const started = Date.now()
    try {
      const response = await callEdgeFunction(example.text, dateFor(caseIndex * REPEAT + r))
      const t = response.totals as Totals | undefined
      const runFoods = (response.foods as Array<Record<string, unknown>> | undefined) ?? []
      const leftOut = (response.unresolved as Array<{ name: string }> | undefined) ?? []
      runs.push({
        latencyMs: Date.now() - started,
        responseType: responseKind(response),
        totals: t && { calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g },
        resolutions: runFoods.map((f) => String(f.resolution ?? 'unknown')),
        leftOut: leftOut.map((u) => u.name),
      })
      if (r === 0) first = response
    } catch (err) {
      runs.push({ latencyMs: Date.now() - started, error: (err as Error)?.message ?? String(err) })
    }
  }

  if (!first) {
    return { ...base, status: 'error', offFields: [], error: runs[0].error, runs }
  }

  const responseType = responseKind(first)
  if (example.type === 'negative') {
    const passed = responseType !== 'log'
    return { ...base, status: passed ? 'pass' : 'fail', responseType, offFields: passed ? [] : ['intent'], runs }
  }

  if (responseType === 'needs_clarification') {
    return {
      ...base, status: 'fail', responseType, offFields: ['unsure'], runs, unsure: true,
      error: `Asked for clarification instead of logging: ${String(first.reply ?? first.message ?? '')}`,
    }
  }

  if (responseType !== 'log') {
    return {
      ...base, status: 'fail', responseType, offFields: ['intent'], runs,
      error: `Expected a food log but got intent="${responseType}"`,
    }
  }

  const totals = runs[0].totals!
  const foods = (first.foods as Array<Record<string, unknown>>) ?? []
  const offFields: string[] = []
  for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
    const band = example.expected?.[field]
    if (band && !inBand(totals[field], band)) offFields.push(field)
  }
  // D5: a log with a food left out still counts as unsure, even when the
  // remaining total happens to land in the band.
  const leftOut = runs[0].leftOut ?? []
  if (leftOut.length > 0) offFields.push('unsure')

  // Consistency only means something when every repeat actually logged.
  const loggedCalories = runs.filter((x) => x.responseType === 'log' && x.totals).map((x) => x.totals!.calories)
  const consistent = REPEAT > 1
    ? loggedCalories.length === REPEAT && isConsistent(loggedCalories)
    : undefined

  return {
    ...base,
    status: offFields.length === 0 ? 'pass' : 'fail',
    responseType,
    predicted: totals,
    expected: example.expected,
    offFields,
    // Lowest per-food confidence in the meal: if a clarification loop is ever
    // built, THIS is the number that would trigger it, so we capture it to
    // check whether it actually correlates with being wrong.
    minConfidence: foods.length ? Math.min(...foods.map((f) => Number(f.confidence ?? 1))) : undefined,
    foodNames: foods.map((f) => `${f.name}(${f.quantity_g}g)[${f.macro_source}/${f.resolution ?? '?'}]conf=${f.confidence}`)
      .concat(leftOut.map((n) => `${n}(LEFT OUT)`)),
    mealLogId: first.meal_log_id as string | undefined,
    runs,
    consistent,
    unsure: leftOut.length > 0,
  }
}

async function main() {
  const datasetFile = arg('dataset') ?? 'dataset-v2.json'
  let dataset: DatasetExample[] = JSON.parse(readFileSync(join(__dirname, datasetFile), 'utf8'))

  const ids = arg('ids')
  if (ids) {
    const wanted = new Set(ids.split(','))
    dataset = dataset.filter((e) => wanted.has(e.id))
  }

  console.log(
    `Running HTTP eval: ${dataset.length} cases from ${datasetFile} → ${FUNCTION_NAME}, ` +
    `repeat ${REPEAT}, concurrency ${CONCURRENCY}\n`,
  )

  const runStartedAt = new Date().toISOString()
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
    const drift = r.consistent === false ? '  [INCONSISTENT: ' + r.runs.map((x) => x.totals?.calories ?? 'x').join(' / ') + ']' : ''
    console.log(`[${icon}] ${r.id} (${r.category ?? r.type}) — "${r.text}"${drift}`)
    if (r.status !== 'pass') {
      if (r.error) console.log(`       error: ${r.error}`)
      if (r.predicted) {
        console.log(`       predicted: ${JSON.stringify(r.predicted)}`)
        console.log(`       expected:  ${JSON.stringify(r.expected)}`)
        console.log(`       off: ${r.offFields.join(', ')} | foods: ${r.foodNames?.join(' | ')}`)
      }
    }
  }

  const cost = await fetchCost(runStartedAt)
  writeReport(results, datasetFile, cost)
}

// Token usage comes from ai_logs (every OpenRouter call writes one row). The
// inserts are fire-and-forget on the server, so give them a moment to land.
async function fetchCost(since: string): Promise<{ rows: number; usd: number; unpriced: string[] } | null> {
  const serviceKey = SERVICE_KEY
  if (!serviceKey) return null
  await new Promise((r) => setTimeout(r, 3000))
  const url = `${SUPABASE_URL}/rest/v1/ai_logs?select=model,prompt_tokens,completion_tokens` +
    `&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}`
  const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })
  if (!res.ok) return null
  const rows = (await res.json()) as TokenRow[]
  return { rows: rows.length, ...costUsd(rows) }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

function writeReport(
  results: HttpResult[],
  datasetFile: string,
  cost: { rows: number; usd: number; unpriced: string[] } | null,
) {
  const logs = results.filter((r) => r.type === 'log')
  const negatives = results.filter((r) => r.type === 'negative')
  const logsPassed = logs.filter((r) => r.status === 'pass').length
  const negPassed = negatives.filter((r) => r.status === 'pass').length
  const errored = results.filter((r) => r.status === 'error').length

  // Literature-standard calorie metrics against the band midpoint.
  const scored = logs.filter((r) => r.predicted && r.expected?.calories)
  const inCalBand = scored.filter((r) => inBand(r.predicted!.calories, r.expected!.calories!)).length
  const within25 = scored.filter((r) =>
    Math.abs(r.predicted!.calories - mid(r.expected!.calories!)) / mid(r.expected!.calories!) <= 0.25,
  ).length
  const calErrors = summarizeErrors(scored.map((r) => signedError(r.predicted!.calories, r.expected!.calories!)))

  const proteinScored = logs.filter((r) => r.predicted && r.expected?.protein_g)
  const proteinErrors = summarizeErrors(
    proteinScored.map((r) => signedError(r.predicted!.protein_g, r.expected!.protein_g!)),
  )

  const latencies = results.flatMap((r) => r.runs.map((x) => x.latencyMs))
  const logRequests = results.flatMap((r) => r.runs).filter((x) => x.responseType === 'log').length

  console.log('\n' + '─'.repeat(72))
  console.log(`FUNCTION:                    ${FUNCTION_NAME}   (repeat ${REPEAT}, memory ${MEMORY})`)
  console.log(`STRICT (all declared bands): ${logsPassed}/${logs.length} logs passed (${pct(logsPassed / logs.length)})`)
  console.log(`CALORIES IN BAND:            ${inCalBand}/${scored.length} (${pct(inCalBand / scored.length)})`)
  console.log(`CALORIES WITHIN ±25% OF MID: ${within25}/${scored.length} (${pct(within25 / scored.length)})  [literature-comparable]`)
  console.log(`MEDIAN CALORIE ERROR:        ${pct(calErrors.medianAbs)}`)
  console.log(`CALORIE LEAN (signed):       median ${signedPct(calErrors.medianSigned)}   ${calErrors.above} above mid / ${calErrors.below} below`)
  if (proteinErrors.n) {
    console.log(`PROTEIN (${proteinErrors.n} cases):          median error ${pct(proteinErrors.medianAbs)}, lean ${signedPct(proteinErrors.medianSigned)}`)
  }
  if (REPEAT > 1) {
    const judged = logs.filter((r) => r.consistent !== undefined)
    const same = judged.filter((r) => r.consistent).length
    console.log(`CONSISTENCY (same number ×${REPEAT}): ${same}/${judged.length} (${pct(same / Math.max(judged.length, 1))})`)
  }
  console.log(`LATENCY:                     p50 ${(percentile(latencies, 50) / 1000).toFixed(2)}s   p95 ${(percentile(latencies, 95) / 1000).toFixed(2)}s   (${latencies.length} requests)`)
  if (cost) {
    const perLog = logRequests ? cost.usd / logRequests : 0
    console.log(`AI COST:                     $${cost.usd.toFixed(4)} total, ~$${perLog.toFixed(5)} per log (${cost.rows} AI calls)` +
      (cost.unpriced.length ? `   unpriced models: ${cost.unpriced.join(', ')}` : ''))
  } else {
    console.log('AI COST:                     unavailable (needs SUPABASE_SERVICE_ROLE_KEY in .env.local and the ai_logs table)')
  }
  const unsure = logs.filter((r) => r.unsure).length
  console.log(`UNSURE (asked, or left a food out): ${unsure}/${logs.length} (${pct(unsure / Math.max(logs.length, 1))})`)
  // Which tier every logged food took, across all runs (a cold run should show
  // no 'memory'; rough_estimate is D5's flagged repair).
  const tally = new Map<string, number>()
  for (const r of results) for (const run of r.runs) for (const res of run.resolutions ?? []) tally.set(res, (tally.get(res) ?? 0) + 1)
  console.log(`RESOLUTION:                  ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'n/a'}`)
  console.log(`NEGATIVES (no phantom log):  ${negPassed}/${negatives.length}`)
  console.log(`ERRORS: ${errored}`)
  console.log('─'.repeat(72))

  const categories = [...new Set(results.map((r) => r.category).filter(Boolean))] as string[]
  console.log('\nBy category:   strict   |  median calorie lean')
  for (const cat of categories) {
    const inCat = results.filter((r) => r.category === cat)
    const passed = inCat.filter((r) => r.status === 'pass').length
    const lean = median(
      inCat.filter((r) => r.predicted && r.expected?.calories).map((r) => signedError(r.predicted!.calories, r.expected!.calories!)),
    )
    console.log(`  ${cat.padEnd(18)} ${String(passed).padStart(2)}/${String(inCat.length).padEnd(4)} |  ${signedPct(lean)}`)
  }

  const fieldMisses = new Map<string, number>()
  for (const r of logs) for (const f of r.offFields) fieldMisses.set(f, (fieldMisses.get(f) ?? 0) + 1)
  console.log('\nField-level misses:')
  for (const [field, count] of fieldMisses) console.log(`  ${field}: ${count}`)

  const outPath = join(__dirname, `results-${basename(datasetFile, '.json')}-${FUNCTION_NAME}.json`)
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results written to ${outPath}`)
}

main().catch((err) => {
  console.error('Eval run failed:', err)
  process.exit(1)
})
