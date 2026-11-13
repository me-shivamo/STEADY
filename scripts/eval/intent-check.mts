// Intent gate: does the parse prompt LOG a message that names a food or drink, and
// ANSWER (not log) a real question? Founder rule (2026-11-13): logging is the first
// priority; coaching only when the user clearly asks. Every prompt or model change
// must score 85/85 here before it ships. Uses the eval key in scripts/eval/.env.local
// (never the live app's key). Usage: npx tsx scripts/eval/intent-check.mts openai/gpt-4o-mini [more models]
import { readFileSync } from 'node:fs'
import { SYSTEM_PROMPT } from '../../supabase/functions/_shared/foodParsePrompt.ts'
const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
const key = env.split('\n').find(l => l.startsWith('OPENROUTER_API_KEY='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const cases = JSON.parse(readFileSync(new URL('./dataset-intent.json', import.meta.url), 'utf8'))
const models = process.argv.slice(2)
for (const model of models) {
  const wrong: string[] = []; let split = 0
  await Promise.all(cases.map(async (c: any, i: number) => {
    await new Promise(r => setTimeout(r, i * 120))
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: c.text }] }) })
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
