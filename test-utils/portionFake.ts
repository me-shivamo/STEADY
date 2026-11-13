// A fake supabase client for the Phase 5 resolver / calibration tests: it serves
// migration 054's reference tables from the real seed (scripts/portions/data) and
// whatever food rows, memory, aliases and calibrations a test gives it, applying
// the filters the code uses (eq, in, not-null, is-null, or "a.in.(…),b.in.(…)").
// Every call is recorded. Not a PostgREST re-implementation: just enough to keep
// the tests honest about which reads happen and with what keys.

import { buildSeed, type SeedRow } from '../scripts/portions/lib'

export interface FakeCall { table: string; op: string; columns?: string; payload?: unknown; filters: unknown[][] }

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

export function portionFake(data: {
  foodItems?: Row[]
  memory?: Row[]            // user_food_memory rows (with embedded food_items for the resolver read)
  aliases?: Row[]
  search?: Row[]
  calibrations?: Row[]
  profiles?: Row[]
  foodEntries?: Row[]
  rpc?: Record<string, (args: Row) => unknown>
  noPortionTables?: boolean
} = {}) {
  const seed = buildSeed()
  const calls: FakeCall[] = []
  const unitRows = (seed.rows as SeedRow[]).map((r) => ({ ...r }))
  const tables: Record<string, Row[]> = data.noPortionTables ? {} : {
    portion_categories: seed.categories.map((c) => ({ ...c })),
    portion_category_words: seed.words.map((w) => ({ ...w })),
    portion_category_map: seed.map.map((m) => ({ ...m })),
    portion_units: unitRows,
  }
  tables.food_items = data.foodItems ?? []
  tables.user_food_memory = data.memory ?? []
  tables.food_aliases = data.aliases ?? []
  tables.user_portion_calibrations = data.calibrations ?? []
  tables.profiles = data.profiles ?? []
  tables.food_entries = data.foodEntries ?? []

  const matches = (r: Row, f: unknown[]): boolean => {
    const [op, col, ...rest] = f as [string, string, ...unknown[]]
    const v = typeof col === 'string' && col.includes('.') ? r[col.split('.')[0]]?.[col.split('.')[1]] : r[col]
    switch (op) {
      case 'eq': return v === rest[0]
      case 'in': return (rest[0] as unknown[]).includes(v)
      case 'is': return rest[0] === null ? v === null || v === undefined : v === rest[0]
      case 'not': return rest[0] === 'is' && rest[1] === null ? v !== null && v !== undefined : true
      case 'or': {
        return String(col).split(/,(?=[a-z_]+\.in\.)/).some((part) => {
          const m = /^([a-z_]+)\.in\.\((.*)\)$/.exec(part)
          if (!m) return false
          const vals = m[2].split(',')
          const x = r[m[1]]
          return x !== null && x !== undefined && vals.includes(String(x))
        })
      }
      case 'textSearch': return String(r.name ?? '').toLowerCase().includes(String(rest[0]).toLowerCase())
      default: return true   // order, limit: not modelled
    }
  }

  const client = {
    from(table: string) {
      const call: FakeCall = { table, op: 'select', filters: [] }
      let single: 'maybe' | 'one' | null = null
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select(columns: string) { if (call.op === 'select') call.columns = columns; return b },
        insert(payload: unknown) { call.op = 'insert'; call.payload = payload; return b },
        upsert(payload: unknown) { call.op = 'upsert'; call.payload = payload; return b },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return b },
        delete() { call.op = 'delete'; return b },
        maybeSingle() { single = 'maybe'; return b },
        single() { single = 'one'; return b },
        // deno-lint-ignore no-explicit-any
        then(resolve: any, reject: any) {
          calls.push(call)
          let out: unknown = null
          let error: unknown = null
          if (call.op === 'select') {
            const src = tables[table]
            if (!src) error = { message: `relation "public.${table}" does not exist` }
            else {
              const rows = src.filter((r) => call.filters.every((f) => matches(r, f)))
              out = single ? rows[0] ?? null : rows
            }
          }
          return Promise.resolve({ data: out, error }).then(resolve, reject)
        },
      }
      for (const f of ['eq', 'in', 'not', 'is', 'or', 'order', 'limit', 'textSearch', 'range']) {
        b[f] = (...args: unknown[]) => {
          // .or() takes one string: keep it in the column slot
          call.filters.push(f === 'or' ? ['or', args[0]] : [f, ...args])
          return b
        }
      }
      return b
    },
    rpc(fn: string, args: Row) {
      calls.push({ table: `rpc:${fn}`, op: 'rpc', payload: args, filters: [] })
      if (fn === 'search_foods') return Promise.resolve({ data: data.search ?? [], error: null })
      const h = data.rpc?.[fn]
      if (!h) return Promise.resolve({ data: null, error: { message: `function ${fn} missing` } })
      return Promise.resolve({ data: h(args), error: null })
    },
  }
  const reads = (table: string) => calls.filter((c) => c.table === table && c.op === 'select')
  return { client, calls, reads, seed }
}
