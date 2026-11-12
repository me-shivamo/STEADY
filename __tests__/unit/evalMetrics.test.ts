import {
  costUsd,
  isConsistent,
  median,
  percentile,
  signedError,
  summarizeErrors,
} from '../../scripts/eval/metrics'

describe('eval metrics', () => {
  test('median averages the two middle values for an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([5, 1, 3])).toBe(3)
    expect(median([])).toBe(0)
  })

  test('percentile uses nearest rank', () => {
    const latencies = Array.from({ length: 20 }, (_, i) => (i + 1) * 100) // 100..2000
    expect(percentile(latencies, 50)).toBe(1000)
    expect(percentile(latencies, 95)).toBe(1900)
    expect(percentile([700], 95)).toBe(700)
  })

  test('signedError is positive when we read high, against the band midpoint', () => {
    expect(signedError(130, [80, 120])).toBeCloseTo(0.3)
    expect(signedError(70, [80, 120])).toBeCloseTo(-0.3)
  })

  test('signedError does not explode on near-zero bands', () => {
    expect(Number.isFinite(signedError(5, [0, 0]))).toBe(true)
    expect(signedError(5, [0, 0])).toBe(5)
  })

  test('summarizeErrors separates size from direction', () => {
    const s = summarizeErrors([0.1, 0.2, 0.3, -0.05])
    expect(s.n).toBe(4)
    expect(s.above).toBe(3)
    expect(s.below).toBe(1)
    expect(s.medianSigned).toBeCloseTo(0.15)
    expect(s.medianAbs).toBeCloseTo(0.15)
  })

  test('isConsistent tolerates rounding only', () => {
    expect(isConsistent([412.3, 412.3, 412.6])).toBe(true)
    expect(isConsistent([412, 470])).toBe(false)
    expect(isConsistent([412])).toBe(true)
  })

  test('costUsd prices known models and reports unknown ones', () => {
    const { usd, unpriced } = costUsd([
      { model: 'openai/gpt-4o-mini', prompt_tokens: 1_000_000, completion_tokens: 0 },
      { model: 'openai/gpt-4o-mini', prompt_tokens: 0, completion_tokens: 1_000_000 },
      { model: 'mystery/model', prompt_tokens: 10, completion_tokens: 10 },
    ])
    expect(usd).toBeCloseTo(0.75)
    expect(unpriced).toEqual(['mystery/model'])
  })
})
