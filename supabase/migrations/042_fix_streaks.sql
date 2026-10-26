-- Make streaks actually work.
--
-- ─── WHAT WE FOUND ──────────────────────────────────────────────────────────
-- We went looking for the trigger that had "stopped updating" the streaks
-- table, and there wasn't one. There never has been. Migration 003 creates a
-- streaks row when a user signs up, and from that moment nothing in the entire
-- system ever increments it: not the photo path (analyze-food-photo), not the
-- text path (log-food-from-text, which only ever READS it via its get_streak
-- tool), not the app, not any database trigger.
--
-- So the streak has always been decoration. 19 users who log meals regularly
-- show current_streak = 0. Three users have non-zero values that look
-- hand-written. Meanwhile the UI reads it (useStreaks.ts), and notification copy
-- interpolates {{streak_days}} into lines like "{{streak_days}} days strong" --
-- which would have quietly told a genuinely consistent user they were on a
-- 0-day streak.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
-- Derive the streak from meal_logs rather than maintaining a counter, for the
-- same reason migration 031 stopped trusting this table: **the event table
-- cannot drift, a counter can.** An incrementing counter has to be correct at
-- every single write forever, and gets permanently wrong if one write is
-- missed. A derived value is correct by construction every time it runs, and
-- self-heals from any past mistake, including all the ones above.
--
-- The trigger lives on meal_logs, which is the one table EVERY logging path
-- writes to regardless of whether the meal came from a photo, the chat, a saved
-- entry or a manual edit. Putting the logic in an Edge Function is exactly how
-- this broke: only one of the two logging paths remembered to do it.
--
-- ─── THE ALGORITHM: GAPS AND ISLANDS ────────────────────────────────────────
-- A classic SQL pattern. Subtract a row number from each date; consecutive
-- dates then share the same value, because both sides increase in lockstep:
--
--   date        row_number   date - row_number  ← same value = same run
--   2026-08-01      1          2026-07-31
--   2026-08-02      2          2026-07-31
--   2026-08-03      3          2026-07-31
--   2026-08-07      4          2026-08-03   ← gap, new island
--
-- Group by that value and each group is one unbroken run of days.

CREATE OR REPLACE FUNCTION public.recompute_streak(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz       TEXT;
  v_today    DATE;
  v_current  INT := 0;
  v_longest  INT := 0;
  v_last     DATE;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN RETURN; END IF;
  v_today := (NOW() AT TIME ZONE v_tz)::DATE;

  WITH d AS (
    SELECT DISTINCT logged_date FROM public.meal_logs WHERE user_id = p_user
  ),
  islands AS (
    SELECT logged_date,
           logged_date - (ROW_NUMBER() OVER (ORDER BY logged_date))::INT AS island
    FROM d
  ),
  runs AS (
    SELECT island, COUNT(*)::INT AS len, MAX(logged_date) AS ends_on
    FROM islands GROUP BY island
  )
  SELECT
    COALESCE(MAX(len), 0),
    -- The current streak is the run ending today or yesterday. Ending
    -- yesterday still counts as alive: the day is not over yet, and breaking
    -- someone's streak at midnight for not having eaten yet would be absurd.
    COALESCE(MAX(len) FILTER (WHERE ends_on >= v_today - 1), 0),
    MAX(ends_on)
  INTO v_longest, v_current, v_last
  FROM runs;

  INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_logged_date, updated_at)
  VALUES (p_user, v_current, GREATEST(v_longest, v_current), v_last, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak   = EXCLUDED.current_streak,
    -- Never let a historic best be lowered by a recomputation.
    longest_streak   = GREATEST(public.streaks.longest_streak, EXCLUDED.longest_streak),
    last_logged_date = EXCLUDED.last_logged_date,
    updated_at       = NOW();
END;
$fn$;

-- ─── TRIGGER ────────────────────────────────────────────────────────────────
-- Fires on INSERT and DELETE. Deleting a meal can legitimately break a streak,
-- and because the value is derived rather than incremented, the delete case
-- needs no separate logic at all -- it just recomputes and gets the right
-- answer. That is the payoff of deriving instead of counting.
CREATE OR REPLACE FUNCTION public.on_meal_log_streak_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.recompute_streak(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL; -- AFTER trigger, return value ignored
END;
$fn$;

DROP TRIGGER IF EXISTS on_meal_log_streak ON public.meal_logs;
CREATE TRIGGER on_meal_log_streak
  AFTER INSERT OR DELETE ON public.meal_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_meal_log_streak_change();

-- ─── BACKFILL ───────────────────────────────────────────────────────────────
-- Every user who has ever logged gets their real streak for the first time.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.meal_logs LOOP
    PERFORM public.recompute_streak(r.user_id);
  END LOOP;
END;
$$;

-- Users with a streaks row but no meals should read zero, not a stale
-- hand-written number.
UPDATE public.streaks s
   SET current_streak = 0, longest_streak = 0, last_logged_date = NULL, updated_at = NOW()
 WHERE NOT EXISTS (SELECT 1 FROM public.meal_logs m WHERE m.user_id = s.user_id)
   AND (s.current_streak <> 0 OR s.longest_streak <> 0);
