// Unit/component tests for src/hooks/useStreak.ts
// Traces TEST_SCENARIOS.md §8 (Streak). Scenario IDs are referenced in test
// names so a failure can be looked up directly in that document.
//
// 8.6 (Home screen streak chip vs. Profile drawer streak) is tagged Manual —
// out of scope here; both surfaces are expected to share this same hook, so
// there is nothing distinct to unit-test.

import { format } from 'date-fns';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useStreak } from '../../src/hooks/useStreak';

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: { session: { user: { id: string } } }) => unknown) =>
    selector({ session: { user: { id: 'test-user-id' } } }),
}));

import { supabase } from '../../src/api/supabase';
import { makeQueryResult } from '../../test-utils/supabaseMock';
const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;

// Builds a `daily_summaries` row set for a given list of day-offsets from
// "today" (0 = today, 1 = yesterday, etc.), computed relative to the real
// current date so the test doesn't depend on when it's run.
function rowsForOffsets(offsets: number[]) {
  return offsets.map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return { summary_date: format(d, 'yyyy-MM-dd') };
  });
}

describe('useStreak', () => {
  beforeEach(() => {
    mockSupabase.from.mockReset();
  });

  // §8.1 — logged every day for the last N days including today -> streak = N
  it('8.1 returns N when calories were logged every day for the last N days including today', async () => {
    const N = 5;
    const offsets = Array.from({ length: N }, (_, i) => i); // [0,1,2,3,4] -> today..N-1 days ago
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(rowsForOffsets(offsets), null));

    const { result } = await renderHook(() => useStreak());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toBe(N);
    expect(mockSupabase.from).toHaveBeenCalledWith('daily_summaries');
  });

  // §8.2 — logged yesterday but nothing yet today -> today is forgiven, streak
  // counts backward from yesterday rather than dropping to 0.
  it('8.2 forgives an empty today and counts the streak backward from yesterday', async () => {
    const N = 4;
    // Logged yesterday through N days ago; NOT today (offset 0 is absent).
    const offsets = Array.from({ length: N }, (_, i) => i + 1); // [1,2,3,4]
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(rowsForOffsets(offsets), null));

    const { result } = await renderHook(() => useStreak());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toBe(N); // not N-1, not 0
  });

  // §8.3 — a gap in history: logged 3 & 2 days ago, skipped yesterday, logged
  // today -> streak should be just the current contiguous run (1), not the
  // total historical days logged (3).
  it('8.3 only counts the current unbroken run, ignoring older logged days across a gap', async () => {
    // today (0) logged, yesterday (1) skipped/gap, 2 and 3 days ago logged.
    const offsets = [0, 2, 3];
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(rowsForOffsets(offsets), null));

    const { result } = await renderHook(() => useStreak());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toBe(1); // just today; the gap at yesterday breaks the run
  });

  // §8.3b — same gap shape, but "today" itself is unlogged (mirrors the
  // Mon/Tue/skip-Wed/Thu example from the spec when today = Thu): the two
  // most-recent contiguous days should count, not the total of 3.
  it('8.3b counts only the most recent contiguous run when today is also empty and an older gap exists', async () => {
    // yesterday (1) and 2-days-ago (2) logged consecutively, gap at 3-days-ago,
    // then 4-days-ago logged in isolation. Today (0) is unlogged -> forgiven,
    // count starts from yesterday.
    const offsets = [1, 2, 4];
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(rowsForOffsets(offsets), null));

    const { result } = await renderHook(() => useStreak());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toBe(2); // yesterday + 2-days-ago; the gap stops the count before reaching 4-days-ago
  });

  // §8.4 — brand new user, zero logged days ever -> settles on 0, not stuck
  // at null forever, and does not crash on an empty dataset.
  it('8.4 settles on streak = 0 for a brand new user with no logged days, without crashing', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQueryResult([], null));

    const { result } = await renderHook(() => useStreak());

    await waitFor(() => expect(result.current).toBe(0));
  });

  // §8.5 — refreshKey changing must retrigger the fetch and update the streak
  // without a full unmount/remount of the hook.
  it('8.5 recomputes the streak when refreshKey changes, without unmounting', async () => {
    // First render: nothing logged today or in recent history -> streak 0.
    mockSupabase.from.mockReturnValueOnce(makeQueryResult([], null));

    const { result, rerender } = await renderHook((key: number) => useStreak(key), {
      initialProps: 0,
    });

    await waitFor(() => expect(result.current).toBe(0));
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);

    // Simulate "first log of the day just happened" — today now has a row.
    mockSupabase.from.mockReturnValueOnce(makeQueryResult(rowsForOffsets([0]), null));

    await rerender(1);

    await waitFor(() => expect(result.current).toBe(1));
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });
});
