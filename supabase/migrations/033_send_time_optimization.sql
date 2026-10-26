-- Adaptive send timing: stop sending at a fixed hour, start sending when this
-- particular person is actually awake and using the app.
--
-- ─── THE IDEA ───────────────────────────────────────────────────────────────
-- Every action a user takes carries a timestamp, so their own history already
-- describes when they are reachable. Counting those actions into 24 hourly
-- buckets gives an activity heatmap, and the peak bucket is the hour they are
-- most likely to see a notification rather than swipe it away.
--
-- Critically this is built from ACTIONS, not from meal times. meal_logs.created_at
-- records when someone told the app, not when they ate -- production has a user
-- who eats breakfast in the morning and logs it at 13:30 every day. That makes
-- the timestamp a poor proxy for hunger and an excellent one for availability,
-- which is exactly the question send-time optimisation asks.
--
-- ─── THREE RULES THE RESEARCH IS EMPHATIC ABOUT ─────────────────────────────
-- 1. ADAPT WITHIN A BAND, NEVER ANYWHERE. A lunch nudge that learns you are
--    active at 01:00 must not fire at 01:00. Every caller passes the window
--    that still makes the message make sense, and we find the best hour inside
--    it. Without this, optimisation quietly destroys the meaning of the message.
-- 2. A FALLBACK IS MANDATORY. Most users will never have enough history. The
--    ladder is: the user's own peak -> the population's peak (a "cross-user
--    prior", i.e. what everyone else does, which is a genuinely good guess) ->
--    a fixed default. Never invent a window from three data points.
-- 3. HARD EXCLUSION WINDOW. Nothing sends before 08:00 or after 21:00 local,
--    whatever the data says. Note this is a *global* default rather than the
--    per-user quiet hours in notification_preferences, because 0 of 6 rows in
--    production have quiet hours set and most users have no row at all -- a
--    protection nobody has configured protects nobody.
--
-- Cold start resolves itself: as a user accumulates history the personal peak
-- takes over from the population prior, typically within a few weeks.

-- ─── ACTIVITY HEATMAP ───────────────────────────────────────────────────────
-- One row per local hour the user has ever done anything in. Deliberately a
-- function rather than a materialised view: at 24 users this is milliseconds,
-- and a view would need a refresh schedule, which is one more thing that can
-- silently stop running (see migration 025 for how that goes here).
CREATE OR REPLACE FUNCTION public.user_activity_by_hour(p_user_id UUID)
RETURNS TABLE (local_hour INT, actions BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tz AS (
    SELECT COALESCE(timezone, 'UTC') AS name FROM public.profiles WHERE id = p_user_id
  ),
  acts AS (
    SELECT ml.created_at AS at FROM public.meal_logs    ml WHERE ml.user_id = p_user_id
    UNION ALL
    SELECT cm.created_at      FROM public.chat_messages cm WHERE cm.user_id = p_user_id
    UNION ALL
    SELECT wl.logged_at       FROM public.water_logs    wl WHERE wl.user_id = p_user_id
    UNION ALL
    SELECT wg.created_at      FROM public.weight_logs   wg WHERE wg.user_id = p_user_id
  )
  SELECT EXTRACT(HOUR FROM (a.at AT TIME ZONE t.name))::INT, COUNT(*)
  FROM acts a CROSS JOIN tz t
  GROUP BY 1;
$$;

-- ─── POPULATION PRIOR ───────────────────────────────────────────────────────
-- The same heatmap across everybody, used when one user has too little history
-- of their own. This is the "cross-user propagation" the research recommends
-- for cold start, and it is a much better guess than a hardcoded hour because
-- it reflects when THIS app's users are actually around.
--
-- Materialised as a table refreshed on demand rather than computed per send:
-- it is identical for every user, so recomputing it inside a loop over due
-- notifications would be pure waste.
CREATE TABLE IF NOT EXISTS public.activity_prior (
  local_hour  INT PRIMARY KEY CHECK (local_hour BETWEEN 0 AND 23),
  actions     BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_prior ENABLE ROW LEVEL SECURITY;
-- Aggregate counts across all users, readable by any signed-in client (there is
-- nothing personal in "how many actions happened at 14:00 across the app"), but
-- writable only by the refresh function below.
CREATE POLICY "Authenticated users can read the activity prior"
  ON public.activity_prior FOR SELECT USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.refresh_activity_prior()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Users with no timezone are excluded rather than assumed to be UTC. Guessing
  -- would smear their activity across the wrong buckets and corrupt the prior
  -- for everyone, which is worse than a slightly smaller sample.
  WITH acts AS (
    SELECT ml.user_id, ml.created_at AS at FROM public.meal_logs    ml
    UNION ALL
    SELECT cm.user_id, cm.created_at      FROM public.chat_messages cm
    UNION ALL
    SELECT wl.user_id, wl.logged_at       FROM public.water_logs    wl
    UNION ALL
    SELECT wg.user_id, wg.created_at      FROM public.weight_logs   wg
  ),
  counted AS (
    SELECT EXTRACT(HOUR FROM (a.at AT TIME ZONE p.timezone))::INT AS h, COUNT(*) AS n
    FROM acts a JOIN public.profiles p ON p.id = a.user_id
    WHERE p.timezone IS NOT NULL
    GROUP BY 1
  )
  INSERT INTO public.activity_prior (local_hour, actions, updated_at)
  SELECT g.h, COALESCE(c.n, 0), NOW()
  FROM generate_series(0, 23) AS g(h)
  LEFT JOIN counted c ON c.h = g.h
  ON CONFLICT (local_hour) DO UPDATE
    SET actions = EXCLUDED.actions, updated_at = NOW();
END;
$fn$;

SELECT public.refresh_activity_prior();

-- Keep it current. Daily is plenty: an activity profile does not move hour to
-- hour, and a stale prior degrades gracefully (it only ever supplies a default
-- for users who have no data of their own).
SELECT cron.schedule(
  'refresh-activity-prior',
  '17 3 * * *',
  $$ SELECT public.refresh_activity_prior(); $$
);

-- ─── THE PICKER ─────────────────────────────────────────────────────────────
-- Returns JSONB rather than a bare INT on purpose. When someone asks "why did
-- STEADY message me at 6pm?", `source` answers it: 'user' (their own peak),
-- 'prior' (the population's), or 'default' (nothing to go on). A timing system
-- that cannot explain itself is one nobody can debug.
--
-- p_earliest/p_latest are the band in which the message still means something,
-- e.g. a lunch nudge might pass (12, 15). They are intersected with the global
-- exclusion window, so a caller cannot accidentally authorise a 3am send.
CREATE OR REPLACE FUNCTION public.pick_send_hour(
  p_user_id  UUID,
  p_earliest INT DEFAULT 8,
  p_latest   INT DEFAULT 21
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Nothing may ever be scheduled outside these hours, local time.
  c_day_start   CONSTANT INT := 8;
  c_day_end     CONSTANT INT := 21;
  -- Below this many actions a personal peak is noise, not a preference. Same
  -- reasoning as build_user_state's engagement_sample floor.
  c_min_user    CONSTANT INT := 20;
  c_min_prior   CONSTANT INT := 50;
  v_lo          INT;
  v_hi          INT;
  v_hour        INT;
  v_sample      BIGINT;
  v_source      TEXT;
BEGIN
  v_lo := GREATEST(COALESCE(p_earliest, c_day_start), c_day_start);
  v_hi := LEAST(COALESCE(p_latest, c_day_end), c_day_end);

  -- A caller passing an inverted or fully-excluded window (say 2am to 5am) gets
  -- the whole allowed day rather than an error, because refusing to schedule is
  -- a silent failure and this system has produced enough of those.
  IF v_lo > v_hi THEN
    v_lo := c_day_start;
    v_hi := c_day_end;
  END IF;

  -- 1. The user's own peak inside the band.
  SELECT h.local_hour, SUM(h.actions) OVER ()
    INTO v_hour, v_sample
    FROM public.user_activity_by_hour(p_user_id) h
   WHERE h.local_hour BETWEEN v_lo AND v_hi
   ORDER BY h.actions DESC, h.local_hour
   LIMIT 1;

  IF v_hour IS NOT NULL AND COALESCE(v_sample, 0) >= c_min_user THEN
    v_source := 'user';
  ELSE
    -- 2. The population prior inside the band.
    SELECT ap.local_hour, SUM(ap.actions) OVER ()
      INTO v_hour, v_sample
      FROM public.activity_prior ap
     WHERE ap.local_hour BETWEEN v_lo AND v_hi
     ORDER BY ap.actions DESC, ap.local_hour
     LIMIT 1;

    IF v_hour IS NOT NULL AND COALESCE(v_sample, 0) >= c_min_prior THEN
      v_source := 'prior';
    ELSE
      -- 3. Nothing to go on. Middle of the allowed band beats an arbitrary
      -- constant, since the band already encodes when the message makes sense.
      v_hour   := (v_lo + v_hi) / 2;
      v_sample := 0;
      v_source := 'default';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'hour',         v_hour,
    'source',       v_source,
    'sample',       COALESCE(v_sample, 0),
    'window_start', v_lo,
    'window_end',   v_hi
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.user_activity_by_hour(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_send_hour(UUID, INT, INT) TO authenticated;
