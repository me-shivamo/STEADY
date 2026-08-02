-- Groups: the social/gamification layer. Friends, family, or coworkers join
-- a shared group, see who's logging today, compare on a leaderboard, and
-- cheer each other on. This is the FIRST feature in the app where one user
-- is meant to see another user's data — every table before this used RLS
-- policies of the plain shape `auth.uid() = user_id`. Groups needs
-- "can I see this row because we're in the same group," which is a
-- fundamentally different kind of rule (see the RLS section below).
--
-- Privacy design: group members never see each other's actual calories or
-- macros. All group-visible activity flows through group_daily_activity, a
-- denormalized ledger that stores only "did they log" and "how many meals" —
-- never nutrition values. That table is populated by a trigger on
-- meal_logs, mirroring update_daily_summary()'s trigger pattern below.

-- ─── GROUPS ─────────────────────────────────────────────────────────────────
-- The group itself. No points/streaks are stored here — those are always
-- computed from group_daily_activity, so there's exactly one source of
-- truth instead of a cached number that can drift out of sync.
CREATE TABLE public.groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  category      TEXT NOT NULL DEFAULT 'friends'
                  CHECK (category IN ('friends', 'family', 'coach', 'team')),
  invite_code   TEXT NOT NULL UNIQUE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX groups_invite_code_idx ON public.groups (invite_code);

-- ─── GROUP MEMBERS ──────────────────────────────────────────────────────────
-- role is unused beyond 'admin' | 'member' in v1 (no Coach role yet) — added
-- now so a future role tier can widen the CHECK constraint later without a
-- breaking migration.
CREATE TABLE public.group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX group_members_group_idx ON public.group_members (group_id);
CREATE INDEX group_members_user_idx  ON public.group_members (user_id);

-- ─── GROUP DAILY ACTIVITY (denormalized, privacy-safe points/streak ledger) ──
-- One row per (group, member, day). Populated by a trigger fanned out from
-- meal_logs — never written to directly by clients. Deliberately carries NO
-- nutrition data, only whether the member logged and how many meals, so
-- it's safe to expose to fellow group members via RLS without leaking
-- anyone's diet details. The leaderboard, activity feed, and per-member
-- "logged today" status all read from this table instead of
-- daily_summaries/meal_logs.
CREATE TABLE public.group_daily_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  did_log       BOOLEAN NOT NULL DEFAULT FALSE,
  meal_count    INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id, activity_date)
);

CREATE INDEX group_daily_activity_group_date_idx
  ON public.group_daily_activity (group_id, activity_date DESC);
CREATE INDEX group_daily_activity_group_user_idx
  ON public.group_daily_activity (group_id, user_id);

-- ─── GROUP ACTIVITY FEED ────────────────────────────────────────────────────
-- Chronological events for the Activity Feed tab: "logged a meal", "hit a
-- streak milestone", "hit their goal", "joined the group". event_meta is a
-- generic JSON bag for small display-only numbers (e.g. {"streak_days": 7})
-- — never nutrition values, keeping the same privacy boundary as the ledger.
CREATE TABLE public.group_activity_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('logged_meal', 'streak_milestone', 'goal_hit', 'joined_group')),
  event_meta   JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX group_activity_events_group_idx
  ON public.group_activity_events (group_id, created_at DESC);

-- ─── GROUP ACTIVITY CHEERS (reactions) ──────────────────────────────────────
-- One "heart" per (event, user) — re-tapping toggles it off. Unlike the
-- ledger/feed, this IS written directly by the client (a heart tap is a
-- simple toggle with no cross-table logic), gated by RLS instead of an RPC.
CREATE TABLE public.group_activity_cheers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.group_activity_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX group_activity_cheers_event_idx ON public.group_activity_cheers (event_id);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- Helper functions first: is_group_member/is_group_admin wrap the "check
-- group_members" logic in a SECURITY DEFINER function. SECURITY DEFINER
-- means the function body runs with the privileges of whoever OWNS the
-- function, not the caller — so its internal query bypasses RLS instead of
-- re-triggering it. This is what breaks the recursion trap: a policy ON
-- group_members that subqueried group_members directly (from inside its own
-- policy evaluation) would ask Postgres to re-check the very policy it's in
-- the middle of evaluating. Routing through this function turns it into an
-- ordinary function call instead of a self-referencing RLS-checked query.
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

ALTER TABLE public.groups                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_daily_activity    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_activity_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_activity_cheers   ENABLE ROW LEVEL SECURITY;

-- groups: members can read; admins can rename. No client-facing INSERT/DELETE
-- policy — creating and deleting a group must also touch group_members
-- atomically, which only the RPCs below can guarantee.
CREATE POLICY "Members can view their groups"
  ON public.groups FOR SELECT
  USING (public.is_group_member(id, auth.uid()));

CREATE POLICY "Admins can update their group"
  ON public.groups FOR UPDATE
  USING (public.is_group_admin(id, auth.uid()));

-- group_members: members can see their fellow members. Self-leave is a
-- direct DELETE; joining and admin-removes-member go through RPCs (joining
-- needs to resolve an invite code and hardcode role='member' server-side —
-- a direct INSERT policy would let a client set role='admin' on themselves).
CREATE POLICY "Members can view fellow group members"
  ON public.group_members FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Members can remove themselves (leave group)"
  ON public.group_members FOR DELETE
  USING (user_id = auth.uid());

-- group_daily_activity: read-only for members, in any group they're in.
-- Only the trigger below (SECURITY DEFINER) ever writes here.
CREATE POLICY "Members can view group activity ledger"
  ON public.group_daily_activity FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

-- group_activity_events: read-only for members. No client INSERT policy —
-- every event is system-derived (the trigger writes 'logged_meal', the
-- record_group_milestone RPC writes the rest), so a member can never post a
-- fake feed entry about themselves or anyone else.
CREATE POLICY "Members can view group activity feed"
  ON public.group_activity_events FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

-- group_activity_cheers: direct client reads/writes, scoped to events that
-- belong to a group the caller is actually in.
CREATE POLICY "Members can view cheers in their groups"
  ON public.group_activity_cheers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_activity_events e
      WHERE e.id = event_id AND public.is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY "Members can cheer events in their groups"
  ON public.group_activity_cheers FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_activity_events e
      WHERE e.id = event_id AND public.is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY "Members can un-cheer their own reaction"
  ON public.group_activity_cheers FOR DELETE
  USING (user_id = auth.uid());

-- ─── TRIGGER: fan meal_logs changes out into every group the user is in ─────
-- Mirrors update_daily_summary()'s "recompute on meal_logs change" shape
-- (see 003_triggers_functions.sql), but fans out per-group instead of
-- per-user, and deliberately stores zero nutrition fields — only did_log
-- and meal_count. A user's meal_logs row doesn't know which group it
-- belongs to (a user can be in more than one group), so this loops over
-- every group the logging user currently belongs to and upserts one ledger
-- row per group for that day.
CREATE OR REPLACE FUNCTION public.update_group_daily_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_date        DATE;
  v_new_count   INT;
  v_already_logged BOOLEAN;
  g RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_date    := OLD.logged_date;
  ELSE
    v_user_id := NEW.user_id;
    v_date    := NEW.logged_date;
  END IF;

  SELECT COUNT(*) INTO v_new_count
  FROM public.meal_logs
  WHERE user_id = v_user_id AND logged_date = v_date;

  FOR g IN SELECT group_id FROM public.group_members WHERE user_id = v_user_id LOOP
    -- Read this group's ledger row BEFORE upserting it, so we know whether
    -- today was already marked logged. Using meal_logs' own row count to
    -- decide "was this the first meal" is a race condition when multiple
    -- meal_logs rows are inserted in the same statement/transaction (e.g. a
    -- multi-item photo log) — every row's trigger firing sees the SAME
    -- final count (all rows are already committed within the statement by
    -- the time any AFTER trigger runs), so "count = 1" would never be true
    -- for a 2-meal batch insert and the feed event would silently never
    -- fire. Checking the ledger's own prior state avoids that: it's exactly
    -- one row we control per (group, user, day), so its "was it already
    -- true" answer is well-defined regardless of how many meal_logs rows
    -- landed in the same transaction.
    SELECT did_log INTO v_already_logged
    FROM public.group_daily_activity
    WHERE group_id = g.group_id AND user_id = v_user_id AND activity_date = v_date;

    INSERT INTO public.group_daily_activity (group_id, user_id, activity_date, did_log, meal_count, updated_at)
    VALUES (g.group_id, v_user_id, v_date, v_new_count > 0, v_new_count, NOW())
    ON CONFLICT (group_id, user_id, activity_date)
    DO UPDATE SET did_log = EXCLUDED.did_log, meal_count = EXCLUDED.meal_count, updated_at = NOW();

    -- Only emit a feed event the moment a day flips from "not logged" to
    -- "logged" — once per day per group, not once per meal.
    IF TG_OP = 'INSERT' AND v_new_count > 0 AND NOT COALESCE(v_already_logged, FALSE) THEN
      INSERT INTO public.group_activity_events (group_id, user_id, event_type, event_meta)
      VALUES (g.group_id, v_user_id, 'logged_meal', jsonb_build_object('date', v_date));
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER on_meal_log_change_group_activity
  AFTER INSERT OR DELETE ON public.meal_logs
  FOR EACH ROW EXECUTE PROCEDURE public.update_group_daily_activity();

-- ─── RPC: create_group ──────────────────────────────────────────────────────
-- Generates a random invite code (STEADY-XXXX, unambiguous charset — no
-- 0/O/1/I) and retries on the rare collision, then inserts the group and
-- the creator's admin membership row atomically. A two-step client-side
-- insert (create group, then insert membership) couldn't guarantee both
-- happen together — a dropped connection between the two would leave an
-- orphaned group with no members.
CREATE OR REPLACE FUNCTION public.create_group(p_name TEXT, p_category TEXT)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_charset TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code    TEXT;
  v_group   public.groups;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'STEADY-' || (
      SELECT string_agg(substr(v_charset, (floor(random() * length(v_charset)) + 1)::INT, 1), '')
      FROM generate_series(1, 4)
    );
    BEGIN
      INSERT INTO public.groups (name, category, invite_code, created_by)
      VALUES (p_name, p_category, v_code, auth.uid())
      RETURNING * INTO v_group;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Could not generate a unique invite code, please try again';
      END IF;
    END;
  END LOOP;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, auth.uid(), 'admin');

  RETURN v_group;
END;
$$;

-- ─── RPC: get_group_preview_by_code ─────────────────────────────────────────
-- Looks up a group by invite code with NO membership check — this is how a
-- non-member can preview a group (name, member count, avatars) on the Join
-- screen before committing to join. Returns only display-safe aggregates,
-- never raw member IDs or emails.
CREATE OR REPLACE FUNCTION public.get_group_preview_by_code(p_code TEXT)
RETURNS TABLE (
  group_id TEXT,
  name TEXT,
  category TEXT,
  member_count INT,
  member_avatars TEXT[]
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT
    g.id::TEXT,
    g.name,
    g.category,
    (SELECT COUNT(*)::INT FROM public.group_members gm WHERE gm.group_id = g.id),
    (SELECT COALESCE(array_agg(p.avatar_url ORDER BY gm2.joined_at) FILTER (WHERE p.avatar_url IS NOT NULL), '{}')
       FROM public.group_members gm2
       JOIN public.profiles p ON p.id = gm2.user_id
       WHERE gm2.group_id = g.id
       LIMIT 5)
  FROM public.groups g
  WHERE g.invite_code = upper(p_code);
$$;

-- ─── RPC: join_group_by_code ─────────────────────────────────────────────────
-- Resolves the code to a group, is idempotent (re-tapping "Join" after
-- already joining just returns the existing group instead of erroring), and
-- always inserts with role='member' — hardcoded server-side so a client
-- can't grant itself admin via a crafted request.
CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group public.groups;
BEGIN
  SELECT * INTO v_group FROM public.groups WHERE invite_code = upper(p_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No group found for that invite code';
  END IF;

  IF public.is_group_member(v_group.id, auth.uid()) THEN
    RETURN v_group;
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, auth.uid(), 'member');

  INSERT INTO public.group_activity_events (group_id, user_id, event_type)
  VALUES (v_group.id, auth.uid(), 'joined_group');

  RETURN v_group;
END;
$$;

-- ─── RPC: leave_group ────────────────────────────────────────────────────────
-- A plain self-DELETE on group_members (already RLS-allowed) isn't quite
-- enough on its own: v1 has no admin-transfer UI, so an admin leaving a
-- group with other members still in it would strand the group with nobody
-- able to rename it or remove anyone. This RPC blocks that case explicitly
-- — the admin's way out of a non-empty group is delete_group(), not leave.
CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_count INT;
BEGIN
  SELECT COUNT(*) INTO v_member_count FROM public.group_members WHERE group_id = p_group_id;

  IF v_member_count <= 1 THEN
    DELETE FROM public.groups WHERE id = p_group_id;
    RETURN;
  END IF;

  IF public.is_group_admin(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Delete the group instead of leaving it while other members remain';
  END IF;

  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = auth.uid();
END;
$$;

-- ─── RPC: remove_member ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_member(p_group_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only a group admin can remove members';
  END IF;
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;

-- ─── RPC: delete_group ────────────────────────────────────────────────────────
-- ON DELETE CASCADE on every child table handles the actual cleanup; this
-- RPC exists so the admin check lives in one enforced place rather than a
-- DELETE RLS policy duplicating the same logic.
CREATE OR REPLACE FUNCTION public.delete_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only a group admin can delete the group';
  END IF;
  DELETE FROM public.groups WHERE id = p_group_id;
END;
$$;

-- ─── RPC: record_group_milestone ─────────────────────────────────────────────
-- The client already computes personal streaks locally (see useStreak.ts).
-- When it detects a milestone worth celebrating (e.g. streak % 7 === 0)
-- right after logging, it calls this to post a feed event. user_id is
-- always auth.uid(), server-side — never trusted from the caller — so a
-- member can't post a fake milestone in someone else's name.
CREATE OR REPLACE FUNCTION public.record_group_milestone(p_group_id UUID, p_event_type TEXT, p_meta JSONB DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;
  IF p_event_type NOT IN ('streak_milestone', 'goal_hit') THEN
    RAISE EXCEPTION 'Invalid milestone event type';
  END IF;
  INSERT INTO public.group_activity_events (group_id, user_id, event_type, event_meta)
  VALUES (p_group_id, auth.uid(), p_event_type, p_meta);
END;
$$;

-- ─── FUNCTION: compute_group_streak ──────────────────────────────────────────
-- Same "consecutive days logged, walking backwards from today, today
-- forgiven" algorithm as the client's useStreak.ts, re-implemented in SQL
-- against group_daily_activity instead of daily_summaries — this is what
-- keeps it inside the privacy boundary (no nutrition table touched). Can
-- differ slightly from a member's personal Home streak if they joined this
-- particular group partway through their streak — expected, since this is
-- explicitly a per-group figure, not a re-export of the personal one.
CREATE OR REPLACE FUNCTION public.compute_group_streak(p_group_id UUID, p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day DATE := CURRENT_DATE;
  v_count INT := 0;
  v_logged_today BOOLEAN;
BEGIN
  SELECT did_log INTO v_logged_today FROM public.group_daily_activity
    WHERE group_id = p_group_id AND user_id = p_user_id AND activity_date = CURRENT_DATE;
  IF NOT COALESCE(v_logged_today, FALSE) THEN
    v_day := v_day - 1;
  END IF;

  LOOP
    IF EXISTS (
      SELECT 1 FROM public.group_daily_activity
      WHERE group_id = p_group_id AND user_id = p_user_id
        AND activity_date = v_day AND did_log
    ) THEN
      v_count := v_count + 1;
      v_day := v_day - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ─── RPC: get_group_leaderboard ──────────────────────────────────────────────
-- Points = total meals logged in this group's ledger, all-time (v1: "1
-- point per meal logged", no goal-adherence weighting). SECURITY DEFINER
-- here specifically lets this function join profiles.full_name/avatar_url
-- for OTHER members despite profiles' own strict auth.uid()=id RLS — scoped
-- tightly to those two display fields only, and gated by is_group_member
-- first so a non-member can't call this to enumerate a group's roster.
CREATE OR REPLACE FUNCTION public.get_group_leaderboard(p_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  points INT,
  current_streak INT,
  logged_today BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  WITH points AS (
    SELECT gda.user_id, SUM(gda.meal_count)::INT AS points
    FROM public.group_daily_activity gda
    WHERE gda.group_id = p_group_id
    GROUP BY gda.user_id
  ),
  today_flag AS (
    SELECT gda.user_id, bool_or(gda.did_log) AS logged_today
    FROM public.group_daily_activity gda
    WHERE gda.group_id = p_group_id AND gda.activity_date = CURRENT_DATE
    GROUP BY gda.user_id
  )
  SELECT
    gm.user_id,
    p.full_name,
    p.avatar_url,
    COALESCE(pts.points, 0),
    COALESCE(public.compute_group_streak(p_group_id, gm.user_id), 0),
    COALESCE(tf.logged_today, FALSE)
  FROM public.group_members gm
  JOIN public.profiles p ON p.id = gm.user_id
  LEFT JOIN points pts ON pts.user_id = gm.user_id
  LEFT JOIN today_flag tf ON tf.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND public.is_group_member(p_group_id, auth.uid())
  ORDER BY COALESCE(pts.points, 0) DESC;
$$;

-- ─── RPC: get_group_activity_score ───────────────────────────────────────────
-- "X/Y members logged today" aggregate for the dashboard's hero card.
CREATE OR REPLACE FUNCTION public.get_group_activity_score(p_group_id UUID)
RETURNS TABLE (member_count INT, logged_today_count INT, pct NUMERIC)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT
    (SELECT COUNT(*)::INT FROM public.group_members WHERE group_id = p_group_id),
    (SELECT COUNT(*)::INT FROM public.group_daily_activity
       WHERE group_id = p_group_id AND activity_date = CURRENT_DATE AND did_log),
    CASE WHEN (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id) = 0 THEN 0
    ELSE ROUND(
      100.0 * (SELECT COUNT(*) FROM public.group_daily_activity
                 WHERE group_id = p_group_id AND activity_date = CURRENT_DATE AND did_log)
            / (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id),
      0
    ) END
  WHERE public.is_group_member(p_group_id, auth.uid());
$$;

-- ─── RPC: get_group_activity_feed ────────────────────────────────────────────
-- Feed rows pre-joined with the poster's name/avatar and cheer info — same
-- cross-member-profile reasoning as the leaderboard above. p_before is a
-- timestamp cursor for infinite scroll (pass the oldest created_at seen so
-- far to fetch the next page; NULL fetches the most recent page).
CREATE OR REPLACE FUNCTION public.get_group_activity_feed(p_group_id UUID, p_limit INT DEFAULT 30, p_before TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  event_type TEXT,
  event_meta JSONB,
  created_at TIMESTAMPTZ,
  cheer_count INT,
  cheered_by_me BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT
    e.id, e.user_id, p.full_name, p.avatar_url, e.event_type, e.event_meta, e.created_at,
    (SELECT COUNT(*)::INT FROM public.group_activity_cheers c WHERE c.event_id = e.id),
    EXISTS (SELECT 1 FROM public.group_activity_cheers c WHERE c.event_id = e.id AND c.user_id = auth.uid())
  FROM public.group_activity_events e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.group_id = p_group_id
    AND public.is_group_member(p_group_id, auth.uid())
    AND (p_before IS NULL OR e.created_at < p_before)
  ORDER BY e.created_at DESC
  LIMIT p_limit;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_preview_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_group_milestone(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_leaderboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_activity_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_activity_feed(UUID, INT, TIMESTAMPTZ) TO authenticated;
