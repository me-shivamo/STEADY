-- Remove the 2-per-day notification cap.
--
-- Shivam's call, made explicitly and with the research in front of him: for a
-- habit-tracking app, if a message is worth sending it should be sent, and a
-- blanket daily ceiling stops genuinely useful nudges from ever arriving. The
-- published figures (3+/day pushing open rates below 5%, 71% of users having
-- uninstalled an app over volume) are drawn largely from marketing and
-- ecommerce push, where notifications interrupt with something the sender wants
-- rather than something the user signed up for. STEADY's messages are almost
-- all reactions to the user's own behaviour, which is a different contract.
--
-- This migration only removes the DAILY VOLUME limit. Two other protections are
-- deliberately untouched, because neither is what was objected to:
--
--   * The 90-minute minimum gap between pushes (in the Edge Function). Stops
--     two notifications landing inside one coffee break. With the daily cap
--     gone this becomes the effective ceiling: roughly 9 per day inside the
--     08:00-21:00 window.
--   * Quiet hours, 08:00-21:00 local. Nothing sends overnight.
--
-- One carve-out is kept on purpose: `dormant` users (30+ days silent) still get
-- a cap of 0. That is not a volume limit, it is us keeping a promise. The
-- day-30 message literally reads "These clearly aren't working. I'll stop
-- sending them 🔕", and continuing to message someone after telling them we
-- would stop is a straightforward lie. Set it above 0 only if that copy changes
-- too.
--
-- To reinstate the old behaviour, change the CASE below back to 2/2/2/2/1/1/1/0.

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
  v_last_log     DATE;
  v_streak_date  DATE;
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

  SELECT MAX(ml.logged_date) INTO v_last_log
    FROM public.meal_logs ml WHERE ml.user_id = p_user_id;

  SELECT s.current_streak, s.longest_streak, s.last_logged_date
    INTO v_streak, v_longest, v_streak_date
    FROM public.streaks s WHERE s.user_id = p_user_id;
  v_streak  := COALESCE(v_streak, 0);
  v_longest := COALESCE(v_longest, 0);

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
   WHERE nl.user_id = p_user_id AND nl.status IN ('sent', 'opened');

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

  -- ── THE CHANGE ──────────────────────────────────────────────────────────
  -- No daily volume limit. 999 rather than NULL so every caller comparing
  -- against it keeps working unchanged, and so push_budget_left stays a real
  -- number the drainer and any dashboard can read without special-casing.
  --
  -- 'dormant' stays at 0 because the day-30 message promised we would stop.
  v_cap := CASE v_lifecycle
    WHEN 'dormant' THEN 0
    ELSE 999
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
