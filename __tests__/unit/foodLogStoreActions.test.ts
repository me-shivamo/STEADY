// Store-action tests for src/store/foodLogStore.ts (Phase 9 logging fixes).
// The pure helpers (sumTotals, todayDate) are covered in foodLogStore.test.ts;
// this file mocks Supabase and exercises the actions themselves:
//   B1  log to the day being viewed, don't show a card on the wrong day, and
//       follow "today" across midnight
//   B2  an edit keeps the user's original caption
//   B3  Adjust Macros writes only changed fields and marks them user_created
//   B4  a photo clarification comes back as a question, not an error
//   B6  the server's typed ai_parse_failed error reaches the app intact
//   B7  every attempt ends in exactly one outcome event
//   B8  food_corrected carries only enums, buckets and counts

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

import { supabase } from '../../src/api/supabase';
import { posthog } from '../../src/utils/posthog';
import { useFoodLogStore, MealCard, todayDate, FoodLogError } from '../../src/store/foodLogStore';
import { toUserMessage } from '../../src/utils/errors';
import { Tables } from '../../src/types/database';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;
const { makeQueryResult } = require('../../test-utils/supabaseMock');
const capture = posthog.capture as jest.Mock;

type FoodEntry = Tables<'food_entries'>;

const PAST = '2026-11-10';
const OTHER = '2026-11-11';

function entry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: 'entry-1',
    meal_log_id: 'meal-1',
    user_id: 'test-user-id',
    food_item_id: 'food-1',
    food_name: 'banana',
    quantity_g: 120,
    quantity_label: '1 medium',
    calories: 100,
    protein_g: 1.3,
    carbs_g: 27.4,
    fat_g: 0.4,
    fiber_g: 3,
    sugar_g: null,
    sodium_mg: null,
    source: 'ai_text',
    ai_confidence: null,
    macro_source: 'usda',
    created_at: '2026-11-10T08:00:00.000Z',
    ...overrides,
  } as FoodEntry;
}

function card(overrides: Partial<MealCard> = {}): MealCard {
  return {
    id: 'meal-1',
    meal_name: 'Snack',
    meal_type: 'snack',
    logged_date: PAST,
    created_at: '2026-11-10T08:00:00.000Z',
    photo_url: null,
    input_text: 'ate a banana',
    entries: [entry()],
    ...overrides,
  };
}

// The body log-food-from-text returns for a successful food log.
function logResponse(loggedDate: string, overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    type: 'log',
    meal_log_id: 'meal-new',
    meal_name: 'Banana',
    meal_type: 'snack',
    logged_date: loggedDate,
    input_text: 'ate a banana',
    entries: [entry({ id: 'entry-new', meal_log_id: 'meal-new' })],
    ...overrides,
  };
}

function invokeResolves(data: unknown, error: unknown = null) {
  mockSupabase.functions.invoke.mockResolvedValueOnce({ data, error });
}

function lastInvokeBody(): Record<string, any> {
  const calls = mockSupabase.functions.invoke.mock.calls;
  return calls[calls.length - 1][1].body;
}

function events(name: string): Record<string, unknown>[] {
  return capture.mock.calls.filter(c => c[0] === name).map(c => c[1]);
}

const OUTCOMES = ['meal_logged', 'meal_log_failed', 'ai_question_answered'];
function outcomeCount(): number {
  return capture.mock.calls.filter(c => OUTCOMES.includes(c[0])).length;
}

// Privacy rule: every string an event carries must be an enum or a bucket —
// never a food name, the user's text, or an error message.
function expectNoFreeText() {
  for (const [, props] of capture.mock.calls) {
    for (const value of Object.values(props ?? {})) {
      if (typeof value !== 'string') continue;
      expect(value).toMatch(/^(?:[a-z_]+|<?\d+(?:-\d+)?\+?|\d{4}-\d{2}-\d{2})$/);
      expect(value).not.toMatch(/banana|dal|reading/i);
    }
  }
}

const initialState = useFoodLogStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useFoodLogStore.setState(initialState, true);
  // toUserMessage logs the original error on purpose; keep test output clean.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expectNoFreeText();
  jest.restoreAllMocks();
});

// ── B1: log to the viewed day ────────────────────────────────────────────────
describe('logMealFromText — logged date (B1)', () => {
  it('sends the viewed day as logged_date and shows the card on that day', async () => {
    useFoodLogStore.setState({ selectedDate: PAST });
    invokeResolves(logResponse(PAST));

    const result = await useFoodLogStore.getState().logMealFromText('ate a banana', undefined, PAST);

    expect(lastInvokeBody().logged_date).toBe(PAST);
    expect(result.type).toBe('log');
    const state = useFoodLogStore.getState();
    expect(state.meals.map(m => m.id)).toEqual(['meal-new']);
    expect(state.totals.calories).toBe(100);
    expect(state.isLogging).toBe(false);
  });

  it('defaults to today when no date is given', async () => {
    invokeResolves(logResponse(todayDate()));

    await useFoodLogStore.getState().logMealFromText('ate a banana');

    expect(lastInvokeBody().logged_date).toBe(todayDate());
    expect(useFoodLogStore.getState().meals).toHaveLength(1);
  });

  it('does not add the card to a different day the user switched to mid-flight', async () => {
    useFoodLogStore.setState({ selectedDate: PAST });
    let resolveInvoke!: (v: unknown) => void;
    mockSupabase.functions.invoke.mockReturnValueOnce(new Promise(r => { resolveInvoke = r; }));

    const pending = useFoodLogStore.getState().logMealFromText('ate a banana', undefined, PAST);
    // The user swipes to another day while the AI is working.
    useFoodLogStore.setState({ selectedDate: OTHER, meals: [] });
    resolveInvoke({ data: logResponse(PAST), error: null });
    const result = await pending;

    expect(result.type).toBe('log'); // still saved, still returned
    const state = useFoodLogStore.getState();
    expect(state.meals).toEqual([]);
    expect(state.totals.calories).toBe(0);
    expect(state.isLogging).toBe(false);
  });
});

describe('logMealFromPhoto — logged date (B1)', () => {
  it('sends the viewed day as logged_date', async () => {
    useFoodLogStore.setState({ selectedDate: PAST });
    invokeResolves({ ...logResponse(PAST), photo_url: 'https://signed/url' });

    const result = await useFoodLogStore.getState().logMealFromPhoto('b64', 'image/jpeg', undefined, PAST);

    expect(mockSupabase.functions.invoke.mock.calls[0][0]).toBe('analyze-food-photo');
    expect(lastInvokeBody().logged_date).toBe(PAST);
    expect(result.type).toBe('log');
    expect(useFoodLogStore.getState().meals).toHaveLength(1);
  });
});

// ── B4: photo clarification ──────────────────────────────────────────────────
describe('logMealFromPhoto — clarification (B4)', () => {
  it("returns the AI's question instead of throwing", async () => {
    invokeResolves({
      success: false,
      type: 'needs_clarification',
      message: 'Is that dal or sambar? Could you type it in?',
    });

    const result = await useFoodLogStore.getState().logMealFromPhoto('b64', 'image/jpeg');

    expect(result).toEqual({
      type: 'needs_clarification',
      message: 'Is that dal or sambar? Could you type it in?',
    });
    const state = useFoodLogStore.getState();
    expect(state.isLogging).toBe(false);
    expect(state.meals).toEqual([]);
    expect(events('meal_log_failed')).toEqual([{ source: 'photo', reason: 'needs_clarification', is_today: true }]);
    expect(outcomeCount()).toBe(1);
  });

  it('falls back to the error field, then to fixed copy, when message is missing', async () => {
    invokeResolves({ success: false, type: 'needs_clarification', error: 'Could you type the foods?' });
    const a = await useFoodLogStore.getState().logMealFromPhoto('b64', 'image/jpeg');
    expect(a).toEqual({ type: 'needs_clarification', message: 'Could you type the foods?' });

    invokeResolves({ success: false, type: 'needs_clarification' });
    const b = await useFoodLogStore.getState().logMealFromPhoto('b64', 'image/jpeg');
    expect(b.type).toBe('needs_clarification');
    expect(b.type === 'needs_clarification' && b.message.length).toBeGreaterThan(0);
  });

  it('still throws for a real failure', async () => {
    invokeResolves(null, { message: 'Edge Function returned a non-2xx status code' });
    await expect(
      useFoodLogStore.getState().logMealFromPhoto('b64', 'image/jpeg')
    ).rejects.toThrow();
    expect(events('meal_log_failed')).toHaveLength(1);
    expect(outcomeCount()).toBe(1);
  });
});

// ── B6 + B7: typed errors and one outcome per attempt ────────────────────────
describe('logMealFromText — outcomes (B6, B7)', () => {
  it('surfaces ai_parse_failed as a typed error with its own reason and copy', async () => {
    invokeResolves({
      success: false,
      error: 'Something went wrong reading that — please try again.',
      error_code: 'ai_parse_failed',
      water_logged: false,
    });

    let caught: FoodLogError | undefined;
    await useFoodLogStore.getState().logMealFromText('how much protein in dal?').catch(e => { caught = e; });

    expect(caught?.code).toBe('ai_parse_failed');
    expect(caught?.waterLogged).toBeUndefined();
    expect(events('meal_log_failed')).toEqual([{ source: 'text', reason: 'ai_parse_failed', is_today: true }]);
    expect(outcomeCount()).toBe(1);
    expect(toUserMessage(caught, 'logMeal')).toBe('Something went wrong reading that. Please try again.');
    expect(useFoodLogStore.getState().isLogging).toBe(false);
  });

  it('flags a failed turn that already logged water, so the caller can refresh', async () => {
    invokeResolves({ success: false, error: 'x', error_code: 'ai_parse_failed', water_logged: true });

    let caught: FoodLogError | undefined;
    await useFoodLogStore.getState().logMealFromText('log 500ml water').catch(e => { caught = e; });

    expect(caught?.waterLogged).toBe(true);
  });

  it('counts an "unsure" reply as a failed log, not a question answered', async () => {
    invokeResolves({
      success: true,
      type: 'answer',
      reply: "I couldn't put a number on that — what was in it?",
      water_logged: false,
      needs_clarification: true,
    });

    const result = await useFoodLogStore.getState().logMealFromText('had the usual');

    expect(result.type).toBe('answer');
    expect(events('meal_log_failed')).toEqual([{ source: 'text', reason: 'needs_clarification', is_today: true }]);
    expect(events('ai_question_answered')).toEqual([]);
    expect(outcomeCount()).toBe(1);
  });

  it('counts a real answer as ai_question_answered', async () => {
    invokeResolves({ success: true, type: 'answer', reply: 'About 7 g.', water_logged: false });

    await useFoodLogStore.getState().logMealFromText('protein in dal?');

    expect(events('ai_question_answered')).toEqual([{ water_logged: false }]);
    expect(outcomeCount()).toBe(1);
  });

  it('counts a successful log as meal_logged', async () => {
    invokeResolves(logResponse(todayDate()));

    await useFoodLogStore.getState().logMealFromText('ate a banana');

    expect(events('meal_logged')).toEqual([
      expect.objectContaining({ source: 'text', item_count: 1, has_photo: false, is_today: true }),
    ]);
    expect(outcomeCount()).toBe(1);
  });

  it('marks outcomes of a past-day log is_today: false', async () => {
    useFoodLogStore.setState({ selectedDate: PAST });
    invokeResolves(logResponse(PAST));
    await useFoodLogStore.getState().logMealFromText('ate a banana', undefined, PAST);

    invokeResolves({ success: false, error: 'x', error_code: 'ai_parse_failed' });
    await useFoodLogStore.getState().logMealFromText('ate a banana', undefined, PAST).catch(() => {});

    expect(events('meal_logged')).toEqual([expect.objectContaining({ is_today: false })]);
    expect(events('meal_log_failed')).toEqual([{ source: 'text', reason: 'ai_parse_failed', is_today: false }]);
  });

  it('keeps the old behaviour for an untyped server error', async () => {
    invokeResolves({ success: false, error: 'Meal not found' });

    let caught: FoodLogError | undefined;
    await useFoodLogStore.getState().logMealFromText('ate a banana').catch(e => { caught = e; });

    expect(caught?.code).toBeUndefined();
    expect(events('meal_log_failed')).toEqual([{ source: 'text', reason: 'not_found', is_today: true }]);
    expect(toUserMessage(caught, 'logMeal')).toBe("We couldn't log that meal. Please try again.");
  });
});

// ── B2 + B8: edits ───────────────────────────────────────────────────────────
describe('editMealFromText (B2, B8)', () => {
  it("keeps the user's caption and restores it when an older function overwrote it", async () => {
    useFoodLogStore.setState({ selectedDate: PAST, meals: [card()] });
    invokeResolves(logResponse(PAST, {
      meal_log_id: 'meal-1',
      // Older deployed versions echo the edit text back as input_text (and
      // wrote it into meal_logs.caption), with no caption_kept flag.
      input_text: 'Banana (2 medium)',
      entries: [entry({ id: 'entry-2', quantity_g: 240, quantity_label: '2 medium', calories: 200 })],
    }));
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null)); // caption restore

    const updated = await useFoodLogStore.getState().editMealFromText('meal-1', 'Banana (2 medium)');

    expect(updated.input_text).toBe('ate a banana');
    expect(useFoodLogStore.getState().meals[0].input_text).toBe('ate a banana');

    expect(mockSupabase.from).toHaveBeenCalledWith('meal_logs');
    const builder = mockSupabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ caption: 'ate a banana' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'meal-1');

    const body = lastInvokeBody();
    expect(body.meal_log_id).toBe('meal-1');
    expect(body.logged_date).toBe(PAST);
    expect(body.previous_entries).toEqual([
      expect.objectContaining({ name: 'banana', quantity_g: 120, macro_source: 'usda' }),
    ]);

    expect(events('food_corrected')).toEqual([
      { method: 'edit', macro_source: 'usda', basis: 'calories', direction: 'up', change_bucket: '100+' },
    ]);
  });

  it('writes nothing back when the function kept the caption itself', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    invokeResolves(logResponse(PAST, {
      meal_log_id: 'meal-1',
      input_text: 'ate a banana',
      caption_kept: true,
      entries: [entry({ calories: 200 })],
    }));

    const updated = await useFoodLogStore.getState().editMealFromText('meal-1', 'Banana (2 medium)');

    expect(updated.input_text).toBe('ate a banana');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('leaves a caption-less card (a photo just logged) without a gray line, and restores null', async () => {
    useFoodLogStore.setState({
      meals: [card({
        input_text: null,
        entries: [entry(), entry({ id: 'entry-b', macro_source: 'ai_estimated', calories: 100 })],
      })],
    });
    invokeResolves(logResponse(PAST, {
      meal_log_id: 'meal-1',
      input_text: 'Banana (1 medium)',
      entries: [entry({ calories: 90 }), entry({ id: 'entry-b', calories: 90 })],
    }));

    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null)); // caption restore

    const updated = await useFoodLogStore.getState().editMealFromText('meal-1', 'Banana (1 medium)');

    // The card showed no caption before the edit, so it shows none after:
    // the AI's summary is not the user's words.
    expect(updated.input_text).toBeNull();
    // An older function overwrote the stored caption with the summary; put
    // back what the card showed.
    const builder = mockSupabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ caption: null });
    // 200 → 180 kcal is a 10% cut across a mixed-source meal.
    expect(events('food_corrected')).toEqual([
      { method: 'edit', macro_source: 'mixed', basis: 'calories', direction: 'down', change_bucket: '10-25' },
    ]);
  });

  it('reports a typed parse failure on an edit and leaves the meal alone', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    invokeResolves({ success: false, error: 'x', error_code: 'ai_parse_failed' });

    await expect(
      useFoodLogStore.getState().editMealFromText('meal-1', 'Banana (2 medium)')
    ).rejects.toMatchObject({ code: 'ai_parse_failed' });

    expect(events('meal_edit_failed')).toEqual([{ reason: 'ai_parse_failed' }]);
    expect(events('food_corrected')).toEqual([]);
    expect(useFoodLogStore.getState().meals[0]).toEqual(card());
  });
});

// ── B3 + B8: Adjust Macros ───────────────────────────────────────────────────
describe('updateEntryMacros (B3, B8)', () => {
  it('writes only the given fields and marks the entry user_created', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

    const written = await useFoodLogStore.getState().updateEntryMacros('meal-1', 'entry-1', { calories: 80 });

    expect(written).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('food_entries');
    const builder = mockSupabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ calories: 80, macro_source: 'user_created' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'entry-1');

    const e = useFoodLogStore.getState().meals[0].entries[0];
    expect(e.calories).toBe(80);
    expect(e.protein_g).toBe(1.3); // untouched field keeps its exact value
    expect(e.macro_source).toBe('user_created');
    expect(e.food_item_id).toBe('food-1'); // kept for the edit-rescale guard
    expect(useFoodLogStore.getState().totals.calories).toBe(80);

    expect(events('food_corrected')).toEqual([{
      method: 'adjust_macros',
      macro_source: 'usda', // the source being corrected, not the new one
      basis: 'calories',
      direction: 'down',
      change_bucket: '10-25',
      fields_changed: 1,
    }]);
  });

  it('measures a macro-only change on the macro that moved most', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

    // protein 1.3 → 5 g (+285%), fat 0.4 → 1 g (+150%); calories untouched.
    await useFoodLogStore.getState().updateEntryMacros('meal-1', 'entry-1', { protein_g: 5, fat_g: 1 });

    const builder = mockSupabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ protein_g: 5, fat_g: 1, macro_source: 'user_created' });
    expect(events('food_corrected')).toEqual([{
      method: 'adjust_macros',
      macro_source: 'usda',
      basis: 'protein_g',
      direction: 'up',
      change_bucket: '100+',
      fields_changed: 2,
    }]);
  });

  it('does nothing when no field is given', async () => {
    useFoodLogStore.setState({ meals: [card()] });

    const written = await useFoodLogStore.getState().updateEntryMacros('meal-1', 'entry-1', {});

    expect(written).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('skips fields that already hold the stored value', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

    await useFoodLogStore.getState().updateEntryMacros('meal-1', 'entry-1', { calories: 100, protein_g: 4 });

    const builder = mockSupabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ protein_g: 4, macro_source: 'user_created' });
    expect(events('food_corrected')).toEqual([expect.objectContaining({ basis: 'protein_g', fields_changed: 1 })]);
  });

  it('a retry that re-sends an already-saved entry writes and tracks nothing', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));
    const store = useFoodLogStore.getState();

    expect(await store.updateEntryMacros('meal-1', 'entry-1', { calories: 50 })).toBe(true);
    // Adjust Macros compares against the values it opened with, so after a
    // partial failure the user's retry sends this row again.
    expect(await store.updateEntryMacros('meal-1', 'entry-1', { calories: 50 })).toBe(false);

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(events('food_corrected')).toEqual([
      expect.objectContaining({ macro_source: 'usda', direction: 'down', change_bucket: '50-100' }),
    ]);
  });

  it('throws and changes nothing when the write fails', async () => {
    useFoodLogStore.setState({ meals: [card()] });
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'rls', code: '42501' }));

    await expect(
      useFoodLogStore.getState().updateEntryMacros('meal-1', 'entry-1', { calories: 80 })
    ).rejects.toMatchObject({ code: '42501' });

    expect(useFoodLogStore.getState().meals[0].entries[0].calories).toBe(100);
    expect(events('food_corrected')).toEqual([]);
  });
});

// ── B1: following "today" across midnight ───────────────────────────────────
describe('syncToday (B1)', () => {
  const MON = new Date(2026, 10, 9, 22, 0);   // Mon 9 Nov, 22:00 local
  const TUE = new Date(2026, 10, 10, 8, 0);   // Tue 10 Nov, 08:00 local
  let switchTo: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ now: MON });
    useFoodLogStore.getState().reset(); // today (and the last-seen today) = Monday
    switchTo = jest.fn();
    // setSelectedDate itself fetches the new day; only the call matters here.
    useFoodLogStore.setState({ setSelectedDate: switchTo });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves a user who was on today to the new today', () => {
    jest.setSystemTime(TUE);
    expect(useFoodLogStore.getState().syncToday()).toBe(true);
    expect(switchTo).toHaveBeenCalledWith('2026-11-10');
    // Once caught up, a second check is a no-op.
    expect(useFoodLogStore.getState().syncToday()).toBe(false);
    expect(switchTo).toHaveBeenCalledTimes(1);
  });

  it('leaves a past day the user chose on purpose', () => {
    useFoodLogStore.setState({ selectedDate: '2026-11-07' });
    jest.setSystemTime(TUE);
    expect(useFoodLogStore.getState().syncToday()).toBe(false);
    expect(switchTo).not.toHaveBeenCalled();
  });

  it('does nothing on the same day', () => {
    jest.setSystemTime(new Date(2026, 10, 9, 23, 59));
    expect(useFoodLogStore.getState().syncToday()).toBe(false);
    expect(switchTo).not.toHaveBeenCalled();
  });
});
