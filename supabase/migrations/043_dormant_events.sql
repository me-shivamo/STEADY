-- Wire up the three events that had templates but nothing to queue them.
--
-- `group_member_joined` and `weight_milestone` are both reactions to a single
-- database write, which makes them a poor fit for the five-minute polling
-- enqueuer and a natural fit for triggers: the moment the row lands we know the
-- event happened, and we know it exactly once.
--
-- `group_never_opened` is different and is only half-fixed here, honestly. It
-- needs to know when a user last looked at their group, and nothing records
-- that. This migration adds the column; the app has to start writing it before
-- the event can fire. Adding the schema now means the enqueuer is ready and the
-- feature switches itself on the moment the client ships, rather than needing a
-- second database change later.

-- ─── group_member_joined ────────────────────────────────────────────────────
-- Notifies the group's OWNER when somebody joins. Deliberately not every
-- member: in a group of eight, one join would otherwise fire seven
-- notifications, which is how a nice moment becomes spam.
CREATE OR REPLACE FUNCTION public.on_group_member_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner UUID;
BEGIN
  SELECT created_by INTO v_owner FROM public.groups WHERE id = NEW.group_id;

  -- Nothing to say when the owner is the one joining (group creation), and no
  -- point telling somebody about their own action.
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NULL;
  END IF;

  -- Keyed on the joining member, so one notification per person who joins,
  -- even if they leave and rejoin within the same tick.
  PERFORM public.enqueue_event(
    v_owner,
    'group_member_joined',
    'group_member_joined:' || v_owner || ':' || NEW.user_id,
    jsonb_build_object('joined_user_id', NEW.user_id)
  );
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS on_group_member_joined_notify ON public.group_members;
CREATE TRIGGER on_group_member_joined_notify
  AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.on_group_member_joined();

-- ─── weight_milestone ───────────────────────────────────────────────────────
-- Fires when a user crosses a whole kilogram in the direction of their goal,
-- measured against their FIRST ever weigh-in.
--
-- Direction matters and is read from profiles.goal: 2kg down is a milestone for
-- someone losing and a setback for someone gaining. Congratulating the wrong
-- direction would be worse than saying nothing, so anyone whose goal is
-- 'maintain', or who has no goal set, gets no milestone at all.
--
-- The dedupe key carries the whole-kg figure, so each kilogram is celebrated
-- exactly once and normal daily fluctuation across the same boundary cannot
-- re-fire it.
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
  IF v_goal NOT IN ('lose_weight', 'gain_weight') THEN
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

DROP TRIGGER IF EXISTS on_weight_logged_milestone ON public.weight_logs;
CREATE TRIGGER on_weight_logged_milestone
  AFTER INSERT ON public.weight_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_weight_logged();

-- ─── group_never_opened: the half we can build ──────────────────────────────
-- The column the app needs to write when someone opens their group screen.
-- Until the client ships that write, every row stays NULL and the enqueuer
-- condition below is never true, so the event stays dormant exactly as it is
-- now. Nothing regresses, and nothing fires on bad data.
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;

COMMENT ON COLUMN public.group_members.last_opened_at IS
  'Set by the app when the user opens this group screen. Drives the group_never_opened notification; NULL means never opened (or the client predates this column).';

-- An RPC for the client, because group_members is RLS-protected and this is a
-- single-column touch rather than a general update grant.
CREATE OR REPLACE FUNCTION public.mark_group_opened(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_rows INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'mark_group_opened: must be called by a signed-in user';
  END IF;

  UPDATE public.group_members
     SET last_opened_at = NOW()
   WHERE group_id = p_group_id
     AND user_id = auth.uid();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mark_group_opened(UUID) TO authenticated;

-- The enqueuer for group_never_opened, kept as its own function rather than
-- folded into enqueue_due_events(). Two reasons: it is the only condition that
-- depends on a column the client does not write yet, so isolating it makes the
-- dependency obvious; and re-emitting the 200-line main enqueuer to add six
-- lines is exactly the kind of wholesale rewrite that lost `local_date` twice
-- (migrations 021 and 022).
--
-- Fires for someone who is in a group and has not opened it for three days,
-- at most once a week. While last_opened_at is NULL for everyone -- which it is
-- until the app ships the mark_group_opened() call -- this matches nothing and
-- sends nothing.
CREATE OR REPLACE FUNCTION public.enqueue_group_never_opened()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r        RECORD;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE p.timezone IS NOT NULL
      AND gm.last_opened_at IS NOT NULL
      AND gm.last_opened_at < NOW() - INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM public.device_push_tokens d WHERE d.user_id = gm.user_id)
  LOOP
    IF public.enqueue_event(
         r.user_id,
         'group_never_opened',
         'group_never_opened:' || r.user_id || ':' || to_char(NOW(), 'IYYY-IW')
       ) THEN
      v_queued := v_queued + 1;
    END IF;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

SELECT cron.schedule(
  'enqueue-group-never-opened',
  '23 * * * *',   -- hourly; this one is not time-of-day sensitive
  $$ SELECT public.enqueue_group_never_opened(); $$
);
