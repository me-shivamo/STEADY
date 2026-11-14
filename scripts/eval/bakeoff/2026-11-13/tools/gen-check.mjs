// node gen-check.mjs <label> [n]  -> compares usage.cost recorded per call with OpenRouter's /generation total_cost (never prints the key)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const line = readFileSync(join(here, 'wt/scripts/eval/.env.local'), 'utf8').split('\n').find((l) => /^OPENROUTER_API_KEY=/.test(l))
const key = line.slice('OPENROUTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
const [label, n = '6'] = process.argv.slice(2)
const rows = readFileSync(join(here, 'runs', label, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.generation_id)
const step = Math.max(1, Math.floor(rows.length / Number(n)))
for (let i = 0; i < rows.length && i / step < Number(n); i += step) {
  const r = rows[i]
  const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(r.generation_id)}`, { headers: { Authorization: `Bearer ${key}` } })
  const j = await res.json().catch(() => ({}))
  const d = j.data ?? {}
  console.log(JSON.stringify({ kind: r.kind, recorded_cost: r.cost_usd, gen_total_cost: d.total_cost ?? null, gen_usage: d.usage ?? null, upstream_cost: d.upstream_inference_cost ?? null, tokens_prompt: d.tokens_prompt ?? null, native_prompt: d.native_tokens_prompt ?? null, native_completion: d.native_tokens_completion ?? null, native_reasoning: d.native_tokens_reasoning ?? null, rec_prompt: r.prompt_tokens, rec_completion: r.completion_tokens, status: res.status }))
}
