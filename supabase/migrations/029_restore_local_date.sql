-- Restore find_due_reminders()'s local_date output column.
--
-- ─── THE BUG ────────────────────────────────────────────────────────────────
-- send-scheduled-notifications runs an alreadySatisfied() check before every
-- send: "did this user already log a meal / water today?" If yes, the reminder
-- is skipped. That check reads `reminder.local_date` — the user's own calendar
-- date, computed inside Postgres via AT TIME ZONE so it stays correct for
-- someone whose local day has rolled over relative to the server's UTC clock.
--
-- Migration 018 added local_date to this function's RETURNS TABLE for exactly
-- that reason. Migrations 021 (weekly/monthly recurrence) and 022 (per-medicine
-- day selection) both needed to change this function for unrelated reasons, and
-- Postgres refuses to CREATE OR REPLACE a function whose RETURNS TABLE shape
-- changed (SQLSTATE 42P13) — so both had to DROP and re-CREATE it. Both started
-- from migration 013's three-column body instead of 018's four-column one, and
-- silently dropped local_date. Twice.
--
-- Nothing failed loudly, because of how the mismatch surfaces in JS: a missing
-- key on an object is `undefined`, not an error. So the Edge Function sent
-- PostgREST `logged_date=eq.undefined`, Postgres rejected it as an invalid
-- date, and the calling code — which destructures only `{ data }` and discards
-- `error` — read the resulting null as "no rows found", i.e. "they haven't
-- logged yet." A database error was quietly laundered into a confident wrong
-- answer, and every meal and water reminder has fired regardless of whether
-- the user already logged. This is the notification most likely to make a user
-- disable notifications outright, so it is worth its own migration.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
-- This is migration 022's function verbatim — every rule it and 021 added is
-- preserved (quiet hours, weekly/monthly recurrence for weight and healthLog,
-- per-medicine day gating) — with the fourth output column added back.
--
-- If you need to change this function again: copy THIS file's body, not an
-- older one. The DROP + CREATE dance makes it very easy to silently revert an
-- output column, which is precisely what happened here. The Edge Function's
-- DueReminder interface is the contract; keep all four columns.
--
-- Verify after applying:
--   SELECT * FROM find_due_reminders(5);           -- should show 4 columns
--   SELECT pg_get_function_result('public.find_due_reminders'::regproc);

DROP FUNCTION IF EXISTS public.find_due_reminders(INT);

CREATE FUNCTION public.find_due_reminders(window_minutes INT)
RETURNS TABLE (user_id UUID, reminder_type TEXT, local_time TEXT, local_date DATE)
LANGUAGE sql
STABLE
AS $$
  SELECT
    np.user_id,
    np.reminder_type,
    t AS local_time,
    -- The whole point of this migration. Consumed by alreadySatisfied() in
    -- send-scheduled-notifications to compare against meal_logs.logged_date /
    -- water_logs.logged_date, which are themselves stored as the user's local
    -- calendar day (migration 018).
    (NOW() AT TIME ZONE p.timezone)::DATE AS local_date
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  CROSS JOIN LATERAL unnest(np.times) AS t
  WHERE np.enabled
    AND p.timezone IS NOT NULL
    -- local "now" as HH:mm, truncated to the same minute granularity as `t`
    AND to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN to_char(
                  (date_trunc('day', NOW() AT TIME ZONE p.timezone)
                    + t::TIME - (window_minutes || ' minutes')::INTERVAL),
                  'HH24:MI'
                )
        AND t
    -- quiet hours: skip if local "now" falls inside [quiet_hours_start, quiet_hours_end)
    AND NOT (
      np.quiet_hours_start IS NOT NULL AND np.quiet_hours_end IS NOT NULL AND
      to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN np.quiet_hours_start AND np.quiet_hours_end
    )
    -- weekly/monthly recurrence gate (weight, healthLog) — unchanged from
    -- migration 021. config->>'freq' IS NULL short-circuits this to true
    -- for every other reminder type, including medicine.
    AND (
      np.config ->> 'freq' IS NULL
      OR (
        np.config ->> 'freq' = 'week'
        AND np.config ->> 'day' = to_char(NOW() AT TIME ZONE p.timezone, 'Dy')
      )
      OR (
        np.config ->> 'freq' = 'month'
        AND (np.config ->> 'date')::INT = EXTRACT(DAY FROM NOW() AT TIME ZONE p.timezone)::INT
      )
    )
    -- per-medicine day gate — unchanged from migration 022. Only applies to
    -- reminder_type = 'medicine'; every other type passes via the first branch.
    AND (
      np.reminder_type <> 'medicine'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(np.config -> 'meds', '[]'::jsonb)) AS med
        WHERE med ->> 'time' = t
          AND (
            jsonb_array_length(COALESCE(med -> 'days', '[]'::jsonb)) = 0
            OR med -> 'days' ? to_char(NOW() AT TIME ZONE p.timezone, 'Dy')
          )
      )
    );
$$;
