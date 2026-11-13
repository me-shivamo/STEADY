// Records everything resolveFoods() does on a fixed set of inputs — every
// supabase call (table, operation, selected columns, filters, payload) and
// every outbound request body (USDA and the matcher) — as one normalized JSON
// string. The Phase 5 legacy-identity test (portionLegacy.test.ts) hashes it and
// compares with the hash the same scenarios gave BEFORE the portion engine was
// wired in (captured at commit 076c7d9), so "PORTION_MODE unset = byte-identical"
// is a measured fact, not a promise.
//
// Random ids (crypto.randomUUID for private rows) and timestamps are replaced by
// placeholders in order of first appearance, so the trace is deterministic.
//
// Plain module (no jest globals) so it can also run under tsx.

import { resolveFoods, type ParsedFood } from '../supabase/functions/_shared/macroResolver'

interface Call { table: string; op: string; columns?: string; payload?: unknown; filters: unknown[][] }

// deno-lint-ignore no-explicit-any
type Rows = Record<string, any[] | undefined>

function fakeSupabase(rows: Rows) {
  const calls: Call[] = []
  const answer = (c: Call): unknown[] | null => {
    if (c.op !== 'select') return null
    if (c.table === 'user_food_memory') return rows.memory ?? []
    if (c.table === 'food_aliases') return rows.alias ?? []
    if (c.table === 'food_items') {
      if (c.filters.some(([f]) => f === 'textSearch')) return rows.fuzzy ?? []
      if (c.filters.some(([f, col]) => f === 'in' && col === 'normalized_name')) return rows.exact ?? []
      if (c.filters.some(([f, col]) => f === 'in' && col === 'fdc_id')) return rows.verifiedUsda ?? []
      return []
    }
    return []
  }
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select(columns: string) { if (call.op === 'select') call.columns = columns; return builder },
        insert(payload: unknown) { call.op = 'insert'; call.payload = payload; return builder },
        upsert(payload: unknown, o?: unknown) { call.op = 'upsert'; call.payload = { payload, o }; return builder },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return builder },
        delete() { call.op = 'delete'; return builder },
        // deno-lint-ignore no-explicit-any
        then(resolve: any, reject: any) {
          calls.push(call)
          return Promise.resolve({ data: answer(call), error: null }).then(resolve, reject)
        },
      }
      for (const f of ['eq', 'in', 'not', 'textSearch', 'order', 'limit', 'range', 'or', 'is']) {
        builder[f] = (...args: unknown[]) => { call.filters.push([f, ...args]); return builder }
      }
      return builder
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: `rpc:${fn}`, op: 'select', payload: args, filters: [] })
      return Promise.resolve({ data: rows.search ?? [], error: null })
    },
  }
  return { client, calls }
}

// deno-lint-ignore no-explicit-any
const per100 = (id: string, source: string, kcal: number, extra: Record<string, any> = {}) => ({
  id, source, status: 'verified', calories_per_100g: kcal, protein_per_100g: 3, carbs_per_100g: 5,
  fat_per_100g: 3, fiber_per_100g: 0, portions: null, ...extra,
})
const pf = (name: string, quantity_description: string, quantity_g: number): ParsedFood =>
  ({ name, quantity_description, quantity_g, confidence: 0.9 })

interface Scenario {
  name: string
  rows: Rows
  foods: ParsedFood[]
  // deno-lint-ignore no-explicit-any
  opts: Record<string, any>
  // deno-lint-ignore no-explicit-any
  matcher: any[][]
  usda?: unknown[]
}

const pick = (i: number, corrected: number | null = null) => ({ candidate_index: i, est_per_100g: null, corrected_quantity_g: corrected })
const est = (kcal: number, p: number, c: number, f: number) =>
  ({ candidate_index: null, est_per_100g: { calories: kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: 0 }, corrected_quantity_g: null })

export const LEGACY_SCENARIOS: Scenario[] = [
  {
    name: 'exact hit with portions + memory hit + fts miss (estimate)',
    rows: {
      exact: [{ ...per100('dal-row', 'indb', 100, { portions: [{ description: '1 katori', gramWeight: 150 }, { description: '1 bowl (1 cup)', gramWeight: 240 }] }), normalized_name: 'dal' }],
      memory: [{ normalized_name: 'poha', origin: 'ai_estimate', food_items: per100('my-poha', 'ai_estimated', 130, { status: 'unverified' }) }],
    },
    foods: [pf('dal', '1 bowl', 200), pf('poha', '1 plate', 200), pf('mystery curry', '1 katori', 150)],
    opts: {},
    matcher: [[est(150, 5, 20, 5)]],
  },
  {
    name: 'fts miss: USDA candidate with portions, matcher corrects grams (not remembered)',
    rows: {
      fuzzy: [{ id: 'indb-sambar', name: 'Sambar', source: 'indb', calories_per_100g: 60, protein_per_100g: 3, carbs_per_100g: 8, fat_per_100g: 2, fiber_per_100g: 1 }],
      verifiedUsda: [{ id: 'shared-sambar', fdc_id: 7, calories_per_100g: 90, protein_per_100g: 4, carbs_per_100g: 10, fat_per_100g: 3, fiber_per_100g: 1 }],
    },
    foods: [pf('sambhar', '2 cups', 300)],
    opts: { fdcApiKey: 'fdc-key' },
    matcher: [[pick(1, 480)]],
    usda: [{ fdcId: 7, description: 'Sambar, cooked', dataType: 'Survey (FNDDS)', foodNutrients: [{ nutrientId: 1008, value: 90 }, { nutrientId: 1003, value: 4 }],
      foodMeasures: [{ disseminationText: '1 cup', gramWeight: 240 }, { disseminationText: '1 serving', gramWeight: 200 }] }],
  },
  {
    name: 'ranked: alias hit, search rows with portions, doubtful estimate retried',
    rows: {
      alias: [{ alias: 'curd', food_items: per100('dahi', 'usda', 61, { portions: [{ description: '1 cup', gramWeight: 245 }] }) }],
      search: [
        { ...per100('roti-row', 'indb', 244, { portions: [{ description: '1 piece', gramWeight: 40 }] }), name: 'Roti', match_kind: 'trgm', score: 0.7, matched_key: 'roti' },
      ],
    },
    foods: [pf('curd', '1 bowl', 200), pf('roti', '2 pieces', 80), pf('zorblax', '1 plate', 200)],
    opts: { search: 'ranked' },
    matcher: [[pick(0), est(200, 8, 25, 8)], [est(120, 4, 18, 3)]],
  },
  {
    name: 'persist:false, memory off, write nothing',
    rows: { exact: [{ ...per100('shared-milk', 'usda', 61, { portions: [{ description: '1 cup', gramWeight: 244 }] }), normalized_name: 'milk' }] },
    foods: [pf('milk', '1 glass', 250), pf('milk', 'half cup', 120)],
    opts: { memory: 'off', persist: false },
    matcher: [],
  },
]

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g

function normalize(s: string): string {
  const ids = new Map<string, string>()
  return s
    .replace(UUID_RE, (u) => { if (!ids.has(u)) ids.set(u, `<uuid${ids.size}>`); return ids.get(u)! })
    .replace(ISO_RE, '<ts>')
}

// Runs one scenario; returns the normalized trace. `extraOpts` lets the caller
// pass the Phase 5 options explicitly set to their legacy values.
// deno-lint-ignore no-explicit-any
export async function traceScenario(s: Scenario, extraOpts: Record<string, any> = {}): Promise<string> {
  const sb = fakeSupabase(s.rows)
  const requests: unknown[] = []
  const answers = [...s.matcher]
  const prevFetch = (globalThis as { fetch?: unknown }).fetch
  ;(globalThis as { fetch?: unknown }).fetch = async (url: string, init: { body?: string } = {}) => {
    if (String(url).includes('api.nal.usda.gov')) {
      requests.push({ usda: String(url).replace(/api_key=[^&]+/, 'api_key=<k>'), body: init.body ?? null })
      return { ok: true, json: async () => ({ foods: s.usda ?? [] }), text: async () => '' }
    }
    const body = JSON.parse(init.body ?? '{}')
    requests.push({ matcher: body })
    const matches = answers.shift() ?? []
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches }) } }], usage: {} }),
      text: async () => '',
    }
  }
  const quiet = { log: console.log, warn: console.warn, error: console.error }
  console.log = () => {}; console.warn = () => {}; console.error = () => {}
  try {
    const result = await resolveFoods(sb.client, s.foods, { openRouterKey: 'k', fdcApiKey: '', userId: 'user-1', ...s.opts, ...extraOpts })
    // ai_logs inserts are fire-and-forget telemetry; their timing is not part of the contract
    const calls = sb.calls.filter((c) => c.table !== 'ai_logs')
    return normalize(JSON.stringify({ result, calls, requests }))
  } finally {
    Object.assign(console, quiet)
    ;(globalThis as { fetch?: unknown }).fetch = prevFetch
  }
}
