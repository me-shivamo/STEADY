-- No database function is callable by a logged-out client, and
-- build_user_state becomes server-only.
--
-- ─── THE HOLE (found while verifying 048) ───────────────────────────────────
-- build_user_state guards itself with
--     IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE ...
-- which lets a NULL auth.uid() through on purpose, so the service role can
-- read anyone. But an anonymous request also has a NULL auth.uid(), and the
-- anon key ships inside the app bundle. So anyone with that key could call
-- build_user_state(<any user id>) and read that person's streak, last log
-- date, group status and push history.
--
-- Its only caller is the send-scheduled-notifications Edge Function
-- (service_role) plus enqueue_due_events / event_still_valid, which run as
-- the owner. The app never calls it. So it goes server-only, like the ten
-- functions in 048, and its guard stays as a second line of defence.
--
-- ─── AND MORE BROADLY ───────────────────────────────────────────────────────
-- Every client-callable function the app uses runs after sign-in
-- (src/store/groupStore.ts, adminPingStore.ts, lib/pushNotifications.ts). None
-- needs to work for a logged-out caller, and several only *mostly* handle a
-- NULL auth.uid(). So EXECUTE is removed from PUBLIC and anon on all of them
-- and kept for authenticated.
--
-- Deliberately NOT touched: is_group_member / is_group_admin. RLS policies
-- call them for every request against the group tables, including
-- anonymous ones, and revoking anon would turn an empty result into a
-- "permission denied" error. They reveal only membership (see 048's audit).
--
-- A DO block resolves each name to its exact signature from pg_proc, so a
-- function with default arguments or overloads cannot be missed by a typo.

REVOKE EXECUTE ON FUNCTION public.build_user_state(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.build_user_state(UUID) TO service_role;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'create_group', 'delete_group', 'join_group_by_code', 'leave_group',
         'remove_member', 'get_group_leaderboard', 'get_group_activity_score',
         'get_group_activity_feed', 'get_group_preview_by_code',
         'mark_group_opened', 'mark_notification_opened',
         'record_group_milestone', 'increment_admin_ping'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END;
$$;
