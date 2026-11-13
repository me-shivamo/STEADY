import { readFileSync } from 'fs'
import { join } from 'path'

import { isPortionMemoryOk, mergeMemoryPortion, readMemoryPortions } from '../../supabase/functions/_shared/portionMemory'

// user_food_memory.portions: the TypeScript validator must accept exactly what
// migration 054's public.portion_memory_ok() accepts. The fixture's `sql` column
// is the SQL function's own answer, recorded on a local PG16 copy of live after a
// real CLI push of 054 (2026-11-13).

const fixtures = JSON.parse(readFileSync(join(__dirname, '../../scripts/portions/tests/memory_portions_fixtures.json'), 'utf8')) as {
  cases: Array<{ name: string; value: unknown; sql: boolean }>
}

it('has a real fixture set (both answers present)', () => {
  expect(fixtures.cases.length).toBeGreaterThan(50)
  expect(fixtures.cases.some((c) => c.sql)).toBe(true)
  expect(fixtures.cases.some((c) => !c.sql)).toBe(true)
})

it.each(fixtures.cases.map((c) => [c.name, c] as const))('TS agrees with portion_memory_ok: %s', (_n, c) => {
  expect(isPortionMemoryOk(c.value)).toBe(c.sql)
})

describe('merge (Phase 6 hook)', () => {
  const e = (unit: 'katori' | 'cup', size: 'S' | 'M' | 'L', grams: number, at = '2026-11-13') => ({ unit, size, grams, origin: 'correction' as const, at })
  it('replaces the same unit and size, keeps others, stays valid', () => {
    const out = mergeMemoryPortion([e('katori', 'M', 150), e('cup', 'M', 240, '2026-11-01')], e('katori', 'M', 180))
    expect(out).toEqual([e('cup', 'M', 240, '2026-11-01'), e('katori', 'M', 180)])
    expect(isPortionMemoryOk(out)).toBe(true)
  })
  it('keeps at most 24 entries, oldest first out', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ unit: (['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'mug'] as const)[i % 8], size: (['S', 'M', 'L'] as const)[Math.floor(i / 8)], grams: 10 + i, origin: 'manual' as const, at: `2026-10-${String(1 + i).padStart(2, '0')}` }))
    const out = mergeMemoryPortion(many, { unit: 'spoon', size: 'M', grams: 9, origin: 'manual', at: '2026-11-13' })
    expect(out).toHaveLength(24)
    expect(out[0].at).toBe('2026-10-02')
    expect(isPortionMemoryOk(out)).toBe(true)
  })
  it('an invalid stored value reads as no memory, never throws', () => {
    expect(readMemoryPortions([{ unit: 'ml' }])).toBeNull()
    expect(readMemoryPortions('x')).toBeNull()
    expect(readMemoryPortions([e('katori', 'M', 150)])).toHaveLength(1)
  })
})
