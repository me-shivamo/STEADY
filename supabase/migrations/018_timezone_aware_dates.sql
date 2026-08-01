-- ─── TIMEZONE-CORRECT DAILY RESETS ──────────────────────────────────────────
-- reset_daily_usage_limits() (migration 003) inserted one usage_limits row
-- per user, all dated with a single global CURRENT_DATE — i.e. one shared
-- reset instant in the database's own session timezone (UTC on Supabase).
-- That means everyone's daily AI-logging quota reset at the same UTC moment
-- regardless of where they live: midnight for a UTC user, but 5:30am for
-- someone in India (UTC+5:30) and still the previous evening for someone
-- west of UTC. This rewrites it to compute each user's OWN local date via
-- their profiles.timezone (the same AT TIME ZONE mechanism find_due_reminders
-- already uses correctly for reminders), so each user's quota resets at
-- their own midnight. Users with no timezone set yet fall back to
-- CURRENT_DATE (best available guess) rather than being skipped, since
-- unlike reminders, a usage-limit row is expected to exist for every user
-- every day once this function's pg_cron job has run.
CREATE OR REPLACE FUNCTION public.reset_daily_usage_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage_limits (user_id, date)
  SELECT
    id,
    (NOW() AT TIME ZONE COALESCE(timezone, 'UTC'))::DATE
  FROM public.profiles
  ON CONFLICT (user_id, date) DO NOTHING;
END;
$$;

-- ─── find_due_reminders(): also return the user's own local date ───────────
-- send-scheduled-notifications's alreadySatisfied() check ("did the user
-- already log a meal/water today?") was comparing against server UTC
-- "today" — wrong the moment a user's local date and the server's UTC date
-- disagree, which undermines the correct per-user-timezone reminder timing
-- this function already computes. Returning local_date alongside local_time
-- means the Edge Function can reuse the same AT TIME ZONE conversion instead
-- of recomputing "today" itself with no timezone information at all.
-- Postgres won't let CREATE OR REPLACE change a RETURNS TABLE shape (adding
-- local_date is a new output column), so the old signature must be dropped
-- first.
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
    (NOW() AT TIME ZONE p.timezone)::DATE AS local_date
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  CROSS JOIN LATERAL unnest(np.times) AS t
  WHERE np.enabled
    AND p.timezone IS NOT NULL
    AND to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN to_char(
                  (date_trunc('day', NOW() AT TIME ZONE p.timezone)
                    + t::TIME - (window_minutes || ' minutes')::INTERVAL),
                  'HH24:MI'
                )
        AND t
    AND NOT (
      np.quiet_hours_start IS NOT NULL AND np.quiet_hours_end IS NOT NULL AND
      to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN np.quiet_hours_start AND np.quiet_hours_end
    );
$$;
