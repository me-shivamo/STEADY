// ── Pure eval metrics ────────────────────────────────────────────────────────
// Everything the harness reports that is arithmetic rather than I/O lives here,
// so it can be unit-tested (__tests__/unit/evalMetrics.test.ts). A wrong metric
// is worse than no metric: earlier rounds were misled by a pass rate that
// swung on noise and an "accuracy" that scored broken replies as passes.

export type Band = [number, number]

export const mid = (b: Band) => (b[0] + b[1]) / 2

// Signed relative error against the band midpoint: +0.30 means 30% too high.
// The denominator is floored at 1 kcal / 1 g so near-zero items (green tea,
// black coffee) can't divide by zero or explode into huge percentages.
export function signedError(predicted: number, band: Band): number {
  return (predicted - mid(band)) / Math.max(mid(band), 1)
}

// True median: the average of the two middle values for an even count.
// (The old harness took the upper middle value, which reads slightly high.)
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Nearest-rank percentile, e.g. p=95 for "the slowest 1 in 20".
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * s.length)
  return s[Math.min(Math.max(rank, 1), s.length) - 1]
}

export interface ErrorSummary {
  n: number
  medianAbs: number      // typical size of the miss, ignoring direction
  medianSigned: number   // typical direction: + = we read high
  above: number          // cases predicted above the midpoint
  below: number          // cases predicted below the midpoint
}

// Direction and size are reported separately on purpose: a pipeline can have
// a small median error and still lean high on most cases, which is exactly
// what over-counts a gainer's surplus.
export function summarizeErrors(signed: number[]): ErrorSummary {
  return {
    n: signed.length,
    medianAbs: median(signed.map(Math.abs)),
    medianSigned: median(signed),
    above: signed.filter((e) => e > 0).length,
    below: signed.filter((e) => e < 0).length,
  }
}

// Same input, same number: every repeat must land within `toleranceKcal` of
// every other. Half a kcal absorbs rounding, nothing more.
export function isConsistent(values: number[], toleranceKcal = 0.5): boolean {
  if (values.length < 2) return true
  return Math.max(...values) - Math.min(...values) <= toleranceKcal
}

// USD per million tokens, [input, output], from provider pricing pages as of
// 2026-11 (see docs/research/notes). OpenRouter can differ slightly, so treat
// the result as an estimate. Unknown models are reported, not guessed.
export const PRICES_PER_M: Record<string, [number, number]> = {
  'openai/gpt-4o-mini': [0.15, 0.60],
  'openai/gpt-5-mini': [0.25, 2.00],
  'openai/gpt-5-nano': [0.05, 0.40],
  'openai/gpt-5.6-luna': [0.20, 1.20],
  'openai/gpt-6-luna': [0.10, 0.50],
  'anthropic/claude-haiku-5.5': [0.10, 0.50],
}

export interface TokenRow {
  model: string
  prompt_tokens: number | null
  completion_tokens: number | null
}

export function costUsd(rows: TokenRow[]): { usd: number; unpriced: string[] } {
  let usd = 0
  const unpriced = new Set<string>()
  for (const r of rows) {
    const price = PRICES_PER_M[r.model]
    if (!price) {
      unpriced.add(r.model)
      continue
    }
    usd += ((r.prompt_tokens ?? 0) * price[0] + (r.completion_tokens ?? 0) * price[1]) / 1_000_000
  }
  return { usd, unpriced: [...unpriced] }
}
