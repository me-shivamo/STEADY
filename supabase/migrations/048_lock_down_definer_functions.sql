-- Lock down SECURITY DEFINER functions, and three smaller P0 fixes.
--
-- ─── THE HOLE ───────────────────────────────────────────────────────────────
-- A SECURITY DEFINER function runs with its owner's privileges (postgres), the
-- way a setuid binary runs as root. That is only safe if one of two things is
-- true: the function checks who is calling it (auth.uid()), or ordinary users
-- cannot call it at all.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and
-- Supabase additionally grants it to anon and authenticated. Not one of the
-- 47 migrations before this one contains a REVOKE. So every server-only
-- helper below was callable by any signed-in user through PostgREST
-- (supabase.rpc(...)), with an arbitrary user id:
--   medicines_due_at          -> read anyone's medicine names       (P0 #1)
--   enqueue_event             -> queue a push to anyone             (P0 #2)
--   enqueue_due_events,
--   enqueue_group_never_opened -> trigger the whole enqueuer early
--   event_still_valid         -> probe another user's state
--   pick_send_hour,
--   user_activity_by_hour     -> learn when any user is usually active
--   recompute_streak, refresh_activity_prior, reset_daily_usage_limits
--                             -> internal maintenance
--
-- ─── AUDIT (every SECURITY DEFINER function, latest definition) ─────────────
-- Server-only, revoked here: the ten above. Their only callers are the
-- send-scheduled-notifications Edge Function (service_role), pg_cron (runs as
-- postgres), and other SECURITY DEFINER functions/triggers (which execute as
-- the owner, so the revoke does not reach them).
--
-- Client-callable, left as they are because each checks auth.uid():
--   build_user_state, create_group, delete_group, join_group_by_code,
--   leave_group, remove_member, get_group_leaderboard,
--   get_group_activity_score, get_group_activity_feed, mark_group_opened,
--   mark_notification_opened, record_group_milestone.
-- Client-callable by design, no per-user data: get_group_preview_by_code
--   (needs the invite code), increment_admin_ping (one shared counter).
-- Left callable, known minor leak: is_group_member / is_group_admin take an
--   arbitrary user id, but RLS policies call them as the querying user, so
--   they must stay executable. They reveal only membership, and only to
--   someone who already holds the group's UUID. Revisit with Groups after v2.1.
-- Trigger functions (handle_new_user, update_daily_summary, ...): cannot be
--   invoked through PostgREST at all, so nothing to change.

-- ─── 1. Server-only functions: service_role only ────────────────────────────
REVOKE EXECUTE ON FUNCTION public.medicines_due_at(UUID, TEXT)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_event(UUID, TEXT, TEXT, JSONB)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_due_events()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_group_never_opened()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.event_still_valid(UUID, TEXT)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_send_hour(UUID, INT, INT)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_activity_by_hour(UUID)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_streak(UUID)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_activity_prior()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_usage_limits()                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.medicines_due_at(UUID, TEXT)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_event(UUID, TEXT, TEXT, JSONB)       TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_due_events()                         TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_group_never_opened()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.event_still_valid(UUID, TEXT)                TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_send_hour(UUID, INT, INT)               TO service_role;
GRANT EXECUTE ON FUNCTION public.user_activity_by_hour(UUID)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_streak(UUID)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_activity_prior()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_daily_usage_limits()                   TO service_role;

-- ─── 2. Close the default for the future ────────────────────────────────────
-- From now on a new function in public is NOT callable by app users until a
-- migration grants it explicitly (every client-callable function above already
-- carries its own GRANT ... TO authenticated, so this changes nothing that
-- exists). Forgetting a grant now fails loudly with "permission denied"
-- instead of silently shipping a hole. Applies to functions created by
-- postgres, which is the role migrations run as. Existing functions keep the
-- privileges set above.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ─── 3. P0 #4: a NULL goal was treated as "gaining" ─────────────────────────
-- `v_goal NOT IN (...)` is NULL, not TRUE, when v_goal is NULL, so the guard
-- never fired and the CASE fell through to the gain branch. Same function as
-- migration 043, with only the guard changed.
CREATE OR REPLACE FUNCTION public.on_weight_logged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_goal   TEXT;
  v_first  NUMERIC;
  v_delta  NUMERIC;
  v_whole  INT;
BEGIN
  SELECT goal INTO v_goal FROM public.profiles WHERE id = NEW.user_id;
  IF v_goal IS NULL OR v_goal NOT IN ('lose_weight', 'gain_weight') THEN
    RETURN NULL;
  END IF;

  SELECT weight_kg INTO v_first
    FROM public.weight_logs
   WHERE user_id = NEW.user_id
   ORDER BY logged_date, created_at
   LIMIT 1;
  IF v_first IS NULL THEN RETURN NULL; END IF;

  -- Positive means "progress toward the goal", whichever direction that is.
  v_delta := CASE v_goal
    WHEN 'lose_weight' THEN v_first - NEW.weight_kg
    ELSE                    NEW.weight_kg - v_first
  END;

  v_whole := FLOOR(v_delta)::INT;
  IF v_whole < 1 THEN RETURN NULL; END IF;

  PERFORM public.enqueue_event(
    NEW.user_id,
    'weight_milestone',
    'weight_milestone:' || NEW.user_id || ':' || v_whole,
    jsonb_build_object('kg', v_whole, 'direction', v_goal)
  );
  RETURN NULL;
END;
$fn$;

-- ─── 4. P0 #3: {{weight_change}} has no producer ────────────────────────────
-- All six weight_milestone templates interpolate {{weight_change}}, but the
-- sender never reads notification_events.payload, so the placeholder would
-- reach users as literal text. Switch the event type off; enqueue_event()
-- already returns FALSE for inactive types. Nothing is queued today (checked
-- 2026-11-12: 0 weight_milestone rows). The v2.0 notification rework renders
-- the payload and turns this back on.
UPDATE public.notification_event_types
   SET active = FALSE
 WHERE event_key = 'weight_milestone';

-- ─── 5. P0 #5: ai_logs was never created ────────────────────────────────────
-- Migration 015 is in the repo but the table does not exist in production
-- (PostgREST returns 404), so every AI call since has failed its fire-and-
-- forget log insert silently. Recreated here exactly as 015 defined it, made
-- idempotent so it is harmless if 015 is ever applied after all.
CREATE TABLE IF NOT EXISTS public.ai_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  source            TEXT NOT NULL CHECK (source IN ('analyze-food-photo', 'log-food-from-text', 'macro-resolver')),
  model             TEXT NOT NULL,

  request_payload   JSONB,
  response_payload  JSONB,

  status            TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message     TEXT,
  latency_ms        INTEGER,

  prompt_tokens     INTEGER,
  completion_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS ai_logs_user_id_idx    ON public.ai_logs (user_id);
CREATE INDEX IF NOT EXISTS ai_logs_created_at_idx ON public.ai_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_logs_status_idx     ON public.ai_logs (status) WHERE status = 'error';
CREATE INDEX IF NOT EXISTS ai_logs_source_idx     ON public.ai_logs (source);

-- RLS on with no policies = deny-all for anon/authenticated; service_role
-- (the Edge Functions) bypasses RLS and can still write.
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- request_payload holds what users typed about their meals and health, so it
-- is kept only as long as it is useful for debugging: 30 days, swept nightly.
SELECT cron.schedule(
  'ai-logs-retention',
  '15 3 * * *',
  $$DELETE FROM public.ai_logs WHERE created_at < NOW() - INTERVAL '30 days'$$
);
