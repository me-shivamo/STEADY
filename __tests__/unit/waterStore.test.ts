// Unit tests for src/store/waterStore.ts.
// Traces TEST_SCENARIOS.md §5 (Water Tracking) — scenarios tagged Unit or "Unit (mock)".
// 5.6 (progress-ring strokeDashoffset math) lives inline in WaterScreen.tsx's JSX,
// not as a separately exported pure function, so it's Component-layer per the spec
// and out of scope here — skipped, not faked.

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: { getState: jest.fn() },
}));

import { Alert } from 'react-native';
import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/authStore';
import { useWaterStore, WaterEntry } from '../../src/store/waterStore';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;
const mockGetState = useAuthStore.getState as jest.Mock;

const { makeQueryResult } = require('../../test-utils/supabaseMock');

const USER_ID = 'user-123';

function withSession(userId: string | null) {
  mockGetState.mockReturnValue({
    session: userId ? { user: { id: userId } } : null,
  });
}

function entry(overrides: Partial<WaterEntry> = {}): WaterEntry {
  return {
    id: 'entry-1',
    logged_date: '2026-07-12',
    amount_ml: 250,
    logged_at: '2026-07-12T08:00:00.000Z',
    ...overrides,
  };
}

const initialState = useWaterStore.getState();

describe('waterStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWaterStore.setState(initialState, true);
    withSession(USER_ID);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('addEntry', () => {
    // §5.2 — logging water multiple times in one day inserts multiple distinct
    // rows and appends them all locally; nothing gets overwritten.
    it('5.2 inserts a new row on each call and appends all of them locally without overwriting', async () => {
      const first = entry({ id: 'entry-1', amount_ml: 250 });
      const second = entry({ id: 'entry-2', amount_ml: 500 });

      mockSupabase.from
        .mockReturnValueOnce(makeQueryResult(first, null))
        .mockReturnValueOnce(makeQueryResult(second, null));

      await useWaterStore.getState().addEntry(250);
      await useWaterStore.getState().addEntry(500);

      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
      expect(mockSupabase.from).toHaveBeenNthCalledWith(1, 'water_logs');
      expect(mockSupabase.from).toHaveBeenNthCalledWith(2, 'water_logs');

      const entries = useWaterStore.getState().entries;
      expect(entries).toHaveLength(2);
      expect(entries).toEqual([first, second]);

      // Confirm it's a plain insert, never an upsert, on both calls.
      const firstBuilder = mockSupabase.from.mock.results[0].value;
      const secondBuilder = mockSupabase.from.mock.results[1].value;
      expect(firstBuilder.insert).toHaveBeenCalledWith({ user_id: USER_ID, amount_ml: 250 });
      expect(secondBuilder.insert).toHaveBeenCalledWith({ user_id: USER_ID, amount_ml: 500 });
      expect(firstBuilder.upsert).not.toHaveBeenCalled();
      expect(secondBuilder.upsert).not.toHaveBeenCalled();

      // Daily total is the sum of all rows, never overwritten.
      const total = entries.reduce((sum, e) => sum + e.amount_ml, 0);
      expect(total).toBe(750);
    });

    // §5.3 — addEntry while signed out is a silent no-op: no Supabase call, no Alert, no crash.
    it('5.3 no-ops when there is no session (signed out) — no Supabase call, no Alert, no crash', async () => {
      withSession(null);
      const alertSpy = jest.spyOn(Alert, 'alert');

      await expect(useWaterStore.getState().addEntry(250)).resolves.toBeUndefined();

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(useWaterStore.getState().entries).toEqual([]);
    });

    // §5.4 — insert fails (DB error / offline): Alert shown, local entries unchanged.
    it('5.4 shows "Could not log water" alert and leaves local entries unchanged when insert fails', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const preexisting = entry({ id: 'existing' });
      useWaterStore.setState({ entries: [preexisting] });

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'insert failed' }));

      await useWaterStore.getState().addEntry(250);

      expect(alertSpy).toHaveBeenCalledWith('Could not log water', 'Check your connection and try again.');
      expect(useWaterStore.getState().entries).toEqual([preexisting]);
    });

    // §5.4 (edge of the same scenario) — a successful call but null data (e.g. .single()
    // resolving with no row) must also hit the failure path, not silently push `null` into entries.
    it('5.4 also alerts when insert "succeeds" with no error but no data returned', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

      await useWaterStore.getState().addEntry(250);

      expect(alertSpy).toHaveBeenCalledWith('Could not log water', 'Check your connection and try again.');
      expect(useWaterStore.getState().entries).toEqual([]);
    });
  });

  describe('deleteEntry', () => {
    // §5.5 — delete query filters on BOTH the entry id AND user_id, as a defense-in-depth
    // check beyond RLS. A mismatched user id must genuinely no-op (error from the filtered
    // query), not just rely on RLS to catch it.
    it("5.5 filters the delete query on .eq('id', ...) AND .eq('user_id', userId), not id alone", async () => {
      useWaterStore.setState({ entries: [entry({ id: 'entry-1' }), entry({ id: 'entry-2' })] });

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

      await useWaterStore.getState().deleteEntry('entry-1');

      const builder = mockSupabase.from.mock.results[0].value;
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'entry-1');
      expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
      // Both filters must actually be applied (defense-in-depth beyond RLS).
      expect(builder.eq).toHaveBeenCalledTimes(2);
    });

    // §5.5 — when the filtered delete query errors (e.g. row belongs to another user and
    // RLS/filter combo rejects it), the entry must NOT be removed locally.
    it('5.5 leaves the entry in place locally when the (id + user_id)-filtered delete errors', async () => {
      const target = entry({ id: 'not-mine' });
      useWaterStore.setState({ entries: [target] });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, { message: 'row not found' }));

      await useWaterStore.getState().deleteEntry('not-mine');

      expect(alertSpy).toHaveBeenCalledWith('Could not delete', 'Check your connection and try again.');
      expect(useWaterStore.getState().entries).toEqual([target]);
    });

    // Negative — deleteEntry while signed out is a silent no-op, same guard pattern as addEntry.
    it('5.3 deleteEntry no-ops when there is no session — no Supabase call, no Alert, no crash', async () => {
      withSession(null);
      const target = entry({ id: 'entry-1' });
      useWaterStore.setState({ entries: [target] });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await expect(useWaterStore.getState().deleteEntry('entry-1')).resolves.toBeUndefined();

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      // Local state untouched since the guard returns before any set() call.
      expect(useWaterStore.getState().entries).toEqual([target]);
    });

    // Positive companion to 5.5 — successful delete removes exactly the targeted entry
    // from local state and leaves the rest untouched.
    it('5.5 removes only the targeted entry locally on a successful delete', async () => {
      const keep = entry({ id: 'keep-me', amount_ml: 100 });
      const remove = entry({ id: 'remove-me', amount_ml: 200 });
      useWaterStore.setState({ entries: [keep, remove] });

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(null, null));

      await useWaterStore.getState().deleteEntry('remove-me');

      expect(useWaterStore.getState().entries).toEqual([keep]);
    });
  });

  describe('fetchToday', () => {
    // Sanity coverage for the shared no-session guard pattern (mirrors 5.3 for fetchToday,
    // not itself a distinct scenario ID in §5, but the same code path addEntry/deleteEntry share).
    it('5.3 fetchToday no-ops when there is no session — no Supabase call, loading stays false', async () => {
      withSession(null);

      await useWaterStore.getState().fetchToday();

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(useWaterStore.getState().loading).toBe(false);
    });
  });

  // §5.6 — progress ring at 0%/50%/100%/>100% of goal (strokeDashoffset math).
  // This math is computed inline in WaterScreen.tsx's JSX (not exported as a pure
  // function), making it Component-layer per TEST_SCENARIOS.md's Layer key.
  // Out of scope for this store-level unit test file — intentionally skipped, not faked.
  it.skip('5.6 progress ring math — Component-layer (WaterScreen.tsx), not covered here', () => {});
});
