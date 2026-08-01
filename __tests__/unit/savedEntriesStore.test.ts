// Unit tests for src/store/savedEntriesStore.ts.
// Covers the three store actions: saveMealAsEntry (snapshot a logged meal),
// deleteSavedEntry, and logSavedEntry (re-log a saved entry as today's meal
// via a direct insert — no Edge Function call, since macros were already
// resolved when the entry was first saved).

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: { getState: jest.fn() },
}));

import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/authStore';
import { useSavedEntriesStore, SavedEntry } from '../../src/store/savedEntriesStore';
import { useFoodLogStore, MealCard } from '../../src/store/foodLogStore';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;
const mockGetState = useAuthStore.getState as jest.Mock;
const { makeQueryResult } = require('../../test-utils/supabaseMock');

const USER_ID = 'user-123';

function withSession(userId: string | null) {
  mockGetState.mockReturnValue({
    session: userId ? { user: { id: userId } } : null,
  });
}

function savedEntry(overrides: Partial<SavedEntry> = {}): SavedEntry {
  return {
    id: 'saved-1',
    name: 'Eggs on toast',
    entries: [
      {
        food_name: 'Egg', food_item_id: 'food-1', quantity_g: 100, quantity_label: '2 eggs',
        calories: 150, protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0, sugar_g: 0,
        sodium_mg: 140, macro_source: 'usda',
      },
    ],
    created_at: '2026-07-12T08:00:00.000Z',
    last_used_at: null,
    ...overrides,
  };
}

function mealCard(overrides: Partial<MealCard> = {}): MealCard {
  return {
    id: 'meal-1',
    meal_name: 'Eggs on toast',
    meal_type: 'breakfast',
    logged_date: '2026-07-12',
    created_at: '2026-07-12T08:00:00.000Z',
    photo_url: null,
    input_text: 'eggs on toast',
    entries: [
      {
        id: 'entry-1', meal_log_id: 'meal-1', user_id: USER_ID, food_item_id: 'food-1',
        food_name: 'Egg', quantity_g: 100, quantity_label: '2 eggs',
        calories: 150, protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0, sugar_g: 0,
        sodium_mg: 140, source: 'ai_text', ai_confidence: null, macro_source: 'usda',
        created_at: '2026-07-12T08:00:00.000Z',
      } as any,
    ],
    ...overrides,
  };
}

const initialState = useSavedEntriesStore.getState();
const initialFoodLogState = useFoodLogStore.getState();

describe('savedEntriesStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSavedEntriesStore.setState(initialState, true);
    useFoodLogStore.setState(initialFoodLogState, true);
    withSession(USER_ID);
  });

  describe('saveMealAsEntry', () => {
    it('inserts a snapshot of the meal entries and prepends the result locally', async () => {
      const meal = mealCard();
      const inserted = savedEntry();
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(inserted, null));

      await useSavedEntriesStore.getState().saveMealAsEntry(meal);

      expect(mockSupabase.from).toHaveBeenCalledWith('saved_entries');
      const builder = mockSupabase.from.mock.results[0].value;
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          name: 'eggs on toast', // prefers input_text over meal_name
          entries: expect.arrayContaining([
            expect.objectContaining({ food_name: 'Egg', calories: 150, food_item_id: 'food-1' }),
          ]),
        })
      );
      expect(useSavedEntriesStore.getState().entries).toEqual([inserted]);
    });

    it('falls back to meal_name when input_text is null', async () => {
      const meal = mealCard({ input_text: null });
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(savedEntry(), null));

      await useSavedEntriesStore.getState().saveMealAsEntry(meal);

      const builder = mockSupabase.from.mock.results[0].value;
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Eggs on toast' })
      );
    });

    it('sets an inline error and does not touch local state when the insert fails', async () => {
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'insert failed' }));

      await useSavedEntriesStore.getState().saveMealAsEntry(mealCard());

      expect(useSavedEntriesStore.getState().error).toBe('Could not save this entry. Please try again.');
      expect(useSavedEntriesStore.getState().entries).toEqual([]);
    });

    it('no-ops when there is no session', async () => {
      withSession(null);

      await useSavedEntriesStore.getState().saveMealAsEntry(mealCard());

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('deleteSavedEntry', () => {
    it('filters on id AND user_id, then removes the entry locally on success', async () => {
      useSavedEntriesStore.setState({ entries: [savedEntry({ id: 'keep' }), savedEntry({ id: 'remove' })] });
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

      await useSavedEntriesStore.getState().deleteSavedEntry('remove');

      const builder = mockSupabase.from.mock.results[0].value;
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'remove');
      expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(useSavedEntriesStore.getState().entries.map((e) => e.id)).toEqual(['keep']);
    });

    it('sets an inline error and leaves entries untouched when the delete fails', async () => {
      const target = savedEntry();
      useSavedEntriesStore.setState({ entries: [target] });
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'row not found' }));

      await useSavedEntriesStore.getState().deleteSavedEntry(target.id);

      expect(useSavedEntriesStore.getState().error).toBe('Could not delete this entry. Please try again.');
      expect(useSavedEntriesStore.getState().entries).toEqual([target]);
    });
  });

  describe('logSavedEntry', () => {
    it('inserts meal_logs + food_entries directly (no Edge Function call) and appends to foodLogStore', async () => {
      const target = savedEntry({ id: 'saved-1' });
      useSavedEntriesStore.setState({ entries: [target] });

      const insertedLog = { id: 'new-meal-1', logged_date: '2026-07-15', created_at: '2026-07-15T09:00:00.000Z' };
      const insertedEntries = [
        { id: 'new-entry-1', meal_log_id: 'new-meal-1', user_id: USER_ID, food_name: 'Egg', calories: 150 },
      ];

      mockSupabase.from
        .mockReturnValueOnce(makeQueryResult(insertedLog, null))       // meal_logs insert
        .mockReturnValueOnce(makeQueryResult(insertedEntries, null))   // food_entries insert
        .mockReturnValueOnce(makeQueryResult(null, null));             // saved_entries last_used_at update

      const card = await useSavedEntriesStore.getState().logSavedEntry('saved-1');

      // Never touches the AI/Edge Function pipeline.
      expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();

      expect(mockSupabase.from).toHaveBeenNthCalledWith(1, 'meal_logs');
      expect(mockSupabase.from).toHaveBeenNthCalledWith(2, 'food_entries');

      const mealLogsBuilder = mockSupabase.from.mock.results[0].value;
      expect(mealLogsBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: USER_ID, meal_type: 'other', caption: 'Eggs on toast' })
      );

      const foodEntriesBuilder = mockSupabase.from.mock.results[1].value;
      expect(foodEntriesBuilder.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          meal_log_id: 'new-meal-1',
          food_name: 'Egg',
          calories: 150,
          source: 'saved_entry',
        }),
      ]);

      expect(card.id).toBe('new-meal-1');
      expect(card.entries).toEqual(insertedEntries);

      // foodLogStore's meals/totals reflect the new card immediately.
      const foodLogState = useFoodLogStore.getState();
      expect(foodLogState.meals.map((m) => m.id)).toContain('new-meal-1');
      expect(foodLogState.totals.calories).toBe(150);
    });

    it('throws if the saved entry cannot be found locally', async () => {
      useSavedEntriesStore.setState({ entries: [] });

      await expect(useSavedEntriesStore.getState().logSavedEntry('missing')).rejects.toThrow(
        'Saved entry not found'
      );
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('throws a friendly error when the meal_logs insert fails', async () => {
      useSavedEntriesStore.setState({ entries: [savedEntry({ id: 'saved-1' })] });
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'db down' }));

      await expect(useSavedEntriesStore.getState().logSavedEntry('saved-1')).rejects.toThrow(
        'Could not log this entry. Please try again.'
      );
    });
  });
});
