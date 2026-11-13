import { createHash } from 'crypto'

import { SYSTEM_PROMPT } from '../../supabase/functions/_shared/foodParsePrompt'
import { GRAM_HINTS_PROMPT } from '../../supabase/functions/_shared/macroResolver'
import { PHOTO_PROMPT_V1 } from '../../supabase/functions/_shared/photoPrompt'
import { LEGACY_SCENARIOS, traceScenario } from '../../test-utils/legacyTrace'

// PORTION_MODE unset (legacy) must be byte-identical to the code before Phase 5.
// The hashes below were captured from commit 076c7d9 (the branch head before the
// portion engine was wired in) with the same harness (test-utils/legacyTrace.ts):
// every supabase call (table, op, selected columns, filters, payload), every
// outbound request body (USDA, the matcher prompt) and the resolved result.
// The prompt hashes were taken from the same commit: SYSTEM_PROMPT as exported,
// the photo prompt as the template literal in analyze-food-photo/index.ts then.

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

// v1.2 Phase 7, spec (g)1: the fts candidate query reads keyed rows only (`.not('normalized_name','is',null)`,
// and normalized_name in its select), so the key-less USDA rows 055 stores stay invisible to it. The USDA-pick
// reuse lookup (verified row with the same fdc_id) gets the same filter in api + legacy mode (fixer 2026-11-13),
// so a pick never reuses an imported row that has no portions. Those are the intended changes to the legacy
// trace (no effect before 055: every verified row has a key). Removing exactly those edits must give the 076c7d9
// trace back, byte for byte; anything else that changed would still fail the pinned hash.
const FTS_COLUMNS_076 = 'id, name, source, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g'
const FTS_COLUMNS_GUARDED = 'id, name, normalized_name, source, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g'
// deno-lint-ignore no-explicit-any
const isFts = (c: any) => c.table === 'food_items' && c.filters.some((f: unknown[]) => f[0] === 'textSearch')
// deno-lint-ignore no-explicit-any
const isGuard = (f: any[]) => f.length === 4 && f[0] === 'not' && f[1] === 'normalized_name' && f[2] === 'is' && f[3] === null
// deno-lint-ignore no-explicit-any
const isReuse = (c: any) => c.table === 'food_items' && c.columns === 'id, fdc_id, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g'
  // deno-lint-ignore no-explicit-any
  && c.filters.some((f: unknown[]) => f[0] === 'in' && f[1] === 'fdc_id')
function stripFtsGuard(trace: string): { stripped: string; ftsCalls: number; guarded: number; reuseCalls: number; reuseGuarded: number } {
  const t = JSON.parse(trace)
  let ftsCalls = 0, guarded = 0, reuseCalls = 0, reuseGuarded = 0
  for (const c of t.calls) {
    if (isReuse(c)) {
      reuseCalls++
      // deno-lint-ignore no-explicit-any
      if (c.filters.filter((f: any[]) => isGuard(f)).length === 1) reuseGuarded++
      // deno-lint-ignore no-explicit-any
      c.filters = c.filters.filter((f: any[]) => !isGuard(f))
      continue
    }
    if (!isFts(c)) continue
    ftsCalls++
    // deno-lint-ignore no-explicit-any
    if (c.columns === FTS_COLUMNS_GUARDED && c.filters.filter((f: any[]) => isGuard(f)).length === 1) guarded++
    c.columns = c.columns === FTS_COLUMNS_GUARDED ? FTS_COLUMNS_076 : c.columns
    // deno-lint-ignore no-explicit-any
    c.filters = c.filters.filter((f: any[]) => !isGuard(f))
  }
  return { stripped: JSON.stringify(t), ftsCalls, guarded, reuseCalls, reuseGuarded }
}

const PINNED_TRACES: Record<string, string> = {
  'exact hit with portions + memory hit + fts miss (estimate)': '11a015a71a27a8cbc57c14b2865e666767472ef811770c619ebf746ccfd9558d',
  'fts miss: USDA candidate with portions, matcher corrects grams (not remembered)': '0c165679c0318c4008335d9332e0380ae6248a8a37b17693c05a3efe450d1c66',
  'ranked: alias hit, search rows with portions, doubtful estimate retried': '5883c684ac7b8a19efea64e410f4525431533aecb9255589a3f428578b2f2e24',
  'persist:false, memory off, write nothing': '19583819f4fe4a65802a24282af44e01a85efcd34c9817e50047309912e4408e',
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('legacy is byte-identical to the pre-Phase-5 code (apart from the spec (g)1 fts guard)', () => {
  it.each(LEGACY_SCENARIOS.map((s) => [s.name, s] as const))('resolveFoods trace: %s', async (name, s) => {
    expect(sha(stripFtsGuard(await traceScenario(s)).stripped)).toBe(PINNED_TRACES[name])
  })
  it.each(LEGACY_SCENARIOS.map((s) => [s.name, s] as const))('…and with portion explicitly legacy: %s', async (name, s) => {
    expect(sha(stripFtsGuard(await traceScenario(s, { portion: { mode: 'legacy', proposed: false, region: 'IN' } })).stripped)).toBe(PINNED_TRACES[name])
  })
  it.each(LEGACY_SCENARIOS.map((s) => [s.name, s] as const))('…and with RESOLVER_USDA explicitly api (Phase 7): %s', async (name, s) => {
    expect(sha(stripFtsGuard(await traceScenario(s, { usda: 'api' })).stripped)).toBe(PINNED_TRACES[name])
  })
  it.each(LEGACY_SCENARIOS.map((s) => [s.name, s] as const))('the fts guard is on every fts query and nowhere else: %s', async (_name, s) => {
    const raw = await traceScenario(s)
    const { ftsCalls, guarded, reuseCalls, reuseGuarded } = stripFtsGuard(raw)
    expect(guarded).toBe(ftsCalls)
    expect(reuseGuarded).toBe(reuseCalls)
    // ranked scenarios never run the fts query; the fts ones run it once per miss
    expect(ftsCalls > 0).toBe(s.opts.search !== 'ranked' && s.foods.some((f) => !['dal', 'poha', 'milk'].includes(f.name)))
    expect((raw.match(/"not","normalized_name","is",null/g) ?? []).length).toBe(ftsCalls + reuseCalls)
  })
  it('the text parse prompt (V1)', () => {
    expect(sha(SYSTEM_PROMPT)).toBe('09bc9cd3c49ac9d773acfc6c4505418891acc9ac44ae0c2153bd51b228320def')
  })
  it('the photo prompt (V1, moved verbatim to _shared/photoPrompt.ts)', () => {
    expect(sha(PHOTO_PROMPT_V1)).toBe('62d67dc4eef7218f04720c30ead76a90e49b3496b3b09b8ef28e7e9895aaf9a6')
  })
  it('GRAM_HINTS_PROMPT (both V1 prompts embed it)', () => {
    expect(sha(GRAM_HINTS_PROMPT)).toBe('0fe729f546e8f8d54697d483a96ce9ffed203229ed027eee25f962e189d3065a')
  })
})

describe('table mode changes the matcher prompt, legacy does not', () => {
  it('table mode: no portion section, no gram estimate, no corrected_quantity_g in the format', async () => {
    const s = LEGACY_SCENARIOS[1]
    const trace = JSON.parse(await traceScenario(s, { portion: { mode: 'table', proposed: false, region: 'IN' } }))
    const prompt: string = trace.requests.find((r: { matcher?: { messages: Array<{ content: string }> } }) => r.matcher).matcher.messages[0].content
    expect(prompt).not.toContain('ALSO CHECK THE PORTION SIZE')
    expect(prompt).not.toContain('which we currently estimate as')
    expect(prompt).not.toContain('corrected_quantity_g')
    expect(prompt).toContain('TWO TRAPS THAT PRODUCE LARGE, SILENT ERRORS')
  })
})
