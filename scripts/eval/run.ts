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
//   npx tsx scripts/eval/run.ts
// Reads scripts/eval/.env.local for secrets (see .env.local.example).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'

import { resolveFoods, type ParsedFood } from '../../supabase/functions/_shared/macroResolver.ts'
import { SYSTEM_PROMPT } from '../../supabase/functions/_shared/foodParsePrompt.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '.env.local') })

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
// mismatch there is harmless. Never used for RLS-gated food_items reads/writes.
const EVAL_USER_ID = '00000000-0000-0000-0000-0000000eeeee'

interface DatasetExample {
  id: string
  text: string
  category: string
  expected: {
    calories: [number, number]
    protein_g: [number, number]
    carbs_g: [number, number]
    fat_g: [number, number]
  }
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
  parsedFoods?: ParsedFood[]
  error?: string
}

// ── Step 1: parse (mirrors callOpenRouter() + the food-log branch in
// log-food-from-text/index.ts, minus the agent tool-calling loop — eval
// inputs are always food descriptions, never coaching questions, so there's
// nothing for the model to call a tool for). ──────────────────────────────
async function parseFoods(text: string): Promise<ParsedFood[]> {
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

  if (parsed.intent !== 'log' || !Array.isArray(parsed.foods) || parsed.foods.length === 0) {
    throw new Error(`expected a food log, got intent="${parsed.intent}"`)
  }

  return parsed.foods as ParsedFood[]
}

function inRange(value: number, [lo, hi]: [number, number]): boolean {
  return value >= lo && value <= hi
}

async function runExample(example: DatasetExample): Promise<ExampleResult> {
  try {
    const parsedFoods = await parseFoods(example.text)
    const { totals, foods } = await resolveFoods(supabase, parsedFoods, {
      openRouterKey: OPENROUTER_API_KEY!,
      fdcApiKey: FDC_API_KEY,
      userId: EVAL_USER_ID,
    })

    const offFields: string[] = []
    for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      if (!inRange(totals[field], example.expected[field])) offFields.push(field)
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
      macroSources: foods.map((f) => `${f.name} [${f.macro_source}] ${f.quantity_g}g`),
      parsedFoods,
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
  const datasetPath = join(__dirname, 'dataset.json')
  let dataset: DatasetExample[] = JSON.parse(readFileSync(datasetPath, 'utf8'))

  // --ids=id1,id2 restricts the run to specific examples — useful for
  // re-validating a fix against just the case(s) it targeted, without
  // burning OpenRouter/USDA calls re-running the whole dataset.
  const idsArg = process.argv.find((a) => a.startsWith('--ids='))
  if (idsArg) {
    const ids = new Set(idsArg.slice('--ids='.length).split(','))
    dataset = dataset.filter((e) => ids.has(e.id))
  }

  console.log(`Running eval on ${dataset.length} examples...\n`)

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
  console.log('─'.repeat(60))

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

  const outPath = join(__dirname, 'results.json')
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results written to ${outPath}`)
}

main().catch((err) => {
  console.error('Eval run failed:', err)
  process.exit(1)
})
