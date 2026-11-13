-- 057_apple_identity.sql — reviewed identity fix: the shared key 'apple' moves to a raw apple row.
-- Spec: .claude/plans/v1.2-phase5-7-spec.md (j) 15 ("the verified apple key points at baby-food applesauce; fix it in a reviewed
-- identity migration"), (e) "Fold-in", (k) 8-15 (founder 2026-11-13: recommended default accepted). Hand-written (one row pair).
-- Rollback: supabase/rollback/057_apple_identity_down.sql (run it before 056's and 055's down scripts).
--
-- WHAT
--   old row 726a34bf-37a3-4931-b3b1-e8d81ed96868  USDA FDC 170959, 47 kcal/100 g, key 'apple': "Babyfood, applesauce" numbers whose only
--       measures are baby-food bottles and jars (054 dropped them on review). Its key is parked and the row is quarantined, reason
--       reviewed:057:apple_identity: served to nobody, kept for the 5 entries that point at it (their numbers never change).
--   new row 0ae1310c-0f9c-50c7-9695-965cdeee4dfa  USDA SR Legacy NDB 09003 "Apples, raw, with skin" (FDC 171688), 52 kcal, P 0.26,
--       C 13.81, F 0.17, fibre 2.4 per 100 g, imported key-less by 055. It takes the key 'apple', so it leaves search_usda_local's
--       index (key-less rows only) and becomes the exact hit for "apple" in every mode. 056 gave FDC 171688 its USDA measures:
--       1 medium 182 g (the old 180 g hint), small 149, large 223, 1 cup slices 109, 1 NLEA serving 242.
--   Why SR 171688 and not FNDDS "Apple, raw" (FDC 2709215, 61 kcal, medium 200 g): it is USDA's generic raw-apple reference, its
--       energy sits inside the 2026 Foundation apples' range (53-58 kcal, five varieties), and its medium apple matches the
--       180 g the app used. Choosing the other row is a one-line change of v_new below (an open question for the founder).
--   machine-learned memory pointers at the old row follow the key to the new row (0 on live, 2026-11-13); user-taught ones
--       (label, correction, manual) are left alone: their target turns quarantined, so the next log resolves afresh.
--   food_value_changes (053's append-only log) gets supersede / key_park / key_take rows.
-- WHAT IT DOES NOT DO: change any number on either row, any entry or summary (fingerprints checked), or any alias.
-- RUNS ONCE: the compare-and-swap below refuses unless both rows are exactly as 055 left them; backup._backup_food_items_057 must
--   not exist. A MIGRATIONS-ONLY REPLAY (db reset, preview branch) skips the whole change with a NOTICE: the baby-food row it moves
--   the key from does not exist there. Production vs replay is decided from that row, checked against 053's backup marker: the row
--   present without the marker (053 rolled back, or its backup renamed or cleaned up) RAISEs, never a silent skip (fixer 2026-11-13).
-- WHERE IT LIVES: supabase/pending/ until rollout step 8 (with 055 and 056; supabase/pending/README.md). It runs with or without
--   056 (its search_usda_local check is skipped when the function is absent). LOCKS (account deletion's order): profiles SHARE, food_items SHARE ROW EXCLUSIVE, food_entries / daily_summaries /
--   saved_entries SHARE, user_food_memory SHARE ROW EXCLUSIVE, food_aliases SHARE. Milliseconds.
-- TRANSACTION: one implicit transaction (CLI); no top-level LOCK / BEGIN / COMMIT.

SELECT pg_catalog.set_config('lock_timeout', '5s', true);

DO $locks$ BEGIN
  LOCK TABLE public.profiles         IN SHARE MODE;
  LOCK TABLE public.food_items       IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_entries, public.daily_summaries, public.saved_entries IN SHARE MODE;
  LOCK TABLE public.user_food_memory IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_aliases     IN SHARE MODE;
END $locks$;

CREATE TEMP TABLE _fp057 ON COMMIT DROP AS SELECT
  (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, food_item_id, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g), ',' ORDER BY id), ''))
     FROM public.food_entries) AS e,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, total_calories, total_protein_g, total_carbs_g, total_fat_g), ',' ORDER BY id), ''))
     FROM public.daily_summaries) AS d,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(id || entries::text, ',' ORDER BY id), ''))
     FROM public.saved_entries) AS s;

DO $apply$
DECLARE
  v_old constant uuid := '726a34bf-37a3-4931-b3b1-e8d81ed96868';
  v_new constant uuid := '0ae1310c-0f9c-50c7-9695-965cdeee4dfa';
  o record; n record; v_top record; v_moved bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_items WHERE id = v_old) THEN
    IF pg_catalog.to_regclass('backup._backup_food_items_053') IS NOT NULL THEN
      RAISE EXCEPTION '057: backup._backup_food_items_053 exists but the old apple row % does not', v_old;
    END IF;
    RAISE NOTICE '057: migrations-only replay (the old apple row does not exist here): the apple identity change is skipped';
    RETURN;
  END IF;
  IF pg_catalog.to_regclass('backup._backup_food_items_053') IS NULL THEN
    RAISE EXCEPTION '057: the old apple row is here but backup._backup_food_items_053 is missing (053 rolled back, or its backup renamed or cleaned up)';
  END IF;
  -- ── §0 Compare-and-swap: both rows exactly as expected ──────────────────────────────────────────────
  IF pg_catalog.to_regclass('backup._backup_food_items_057') IS NOT NULL THEN
    RAISE EXCEPTION '057 runs once: backup._backup_food_items_057 exists (the 057 down script drops it)';
  END IF;
  SELECT * INTO o FROM public.food_items WHERE id = v_old;
  SELECT * INTO n FROM public.food_items WHERE id = v_new;
  IF o.id IS NULL OR (o.status, o.normalized_name, o.source, o.fdc_id, o.calories_per_100g, o.created_by)
       IS DISTINCT FROM ('verified', 'apple', 'usda', 170959::bigint, 47::numeric, NULL::uuid) THEN
    RAISE EXCEPTION '057: the old apple row is not the verified baby-food row with key apple (status %, key %, fdc %, kcal %)',
      o.status, o.normalized_name, o.fdc_id, o.calories_per_100g;
  END IF;
  IF n.id IS NULL OR (n.status, n.normalized_name, n.parked_normalized_name, n.source, n.fdc_id, n.external_id,
                      n.calories_per_100g, n.protein_per_100g, n.carbs_per_100g, n.fat_per_100g, n.fiber_per_100g, n.created_by)
       IS DISTINCT FROM ('verified', NULL::text, NULL::text, 'usda', 171688::bigint, 'ndb:9003',
                         52::numeric, 0.26::numeric, 13.81::numeric, 0.17::numeric, 2.4::numeric, NULL::uuid)
     OR n.status_reason NOT LIKE 'rules\_v1 import:055 sr:2018-04 %' THEN
    RAISE EXCEPTION '057 requires 055: the SR raw apple row (FDC 171688) is missing or differs (status %, key %, kcal %)',
      n.status, n.normalized_name, n.calories_per_100g;
  END IF;
  IF EXISTS (SELECT 1 FROM public.food_aliases WHERE alias = 'apple') THEN
    RAISE EXCEPTION '057: an alias ''apple'' exists; review it with this change';
  END IF;

  -- ── §1 Backups (schema backup: no API-role access since 050) ────────────────────────────────────────
  CREATE TABLE backup._backup_food_items_057 AS
    SELECT fi.* FROM public.food_items fi WHERE fi.id IN (v_old, v_new);
  CREATE TABLE backup._backup_user_food_memory_057 AS
    SELECT m.* FROM public.user_food_memory m WHERE m.food_item_id = v_old;
  REVOKE ALL ON backup._backup_food_items_057, backup._backup_user_food_memory_057 FROM PUBLIC, anon, authenticated, service_role;
  COMMENT ON TABLE backup._backup_food_items_057 IS
    'The two food_items rows 057 changed (apple key moved), as they were before it. Source for supabase/rollback/057_apple_identity_down.sql.';
  COMMENT ON TABLE backup._backup_user_food_memory_057 IS
    'user_food_memory rows that pointed at the old apple row before 057. May hold user ids: drop in a later reviewed migration.';

  -- ── §2 Move the key (park first: the unique key index allows one 'apple') ───────────────────────────
  UPDATE public.food_items
     SET normalized_name = NULL, parked_normalized_name = 'apple', status = 'quarantined',
         status_reason = 'reviewed:057:apple_identity (baby-food applesauce held the key apple; successor 0ae1310c SR 09003)',
         status_changed_at = now()
   WHERE id = v_old;
  UPDATE public.food_items
     SET normalized_name = 'apple', status_reason = status_reason || ' reviewed:057:key_apple', status_changed_at = now()
   WHERE id = v_new;
  UPDATE public.user_food_memory SET food_item_id = v_new
   WHERE food_item_id = v_old AND origin NOT IN ('label', 'correction', 'manual');
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- ── §3 The append-only change log (053's table; counts only for memory) ─────────────────────────────
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, key, relation, before, after, reason)
  SELECT '057', 'supersede', v_old, v_new, 'apple', 'wrong_food_for_phrase',
         jsonb_build_object('kcal', o.calories_per_100g, 'protein', o.protein_per_100g, 'carbs', o.carbs_per_100g, 'fat', o.fat_per_100g,
                            'fiber', o.fiber_per_100g, 'fdc_id', o.fdc_id, 'status', o.status, 'status_reason', o.status_reason),
         jsonb_build_object('kcal', n.calories_per_100g, 'protein', n.protein_per_100g, 'carbs', n.carbs_per_100g, 'fat', n.fat_per_100g,
                            'fiber', n.fiber_per_100g, 'fdc_id', n.fdc_id),
         'spec j15: the key apple served baby-food applesauce (FDC 170959); USDA SR raw apple with skin (NDB 09003) takes it';
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, key, reason)
  VALUES ('057', 'key_park', v_old, 'apple', 'key parked on the quarantined baby-food row'),
         ('057', 'key_take', v_new, 'apple', 'reviewed identity fix (spec j15)');
  IF v_moved > 0 THEN
    INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, n_rows, reason)
    VALUES ('057', 'memory_repoint', v_old, v_new, v_moved, 'machine-learned pointers follow the apple key');
  END IF;

  -- ── §4 Self-checks ──────────────────────────────────────────────────────────────────────────────────
  IF (SELECT count(*) FROM public.food_items WHERE normalized_name = 'apple') <> 1
     OR (SELECT id FROM public.food_items WHERE normalized_name = 'apple') IS DISTINCT FROM v_new
     OR (SELECT status FROM public.food_items WHERE id = v_new) IS DISTINCT FROM 'verified'
     OR (SELECT status FROM public.food_items WHERE id = v_old) IS DISTINCT FROM 'quarantined' THEN
    RAISE EXCEPTION '057: the apple key did not move as planned';
  END IF;
  SELECT * INTO v_top FROM public.search_foods('apple', 1);
  IF v_top.id IS DISTINCT FROM v_new OR v_top.match_kind IS DISTINCT FROM 'exact' THEN
    RAISE EXCEPTION '057: search_foods(apple) top = % (%), expected the new row (exact)', v_top.id, v_top.match_kind;
  END IF;
  -- nested: PL/pgSQL plans an IF condition as one expression, so "function exists AND EXISTS (… the function …)" would fail
  -- to plan without 056 instead of skipping
  IF pg_catalog.to_regprocedure('public.search_usda_local(text, integer)') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.search_usda_local('apple', 10) s WHERE s.id IN (v_new, v_old)) THEN
      RAISE EXCEPTION '057: search_usda_local still returns an apple row that now has (or had) the key';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_food_memory WHERE food_item_id = v_old AND origin NOT IN ('label', 'correction', 'manual')) THEN
    RAISE EXCEPTION '057: machine-learned memory still points at the old row';
  END IF;
  IF (SELECT ROW(e, d, s) FROM _fp057) IS DISTINCT FROM ROW(
    (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, food_item_id, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g), ',' ORDER BY id), '')) FROM public.food_entries),
    (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, total_calories, total_protein_g, total_carbs_g, total_fat_g), ',' ORDER BY id), '')) FROM public.daily_summaries),
    (SELECT count(*) || ':' || md5(coalesce(string_agg(id || entries::text, ',' ORDER BY id), '')) FROM public.saved_entries)) THEN
    RAISE EXCEPTION '057: food_entries / daily_summaries / saved_entries changed';
  END IF;
  RAISE NOTICE '057 ok: key apple -> % (SR 09003, 52 kcal); old row % quarantined; % memory pointers repointed', v_new, v_old, v_moved;
END
$apply$;

NOTIFY pgrst, 'reload schema';
