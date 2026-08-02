-- Reminders redesign: each reminder type now has a real, type-specific
-- schedule shape (meal checklist, water window+mode, weekly/monthly
-- recurrence, a free-form medicine list) instead of one flat `times[]` array
-- shared by everything. `config` carries that type-specific data as JSON;
-- `times` is kept in sync by the client (see reminderStore.ts) as the flat
-- list of "HH:mm" fire-times derived from `config`, so this migration only
-- needs to teach find_due_reminders() how to also respect weekly/monthly
-- recurrence and per-meal/per-medicine on-off flags — the Edge Function
-- itself (send-scheduled-notifications) is untouched, since it only ever
-- calls this RPC and never reads `times` or `config` directly.

ALTER TABLE public.notification_preferences
  ADD COLUMN config JSONB NOT NULL DEFAULT '{}';

-- ─── find_due_reminders() — now recurrence-aware ────────────────────────────
-- Same return shape as migration 013 (user_id, reminder_type, local_time), so
-- send-scheduled-notifications/index.ts needs no changes at all.
--
-- `times` still holds every "HH:mm" this reminder could fire at today, for
-- every type — the client is responsible for keeping it in sync with
-- `config` (e.g. only the enabled meal slots' times, or every medicine's
-- time). That keeps this function's window-matching logic (the tricky
-- timezone arithmetic from migration 013) exactly as it was. What's new
-- here is a second check, only for 'weight' and 'healthLog': if `config`
-- says "weekly", only fire on the matching weekday; if "monthly", only fire
-- on the matching day-of-month. Types without a `config.freq` (daily,
-- meals, water, medicine) skip this check entirely and behave as before.
--
-- Dropped and recreated (not CREATE OR REPLACE) because Postgres refuses to
-- REPLACE a function whose RETURNS TABLE column list doesn't match byte-for-
-- byte at the catalog level, even when it's logically identical to the
-- existing one (SQLSTATE 42P13, "cannot change return type of existing
-- function") — DROP + CREATE sidesteps that check entirely.
DROP FUNCTION IF EXISTS public.find_due_reminders(INT);

CREATE FUNCTION public.find_due_reminders(window_minutes INT)
RETURNS TABLE (user_id UUID, reminder_type TEXT, local_time TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    np.user_id,
    np.reminder_type,
    t AS local_time
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
    -- weekly/monthly recurrence gate — only applies when config.freq is set
    -- (weight, healthLog); every other reminder type has no `freq` key, and
    -- `config->>'freq' IS NULL` short-circuits the whole AND to true for them.
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
    );
$$;
