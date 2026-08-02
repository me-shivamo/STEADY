-- Per-medicine day selection: each medicine inside a 'medicine' reminder's
-- config.meds[] now carries its own `days` array (subset of Sun..Sat; empty
-- means every day), set by the new day-chip row in ReminderDetailScreen's
-- MedicineBody. This is different from the weight/healthLog recurrence gate
-- added in migration 021 — that one reads a single top-level config.freq
-- for the whole reminder, but medicine needs a *per-item* day check, since
-- one reminder can hold several medicines each on a different schedule
-- (e.g. "Vitamin D every day" + "Antibiotic Mon/Wed/Fri" in the same list).
--
-- Dropped and recreated (not CREATE OR REPLACE) for the same reason as
-- migration 021: Postgres's RETURNS TABLE compatibility check operates on
-- the catalog representation, not the SQL text, and rejects a byte-for-byte
-- identical-looking signature (SQLSTATE 42P13).
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
    -- per-medicine day gate: only applies to reminder_type = 'medicine'.
    -- Finds the medicine(s) in config.meds whose own `time` equals this row's
    -- `t`, and passes only if at least one of them has no `days` restriction
    -- (empty/absent array = every day) or explicitly includes today's
    -- weekday. Every other reminder_type has no config.meds, so the EXISTS
    -- check is vacuously true via the reminder_type <> 'medicine' branch.
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
