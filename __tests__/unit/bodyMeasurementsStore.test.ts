// Unit tests for src/store/bodyMeasurementsStore.ts
// Traces TEST_SCENARIOS.md §7 (Body Measurements) — scenarios tagged Unit / "Unit (mock)".
//
// Scope note: 7.4 ("submit with all fields empty should be blocked client-side") lives in
// BodyMeasurementsScreen.handleSave (the `anyValid` guard + "Nothing to save" Alert), not in
// this store — the store's addEntry() has no such guard itself. Out of scope for this file;
// see BodyMeasurementsScreen's own (Component-layer) test for that scenario.
//
// Key behavior under test (per bodyMeasurementsStore.ts source):
// - addEntry(values) upserts `{ user_id, logged_date: today, ...values }` in ONE call. Because
//   `values` is a Partial object, spreading it only adds the keys that were actually set — a
//   field the caller never touched is simply ABSENT from the payload object, not present with
//   value `undefined`. This is the "spread-into-upsert" pattern from LEARNING.md.
// - Unlike weightStore/waterStore, this store has NO Alert.alert anywhere. Every write path is
//   `if (!error && data) { ...update local state... }` with no else — a Supabase error is
//   silently swallowed: nothing throws, nothing alerts, local state simply doesn't change. That
//   is a real UX gap (documented, not "fixed") and scenario 7.6 exercises it directly.
// - There is no bounds-checking on measurement values anywhere in the store (matches weightStore's
//   6.7 gap) — negative/absurd values are saved as-is.

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

import { supabase } from '../../src/api/supabase';
import { makeQueryResult } from '../../test-utils/supabaseMock';
import { useBodyMeasurementsStore } from '../../src/store/bodyMeasurementsStore';
import { useAuthStore } from '../../src/store/authStore';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;

const USER_ID = 'test-user-id';

function setSignedIn(userId: string | null) {
  useAuthStore.setState({
    session: userId ? ({ user: { id: userId } } as any) : null,
  } as any);
}

describe('bodyMeasurementsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset only the data fields — NOT a `true` (replace) setState, which would also wipe out
    // the action functions (setRange/fetchEntries/addEntry/deleteEntry) since this store defines
    // them as plain properties on the same object returned by create().
    useBodyMeasurementsStore.setState({ entries: [], range: '90d', loading: false });
    setSignedIn(USER_ID);
  });

  afterEach(() => {
    useBodyMeasurementsStore.setState({ entries: [], range: '90d', loading: false });
    setSignedIn(null);
  });

  describe('addEntry — partial-upsert payload shape (7.1, 7.2)', () => {
    // §7.1 — logging only one field today must only write that field's column.
    it('7.1 upserts only the typed field — other measurement keys are entirely absent from the payload, not undefined', async () => {
      const returnedRow = {
        id: 'row-1',
        logged_date: '2026-07-12',
        waist_cm: 80,
        hips_cm: null,
        chest_cm: null,
        arms_cm: null,
        thighs_cm: null,
        neck_cm: null,
        body_fat_pct: null,
      };
      const query = makeQueryResult(returnedRow, null);
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().addEntry({ waist_cm: 80 });

      expect(mockSupabase.from).toHaveBeenCalledWith('body_measurements');
      expect(query.upsert).toHaveBeenCalledTimes(1);
      const payload = query.upsert.mock.calls[0][0];

      expect(payload).toEqual({ user_id: USER_ID, logged_date: expect.any(String), waist_cm: 80 });
      // The other six fields must be genuinely absent as keys, not present-with-undefined —
      // JS distinguishes "key absent" from "key: undefined", and only the former is what a
      // partial object spread produces here.
      expect(Object.keys(payload).sort()).toEqual(['logged_date', 'user_id', 'waist_cm']);
      expect(payload).not.toHaveProperty('hips_cm');
      expect(payload).not.toHaveProperty('chest_cm');
      expect(payload).not.toHaveProperty('arms_cm');
      expect(payload).not.toHaveProperty('thighs_cm');
      expect(payload).not.toHaveProperty('neck_cm');
      expect(payload).not.toHaveProperty('body_fat_pct');

      // Second arg is the upsert conflict target.
      expect(query.upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id,logged_date' });
    });

    // §7.2 — a second field logged later the same day must not clobber the first: both end up
    // present on today's single row (this is a DB-level upsert-merge guarantee, but we can at
    // least confirm the client sends only the new field, not the whole prior row re-sent as null).
    it('7.2 logging a second field later the same day sends only that field — payload does not re-send/null the first field', async () => {
      const firstReturn = {
        id: 'row-1',
        logged_date: '2026-07-12',
        waist_cm: 80,
        hips_cm: null,
        chest_cm: null,
        arms_cm: null,
        thighs_cm: null,
        neck_cm: null,
        body_fat_pct: null,
      };
      const secondReturn = {
        ...firstReturn,
        hips_cm: 95, // server-side merge: waist_cm survives even though this call didn't send it
      };

      mockSupabase.from.mockReturnValueOnce(makeQueryResult(firstReturn, null));
      await useBodyMeasurementsStore.getState().addEntry({ waist_cm: 80 });

      const secondQuery = makeQueryResult(secondReturn, null);
      mockSupabase.from.mockReturnValueOnce(secondQuery);
      await useBodyMeasurementsStore.getState().addEntry({ hips_cm: 95 });

      const secondPayload = secondQuery.upsert.mock.calls[0][0];
      expect(secondPayload).toEqual({ user_id: USER_ID, logged_date: expect.any(String), hips_cm: 95 });
      expect(secondPayload).not.toHaveProperty('waist_cm');

      // Local state reflects the server's merged row (both fields present) for today, and only
      // one entry exists for today (the second call replaced, not duplicated, today's entry).
      const { entries } = useBodyMeasurementsStore.getState();
      const todays = entries.filter((e) => e.logged_date === '2026-07-12');
      expect(todays).toHaveLength(1);
      expect(todays[0].waist_cm).toBe(80);
      expect(todays[0].hips_cm).toBe(95);
    });

    // §7.3 (all 7 fields at once) is tagged E2E in the spec — out of scope here, but a light
    // unit check that a full payload is passed through untouched is cheap and adjacent coverage.
    it('7.3 [adjacent] passes through all 7 fields in one upsert call when all are provided', async () => {
      const fullValues = {
        waist_cm: 80,
        hips_cm: 95,
        chest_cm: 100,
        arms_cm: 30,
        thighs_cm: 55,
        neck_cm: 38,
        body_fat_pct: 18.5,
      };
      const returnedRow = { id: 'row-1', logged_date: '2026-07-12', ...fullValues };
      const query = makeQueryResult(returnedRow, null);
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().addEntry(fullValues);

      const payload = query.upsert.mock.calls[0][0];
      expect(payload).toEqual({ user_id: USER_ID, logged_date: expect.any(String), ...fullValues });
    });
  });

  describe('fetchEntries / setRange — chart range cutoff (7.5)', () => {
    // §7.5 — switching range (30d/90d/1y) refetches with the correct "since" cutoff.
    it.each([
      ['30d', 30],
      ['90d', 90],
      ['1y', 365],
    ] as const)('7.5 setRange(%s) refetches with a since-cutoff %s days back', async (range, days) => {
      const query = makeQueryResult([], null);
      mockSupabase.from.mockReturnValueOnce(query);

      // Bracket "now" with a before/after real Date snapshot rather than mocking the global
      // Date constructor — the store computes `since` from `new Date()` at call time, so the
      // expected cutoff must be computed the same way (days-before-real-now), just tolerant of
      // the test itself taking a few ms to run.
      const beforeCall = new Date();

      useBodyMeasurementsStore.getState().setRange(range);
      // setRange sets state synchronously then kicks off fetchEntries (async) — flush it.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(useBodyMeasurementsStore.getState().range).toBe(range);
      expect(mockSupabase.from).toHaveBeenCalledWith('body_measurements');

      const expectedSince = new Date(beforeCall);
      expectedSince.setDate(expectedSince.getDate() - days);
      const expectedSinceStr = expectedSince.toISOString().split('T')[0];

      expect(query.gte).toHaveBeenCalledWith('logged_date', expectedSinceStr);
    });

    it('7.5 fetchEntries is a no-op (no supabase call) when there is no session', async () => {
      setSignedIn(null);
      await useBodyMeasurementsStore.getState().fetchEntries();
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(useBodyMeasurementsStore.getState().loading).toBe(false);
    });
  });

  describe('silent-failure behavior (no Alert anywhere in this store)', () => {
    // Documents the real UX gap called out in the assignment: unlike weightStore/waterStore,
    // there is no Alert.alert call on error paths here — errors are swallowed silently.
    it('addEntry on a Supabase error leaves local entries unchanged and does not throw', async () => {
      const query = makeQueryResult(null, { message: 'upsert failed' });
      mockSupabase.from.mockReturnValueOnce(query);

      const before = useBodyMeasurementsStore.getState().entries;

      await expect(
        useBodyMeasurementsStore.getState().addEntry({ waist_cm: 80 })
      ).resolves.toBeUndefined();

      expect(useBodyMeasurementsStore.getState().entries).toBe(before); // reference-equal: no set() happened
    });

    it('fetchEntries on a Supabase error leaves entries unchanged but still clears loading', async () => {
      useBodyMeasurementsStore.setState({
        entries: [
          {
            id: 'existing',
            logged_date: '2026-07-01',
            waist_cm: 80,
            hips_cm: null,
            chest_cm: null,
            arms_cm: null,
            thighs_cm: null,
            neck_cm: null,
            body_fat_pct: null,
          },
        ],
      });

      const query = makeQueryResult(null, { message: 'select failed' });
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().fetchEntries();

      const state = useBodyMeasurementsStore.getState();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('existing'); // untouched by the failed fetch
      expect(state.loading).toBe(false); // still cleared even though the fetch failed
    });

    it('deleteEntry on a Supabase error still removes the entry locally (no error check on delete)', async () => {
      // deleteEntry doesn't inspect {error} at all — it awaits the delete call, then
      // unconditionally filters local state. Locking in this current (unguarded) behavior.
      useBodyMeasurementsStore.setState({
        entries: [
          {
            id: 'to-delete',
            logged_date: '2026-07-01',
            waist_cm: 80,
            hips_cm: null,
            chest_cm: null,
            arms_cm: null,
            thighs_cm: null,
            neck_cm: null,
            body_fat_pct: null,
          },
        ],
      });

      const query = makeQueryResult(null, { message: 'delete failed' });
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().deleteEntry('to-delete');

      expect(useBodyMeasurementsStore.getState().entries).toHaveLength(0);
    });
  });

  describe('7.6 no bounds-checking on measurement values (negative/absurd) — documents current gap', () => {
    it('7.6 addEntry saves a negative waist_cm as-is with no client-side validation', async () => {
      const returnedRow = {
        id: 'row-1',
        logged_date: '2026-07-12',
        waist_cm: -5,
        hips_cm: null,
        chest_cm: null,
        arms_cm: null,
        thighs_cm: null,
        neck_cm: null,
        body_fat_pct: null,
      };
      const query = makeQueryResult(returnedRow, null);
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().addEntry({ waist_cm: -5 });

      const payload = query.upsert.mock.calls[0][0];
      expect(payload.waist_cm).toBe(-5); // sent verbatim — store performs no bounds-check

      const { entries } = useBodyMeasurementsStore.getState();
      expect(entries.find((e) => e.logged_date === '2026-07-12')?.waist_cm).toBe(-5);
    });

    it('7.6 addEntry saves an absurdly large body_fat_pct (9999) as-is with no client-side validation', async () => {
      const returnedRow = {
        id: 'row-1',
        logged_date: '2026-07-12',
        waist_cm: null,
        hips_cm: null,
        chest_cm: null,
        arms_cm: null,
        thighs_cm: null,
        neck_cm: null,
        body_fat_pct: 9999,
      };
      const query = makeQueryResult(returnedRow, null);
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().addEntry({ body_fat_pct: 9999 });

      const payload = query.upsert.mock.calls[0][0];
      expect(payload.body_fat_pct).toBe(9999);

      const { entries } = useBodyMeasurementsStore.getState();
      expect(entries.find((e) => e.logged_date === '2026-07-12')?.body_fat_pct).toBe(9999);
    });
  });

  describe('edge: no session (addEntry / deleteEntry no-ops)', () => {
    it('addEntry returns early with no supabase call and no state change when signed out', async () => {
      setSignedIn(null);
      const before = useBodyMeasurementsStore.getState().entries;

      await useBodyMeasurementsStore.getState().addEntry({ waist_cm: 80 });

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(useBodyMeasurementsStore.getState().entries).toBe(before);
    });

    it('deleteEntry returns early with no supabase call and no state change when signed out', async () => {
      setSignedIn(null);
      useBodyMeasurementsStore.setState({
        entries: [
          {
            id: 'entry-1',
            logged_date: '2026-07-01',
            waist_cm: 80,
            hips_cm: null,
            chest_cm: null,
            arms_cm: null,
            thighs_cm: null,
            neck_cm: null,
            body_fat_pct: null,
          },
        ],
      });

      await useBodyMeasurementsStore.getState().deleteEntry('entry-1');

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(useBodyMeasurementsStore.getState().entries).toHaveLength(1);
    });
  });

  describe('deleteEntry — happy path', () => {
    it('deletes by id and user_id, then filters the entry out of local state', async () => {
      useBodyMeasurementsStore.setState({
        entries: [
          {
            id: 'keep',
            logged_date: '2026-07-01',
            waist_cm: 80,
            hips_cm: null,
            chest_cm: null,
            arms_cm: null,
            thighs_cm: null,
            neck_cm: null,
            body_fat_pct: null,
          },
          {
            id: 'remove',
            logged_date: '2026-07-02',
            waist_cm: 81,
            hips_cm: null,
            chest_cm: null,
            arms_cm: null,
            thighs_cm: null,
            neck_cm: null,
            body_fat_pct: null,
          },
        ],
      });

      const query = makeQueryResult(null, null);
      mockSupabase.from.mockReturnValueOnce(query);

      await useBodyMeasurementsStore.getState().deleteEntry('remove');

      expect(query.delete).toHaveBeenCalledTimes(1);
      expect(query.eq).toHaveBeenCalledWith('id', 'remove');
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);

      const { entries } = useBodyMeasurementsStore.getState();
      expect(entries.map((e) => e.id)).toEqual(['keep']);
    });
  });
});
