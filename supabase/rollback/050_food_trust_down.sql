-- 050_food_trust_down.sql — undo supabase/migrations/050_food_trust.sql (rollback level R3)
--
-- WHY THIS FILE LIVES OUTSIDE migrations/
--   The Supabase CLI applies every .sql file in supabase/migrations/ in name order. A down script
--   sitting there would run straight after 050 on the next `db push` and silently undo it. Here it
--   is inert until a person runs it on purpose.
--
-- WHEN TO RUN IT (cheapest rollback first — see .claude/plans/v1.2-phase3-spec.md §(f)):
--   R1  redeploy the pre-Phase-3 Edge Functions. The old code works on 050, so this is usually enough.
--   R2  `RESOLVER_MEMORY=off` (or write_only) as a function secret, to stop serving user_food_memory.
--   R3  this script — only AFTER R1 (the Phase 3 functions read and write the status columns this
--       drops, so with them still live every text and photo log would return 500), and only with
--       Shivam's approval. Steps:
--         1. R1, then log ONE new food (a phrase never logged before) so the old code writes a row.
--            Step 0 below refuses to run until the newest post-050 row looks like the old code's.
--         2. Run this file by hand in the SQL editor or psql.
--         3. `supabase migration repair --status reverted 050`
--         4. 050 is now PENDING again: the next `db push` (e.g. shipping 051) re-applies it from
--            scratch, with a fresh backup. To keep 050 off, move the file out of migrations/ first.
--
-- WHAT IT DOES
--   0. Locks the tables it touches, then checks that the pre-Phase-3 functions are the ones writing.
--   1. Copies user_food_memory and the current food_items into backup._rollback_*_050, so the undo
--      is itself undoable (the same "back up what you touch" rule 050 follows).
--   2. Drops the guard trigger, user_food_memory, the status CHECKs, the new policy and columns,
--      and the rules function.
--   3. Puts every shared exact-hit key back on the row that held it before 050, from
--      backup._backup_food_items_050 (050 only MOVED keys into parked_normalized_name; it changed no
--      numbers, so restoring the keys restores the old cache exactly).
--   4. Renames backup._backup_food_items_050 to _backup_food_items_050_r3: the data stays, and the
--      name is free for a re-applied 050 (whose run-once check refuses to start while it exists).
--
-- WHAT IT DOES NOT DO
--   - delete any food_items row. Rows created after 050 stay: food_entries reference them, and the
--     resolver created them key-less, so they never collide with a restored key.
--   - touch food_entries or saved_entries. 050 never changed them, so no rollback level can affect
--     a user's logged history.
--   - restore the client INSERT/UPDATE policies from 002, the client write grants, or 002's "every
--     signed-in user reads every row" SELECT policy. src/ never reads or writes food_items; signed-in
--     users keep reading only ownerless rows and their own, as under 050.
--   - drop any backup table. They hold created_by and private food names outside the
--     account-deletion cascade, so drop them in the reviewed follow-up migration, not later.
--
-- LOCK ORDER: account deletion locks profiles, then user_food_memory (both ON DELETE CASCADE), then
--   food_items (created_by SET NULL). Dropping user_food_memory's foreign keys needs ACCESS EXCLUSIVE
--   on profiles and food_items, so all three are taken up front, profiles first: a deletion running at
--   the same moment waits for this script (well under a second) instead of deadlocking with it. The
--   lock also comes BEFORE the backup copies, so no row can land between the copy and the change.
--
-- TRANSACTION: unlike a CLI migration, a hand-run script gets no implicit transaction, so this one
--   wraps itself in BEGIN/COMMIT. Any error leaves the database exactly as 050 left it.

BEGIN;

SELECT pg_catalog.set_config('lock_timeout', '5s', true);   -- fail fast instead of queueing behind a long query
LOCK TABLE public.profiles, public.food_items, public.user_food_memory IN ACCESS EXCLUSIVE MODE;

-- ── 0. Refuse while the Phase 3 functions are live ──────────────────────────────────────────
-- Every row the Phase 3 resolver writes carries a status_reason ('private', 'auto_v1:…',
-- 'rough_v1:…'); the pre-Phase-3 code knows nothing about the column, so its rows (through 050's
-- guard) have none. If the newest row created after 050 has one, the new code wrote it last.
DO $probe$
DECLARE
  v_reason text;
  v_at     timestamptz;
BEGIN
  SELECT fi.status_reason, fi.created_at INTO v_reason, v_at
    FROM public.food_items fi
   WHERE NOT EXISTS (SELECT 1 FROM backup._backup_food_items_050 b WHERE b.id = fi.id)
   ORDER BY fi.created_at DESC NULLS LAST, fi.id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'R3: no food_items row was created after 050, so the deployed code cannot be checked. Make sure R1 is done.';
  ELSIF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'R3 refused: the newest food_items row (created %) was written by the Phase 3 resolver (status_reason %). Do R1, log one new food, then run this again.', v_at, v_reason;
  END IF;
END
$probe$;

-- ── 1. Back up what we are about to change ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup._rollback_user_food_memory_050 AS TABLE public.user_food_memory;
CREATE TABLE IF NOT EXISTS backup._rollback_food_items_050       AS TABLE public.food_items;

-- ── 2. Remove the guard and the memory table ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS food_items_guard ON public.food_items;
DROP FUNCTION IF EXISTS public.food_items_guard();
DROP TABLE IF EXISTS public.user_food_memory;                 -- also drops its two triggers
DROP FUNCTION IF EXISTS public.user_food_memory_check_target();

-- The CHECKs must go before the keys come back: food_items_shared_key_check forbids a key on any
-- non-verified row, and restored keys land on AI/label rows again.
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_shared_key_check,
  DROP CONSTRAINT IF EXISTS food_items_verified_check, DROP CONSTRAINT IF EXISTS food_items_status_check;

-- ── 3. Restore the shared keys ──────────────────────────────────────────────────────────────
-- A row created after 050 can only hold a key if a curator gave it one. Clear any such key that a
-- pre-050 row is about to reclaim, so the unique index never sees two rows with one name.
UPDATE public.food_items fi SET normalized_name = NULL
 WHERE NOT EXISTS (SELECT 1 FROM backup._backup_food_items_050 b WHERE b.id = fi.id)
   AND fi.normalized_name IN (SELECT b.normalized_name FROM backup._backup_food_items_050 b WHERE b.normalized_name IS NOT NULL);
UPDATE public.food_items fi SET normalized_name = b.normalized_name
  FROM backup._backup_food_items_050 b WHERE b.id = fi.id AND fi.normalized_name IS DISTINCT FROM b.normalized_name;

-- ── 4. Policies, columns, rules function ────────────────────────────────────────────────────
-- The policy reads `status`, so it has to be dropped before the column. Its replacement needs no
-- status: ownerless rows (the reference data, and the AI/label rows this script re-shares) plus the
-- reader's own. 002's original policy let every signed-in user read every user's private rows.
DROP POLICY IF EXISTS "Read verified or own food items" ON public.food_items;
DROP POLICY IF EXISTS "Read shared or own food items"   ON public.food_items;
CREATE POLICY "Read shared or own food items" ON public.food_items
  FOR SELECT TO authenticated
  USING (created_by IS NULL OR created_by = (SELECT auth.uid()));
ALTER TABLE public.food_items DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS status_reason,
  DROP COLUMN IF EXISTS status_changed_at, DROP COLUMN IF EXISTS parked_normalized_name;
DROP FUNCTION IF EXISTS public.food_item_issues(text, text, numeric, numeric, numeric, numeric, numeric);

-- ── 5. Free 050's backup name, keep its data ────────────────────────────────────────────────
-- Fails (and rolls everything back) if a _r3 copy already exists from an earlier R3: rename that
-- one on purpose first rather than lose either.
ALTER TABLE backup._backup_food_items_050 RENAME TO _backup_food_items_050_r3;
COMMENT ON TABLE backup._backup_food_items_050_r3 IS
  'backup._backup_food_items_050, renamed by supabase/rollback/050_food_trust_down.sql (R3) so a re-applied 050 can take a fresh backup.';

NOTIFY pgrst, 'reload schema';

COMMIT;
-- Client write grants/policies stay revoked; rows created after 050 stay (entries reference them).
