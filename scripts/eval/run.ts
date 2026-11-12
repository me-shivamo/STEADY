// ── Food-logging macro accuracy eval ──────────────────────────────────────────
// Runs the REAL production pipeline (parse prompt → resolveFoods()) against a
// curated set of food descriptions with independently-sourced ground-truth
// macro ranges, and reports a pass rate + failure breakdown.
//
// This is Node, not Deno — supabase/functions/_shared/macroResolver.ts and
// usda.ts have zero Deno-only APIs (just fetch + the supabase-js client), so
// they run unmodified here via a relative import. foodParsePrompt.ts (the
// exact SYSTEM_PROMPT log-food-from-text/index.ts uses) is imported the same
// way, so a prompt change in production is automatically picked up here too.
//
// Run:
//   npx tsx scripts/eval/run.ts [--dataset=dataset.json] [--ids=a,b,c]
//                               [--search=fts|ranked] [--repeat=1]
//
//   --dataset  which dataset file in scripts/eval/ (default dataset.json). The
//              v4 format works too: optional per-field bands, and 'negative'
//              cases that pass when the parse step does NOT return a food log.
//   --search   which DB search the resolver uses (v1.2 Phase 4): fts (default,
//              the pre-Phase-4 query) or ranked (food_aliases + search_foods,
//              migration 052). This is the cleanest A/B of Phase 4: same code,
//              same moment, no deploy, nothing written (spec §(d) run A).
//   --repeat   run every case N times and report how many give the identical
//              calories every time. Pass/fail uses the FIRST run.
// Reads scripts/eval/.env.local for secrets (see .env.local.example). Results go
// to results.json for the default dataset + fts, else
// results-<dataset>-inprocess-<search>.json, so an fts and a ranked run of the
// same dataset can be diffed food by food.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'

import { resolveFoods, type ParsedFood } from '../../supabase/functions/_shared/macroResolver.ts'
import { SYSTEM_PROMPT } from '../../supabase/functions/_shared/foodParsePrompt.ts'
import { isConsistent, type Band } from './metrics.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '.env.local') })

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(name.length + 3)
}

const DATASET_FILE = arg('dataset') ?? 'dataset.json'
const SEARCH = arg('search') ?? 'fts'
if (SEARCH !== 'fts' && SEARCH !== 'ranked') {
  console.error(`--search must be fts or ranked (got "${SEARCH}")`)
  process.exit(1)
}
const REPEAT = Math.max(1, Number(arg('repeat') ?? 1) || 1)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const FDC_API_KEY = process.env.FDC_API_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error('Missing required env vars. Copy scripts/eval/.env.local.example to .env.local and fill in the values.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// A throwaway UUID — not a real profiles row. Only used as ai_logs.user_id,
// and aiLogger.ts swallows insert failures (best-effort logging), so an FK
// mismatch there is harmless. The resolver runs with persist:false and
// memory:'off' (see runExample), so this id never owns a food_items row or a
// user_food_memory pointer: the eval reads the shared verified base and writes
// nothing to production.
const EVAL_USER_ID = '00000000-0000-0000-0000-0000000eeeee'

// dataset.json gives all four bands; dataset-v2+ give calories and only the
// diagnostic macros, and add 'negative' cases (not a food log at all).
interface DatasetExample {
  id: string
  type?: 'log' | 'negative'
  text: string
  category: string
  expected?: { calories?: Band; protein_g?: Band; carbs_g?: Band; fat_g?: Band }
  note?: string
}

interface ExampleResult {
  id: string
  text: string
  category: string
  status: 'pass' | 'fail' | 'error'
  predicted?: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  expected?: DatasetExample['expected']
  offFields: string[]
  macroSources: string[]
  // foods[].resolution of the first run (memory, verified_exact, verified_alias, …)
  resolutions?: string[]
  // Foods the resolver could not put a single usable number on (left out of
  // the log) and foods logged as flagged rough estimates — founder decision D5.
  unresolved?: string[]
  roughEstimates?: string[]
  parsedFoods?: ParsedFood[]
  // --repeat > 1 only: calories of every run, and whether they all agree.
  runCalories?: number[]
  consistent?: boolean
  error?: string
}

// ── Step 1: parse (mirrors callOpenRouter() + the food-log branch in
// log-food-from-text/index.ts, minus the agent tool-calling loop — eval
// inputs are always food descriptions, never coaching questions, so there's
// nothing for the model to call a tool for). ──────────────────────────────
async function parseFoods(text: string): Promise<{ intent: string; foods: ParsedFood[] }> {
  const requestBody = {
    model: 'openai/gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current date: ${new Date().toISOString().split('T')[0]}. User's timezone context: messages are in local time.` },
      { role: 'user', content: text },
    ],
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://steadyapp.io',
      'X-Title': 'STEADY-eval',
    },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) throw new Error(`parse call failed: ${res.status} ${await res.text()}`)

  const json = await res.json()
  const content = json.choices[0].message.content as string
  const parsed = JSON.parse(content)
  return { intent: String(parsed.intent), foods: Array.isArray(parsed.foods) ? parsed.foods as ParsedFood[] : [] }
}

function inRange(value: number, [lo, hi]: Band): boolean {
  return value >= lo && value <= hi
}

// One parse → resolve pass, exactly as production runs it for a fresh log.
async function logOnce(text: string) {
  const { intent, foods: parsedFoods } = await parseFoods(text)
  if (intent !== 'log' || parsedFoods.length === 0) {
    throw new Error(`expected a food log, got intent="${intent}"`)
  }
  const resolved = await resolveFoods(supabase, parsedFoods, {
    openRouterKey: OPENROUTER_API_KEY!,
    fdcApiKey: FDC_API_KEY,
    userId: EVAL_USER_ID,
    // Never write to production from an eval, and start every case cold:
    // memory would make the second run of a food measure the first one.
    persist: false,
    memory: 'off',
    // Phase 4 A/B. Aliases still apply under memory:'off' (they are shared
    // verified data, not per-user memory), so ranked runs measure them too.
    search: SEARCH as 'fts' | 'ranked',
  })
  return { parsedFoods, ...resolved }
}

async function runExample(example: DatasetExample): Promise<ExampleResult> {
  try {
    if (example.type === 'negative') {
      // Not a food log: passes when the parse step does not try to log it.
      const { intent, foods } = await parseFoods(example.text)
      const passed = intent !== 'log' || foods.length === 0
      return {
        id: example.id, text: example.text, category: example.category,
        status: passed ? 'pass' : 'fail', offFields: passed ? [] : ['intent'], macroSources: [],
      }
    }

    const { parsedFoods, totals, foods, unresolved } = await logOnce(example.text)

    const offFields: string[] = []
    for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      const band = example.expected?.[field]
      if (band && !inRange(totals[field], band)) offFields.push(field)
    }
    // A food left out of the meal is a failure even if the remaining total
    // happens to land in the band: the user would have to add it by hand.
    if (unresolved.length > 0) offFields.push('unsure')

    // The "same meal, same number" promise. A repeat that errors counts as
    // inconsistent, the same rule run-http.ts uses.
    let runCalories: number[] | undefined
    let consistent: boolean | undefined
    if (REPEAT > 1) {
      runCalories = [totals.calories]
      for (let r = 1; r < REPEAT; r++) {
        try {
          runCalories.push((await logOnce(example.text)).totals.calories)
        } catch {
          // left out of runCalories, so the length check below fails
        }
      }
      consistent = runCalories.length === REPEAT && isConsistent(runCalories)
    }

    return {
      id: example.id,
      text: example.text,
      category: example.category,
      status: offFields.length === 0 ? 'pass' : 'fail',
      predicted: {
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
      },
      expected: example.expected,
      offFields,
      // match_score (ranked only) is search_foods' raw signal, kept for Phase 8.
      macroSources: foods.map((f) =>
        `${f.name} [${f.macro_source}] ${f.quantity_g}g (${f.resolution ?? '?'}${f.match_score !== undefined ? ` ${f.match_score.toFixed(2)}` : ''})`),
      resolutions: foods.map((f) => String(f.resolution ?? 'unknown')),
      unresolved: unresolved.map((u) => `${u.name} (${u.reason})`),
      roughEstimates: foods.filter((f) => f.resolution === 'rough_estimate').map((f) => f.name),
      parsedFoods,
      runCalories,
      consistent,
    }
  } catch (err) {
    return {
      id: example.id,
      text: example.text,
      category: example.category,
      status: 'error',
      offFields: [],
      macroSources: [],
      // Supabase-js throws plain {message, code, details} objects, not Error
      // instances — same shape production's own catch handler (index.ts)
      // already accounts for via `err?.message ?? ...`.
      error: (err as { message?: string })?.message ?? String(err),
    }
  }
}

async function main() {
  const datasetPath = join(__dirname, DATASET_FILE)
  let dataset: DatasetExample[] = JSON.parse(readFileSync(datasetPath, 'utf8'))

  // --ids=id1,id2 restricts the run to specific examples — useful for
  // re-validating a fix against just the case(s) it targeted, without
  // burning OpenRouter/USDA calls re-running the whole dataset.
  const idsArg = process.argv.find((a) => a.startsWith('--ids='))
  if (idsArg) {
    const ids = new Set(idsArg.slice('--ids='.length).split(','))
    dataset = dataset.filter((e) => ids.has(e.id))
  }

  console.log(`Running eval on ${dataset.length} examples from ${DATASET_FILE} (search=${SEARCH}, repeat=${REPEAT}, memory=off, persist=false)...\n`)

  const results: ExampleResult[] = []
  // Sequential, not Promise.all — keeps OpenRouter/USDA rate limits sane and
  // console output readable; a few hundred examples still finish in minutes.
  for (const example of dataset) {
    const result = await runExample(example)
    results.push(result)
    const icon = result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'ERROR'
    console.log(`[${icon}] ${example.id} — "${example.text}"`)
    if (result.status !== 'pass') {
      if (result.error) console.log(`       error: ${result.error}`)
      if (result.predicted) {
        console.log(`       predicted: ${JSON.stringify(result.predicted)}`)
        console.log(`       expected:  ${JSON.stringify(result.expected)}`)
        console.log(`       off: ${result.offFields.join(', ')}`)
        console.log(`       sources: ${result.macroSources.join(' | ')}`)
        if (result.unresolved?.length) console.log(`       left out: ${result.unresolved.join(' | ')}`)
      }
    }
  }

  writeReport(results)
}

function writeReport(results: ExampleResult[]) {
  const total = results.length
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const errored = results.filter((r) => r.status === 'error').length

  console.log('\n' + '─'.repeat(60))
  console.log(`RESULTS: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`)
  console.log(`         ${failed} failed, ${errored} errored`)
  const unsure = results.filter((r) => r.unresolved?.length).length
  const rough = results.filter((r) => r.roughEstimates?.length).length
  console.log(`         ${unsure} with a food left out (unsure), ${rough} with a rough estimate`)
  console.log(`         search=${SEARCH} · dataset=${DATASET_FILE}`)
  if (REPEAT > 1) {
    const logged = results.filter((r) => r.consistent !== undefined)
    const same = logged.filter((r) => r.consistent).length
    console.log(`         consistency: ${same}/${logged.length} cases gave identical calories on all ${REPEAT} runs`)
  }
  console.log('─'.repeat(60))

  // Which tier each food took (first run). The Phase 4 pass criteria are read
  // off this mix: ai_estimate down, reference_match + verified_alias up.
  const tally = new Map<string, number>()
  for (const r of results) for (const res of r.resolutions ?? []) tally.set(res, (tally.get(res) ?? 0) + 1)
  console.log(`\nResolution mix: ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)

  // By category
  const categories = [...new Set(results.map((r) => r.category))]
  console.log('\nBy category:')
  for (const cat of categories) {
    const inCat = results.filter((r) => r.category === cat)
    const catPassed = inCat.filter((r) => r.status === 'pass').length
    console.log(`  ${cat}: ${catPassed}/${inCat.length}`)
  }

  // By macro_source (which resolution tier is producing wrong numbers)
  const sourceCounts = new Map<string, { pass: number; fail: number }>()
  for (const r of results) {
    for (const s of r.macroSources) {
      const source = s.match(/\[([^\]]+)\]/)?.[1] ?? 'unknown'
      const bucket = sourceCounts.get(source) ?? { pass: 0, fail: 0 }
      if (r.status === 'pass') bucket.pass++
      else if (r.status === 'fail') bucket.fail++
      sourceCounts.set(source, bucket)
    }
  }
  console.log('\nBy macro_source (foods appearing in passing vs failing examples):')
  for (const [source, { pass, fail }] of sourceCounts) {
    console.log(`  ${source}: ${pass} pass, ${fail} fail`)
  }

  // Field-level miss breakdown
  const fieldMisses = new Map<string, number>()
  for (const r of results) {
    for (const f of r.offFields) fieldMisses.set(f, (fieldMisses.get(f) ?? 0) + 1)
  }
  console.log('\nField-level misses:')
  for (const [field, count] of fieldMisses) {
    console.log(`  ${field}: ${count}`)
  }

  const outPath = DATASET_FILE === 'dataset.json' && SEARCH === 'fts'
    ? join(__dirname, 'results.json')
    : join(__dirname, `results-${basename(DATASET_FILE, '.json')}-inprocess-${SEARCH}.json`)
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results written to ${outPath}`)
}

main().catch((err) => {
  console.error('Eval run failed:', err)
  process.exit(1)
})
