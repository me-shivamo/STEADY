-- Fix build_user_state()'s source of truth for "when did this person last log".
--
-- Migration 030 read `days_since_last_log` from streaks.last_logged_date,
-- treating the streaks table as authoritative. Testing the function against
-- production immediately produced a self-contradictory snapshot for our most
-- active account:
--
--   "lifecycle":          "lapsed"
--   "days_since_last_log": 16
--   "logs_last_7d":        12        <-- these three cannot all be true
--   "meals_logged_today":  1
--
-- The streaks row for that user says last_logged_date = 2026-07-22 with
-- updated_at frozen at 2026-06-19, while meal_logs has 13 entries since and one
-- from today. The streak cache stopped being maintained for this user and has
-- been drifting ever since. It affects 1 of 16 streak rows, so this is an edge
-- case rather than a broken trigger fleet-wide, but it is precisely the kind of
-- drift a notification system must not inherit: that user would have been
-- classified 'lapsed' and sent "Did you forget about me?" on a day they had
-- already logged breakfast. Exactly the failure mode migration 029 fixed for
-- meal reminders, arriving by a different route.
--
-- The general rule this encodes: **derive from the event table, not from the
-- cache built on top of it.** meal_logs is ground truth because it is what the
-- user actually did; streaks is a derived counter maintained by a trigger, and
-- any derived value can fall out of sync while the events themselves cannot.
--
-- Two changes:
--   1. days_since_last_log / lifecycle now come from meal_logs directly.
--   2. A new `streak_stale` flag exposes the drift, so the sender can avoid
--      {{streak_days}} copy for anyone whose counter is untrustworthy rather
--      than confidently pushing "16 day streak!" at someone whose real number
--      is different. Fixing the streak trigger itself is deliberately NOT done
--      here: it changes a user-visible number and belongs in its own change.
--
-- Same signature as 030, so CREATE OR REPLACE is legal (no RETURNS TABLE shape
-- to fight, unlike find_due_reminders in 029).

CREATE OR REPLACE FUNCTION public.build_user_state(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  p              public.profiles%ROWTYPE;
  v_tz           TEXT;
  v_today        DATE;
  v_hour         INT;
  v_last_log     DATE;   -- ground truth, from meal_logs
  v_streak_date  DATE;   -- what the streaks cache believes
  v_stale        BOOLEAN := FALSE;
  v_days_quiet   INT;
  v_lifecycle    TEXT;
  v_logs_7d      INT;
  v_active_7d    INT;
  v_streak       INT := 0;
  v_longest      INT := 0;
  v_cal          NUMERIC := 0;
  v_pro          NUMERIC := 0;
  v_water        NUMERIC := 0;
  v_meals        INT := 0;
  v_group        TEXT;
  v_last_food    TEXT;
  v_weigh_days   INT;
  v_push_today   INT;
  v_push_7d      INT;
  v_last_push    TIMESTAMPTZ;
  v_opens_30d    INT;
  v_eng_hour     INT;
  v_eng_n        INT;
  v_cap          INT;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'build_user_state: cannot read another user''s state';
  END IF;

  v_tz    := COALESCE(p.timezone, 'UTC');
  v_today := (NOW() AT TIME ZONE v_tz)::DATE;
  v_hour  := EXTRACT(HOUR FROM (NOW() AT TIME ZONE v_tz))::INT;

  -- Ground truth first.
  SELECT MAX(ml.logged_date) INTO v_last_log
    FROM public.meal_logs ml WHERE ml.user_id = p_user_id;

  SELECT s.current_streak, s.longest_streak, s.last_logged_date
    INTO v_streak, v_longest, v_streak_date
    FROM public.streaks s WHERE s.user_id = p_user_id;
  v_streak  := COALESCE(v_streak, 0);
  v_longest := COALESCE(v_longest, 0);

  -- The cache is stale if the user has logged since the counter last moved.
  v_stale := v_last_log IS NOT NULL
             AND v_streak_date IS NOT NULL
             AND v_last_log > v_streak_date;

  v_days_quiet := CASE WHEN v_last_log IS NULL THEN NULL ELSE v_today - v_last_log END;

  SELECT COUNT(*), COUNT(DISTINCT ml.logged_date)
    INTO v_logs_7d, v_active_7d
    FROM public.meal_logs ml
   WHERE ml.user_id = p_user_id AND ml.logged_date > v_today - 7;

  v_lifecycle := CASE
    WHEN v_last_log IS NULL AND (v_today - (p.created_at AT TIME ZONE v_tz)::DATE) <= 7 THEN 'new_no_log'
    WHEN v_last_log IS NULL                                                              THEN 'never_logged'
    WHEN v_days_quiet = 0                                                                THEN 'active_today'
    WHEN (v_today - (p.created_at AT TIME ZONE v_tz)::DATE) <= 7                          THEN 'new'
    WHEN v_days_quiet <= 2                                                               THEN 'active'
    WHEN v_days_quiet <= 6                                                               THEN 'quiet'
    WHEN v_days_quiet <= 29                                                              THEN 'lapsed'
    ELSE 'dormant'
  END;

  SELECT ds.total_calories, ds.total_protein_g, ds.total_water_ml, ds.meal_count
    INTO v_cal, v_pro, v_water, v_meals
    FROM public.daily_summaries ds
   WHERE ds.user_id = p_user_id AND ds.summary_date = v_today;

  SELECT g.name INTO v_group
    FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = p_user_id ORDER BY gm.joined_at LIMIT 1;

  SELECT fe.food_name INTO v_last_food
    FROM public.food_entries fe
   WHERE fe.user_id = p_user_id ORDER BY fe.created_at DESC LIMIT 1;

  SELECT v_today - MAX(wl.logged_date) INTO v_weigh_days
    FROM public.weight_logs wl WHERE wl.user_id = p_user_id;

  SELECT
    COUNT(*) FILTER (WHERE (nl.sent_at AT TIME ZONE v_tz)::DATE = v_today),
    COUNT(*) FILTER (WHERE nl.sent_at > NOW() - INTERVAL '7 days'),
    MAX(nl.sent_at)
    INTO v_push_today, v_push_7d, v_last_push
    FROM public.notification_log nl
   WHERE nl.user_id = p_user_id AND nl.status = 'sent';

  SELECT COUNT(*) INTO v_opens_30d
    FROM public.notification_log nl
   WHERE nl.user_id = p_user_id AND nl.status = 'opened'
     AND nl.sent_at > NOW() - INTERVAL '30 days';

  WITH acts AS (
    SELECT ml.created_at AS at FROM public.meal_logs   ml WHERE ml.user_id = p_user_id
    UNION ALL
    SELECT cm.created_at      FROM public.chat_messages cm WHERE cm.user_id = p_user_id
    UNION ALL
    SELECT wl.logged_at       FROM public.water_logs    wl WHERE wl.user_id = p_user_id
    UNION ALL
    SELECT wg.created_at      FROM public.weight_logs   wg WHERE wg.user_id = p_user_id
  )
  SELECT mode() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM (a.at AT TIME ZONE v_tz))::INT),
         COUNT(*)
    INTO v_eng_hour, v_eng_n
    FROM acts a;
  IF COALESCE(v_eng_n, 0) < 10 THEN
    v_eng_hour := NULL;
  END IF;

  v_cap := CASE v_lifecycle
    WHEN 'active_today' THEN 2
    WHEN 'active'       THEN 2
    WHEN 'new'          THEN 2
    WHEN 'new_no_log'   THEN 2
    WHEN 'quiet'        THEN 1
    WHEN 'lapsed'       THEN 1
    WHEN 'never_logged' THEN 1
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'user_id',              p_user_id,
    'first_name',           NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''),
    'timezone',             p.timezone,
    'has_timezone',         p.timezone IS NOT NULL,
    'goal',                 p.goal,
    'preferred_tone',       p.preferred_tone,
    'local_date',           v_today,
    'local_hour',           v_hour,
    'days_since_signup',    v_today - (p.created_at AT TIME ZONE v_tz)::DATE,

    'lifecycle',            v_lifecycle,
    'days_since_last_log',  v_days_quiet,
    'logged_today',         COALESCE(v_days_quiet, -1) = 0,

    'has_logged_food',      v_last_log IS NOT NULL,
    'has_logged_water',     EXISTS (SELECT 1 FROM public.water_logs   w WHERE w.user_id = p_user_id),
    'has_used_chat',        EXISTS (SELECT 1 FROM public.chat_messages c WHERE c.user_id = p_user_id),
    'has_weighed',          EXISTS (SELECT 1 FROM public.weight_logs  w WHERE w.user_id = p_user_id),
    'has_group',            v_group IS NOT NULL,
    'group_name',           v_group,
    'has_reminder_enabled', EXISTS (SELECT 1 FROM public.notification_preferences np
                                     WHERE np.user_id = p_user_id AND np.enabled),
    'has_push_token',       EXISTS (SELECT 1 FROM public.device_push_tokens d WHERE d.user_id = p_user_id),

    'streak_days',          v_streak,
    'longest_streak',       v_longest,
    -- TRUE means the counter has drifted behind actual logging. Callers must
    -- not use {{streak_days}} copy when this is set.
    'streak_stale',         v_stale,

    'calories_logged',      ROUND(COALESCE(v_cal, 0)),
    'calories_target',      p.calorie_goal,
    'calories_left',        GREATEST(0, ROUND(COALESCE(p.calorie_goal, 0) - COALESCE(v_cal, 0))),
    'protein_logged',       ROUND(COALESCE(v_pro, 0)),
    'protein_target',       p.protein_goal_g,
    'protein_left',         GREATEST(0, ROUND(COALESCE(p.protein_goal_g, 0) - COALESCE(v_pro, 0))),
    'water_ml',             ROUND(COALESCE(v_water, 0)),
    'water_goal_ml',        p.water_goal_ml,
    'meals_logged_today',   COALESCE(v_meals, 0),
    'last_food',            v_last_food,
    'days_since_weigh_in',  v_weigh_days,

    'logs_last_7d',         COALESCE(v_logs_7d, 0),
    'active_days_last_7d',  COALESCE(v_active_7d, 0),

    'pushes_today',         COALESCE(v_push_today, 0),
    'pushes_last_7d',       COALESCE(v_push_7d, 0),
    'last_push_at',         v_last_push,
    'minutes_since_push',   CASE WHEN v_last_push IS NULL THEN NULL
                                 ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last_push)) / 60)::INT END,
    'opens_last_30d',       COALESCE(v_opens_30d, 0),
    'push_cap_today',       v_cap,
    'push_budget_left',     GREATEST(0, v_cap - COALESCE(v_push_today, 0)),

    'engagement_hour',      v_eng_hour,
    'engagement_sample',    COALESCE(v_eng_n, 0)
  );
END;
$fn$;
