// node analyze.mjs <label> [label...]  -> one JSON object per run (metrics for the bake-off report)
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const pctl = (v, p) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.min(Math.max(Math.ceil((p / 100) * s.length), 1), s.length) - 1] }
const r = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

const out = {}
for (const label of process.argv.slice(2)) {
  const dir = join(here, 'runs', label)
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
  const summary = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) : null
  const calls = readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const logCases = results.filter((x) => x.expected && x.expected.calories)
  const neg = results.filter((x) => x.category === 'negative' || (!x.expected && x.id?.startsWith('n')))
  const inBand = logCases.filter((x) => x.predicted && x.predicted.calories >= x.expected.calories[0] && x.predicted.calories <= x.expected.calories[1]).length
  const a = summary?.accuracy
  const byKind = (k) => {
    const ks = calls.filter((c) => c.kind === k)
    const ok = ks.filter((c) => c.ok)
    return {
      calls: ks.length, retries: ks.filter((c) => c.call_in_case > 1).length,
      http_or_api_errors: ks.filter((c) => !c.ok).length,
      empty: ok.filter((c) => c.empty).length,
      json_strict_fail: ok.filter((c) => !c.empty && !c.json_strict_ok).length,
      json_lenient_fail: ok.filter((c) => !c.empty && !c.json_lenient_ok).length,
      schema_fail: ok.filter((c) => !c.empty && c.json_lenient_ok && !c.schema_ok).length,
      finish_length: ok.filter((c) => c.finish_reason === 'length').length,
      latency_ms_p50: pctl(ks.map((c) => c.latency_ms), 50), latency_ms_p95: pctl(ks.map((c) => c.latency_ms), 95),
      mean_prompt_tok: r(ks.reduce((s, c) => s + (c.prompt_tokens ?? 0), 0) / (ks.length || 1)),
      mean_completion_tok: r(ks.reduce((s, c) => s + (c.completion_tokens ?? 0), 0) / (ks.length || 1)),
      mean_reasoning_tok: r(ks.reduce((s, c) => s + (c.reasoning_tokens ?? 0), 0) / (ks.length || 1)),
      cost_usd: r(ks.reduce((s, c) => s + (c.cost_usd ?? 0), 0), 6),
      served_models: [...new Set(ks.map((c) => c.served_model).filter(Boolean))],
      providers: [...new Set(ks.map((c) => c.provider).filter(Boolean))],
      schema_issues: Object.entries(ok.filter((c) => c.schema_issue).reduce((m, c) => ((m[c.schema_issue] = (m[c.schema_issue] ?? 0) + 1), m), {})),
      errors_sample: ks.filter((c) => c.error).slice(0, 3).map((c) => c.error.slice(0, 160)),
    }
  }
  const perLog = new Map()
  for (const c of calls) { const k = `${c.case_id}#${c.rep}`; perLog.set(k, [...(perLog.get(k) ?? []), c]) }
  const logs = [...perLog.values()]
  const sumF = (rs, f) => rs.reduce((s, c) => s + (c[f] ?? 0), 0)
  const totalCost = calls.reduce((s, c) => s + (c.cost_usd ?? 0), 0)
  const costSources = calls.reduce((m, c) => ((m[c.cost_source] = (m[c.cost_source] ?? 0) + 1), m), {})
  out[label] = {
    cases: results.length,
    strict_pass_pct: pct(results.filter((x) => x.status === 'pass').length, results.length),
    passed: results.filter((x) => x.status === 'pass').length,
    failed: results.filter((x) => x.status === 'fail').length,
    errored_cases: results.filter((x) => x.status === 'error').length,
    error_case_ids: results.filter((x) => x.status === 'error').map((x) => `${x.id}: ${String(x.error ?? '').slice(0, 100)}`),
    calories_in_band_pct: pct(inBand, logCases.length), calories_in_band: `${inBand}/${logCases.length}`,
    calorie_median_abs_err_pct: a ? r(a.calories_error.medianAbs * 100) : null,
    calorie_signed_lean_pct: a ? r(a.calories_error.medianSigned * 100) : null,
    calorie_above_below: a ? `${a.calories_error.above} above / ${a.calories_error.below} below (n=${a.calories_error.n})` : null,
    protein_median_abs_err_pct: a ? r(a.protein_error.medianAbs * 100) : null,
    protein_signed_lean_pct: a ? r(a.protein_error.medianSigned * 100) : null,
    consistency: a?.consistency ? `${a.consistency.identical}/${a.consistency.of} identical x${a.consistency.runs}` : null,
    consistency_pct: a?.consistency ? pct(a.consistency.identical, a.consistency.of) : null,
    negatives_handled: `${neg.filter((x) => x.status === 'pass').length}/${neg.length}`,
    unsure_cases: a?.unsure_cases, rough_cases: a?.rough_cases,
    calls: { parse: byKind('parse'), match: byKind('match') },
    all_calls_latency_ms: { p50: pctl(calls.map((c) => c.latency_ms), 50), p95: pctl(calls.map((c) => c.latency_ms), 95) },
    per_log: {
      logs: logs.length,
      wall_ms_p50: summary?.per_log?.wall_ms_p50 ?? null, wall_ms_p95: summary?.per_log?.wall_ms_p95 ?? null,
      llm_ms_p50: pctl(logs.map((rs) => sumF(rs, 'latency_ms')), 50), llm_ms_p95: pctl(logs.map((rs) => sumF(rs, 'latency_ms')), 95),
      calls_mean: r(calls.length / (logs.length || 1), 2),
      prompt_tok_mean: r(sumF(calls, 'prompt_tokens') / (logs.length || 1)),
      completion_tok_mean: r(sumF(calls, 'completion_tokens') / (logs.length || 1)),
      reasoning_tok_mean: r(sumF(calls, 'reasoning_tokens') / (logs.length || 1)),
      cost_usd_mean: r(totalCost / (logs.length || 1), 7),
      cost_usd_p95: r(pctl(logs.map((rs) => sumF(rs, 'cost_usd')), 95), 7),
    },
    total_cost_usd: r(totalCost, 5),
    cost_sources: costSources,
    aborted: summary?.aborted ?? null,
  }
}
console.log(JSON.stringify(out, null, 2))
