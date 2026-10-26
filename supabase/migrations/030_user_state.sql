-- The "understand the user" layer.
--
-- Every notification decision needs to know things about a person: have they
-- logged today, are they in a group, what's their streak, how many pushes have
-- they already had. Answering those one query at a time would mean a dozen
-- round trips per send, and worse, the targeting logic and the copy
-- interpolation would each compute their own version of "today" and could
-- disagree -- a message reading "0 calories left" attached to a decision made
-- because the user had logged nothing.
--
-- So this migration adds ONE function that answers everything at once and
-- returns it as a single JSONB object. Both jobs read from that same object:
-- the rules decide *whether* to send, the interpolator fills {{streak_days}}.
-- One snapshot, one truth, taken at one instant.
--
-- Contents:
--   1. Normalise the Asia/Calcutta timezone spelling
--   2. profiles.preferred_tone, for the tone-locking work
--   3. build_user_state(user_id) -> JSONB

-- ─── 1. TIMEZONE SPELLING ───────────────────────────────────────────────────
-- 'Asia/Calcutta' is a deprecated alias that the IANA database still resolves
-- identically to 'Asia/Kolkata', so AT TIME ZONE has always behaved correctly
-- and no reminder ever fired at the wrong hour because of this. The damage is
-- analytical: production currently holds both spellings, so any GROUP BY
-- timezone splits one population into two, and any code comparing the string
-- to a constant silently misses a slice of users. Normalising to the modern
-- name makes the column safe to group on.
UPDATE public.profiles SET timezone = 'Asia/Kolkata' WHERE timezone = 'Asia/Calcutta';

-- ─── 2. PREFERRED TONE ──────────────────────────────────────────────────────
-- Null means "still rotating tones at random". Once tap tracking has recorded
-- enough opens per tone for a user, this gets set to their best performer and
-- the sender biases toward it (keeping ~20% exploration so a wrong lock can
-- correct itself). No CHECK constraint on the value: the tone vocabulary lives
-- in the templates table and will grow, and a CHECK here would mean a
-- migration every time we invent a voice.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_tone TEXT;

-- ─── 3. build_user_state() ──────────────────────────────────────────────────
-- SECURITY DEFINER because it reads across tables that are RLS'd per user
-- (notification_log has RLS on with no policies at all). The guard below is
-- what makes that safe: service_role callers have no auth.uid() and may read
-- anyone, while a logged-in client gets an exception if it asks about anybody
-- other than itself. Without that check, SECURITY DEFINER here would hand any
-- authenticated user everyone else's eating habits.
--
-- Every "today" in here is the *user's* local day computed via AT TIME ZONE,
-- never the server's UTC day. Migration 029 exists because that distinction
-- was lost once already.
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

  -- auth.uid() is NULL for service_role (the Edge Functions) and set for a
  -- logged-in client. Only the latter needs restricting.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'build_user_state: cannot read another user''s state';
  END IF;

  -- Fall back to UTC only for *computing* this snapshot, so a user with no
  -- timezone still produces usable output. has_timezone is exposed separately
  -- because find_due_reminders skips those users entirely, and any caller
  -- deciding whether to send needs to know that rather than infer it.
  v_tz    := COALESCE(p.timezone, 'UTC');
  v_today := (NOW() AT TIME ZONE v_tz)::DATE;
  v_hour  := EXTRACT(HOUR FROM (NOW() AT TIME ZONE v_tz))::INT;

  SELECT s.current_streak, s.longest_streak, s.last_logged_date
    INTO v_streak, v_longest, v_last_log
    FROM public.streaks s WHERE s.user_id = p_user_id;
  v_streak  := COALESCE(v_streak, 0);
  v_longest := COALESCE(v_longest, 0);

  -- last_logged_date is maintained by the streak trigger and only moves on a
  -- food log, so fall back to meal_logs directly for users whose streak row
  -- doesn't exist yet.
  IF v_last_log IS NULL THEN
    SELECT MAX(ml.logged_date) INTO v_last_log
      FROM public.meal_logs ml WHERE ml.user_id = p_user_id;
  END IF;
  v_days_quiet := CASE WHEN v_last_log IS NULL THEN NULL ELSE v_today - v_last_log END;

  SELECT COUNT(*), COUNT(DISTINCT ml.logged_date)
    INTO v_logs_7d, v_active_7d
    FROM public.meal_logs ml
   WHERE ml.user_id = p_user_id AND ml.logged_date > v_today - 7;

  -- Lifecycle stage. Deliberately ordered most-engaged first so the first
  -- matching branch wins; 'new' outranks 'quiet' so a three-day-old account
  -- that hasn't logged yet is treated as onboarding rather than as lapsing.
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

  -- Engagement hour: the local hour this person is most often doing *anything*
  -- in the app. Note this is deliberately built from actions, not from meal
  -- times -- meal_logs.created_at records when someone told the app, not when
  -- they ate (production has a user who logs breakfast at 13:30 daily), which
  -- makes it a poor proxy for hunger and an excellent one for availability.
  -- NULL below a 10-action sample rather than reporting a mode drawn from
  -- three data points as if it meant something.
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

  -- Daily push ceiling. Revised down from an earlier draft that allowed 4 for
  -- the most active users: the published research is consistent that 3 or more
  -- per day pushes open rates below 5% and weekly opt-out to 5-8%, so 2 is the
  -- ceiling for everyone and the tiers below it only ever reduce.
  v_cap := CASE v_lifecycle
    WHEN 'active_today' THEN 2
    WHEN 'active'       THEN 2
    WHEN 'new'          THEN 2
    WHEN 'new_no_log'   THEN 2
    WHEN 'quiet'        THEN 1
    WHEN 'lapsed'       THEN 1
    WHEN 'never_logged' THEN 1
    ELSE 0                       -- dormant: the day-30 goodbye is the last one
  END;

  RETURN jsonb_build_object(
    -- identity and copy variables
    'user_id',              p_user_id,
    'first_name',           NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''),
    'timezone',             p.timezone,
    'has_timezone',         p.timezone IS NOT NULL,
    'goal',                 p.goal,
    'preferred_tone',       p.preferred_tone,
    'local_date',           v_today,
    'local_hour',           v_hour,
    'days_since_signup',    v_today - (p.created_at AT TIME ZONE v_tz)::DATE,

    -- lifecycle
    'lifecycle',            v_lifecycle,
    'days_since_last_log',  v_days_quiet,
    'logged_today',         COALESCE(v_days_quiet, -1) = 0,

    -- feature adoption: what has this person actually discovered
    'has_logged_food',      v_last_log IS NOT NULL,
    'has_logged_water',     EXISTS (SELECT 1 FROM public.water_logs   w WHERE w.user_id = p_user_id),
    'has_used_chat',        EXISTS (SELECT 1 FROM public.chat_messages c WHERE c.user_id = p_user_id),
    'has_weighed',          EXISTS (SELECT 1 FROM public.weight_logs  w WHERE w.user_id = p_user_id),
    'has_group',            v_group IS NOT NULL,
    'group_name',           v_group,
    'has_reminder_enabled', EXISTS (SELECT 1 FROM public.notification_preferences np
                                     WHERE np.user_id = p_user_id AND np.enabled),
    'has_push_token',       EXISTS (SELECT 1 FROM public.device_push_tokens d WHERE d.user_id = p_user_id),

    -- streak
    'streak_days',          v_streak,
    'longest_streak',       v_longest,

    -- today, in the user's own local day
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

    -- recent behaviour
    'logs_last_7d',         COALESCE(v_logs_7d, 0),
    'active_days_last_7d',  COALESCE(v_active_7d, 0),

    -- notification pressure, for the frequency cap
    'pushes_today',         COALESCE(v_push_today, 0),
    'pushes_last_7d',       COALESCE(v_push_7d, 0),
    'last_push_at',         v_last_push,
    'minutes_since_push',   CASE WHEN v_last_push IS NULL THEN NULL
                                 ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last_push)) / 60)::INT END,
    'opens_last_30d',       COALESCE(v_opens_30d, 0),
    'push_cap_today',       v_cap,
    'push_budget_left',     GREATEST(0, v_cap - COALESCE(v_push_today, 0)),

    -- when this person is actually reachable
    'engagement_hour',      v_eng_hour,
    'engagement_sample',    COALESCE(v_eng_n, 0)
  );
END;
$fn$;

-- Clients may call this for their own row (useful for a debug screen and for
-- showing someone why they did or didn't get a nudge). The auth.uid() guard
-- inside the function is what actually enforces the boundary.
GRANT EXECUTE ON FUNCTION public.build_user_state(UUID) TO authenticated;
