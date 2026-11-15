// Intent gate: does the parse prompt LOG a message that names a food or drink, and
// ANSWER (not log) a real question? Founder rule (2026-11-13): logging is the first
// priority; coaching only when the user clearly asks. Every prompt or model change
// must score 85/85 here before it ships. Uses the eval key in scripts/eval/.env.local
// (never the live app's key). It calls the model once per case (85 calls per model):
// check the eval key's budget first (MODEL-TESTING.md) and record the run there.
//
// Usage:
//   npx tsx scripts/eval/intent-check.mts [--prompt=v1|v2] [--dry-run] <model> [more models]
//   npx tsx scripts/eval/intent-check.mts openai/gpt-4o-mini                 # V1, as before
//   npx tsx scripts/eval/intent-check.mts --prompt=v2 openai/gpt-4o-mini     # V2 (pre-table gate)
//
//   --prompt   which system prompt the cases run against (default v1):
//                v1  SYSTEM_PROMPT, what legacy and shadow mode serve (every real user today)
//                v2  SYSTEM_PROMPT_V2, what PORTION_MODE table / eval_only serve. Review correction #9:
//                    V2 has never passed this gate, so a v2 run at 85/85 is a pre-table gate.
//              Both are imported from _shared/foodParsePrompt.ts, so the bytes are production's. Scoring is
//              the same for both: V2 keeps the "intent" and "foods" keys.
//   --dry-run  print the prompt's name, length and sha256 and the case count, then exit: no key read,
//              no network, no cost. Use it to tie a recorded run to the exact prompt bytes.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_V2 } from '../../supabase/functions/_shared/foodParsePrompt.ts'

const PROMPTS: Record<string, { name: string; text: string }> = {
  v1: { name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT },
  v2: { name: 'SYSTEM_PROMPT_V2', text: SYSTEM_PROMPT_V2 },
}
const USAGE = 'usage: npx tsx scripts/eval/intent-check.mts [--prompt=v1|v2] [--dry-run] <model> [more models]'
const args = process.argv.slice(2)
const flags = args.filter(a => a.startsWith('--'))
const models = args.filter(a => !a.startsWith('--'))
const promptArg = flags.find(f => f.startsWith('--prompt='))?.slice('--prompt='.length) ?? 'v1'
const dryRun = flags.includes('--dry-run')
const badFlag = flags.find(f => f !== '--dry-run' && !f.startsWith('--prompt='))
if (badFlag || !PROMPTS[promptArg] || (models.length === 0 && !dryRun)) {
  console.error(badFlag ? `unknown flag ${badFlag}` : !PROMPTS[promptArg] ? `unknown prompt "${promptArg}" (v1 or v2)` : 'no model given')
  console.error(USAGE)
  process.exit(2)
}
const prompt = PROMPTS[promptArg]
const SYSTEM = prompt.text
const cases = JSON.parse(readFileSync(new URL('./dataset-intent.json', import.meta.url), 'utf8'))
const sha = createHash('sha256').update(SYSTEM).digest('hex')
console.log(`Intent check: prompt=${promptArg} (${prompt.name}, ${SYSTEM.length} chars, sha256 ${sha.slice(0, 16)}), ${cases.length} cases`)
if (dryRun) process.exit(0)

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
const key = env.split('\n').find(l => l.startsWith('OPENROUTER_API_KEY='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
for (const model of models) {
  const wrong: string[] = []; let split = 0
  await Promise.all(cases.map(async (c: any, i: number) => {
    await new Promise(r => setTimeout(r, i * 120))
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: c.text }] }) })
    const j: any = await r.json(); const content = String(j.choices?.[0]?.message?.content ?? '')
    let isLog = false, nFoods = 0
    try { const m = content.match(/\{[\s\S]*\}/); const o = m ? JSON.parse(m[0]) : null; isLog = o?.intent === 'log'; nFoods = o?.foods?.length ?? 0 } catch {}
    const want = c.type === 'log'
    if (isLog !== want) wrong.push(`${c.id} ${c.type} "${c.text}" -> ${isLog ? 'LOG' : 'not log: ' + content.slice(0, 90).replace(/\s+/g, ' ')}`)
    if (isLog && want && nFoods > (c.text.split(/,| and | aur |with/).length + 1)) split++
  }))
  const nl = cases.filter((c: any) => c.type === 'log').length, nc = cases.length - nl
  console.log(`\n=== ${model}: ${cases.length - wrong.length}/${cases.length} correct (log ${nl - wrong.filter(w => w.includes(' log ')).length}/${nl}, coach ${nc - wrong.filter(w => w.includes(' coach ')).length}/${nc}); dishes split into many parts: ${split}`)
  wrong.sort().forEach(w => console.log('  WRONG ' + w))
}
