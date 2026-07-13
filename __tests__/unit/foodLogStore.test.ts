// Unit tests for the pure helpers exported from src/store/foodLogStore.ts.
// Traces TEST_SCENARIOS.md §3 (the "Unit (mock)" scenarios that are really
// pure-function tests once isolated from the Supabase-calling store methods).
//
// NOTE: this file does NOT touch useFoodLogStore (the Zustand store itself) —
// that requires mocking supabase and belongs to the Component-layer tests
// (see the "Export sumTotals/todayDate" step in the current test buildout).

import { sumTotals, todayDate, MealCard } from '../../src/store/foodLogStore';
import { Tables } from '../../src/types/database';

type FoodEntry = Tables<'food_entries'>;

// Fixture factory: sumTotals only reads calories/protein_g/carbs_g/fat_g, so
// this only fills those in — the cast covers the many DB-only columns
// (id, meal_log_id, timestamps, ...) that are irrelevant to this function.
function entry(overrides: Partial<FoodEntry>): FoodEntry {
  return {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    ...overrides,
  } as FoodEntry;
}

function meal(entries: FoodEntry[]): MealCard {
  return {
    id: 'meal-1',
    meal_name: 'Test Meal',
    meal_type: 'breakfast',
    logged_date: '2026-07-12',
    created_at: '2026-07-12T08:00:00.000Z',
    photo_url: null,
    input_text: null,
    entries,
  };
}

describe('sumTotals', () => {
  it('returns all-zero totals for an empty meal list', () => {
    expect(sumTotals([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it('returns all-zero totals when meals exist but have no entries', () => {
    expect(sumTotals([meal([]), meal([])])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it('sums a single entry across all four macro fields', () => {
    const result = sumTotals([meal([entry({ calories: 250, protein_g: 20, carbs_g: 30, fat_g: 8 })])]);
    expect(result).toEqual({ calories: 250, protein_g: 20, carbs_g: 30, fat_g: 8 });
  });

  it('sums multiple entries within one meal AND across multiple meals', () => {
    const mealA = meal([
      entry({ calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }),
      entry({ calories: 50, protein_g: 5, carbs_g: 5, fat_g: 1 }),
    ]);
    const mealB = meal([entry({ calories: 300, protein_g: 25, carbs_g: 20, fat_g: 10 })]);

    const result = sumTotals([mealA, mealB]);
    expect(result).toEqual({ calories: 450, protein_g: 40, carbs_g: 35, fat_g: 13 });
  });

  it('treats null macro fields as 0 rather than propagating null/NaN', () => {
    // protein_g/fat_g are NOT NULL in the DB (see 001_initial_schema.sql), so this
    // null can never actually arrive from Supabase — but sumTotals should still
    // defend against it (upstream resolver logic, future schema changes, etc.),
    // so we force the type here to exercise that defensive branch.
    const result = sumTotals([
      meal([
        entry({ calories: 200, protein_g: null, carbs_g: 15, fat_g: null } as unknown as Partial<FoodEntry>),
      ]),
    ]);
    expect(result).toEqual({ calories: 200, protein_g: 0, carbs_g: 15, fat_g: 0 });
    expect(Number.isNaN(result.protein_g)).toBe(false);
  });

  it('rounds the final totals to 1 decimal place to suppress floating-point noise', () => {
    // 0.1 + 0.2 style drift: three entries of 0.1 protein_g should not surface as
    // something like 0.30000000000000004 in the UI.
    const result = sumTotals([
      meal([
        entry({ protein_g: 0.1 }),
        entry({ protein_g: 0.1 }),
        entry({ protein_g: 0.1 }),
      ]),
    ]);
    expect(result.protein_g).toBe(0.3);
  });
});

describe('todayDate', () => {
  it('returns a YYYY-MM-DD string (ISO date, no time component)', () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the date portion of a fresh Date().toISOString() call', () => {
    // Loosely coupled to "now" on purpose — avoids re-deriving Date mocking
    // machinery here; this just confirms todayDate() truly reflects the
    // current date rather than being hardcoded or off-by-one.
    const expected = new Date().toISOString().split('T')[0];
    expect(todayDate()).toBe(expected);
  });
});
