// Unit tests for src/store/weightStore.ts.
// Traces TEST_SCENARIOS.md §6 (Weight Tracking) scenarios tagged Unit / "Unit (mock)": 6.1-6.7.
// 6.1 and 6.5 are E2E/Manual respectively per the spec's Layer column, but the store-level
// slice of their behavior (upsert call shape / Alert on failure) is exercised incidentally by
// the other mocked scenarios below.

import { Alert } from 'react-native';
import { makeQueryResult } from '../../test-utils/supabaseMock';

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(),
  },
}));

import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/authStore';
import { useWeightStore } from '../../src/store/weightStore';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;
const mockGetState = useAuthStore.getState as jest.Mock;

const USER_ID = 'user-abc-123';

function withSession(updateProfile: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  mockGetState.mockReturnValue({
    session: { user: { id: USER_ID } },
    updateProfile,
  });
  return updateProfile;
}

function withNoSession() {
  mockGetState.mockReturnValue({
    session: null,
    updateProfile: jest.fn(),
  });
}

const initialState = useWeightStore.getState();

describe('weightStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWeightStore.setState(initialState, true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // §6.2 — logging weight twice the same day upserts (overwrites), doesn't duplicate
  describe('6.2 addEntry called twice the same day', () => {
    it('6.2 overwrites the existing row via upsert — entries list holds exactly one row for today, with the latest value', async () => {
      withSession();

      const today = new Date().toISOString().split('T')[0];

      mockSupabase.from.mockReturnValueOnce(
        makeQueryResult({ id: 'w1', logged_date: today, weight_kg: 70, notes: null })
      );
      await useWeightStore.getState().addEntry(70);

      mockSupabase.from.mockReturnValueOnce(
        makeQueryResult({ id: 'w1', logged_date: today, weight_kg: 71.5, notes: 'after lunch' })
      );
      await useWeightStore.getState().addEntry(71.5, 'after lunch');

      const entries = useWeightStore.getState().entries;
      const todaysEntries = entries.filter((e) => e.logged_date === today);

      expect(todaysEntries).toHaveLength(1);
      expect(todaysEntries[0].weight_kg).toBe(71.5);
      expect(todaysEntries[0].notes).toBe('after lunch');
      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    });

    it('6.2 each addEntry call upserts with onConflict user_id,logged_date (never a plain insert)', async () => {
      withSession();
      const today = new Date().toISOString().split('T')[0];
      const builder = makeQueryResult({ id: 'w1', logged_date: today, weight_kg: 65, notes: null });
      mockSupabase.from.mockReturnValueOnce(builder);

      await useWeightStore.getState().addEntry(65);

      expect(builder.upsert).toHaveBeenCalledWith(
        { user_id: USER_ID, logged_date: today, weight_kg: 65, notes: null },
        { onConflict: 'user_id,logged_date' }
      );
    });
  });

  // §6.3 — profile sync failure after a successful weight save must not throw or roll back
  describe('6.3 profile sync failure after a successful weight upsert', () => {
    it('6.3 addEntry still resolves and keeps the saved weight entry in local state when updateProfile rejects', async () => {
      const updateProfile = jest.fn().mockRejectedValue(new Error('profile sync boom'));
      withSession(updateProfile);

      const today = new Date().toISOString().split('T')[0];
      mockSupabase.from.mockReturnValueOnce(
        makeQueryResult({ id: 'w9', logged_date: today, weight_kg: 82, notes: null })
      );

      await expect(useWeightStore.getState().addEntry(82)).resolves.toBeUndefined();

      const entries = useWeightStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ id: 'w9', logged_date: today, weight_kg: 82, notes: null });
      expect(updateProfile).toHaveBeenCalledWith({ current_weight_kg: 82 });
      // Failure must not surface as a save-failed alert — the weight row itself succeeded.
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  // §6.4 — switching chart range refetches with the correct "since" cutoff
  describe('6.4 setRange switches 7d / 30d / 90d and refetches with the correct cutoff', () => {
    const REAL_DATE = Date;
    function mockToday(isoDate: string) {
      const fixed = new REAL_DATE(isoDate);
      // @ts-expect-error — intentionally replacing the global Date constructor for this test only
      global.Date = class extends REAL_DATE {
        // @ts-expect-error — intentionally not calling super(); this constructor
        // always returns an override object instead, which JS permits but TS's
        // "derived classes must call super()" rule doesn't know how to allow.
        constructor(...args: unknown[]) {
          if (args.length === 0) return fixed;
          // @ts-expect-error — forwarding varargs to the real Date constructor
          return new REAL_DATE(...args);
        }
        static now() {
          return fixed.getTime();
        }
      };
    }
    afterEach(() => {
      global.Date = REAL_DATE;
    });

    it.each([
      ['7d', 7, '2026-07-05'],
      ['30d', 30, '2026-06-12'],
      ['90d', 90, '2026-04-13'],
    ] as const)('6.4 setRange(%s) fetches entries with logged_date >= %s (cutoff %s)', async (range, _days, expectedSince) => {
      mockToday('2026-07-12T12:00:00.000Z');
      withSession();

      const builder = makeQueryResult([]);
      mockSupabase.from.mockReturnValueOnce(builder);

      useWeightStore.getState().setRange(range);
      // fetchEntries is async and fired without awaiting inside setRange — flush microtasks.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(useWeightStore.getState().range).toBe(range);
      expect(builder.gte).toHaveBeenCalledWith('logged_date', expectedSince);
    });
  });

  // §6.6 — deleting a weight entry filters it out of local state after a successful DB delete
  describe('6.6 deleteEntry', () => {
    it('6.6 removes the entry from local state after a successful DB delete', async () => {
      withSession();
      useWeightStore.setState({
        entries: [
          { id: 'w1', logged_date: '2026-07-10', weight_kg: 70, notes: null },
          { id: 'w2', logged_date: '2026-07-11', weight_kg: 69.5, notes: null },
        ],
      });

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

      await useWeightStore.getState().deleteEntry('w1');

      expect(useWeightStore.getState().entries).toEqual([
        { id: 'w2', logged_date: '2026-07-11', weight_kg: 69.5, notes: null },
      ]);
    });

    it('6.6 filters the delete query on both id and user_id', async () => {
      withSession();
      const builder = makeQueryResult(null, null);
      mockSupabase.from.mockReturnValueOnce(builder);

      await useWeightStore.getState().deleteEntry('w1');

      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'w1');
      expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('6.6 [Negative] shows a "Could not delete" alert and leaves local state unchanged on DB error', async () => {
      withSession();
      const existing = [{ id: 'w1', logged_date: '2026-07-10', weight_kg: 70, notes: null }];
      useWeightStore.setState({ entries: existing });

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'db down' }));

      await useWeightStore.getState().deleteEntry('w1');

      expect(Alert.alert).toHaveBeenCalledWith('Could not delete', 'Check your connection and try again.');
      expect(useWeightStore.getState().entries).toEqual(existing);
    });
  });

  // §6.7 — no client-side bounds-checking on the weight value; document the current gap
  describe('6.7 [Negative] implausible weight values are saved as-is (no bounds-checking gap)', () => {
    it.each([
      ['zero', 0],
      ['negative', -5],
      ['implausibly large', 500],
    ])('6.7 addEntry(%s = %s kg) sends the value through to upsert unchanged and stores it locally', async (_label, weight) => {
      withSession();
      const today = new Date().toISOString().split('T')[0];
      const builder = makeQueryResult({ id: 'w1', logged_date: today, weight_kg: weight, notes: null });
      mockSupabase.from.mockReturnValueOnce(builder);

      await useWeightStore.getState().addEntry(weight);

      // No validation error, no early return, no Alert — the value passes straight through.
      expect(builder.upsert).toHaveBeenCalledWith(
        { user_id: USER_ID, logged_date: today, weight_kg: weight, notes: null },
        { onConflict: 'user_id,logged_date' }
      );
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(useWeightStore.getState().entries[0].weight_kg).toBe(weight);
    });
  });

  // Session guard — every method no-ops silently with no session (covers the guard exercised
  // implicitly across 6.1-6.7 as a foundational edge case).
  describe('no-session guard', () => {
    it('6.1 fetchEntries makes no Supabase call and does not throw when there is no session', async () => {
      withNoSession();
      await expect(useWeightStore.getState().fetchEntries()).resolves.toBeUndefined();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('6.1 addEntry makes no Supabase call, shows no Alert, and does not throw when there is no session', async () => {
      withNoSession();
      await expect(useWeightStore.getState().addEntry(70)).resolves.toBeUndefined();
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('6.6 deleteEntry makes no Supabase call and does not throw when there is no session', async () => {
      withNoSession();
      await expect(useWeightStore.getState().deleteEntry('w1')).resolves.toBeUndefined();
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  // §6.5's Layer is Manual (offline detection isn't unit-testable), but the store-level
  // upsert-failure Alert path it depends on is a Unit-testable contract worth locking down.
  describe('6.5 [Unit-testable slice] addEntry upsert failure', () => {
    it('6.5 shows "Could not save weight" and does not add a local entry when the upsert errors', async () => {
      withSession();
      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'network down' }));

      await useWeightStore.getState().addEntry(70);

      expect(Alert.alert).toHaveBeenCalledWith('Could not save weight', 'Check your connection and try again.');
      expect(useWeightStore.getState().entries).toEqual([]);
    });
  });
});
