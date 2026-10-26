-- Bound the day-based conditions to windows, and clear the backlog they made.
--
-- ─── WHAT WENT WRONG ────────────────────────────────────────────────────────
-- Migration 038's discovery and onboarding conditions were open-ended: "day 5
-- or later and not in a group", "day 7 or later and not in a group". That
-- reads fine for a user moving through their first week, and is badly wrong
-- the day you switch the system on against an existing user base, because
-- every one of those conditions is simultaneously true for everybody who has
-- been around longer than a week.
--
-- The first run made that concrete. 67 candidates for 21 users, and:
--   * 14 users queued for BOTH discover_groups ("you can track calories in a
--     group") AND group_no_join_day7 ("still not joined a group?"). Two ways
--     of saying one thing, to the same person.
--   * 2 users queued 5 messages, 6 more queued 4.
--
-- The daily cap would have limited each day's damage, and expires_at would
-- have quietly binned the rest, so nobody was going to be buried. But "the
-- rate limiter saved us" is not a design. A three-month-old user should never
-- have been eligible for a day-5 tip in the first place.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
-- Every day-keyed event now fires inside a window instead of after a
-- threshold. This solves both problems at once: consecutive events stop
-- overlapping (discover_groups is days 5-6, group_no_join_day7 is days 7-10),
-- and users who predate the event system are simply past the window, so no
-- retroactive onboarding barrage.
--
-- The windows are a few days wide rather than a single day so that a user
-- whose phone is off, or who has no push token for a day, still catches the
-- message rather than missing it forever on an exact-match condition.
--
-- Existing users are not left out. They remain eligible for everything that is
-- genuinely ongoing: mealtime nudges, lapse and win-back, streak risk,
-- celebrations, weigh-in reminders, weekly recaps. They just stop receiving
-- "here is a tip for your fifth day" three months late.

-- Clear the backlog produced by the unbounded version. Safe: nothing has been
-- sent (the drainer does not exist yet), so these rows have never reached
-- anybody and deleting them loses no history.
DELETE FROM public.notification_events WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.enqueue_due_events()
RETURNS TABLE (queued INT, considered INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  u            RECORD;
  s            JSONB;
  v_queued     INT := 0;
  v_considered INT := 0;
  v_date       TEXT;
  v_hour       INT;
  v_days       INT;
  v_quiet      INT;
  v_lastlog    TEXT;
  v_streak     INT;
  v_cal        NUMERIC;
  v_caltgt     NUMERIC;
  v_meals      INT;
  v_logcount   INT;
BEGIN
  FOR u IN
    SELECT p.id, p.water_tracking_enabled
    FROM public.profiles p
    WHERE p.timezone IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.device_push_tokens d WHERE d.user_id = p.id)
  LOOP
    v_considered := v_considered + 1;
    s := public.build_user_state(u.id);
    CONTINUE WHEN s IS NULL;

    v_date    := s ->> 'local_date';
    v_hour    := (s ->> 'local_hour')::INT;
    v_days    := (s ->> 'days_since_signup')::INT;
    v_quiet   := NULLIF(s ->> 'days_since_last_log', '')::INT;
    v_streak  := COALESCE((s ->> 'streak_days')::INT, 0);
    v_cal     := COALESCE((s ->> 'calories_logged')::NUMERIC, 0);
    v_caltgt  := COALESCE((s ->> 'calories_target')::NUMERIC, 0);
    v_meals   := COALESCE((s ->> 'meals_logged_today')::INT, 0);
    SELECT MAX(logged_date)::TEXT INTO v_lastlog FROM public.meal_logs WHERE user_id = u.id;

    -- ══ A · ONBOARDING (windowed) ══════════════════════════════════════════
    IF v_days = 0 THEN
      IF public.enqueue_event(u.id, 'welcome', 'welcome:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days = 0 AND (s ->> 'has_logged_food')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'how_to_log_food', 'how_to_log_food:' || u.id) THEN v_queued := v_queued + 1; END IF;
      IF v_hour >= 19 AND public.enqueue_event(u.id, 'first_log_nudge_evening', 'first_log_nudge_evening:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days = 1 AND (s ->> 'logged_today')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'day1_morning', 'day1_morning:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days BETWEEN 2 AND 3 THEN
      IF public.enqueue_event(u.id, 'day2_photo_tip', 'day2_photo_tip:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days BETWEEN 3 AND 4 AND (s ->> 'has_reminder_enabled')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'day3_reminders_screen', 'day3_reminders_screen:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days BETWEEN 7 AND 9 THEN
      IF public.enqueue_event(u.id, 'day7_first_week', 'day7_first_week:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ B · CELEBRATIONS (ongoing, no window) ══════════════════════════════
    SELECT COUNT(*) INTO v_logcount FROM public.meal_logs WHERE user_id = u.id;

    IF v_logcount = 1 THEN
      IF public.enqueue_event(u.id, 'first_log_celebration', 'first_log_celebration:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_caltgt > 0 AND v_cal BETWEEN v_caltgt * 0.9 AND v_caltgt * 1.1
       AND COALESCE((s ->> 'protein_left')::NUMERIC, 1) = 0 THEN
      IF public.enqueue_event(u.id, 'daily_target_hit', 'daily_target_hit:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_streak IN (3, 7, 14, 30, 50, 100) AND (s ->> 'streak_stale')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'streak_milestone', 'streak_milestone:' || u.id || ':' || v_streak) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF COALESCE((s ->> 'active_days_last_7d')::INT, 0) >= 7 THEN
      IF public.enqueue_event(u.id, 'perfect_week', 'perfect_week:' || u.id || ':' || to_char(NOW(), 'IYYY-IW')) THEN v_queued := v_queued + 1; END IF;
      -- Only a genuine first week, not every perfect week thereafter.
      IF v_days <= 14 AND public.enqueue_event(u.id, 'first_week_complete', 'first_week_complete:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ C · FEATURE DISCOVERY (windowed, non-overlapping) ══════════════════
    IF v_days BETWEEN 2 AND 4 AND (s ->> 'has_logged_water')::BOOLEAN IS FALSE AND u.water_tracking_enabled THEN
      IF public.enqueue_event(u.id, 'discover_chat_water', 'discover_chat_water:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days BETWEEN 4 AND 6 AND (s ->> 'has_used_chat')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'discover_chat_logging', 'discover_chat_logging:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- Days 5-6 only. group_no_join_day7 takes over from day 7, so the two can
    -- never both be queued for the same person.
    IF v_days BETWEEN 5 AND 6 AND (s ->> 'has_group')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'discover_groups', 'discover_groups:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days BETWEEN 6 AND 8 AND COALESCE((s ->> 'active_days_last_7d')::INT, 0) >= 4 THEN
      IF public.enqueue_event(u.id, 'discover_progress_screen', 'discover_progress_screen:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ D · GROUPS ═════════════════════════════════════════════════════════
    IF v_days BETWEEN 7 AND 10 AND (s ->> 'has_group')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'group_no_join_day7', 'group_no_join_day7:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF (s ->> 'has_group')::BOOLEAN AND (s ->> 'logged_today')::BOOLEAN IS FALSE
       AND EXISTS (
         SELECT 1 FROM public.group_members gm
         JOIN public.group_members mine ON mine.group_id = gm.group_id AND mine.user_id = u.id
         JOIN public.meal_logs ml ON ml.user_id = gm.user_id AND ml.logged_date = v_date::DATE
         WHERE gm.user_id <> u.id
       ) THEN
      IF public.enqueue_event(u.id, 'group_activity', 'group_activity:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ E · MEALTIME (ongoing) ═════════════════════════════════════════════
    IF v_hour >= 12 AND v_meals = 0 AND v_quiet IS NOT NULL THEN
      IF public.enqueue_event(u.id, 'lunch_nudge', 'lunch_nudge:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_hour >= 19 AND v_meals < 2 AND v_quiet IS NOT NULL THEN
      IF public.enqueue_event(u.id, 'dinner_nudge', 'dinner_nudge:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_hour >= 20 AND v_meals >= 1 AND v_caltgt > 0 AND v_cal < v_caltgt * 0.5 THEN
      IF public.enqueue_event(u.id, 'under_eating_evening', 'under_eating_evening:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ F · LAPSE (ongoing) ════════════════════════════════════════════════
    IF v_quiet = 1 AND COALESCE((s ->> 'logs_last_7d')::INT, 0) >= 3 THEN
      IF public.enqueue_event(u.id, 'lapse_1d', 'lapse_1d:' || u.id || ':' || v_lastlog) THEN v_queued := v_queued + 1; END IF;
    END IF;
    IF v_quiet = 3 THEN
      IF public.enqueue_event(u.id, 'lapse_3d', 'lapse_3d:' || u.id || ':' || v_lastlog) THEN v_queued := v_queued + 1; END IF;
    END IF;
    IF v_quiet = 7 THEN
      IF public.enqueue_event(u.id, 'lapse_7d', 'lapse_7d:' || u.id || ':' || v_lastlog) THEN v_queued := v_queued + 1; END IF;
    END IF;
    IF v_quiet = 14 THEN
      IF public.enqueue_event(u.id, 'lapse_14d', 'lapse_14d:' || u.id || ':' || v_lastlog) THEN v_queued := v_queued + 1; END IF;
    END IF;
    IF v_quiet = 30 THEN
      IF public.enqueue_event(u.id, 'lapse_30d', 'lapse_30d:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ G · STREAK AT RISK ═════════════════════════════════════════════════
    IF v_streak >= 3 AND (s ->> 'streak_stale')::BOOLEAN IS FALSE
       AND (s ->> 'logged_today')::BOOLEAN IS FALSE AND v_hour >= 19 THEN
      IF public.enqueue_event(u.id, 'streak_risk_evening', 'streak_risk_evening:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ H · WEIGHT ═════════════════════════════════════════════════════════
    IF (s ->> 'has_weighed')::BOOLEAN AND COALESCE((s ->> 'days_since_weigh_in')::INT, 0) >= 7 THEN
      IF public.enqueue_event(u.id, 'weigh_in_nudge_7d', 'weigh_in_nudge_7d:' || u.id || ':' || to_char(NOW(), 'IYYY-IW')) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ I · WATER ══════════════════════════════════════════════════════════
    IF u.water_tracking_enabled AND (s ->> 'has_logged_water')::BOOLEAN
       AND COALESCE((s ->> 'water_goal_ml')::NUMERIC, 0) > 0
       AND COALESCE((s ->> 'water_ml')::NUMERIC, 0) < (s ->> 'water_goal_ml')::NUMERIC * 0.4
       AND v_hour >= 15 THEN
      IF public.enqueue_event(u.id, 'water_behind_afternoon', 'water_behind_afternoon:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ J · RECAP ══════════════════════════════════════════════════════════
    IF EXTRACT(DOW FROM v_date::DATE) = 0 AND COALESCE((s ->> 'active_days_last_7d')::INT, 0) >= 3 THEN
      IF public.enqueue_event(u.id, 'weekly_recap', 'weekly_recap:' || u.id || ':' || to_char(NOW(), 'IYYY-IW')) THEN v_queued := v_queued + 1; END IF;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_queued, v_considered;
END;
$fn$;
