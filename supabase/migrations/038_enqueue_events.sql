-- The missing half of the event system: the thing that decides who needs which
-- message, and puts it in the queue.
--
-- Migration 034 built the queue and 036 filled the catalogue with 225 messages,
-- but nothing ever wrote a row into notification_events, so the queue has sat
-- at zero and 20 users with valid push tokens have heard nothing. This is the
-- part that changes that, and it is deliberately server-side only: no app
-- update, no action from the user, no Reminders screen visit required. That is
-- the entire point of events over clocks.
--
-- Two functions:
--   enqueue_event()      -- knows HOW to queue one thing (timing, dedupe, ttl)
--   enqueue_due_events() -- knows WHEN each of the 33 events applies
--
-- Splitting them that way keeps the conditions readable as a flat list you can
-- audit against .claude/plans/notifications.md, instead of timing arithmetic
-- tangled through 33 branches.

-- ─── enqueue_event(): how to queue one candidate ────────────────────────────
-- Returns TRUE if a row was actually created, FALSE if the dedupe key already
-- existed (the normal, harmless case on most ticks).
--
-- Timing comes from pick_send_hour() (migration 033): the user's most active
-- hour inside the band where this message still makes sense. Events flagged
-- `immediate` skip that entirely, because congratulating someone on their first
-- ever log four hours later reads like a bot catching up on a backlog.
CREATE OR REPLACE FUNCTION public.enqueue_event(
  p_user    UUID,
  p_event   TEXT,
  p_dedupe  TEXT,
  p_payload JSONB DEFAULT '{}'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  et         public.notification_event_types%ROWTYPE;
  v_tz       TEXT;
  v_hour     INT;
  v_send_at  TIMESTAMPTZ;
  v_rows     INT;
BEGIN
  SELECT * INTO et FROM public.notification_event_types WHERE event_key = p_event AND active;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM public.profiles WHERE id = p_user;

  IF et.immediate THEN
    v_send_at := NOW();
  ELSE
    v_hour := (public.pick_send_hour(p_user, et.window_start, et.window_end) ->> 'hour')::INT;
    -- Today's local date at the chosen hour, converted back to an absolute
    -- instant. AT TIME ZONE on a naive timestamp reads it AS local time and
    -- returns the timestamptz, which is the direction we want here.
    v_send_at := ((NOW() AT TIME ZONE v_tz)::DATE + make_time(v_hour, 0, 0)) AT TIME ZONE v_tz;
    -- If that hour has already gone by today, send at the next tick rather
    -- than dropping the message. The drainer still refuses to deliver outside
    -- quiet hours, so this cannot become a 2am notification.
    IF v_send_at < NOW() THEN
      v_send_at := NOW();
    END IF;
  END IF;

  INSERT INTO public.notification_events
    (user_id, event_key, dedupe_key, send_after, expires_at, payload)
  VALUES
    (p_user, p_event, p_dedupe, v_send_at, v_send_at + (et.ttl_hours || ' hours')::INTERVAL, p_payload)
  ON CONFLICT (dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$fn$;

-- ─── enqueue_due_events(): when each event applies ──────────────────────────
-- Runs on the same cron heartbeat as the sender. For every reachable user it
-- takes ONE build_user_state() snapshot and evaluates every condition against
-- it, so all 33 decisions for a person are made from a single consistent view
-- rather than 33 racing queries.
--
-- Only users with a push token AND a timezone are considered. Without a token
-- there is nowhere to deliver; without a timezone every "local hour" decision
-- would be a guess, and find_due_reminders has always skipped them for the
-- same reason.
--
-- The dedupe key encodes each event's intended frequency, which is what makes
-- "once ever" and "once per day" the same mechanism:
--     welcome:<uid>                    once, ever
--     lunch_nudge:<uid>:<local_date>    once per local day
--     lapse_3d:<uid>:<last_log_date>    once per lapse episode
--     streak_milestone:<uid>:<n>        once per milestone reached
--
-- NOT YET COVERED (needs signals we don't record):
--   group_never_opened  -- we don't track group screen opens
--   group_member_joined -- belongs on a trigger against group_members
--   weight_milestone    -- needs before/after weight comparison
-- Their templates exist and are inactive-by-absence: no enqueuer means no
-- sends, which is honest rather than half-working.
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
  v_days       INT;      -- days since signup
  v_quiet      INT;      -- days since last log (NULL = never logged)
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
    -- The date of the last log, used to make a lapse dedupe key stable for the
    -- whole episode: the same silence produces the same key every day, so
    -- lapse_3d is queued once per lapse and not once per tick.
    SELECT MAX(logged_date)::TEXT INTO v_lastlog FROM public.meal_logs WHERE user_id = u.id;

    -- ══ A · ONBOARDING ═════════════════════════════════════════════════════
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

    IF v_days = 2 THEN
      IF public.enqueue_event(u.id, 'day2_photo_tip', 'day2_photo_tip:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days = 3 AND (s ->> 'has_reminder_enabled')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'day3_reminders_screen', 'day3_reminders_screen:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days = 7 THEN
      IF public.enqueue_event(u.id, 'day7_first_week', 'day7_first_week:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ B · CELEBRATIONS ═══════════════════════════════════════════════════
    -- Counted rather than read from state: "is this their first ever log" is a
    -- lifetime fact, and state only carries recent windows.
    SELECT COUNT(*) INTO v_logcount FROM public.meal_logs WHERE user_id = u.id;

    IF v_logcount = 1 THEN
      IF public.enqueue_event(u.id, 'first_log_celebration', 'first_log_celebration:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- Within 10% of the calorie target, and protein met. Deliberately a band,
    -- not an exact number: nobody hits a target precisely, and a celebration
    -- that almost never fires is not a feature.
    IF v_caltgt > 0 AND v_cal BETWEEN v_caltgt * 0.9 AND v_caltgt * 1.1
       AND COALESCE((s ->> 'protein_left')::NUMERIC, 1) = 0 THEN
      IF public.enqueue_event(u.id, 'daily_target_hit', 'daily_target_hit:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- streak_stale means the streak counter has drifted behind actual logging
    -- (see migration 031), so the number would be wrong. Better to stay quiet
    -- than to congratulate someone on a streak length we cannot stand behind.
    IF v_streak IN (3, 7, 14, 30, 50, 100) AND (s ->> 'streak_stale')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'streak_milestone', 'streak_milestone:' || u.id || ':' || v_streak) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF COALESCE((s ->> 'active_days_last_7d')::INT, 0) >= 7 THEN
      IF public.enqueue_event(u.id, 'perfect_week', 'perfect_week:' || u.id || ':' || to_char(NOW(), 'IYYY-IW')) THEN v_queued := v_queued + 1; END IF;
      IF public.enqueue_event(u.id, 'first_week_complete', 'first_week_complete:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ C · FEATURE DISCOVERY ══════════════════════════════════════════════
    IF v_days >= 2 AND (s ->> 'has_logged_water')::BOOLEAN IS FALSE AND u.water_tracking_enabled THEN
      IF public.enqueue_event(u.id, 'discover_chat_water', 'discover_chat_water:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days >= 4 AND (s ->> 'has_used_chat')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'discover_chat_logging', 'discover_chat_logging:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days >= 5 AND (s ->> 'has_group')::BOOLEAN IS FALSE THEN
      IF public.enqueue_event(u.id, 'discover_groups', 'discover_groups:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_days >= 6 AND COALESCE((s ->> 'active_days_last_7d')::INT, 0) >= 4 THEN
      IF public.enqueue_event(u.id, 'discover_progress_screen', 'discover_progress_screen:' || u.id) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ D · GROUPS ═════════════════════════════════════════════════════════
    IF v_days >= 7 AND (s ->> 'has_group')::BOOLEAN IS FALSE THEN
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

    -- ══ E · MEALTIME ═══════════════════════════════════════════════════════
    IF v_hour >= 12 AND v_meals = 0 AND v_quiet IS NOT NULL THEN
      IF public.enqueue_event(u.id, 'lunch_nudge', 'lunch_nudge:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    IF v_hour >= 19 AND v_meals < 2 AND v_quiet IS NOT NULL THEN
      IF public.enqueue_event(u.id, 'dinner_nudge', 'dinner_nudge:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- Requires at least one meal logged: zero logged is a lapse, not
    -- under-eating, and the two need very different messages.
    IF v_hour >= 20 AND v_meals >= 1 AND v_caltgt > 0 AND v_cal < v_caltgt * 0.5 THEN
      IF public.enqueue_event(u.id, 'under_eating_evening', 'under_eating_evening:' || u.id || ':' || v_date) THEN v_queued := v_queued + 1; END IF;
    END IF;

    -- ══ F · LAPSE ══════════════════════════════════════════════════════════
    -- Keyed on the last log date so one lapse episode produces one message per
    -- stage, however many ticks pass.
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

-- Same 5-minute heartbeat as the sender, offset by nothing in particular: the
-- queue is drained by whichever send run comes next, so a candidate waits at
-- most one tick.
SELECT cron.schedule(
  'enqueue-notification-events',
  '*/5 * * * *',
  $$ SELECT public.enqueue_due_events(); $$
);
