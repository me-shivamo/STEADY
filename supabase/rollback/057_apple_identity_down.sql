-- 057_apple_identity_down.sql — undoes 057: the key 'apple' goes back to the baby-food row (FDC 170959), the SR raw apple row
-- (FDC 171688) is key-less again, memory pointers 057 moved go back. Run BEFORE 056's and 055's down scripts, as postgres:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/057_apple_identity_down.sql
--   npx supabase migration repair --status reverted 057
-- Restores status, key, parked key and status_reason of both rows from backup._backup_food_items_057 (numbers were never changed),
-- appends a 'rollback' row to food_value_changes, then drops the two backups. Entries and summaries are never touched.
-- One transaction (BEGIN ... COMMIT below).

BEGIN;
SELECT pg_catalog.set_config('lock_timeout', '5s', true);

DO $locks$ BEGIN
  LOCK TABLE public.profiles         IN SHARE MODE;
  LOCK TABLE public.food_items       IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_entries, public.daily_summaries, public.saved_entries IN SHARE MODE;
  LOCK TABLE public.user_food_memory IN SHARE ROW EXCLUSIVE MODE;
END $locks$;

DO $down$
DECLARE v_old uuid := '726a34bf-37a3-4931-b3b1-e8d81ed96868'; v_new uuid := '0ae1310c-0f9c-50c7-9695-965cdeee4dfa'; v_n bigint;
BEGIN
  IF pg_catalog.to_regclass('backup._backup_food_items_057') IS NULL THEN
    IF pg_catalog.to_regclass('backup._backup_food_items_053') IS NULL THEN
      RAISE NOTICE '057 down: migrations-only replay, 057 changed nothing here';
      RETURN;
    END IF;
    RAISE EXCEPTION '057 down: backup._backup_food_items_057 is missing (057 not applied, or already rolled back)';
  END IF;
  IF (SELECT normalized_name FROM public.food_items WHERE id = v_new) IS DISTINCT FROM 'apple' THEN
    RAISE EXCEPTION '057 down: the new row no longer holds the key apple; review by hand';
  END IF;
  -- key off the new row first (one 'apple' at a time), then restore both rows' identity columns from the backup
  UPDATE public.food_items fi
     SET normalized_name = b.normalized_name, parked_normalized_name = b.parked_normalized_name, status = b.status,
         status_reason = b.status_reason, status_changed_at = now()
    FROM backup._backup_food_items_057 b WHERE b.id = fi.id AND fi.id = v_new;
  UPDATE public.food_items fi
     SET normalized_name = b.normalized_name, parked_normalized_name = b.parked_normalized_name, status = b.status,
         status_reason = b.status_reason, status_changed_at = now()
    FROM backup._backup_food_items_057 b WHERE b.id = fi.id AND fi.id = v_old;
  UPDATE public.user_food_memory m SET food_item_id = v_old
    FROM backup._backup_user_food_memory_057 b WHERE b.id = m.id AND m.food_item_id = v_new;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, key, n_rows, reason)
  VALUES ('057', 'rollback', v_new, v_old, 'apple', v_n, '057 down: key apple back on the baby-food row');
  IF (SELECT id FROM public.food_items WHERE normalized_name = 'apple') IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION '057 down: the key apple is not back on the old row';
  END IF;
  DROP TABLE backup._backup_food_items_057;
  DROP TABLE backup._backup_user_food_memory_057;
  RAISE NOTICE '057 down ok: key apple back on %, % memory pointers moved back', v_old, v_n;
END
$down$;

NOTIFY pgrst, 'reload schema';   -- delivered at COMMIT

COMMIT;
