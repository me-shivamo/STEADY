// Prints the eval key's OpenRouter spend/limit (never the key itself).
// node key-status.mjs   (reads wt/scripts/eval/.env.local)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const line = readFileSync(join(here, 'wt/scripts/eval/.env.local'), 'utf8').split('\n').find((l) => /^OPENROUTER_API_KEY=/.test(l))
if (!line) { console.error('no OPENROUTER_API_KEY in eval .env.local'); process.exit(1) }
const key = line.slice('OPENROUTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } })
const j = await res.json().catch(() => ({}))
if (!res.ok) { console.log(JSON.stringify({ status: res.status, error: j?.error?.message ?? null })); process.exit(2) }
const d = j.data ?? {}
console.log(JSON.stringify({ label_is_set: !!d.label, limit: d.limit, usage: d.usage, limit_remaining: d.limit_remaining, usage_daily: d.usage_daily, is_free_tier: d.is_free_tier, rate_limit: d.rate_limit }))
