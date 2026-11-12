-- 052_food_search_down.sql — undo supabase/migrations/052_food_search.sql (rollback level R3)
--
-- WHY THIS FILE LIVES OUTSIDE migrations/
--   The Supabase CLI applies every .sql file in supabase/migrations/ in name order. A down script sitting
--   there would run straight after 052 on the next `db push` and silently undo it. Here it is inert until a
--   person runs it on purpose.
--
-- WHEN TO RUN IT (cheapest rollback first — see .claude/plans/v1.2-phase4-spec.md §(e)):
--   R0  set the function secret RESOLVER_SEARCH=fts. Instant, no deploy: the fts path is the pre-Phase-4 query
--       and food_items_fts_idx was never dropped. This is almost always enough.
--   R1  redeploy the pre-Phase-4 commit of log-food-from-text and analyze-food-photo. They never touch the 052
--       objects, so 052 is inert to them.
--   R2  a wrong alias is DATA: fix it with a new migration that DELETEs or UPDATEs public.food_aliases. Alias
--       hits are never remembered in user_food_memory, so the fix reaches every user on their next log.
--   R3  this script — only AFTER R0 or R1 (a ranked resolver whose alias table and search function vanish
--       keeps logging, through USDA and the matcher only, but that is a silent quality drop, not a rollback),
--       and only with Shivam's approval. Steps:
--         1. Run this file by hand in the SQL editor, or `psql -v ON_ERROR_STOP=1 -f` (it wraps itself in
--            BEGIN/COMMIT; see TRANSACTION below).
--         2. `supabase migration repair --status reverted 052`
--         3. 052 is now PENDING again: the next `db push` re-applies it. To keep it off, move
--            052_food_search.sql out of migrations/ first.
--
-- WHAT IT DOES
--   1. Copies food_aliases into backup._rollback_food_aliases_052, so the undo is itself undoable (the same
--      "back up what you touch" rule 050 follows). A second run keeps the first copy, and once food_aliases is
--      gone it skips the copy instead of failing on the missing table (CREATE TABLE IF NOT EXISTS ... AS still
--      parses its source), so the script can always be re-run to finish a rollback.
--   2. Drops search_foods, food_aliases and the trigram index, then tells PostgREST to reload its schema.
--
-- WHAT IT DOES NOT DO
--   - touch any food_items, food_entries, saved_entries or user_food_memory row. Entries logged through an alias
--     or a search point at verified rows, which no rollback changes; reference_match memory pointers stay valid.
--   - drop pg_trgm. The extension is inert without the function and index, and other code may come to use it.
--
-- LOCKS: food_items briefly (ACCESS EXCLUSIVE for the index drop, plus the foreign key 052 added from
--   food_aliases). Milliseconds at ~2.4k rows; the lock_timeout below makes it fail fast instead of queueing.
--   While a DROP waits for its lock, every resolver read of food_items queues behind it, and the resolver
--   treats a failed exact read as fatal, so a DROP queueing with no limit stalls ALL food logging.
--
-- TRANSACTION: unlike a CLI migration, a hand-run script gets no implicit transaction (`psql -f` autocommits
--   each statement), and set_config(..., true) lasts only to the end of the transaction. So this one wraps
--   itself in BEGIN/COMMIT, as 050_food_trust_down.sql does: the 5 s lock_timeout then covers every DROP, and
--   any error leaves 052 fully in place (function, table, index; no half-rolled-back state, no backup copy).

BEGIN;

SELECT pg_catalog.set_config('lock_timeout', '5s', true);   -- fail fast instead of queueing behind a long query

-- ── 1. Back up the aliases ──────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backup;
DO $bk$
BEGIN
  IF pg_catalog.to_regclass('public.food_aliases') IS NOT NULL THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup._rollback_food_aliases_052 AS TABLE public.food_aliases';
  END IF;
END
$bk$;

-- ── 2. Drop the 052 objects ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_foods(text, integer);
DROP TABLE    IF EXISTS public.food_aliases;
DROP INDEX    IF EXISTS public.food_items_normalized_name_trgm_idx;
-- pg_trgm stays installed (inert).

NOTIFY pgrst, 'reload schema';   -- delivered at COMMIT

COMMIT;
