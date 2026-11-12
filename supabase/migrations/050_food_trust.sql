-- 050_food_trust.sql — v1.2 Phase 3 "Stop the bleeding"
-- (.claude/plans/v1.2-accuracy.md calls this 049_food_trust.sql; 049 is taken.)
--
-- WHAT IT DOES
--   §1  food_items gets status (verified | unverified | quarantined), status_reason, status_changed_at,
--       parked_normalized_name. This ALTER takes an ACCESS EXCLUSIVE lock held until the migration
--       commits, so the backup (§2) and the relabel (§4) see exactly the same rows.
--   §2  Backs up every food_items row to backup._backup_food_items_050 (schema not exposed to PostgREST).
--   §3  public.food_item_issues(): SQL twin of supabase/functions/_shared/validate.ts (RULES_VERSION 1).
--   §4  Relabels every row in ONE statement:
--         keyed usda/indb/ifct rows that pass the rules          -> verified   (keep the shared key)
--         rows that fail the rules / are on the reviewed list    -> quarantined (key parked)
--         ai_estimated and label rows                            -> unverified  (key parked: they leave the shared base)
--         legacy per-serving rows (no per-100 g values)          -> unverified
--   §5  CHECKs: only verified rows hold normalized_name; verified rows are ownerless reference data.
--   §6  Guard trigger: API roles (anon, authenticated, service_role) never create shared keys or verified
--       rows, may only change last_used_at on UPDATE (created_by only to NULL), and may not DELETE.
--       BEFORE INSERT runs before the ON CONFLICT arbiter check, so the deployed resolver's upserts
--       (macroResolver.ts:386-393 and 479-501) become plain inserts of key-less rows.
--   §7  Clients read verified rows + their own rows and can no longer write (src/ never touches food_items).
--   §8  user_food_memory: per-user pointer (user, normalized phrase) -> food_items row. Numbers stay in food_items.
--   §9  Backfill: each real user keeps the numbers they already got from the shared AI/label rows §4 un-shares.
--   §10 Self-checks: any failure aborts and rolls back the whole migration.
-- WHAT IT DOES NOT DO
--   - touch food_entries or saved_entries (no row, no index; the food_item_id index ships in its own
--     migration so this one never holds food_items and food_entries locks at the same time)
--   - change any id, name, source, nutrition number, fdc_id or portions (self-check §10 proves it)
--   - change food_items_normalized_name_uidx (every onConflict:'normalized_name' caller keeps working)
--   - change any CHECK on food_entries (no new macro_source values)
-- COMPATIBILITY: safe with the CURRENTLY deployed Edge Functions and with the Phase 3 ones.
--   Order: apply this first, then deploy log-food-from-text + analyze-food-photo. Never the reverse:
--   the Phase 3 functions read and write the status columns, so on a database without 050 every
--   text and photo log returns 500. Deploy gate: `npx tsx scripts/audit-food-items.ts --check` exits 1
--   while 050 is missing, so deploy the functions only after it exits 0.
-- LOCK ORDER: account deletion (delete-account -> auth.admin.deleteUser) locks profiles (ON DELETE
--   CASCADE) and THEN food_items (created_by ON DELETE SET NULL); the auth.users FK triggers fire in
--   name order. This file takes the same two tables in the same order: §8's table (whose foreign keys
--   need SHARE ROW EXCLUSIVE on profiles, then food_items) is created before §1 upgrades food_items to
--   ACCESS EXCLUSIVE. A deletion running at the same moment then just waits, instead of deadlocking.
-- RUNS ONCE: the first statement refuses to run if backup._backup_food_items_050 already exists (a
--   stale backup would fail §10's count check, or worse, pass it). After rollback R3, which renames
--   that backup, a later `db push` re-applies 050 from scratch.
-- TRANSACTION: the Supabase CLI applies a migration file as one implicit transaction, so this file has no
--   BEGIN/COMMIT/LOCK TABLE/SET LOCAL; set_config(..., true) is transaction-local.
-- LATER CURATION (051+): migrations run as postgres, which the guard does not restrict. Every such
--   migration first copies the rows it touches into backup._backup_food_items_<nnn>.

SELECT pg_catalog.set_config('lock_timeout', '5s', true);   -- fail fast instead of queueing behind a long query

DO $once$
BEGIN
  IF pg_catalog.to_regclass('backup._backup_food_items_050') IS NOT NULL THEN
    RAISE EXCEPTION '050: backup._backup_food_items_050 already exists. 050 runs once; after rollback R3 the backup is renamed _backup_food_items_050_r3. Rename or drop it on purpose before re-applying 050.';
  END IF;
END
$once$;

-- ── §8 (first part) user_food_memory table — created before §1 for the lock order above ──────
-- Its two foreign keys lock profiles, then food_items (SHARE ROW EXCLUSIVE), the order account
-- deletion uses. The rest of §8 (comment, index, triggers, grants) stays below.
CREATE TABLE IF NOT EXISTS public.user_food_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  normalized_name text NOT NULL CHECK (normalized_name <> ''),   -- macroResolver.normalizeName() of the user's phrase
  display_name    text NOT NULL,                                 -- the phrase as last typed
  food_item_id    uuid NOT NULL REFERENCES public.food_items(id) ON DELETE RESTRICT,
  origin          text NOT NULL CHECK (origin IN
                    ('history', 'reference_match', 'usda_match', 'ai_estimate', 'label', 'correction', 'manual')),
  portions        jsonb CHECK (portions IS NULL OR jsonb_typeof(portions) = 'array'),  -- personal unit weights (Phase 5/6); same shape as food_items.portions
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_food_memory_user_name_key UNIQUE (user_id, normalized_name)   -- PostgREST onConflict:'user_id,normalized_name'
);

-- ── §1 Columns (constant default => metadata-only on PG17, no table rewrite) ──────────────────
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS status                 text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS status_reason          text,
  ADD COLUMN IF NOT EXISTS status_changed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS parked_normalized_name text;

COMMENT ON COLUMN public.food_items.status IS
  'verified = shared base (usda/indb/ifct reference data that passed rules v1; changed only by migrations). '
  'unverified = never shared: AI estimates, label scans, personal rows; reachable only through the owner''s user_food_memory. '
  'quarantined = numbers judged wrong; kept for history (food_entries FK) and review, served to nobody.';
COMMENT ON COLUMN public.food_items.status_reason IS
  'rules_v1_pass | auto_050:<codes> | manual_050:<why> | unshared_050 | private | legacy_per_serving | auto_v1:<codes> (Phase 3 resolver) | rough_v1:<codes> (Phase 3 resolver: an AI guess still failing the rules after the retry, logged flagged and low-confidence and never remembered; an impossible guess is repaired first, a merely doubtful one is kept as given; <codes> are what the guess failed) | gate:<status> (guard downgrade) | reviewed:<note> (051+)';
COMMENT ON COLUMN public.food_items.parked_normalized_name IS
  'The shared exact-hit key this row held, or asked for, before it was taken out of the shared namespace. Lets a reviewed migration re-key a fixed row.';

-- ── §2 Backup (every row; both per-100 g and legacy per-serving columns) ─────────────────────
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE backup._backup_food_items_050 AS TABLE public.food_items;   -- never IF NOT EXISTS: see RUNS ONCE
COMMENT ON TABLE backup._backup_food_items_050 IS
  'public.food_items as it was before migration 050 (the new status columns at their defaults). Source for supabase/rollback/050_food_trust_down.sql. '
  'Holds created_by and private food names outside the account-deletion cascade: drop it in the reviewed follow-up migration (D13), not later.';

-- ── §3 Validation rules v1 (SQL twin of supabase/functions/_shared/validate.ts) ───────────────
-- Same codes, same order as foodItemIssues(). Empty array = passes.
-- Carbs: USDA/INDB carbs include fiber, IFCT carbs exclude it, so the sum rule uses P+C+F only and the
-- energy check accepts the whole range between "fiber worth 0 inside carbs" and "fiber worth 4 outside carbs".
CREATE OR REPLACE FUNCTION public.food_item_issues(
  p_source text, p_name text,
  p_kcal numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_fiber numeric)
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE WHEN v.k IS NULL THEN ARRAY['missing_energy']::text[] ELSE pg_catalog.array_remove(ARRAY[
    CASE WHEN v.k < 0 OR v.k > 900 THEN 'energy_out_of_range' END,
    CASE WHEN least(v.p, v.c, v.f, v.fb) < 0 OR greatest(v.p, v.c, v.f, v.fb) > 100 THEN 'macro_out_of_range' END,
    CASE WHEN v.p + v.c + v.f > 100.5 THEN 'macro_sum_over_100' END,
    CASE WHEN v.k < 4*v.p + 9*v.f + 4*greatest(v.c - v.fb, 0) - (0.2*v.k + 20)
           OR v.k > 4*v.p + 9*v.f + 4*v.c + 4*v.fb
                    + CASE WHEN v.n ~* '\m(?:wine|beer|whiske?y|vodka|rum|gin|brandy|liqueur|cocktail|sake|alcohol|cider|tequila|champagne|lager|ale|toddy|feni|scotch|bourbon|peg|daru|old monk|mojito|margarita|martini|sangria|breezer|arrack|liquor|spirits?)\M'
                           THEN 315 ELSE 0 END
                    + (0.2*v.k + 20)
         THEN 'atwater_mismatch' END,
    CASE WHEN v.s = 'indb' AND v.f >= 30 AND v.k > 0 AND 9*v.f >= 0.85*v.k AND v.p + v.c < 20
          AND v.n !~* '\m(?:oils?|ghee|butter|lard|vanaspati|dalda|makhan|makkhan|margarine|shortening|mayonnaise|mayo|dressing|aioli|baghar|tadka|tarka|tartare|thousand island)\M'
         THEN 'fat_dominant_dish' END,
    CASE WHEN v.k = 0
          AND v.n !~* '\m(?:water|pani|paani|tea|coffee|salt|soda|diet|zero|sugar.?free|vitamins?|multivitamin|tablets?|capsules?|creatine|ors|electrolytes?|sweetener|stevia|supplement)\M'
         THEN 'zero_energy' END,
    CASE WHEN v.k = 200 AND v.p = 8 AND v.c = 25 AND v.f = 8 THEN 'generic_placeholder' END
  ]::text[], NULL) END
  FROM (SELECT p_kcal AS k,
               coalesce(p_protein, 0) AS p, coalesce(p_carbs, 0) AS c,
               coalesce(p_fat, 0)     AS f, coalesce(p_fiber, 0) AS fb,
               coalesce(p_name, '')   AS n, coalesce(p_source, '') AS s) v
$fn$;
COMMENT ON FUNCTION public.food_item_issues(text, text, numeric, numeric, numeric, numeric, numeric) IS
  'Rules v1. Must stay code-for-code identical to foodItemIssues() in supabase/functions/_shared/validate.ts (checked by scripts/audit-food-items.ts --check).';
REVOKE EXECUTE ON FUNCTION public.food_item_issues(text, text, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.food_item_issues(text, text, numeric, numeric, numeric, numeric, numeric) TO service_role;

-- ── §4 Relabel every row (one statement; promotion happens here, so the shared cache never goes cold) ──
WITH manual(id, why) AS (VALUES
  -- Reviewed outliers the automatic rules cannot see (category density). Founder decision D3.
  ('3d077dc1-6de5-4f70-8a56-673b3b888f8d'::uuid, 'water_mass_counted'),   -- indb Boiled egg (Ubla anda) 45 kcal (real ~155)
  ('3fe307de-24b4-4fd9-8149-7c6e5fda855c'::uuid, 'dry_basis'),            -- indb Plain dosa 381 (Masala dosa 165, USDA dosa 184-210)
  ('a211eb87-02ab-46cc-94ab-6d3e2ff56bba'::uuid, 'dry_basis'),            -- indb Rice dal porridge (khichdi) 383 (other khichdis 57-167)
  ('d5788ae3-bce1-4302-9351-6ea892e50efc'::uuid, 'dry_basis'),            -- indb Maa chaane ki dal 345 (cooked dals 24-111)
  ('f5b01048-cb53-41f7-99e7-02dabc75f960'::uuid, 'implausibly_low'),      -- indb Khaman (dhokla) 55 (Dhokla 216)
  ('9fbdbb65-3ecf-4c20-ade2-97692286ccab'::uuid, 'implausibly_low'),      -- indb Moong dal with vadi 24
  ('d7712913-933b-422e-8ab3-54f33374eb72'::uuid, 'implausibly_low'),      -- indb Tomato ketchup 33 (real ~100-117)
  ('afb89caa-339b-492f-b288-9aad155cb528'::uuid, 'dry_mix_suspected')     -- usda "kheer" 350 (cooked kheer ~120-160)
),
-- The key is read as coalesce(normalized_name, parked_normalized_name) so that if this ever runs on
-- rows that already went through it (keys parked), it re-judges them by the same key instead of
-- wiping the parked one. On a first run parked_normalized_name is NULL everywhere, so nothing changes.
v AS (
  SELECT fi.id, fi.source, coalesce(fi.normalized_name, fi.parked_normalized_name) AS normalized_name,
         fi.created_by, fi.calories_per_100g, m.why,
         public.food_item_issues(fi.source, fi.name, fi.calories_per_100g, fi.protein_per_100g,
                                 fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g) AS iss
  FROM public.food_items fi
  LEFT JOIN manual m ON m.id = fi.id
),
d AS (
  SELECT v.id, v.normalized_name,
    CASE
      WHEN v.calories_per_100g IS NULL                    THEN 'unverified'
      WHEN v.why IS NOT NULL OR cardinality(v.iss) > 0    THEN 'quarantined'
      WHEN coalesce(v.source, '') IN ('usda', 'indb', 'ifct')
           AND v.created_by IS NULL AND v.normalized_name IS NOT NULL THEN 'verified'
      ELSE 'unverified'
    END AS new_status,
    CASE
      WHEN v.calories_per_100g IS NULL                    THEN 'legacy_per_serving'
      WHEN v.why IS NOT NULL                              THEN 'manual_050:' || v.why
      WHEN cardinality(v.iss) > 0                         THEN 'auto_050:' || array_to_string(v.iss, ',')
      WHEN coalesce(v.source, '') IN ('usda', 'indb', 'ifct')
           AND v.created_by IS NULL AND v.normalized_name IS NOT NULL THEN 'rules_v1_pass'
      WHEN v.normalized_name IS NOT NULL                  THEN 'unshared_050'   -- the shared ai_estimated / label rows
      ELSE 'private'
    END AS new_reason
  FROM v
)
UPDATE public.food_items fi
   SET status                 = d.new_status,
       status_reason          = d.new_reason,
       status_changed_at      = now(),
       parked_normalized_name = CASE WHEN d.new_status <> 'verified' THEN d.normalized_name END,
       normalized_name        = CASE WHEN d.new_status =  'verified' THEN d.normalized_name END
  FROM d
 WHERE d.id = fi.id;
-- Expected on 2026-11-12 data: verified 1635 (usda 255, indb 856, ifct 524); quarantined 177
-- (indb 158, ifct 2, usda 1, ai_estimated 15, label 1); unverified 381 incl. 204 unshared_050.

-- ── §5 Invariants ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_status_check;
ALTER TABLE public.food_items ADD  CONSTRAINT food_items_status_check
  CHECK (status IN ('verified', 'unverified', 'quarantined'));
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_shared_key_check;
ALTER TABLE public.food_items ADD  CONSTRAINT food_items_shared_key_check
  CHECK (normalized_name IS NULL OR status = 'verified');            -- only the shared base holds exact-hit keys
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_verified_check;
ALTER TABLE public.food_items ADD  CONSTRAINT food_items_verified_check
  CHECK (status <> 'verified' OR (coalesce(source, '') IN ('usda', 'indb', 'ifct')   -- coalesce: a NULL source would make
         AND created_by IS NULL AND calories_per_100g IS NOT NULL)); -- the CHECK NULL, which passes. AI guesses / label scans can never be verified

-- ── §6 Guard trigger ─────────────────────────────────────────────────────────────────────────
-- Curators (migrations, the SQL editor, and FK actions, which run as the table owner — e.g. account
-- deletion's ON DELETE SET NULL on created_by) are not restricted. Only the three API roles are.
CREATE OR REPLACE FUNCTION public.food_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_used  timestamptz;
  v_owner uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'food_items: % may not delete rows; quarantine them in a migration instead', current_user
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- API roles never create shared exact-hit keys. Parked here, before the ON CONFLICT check,
    -- so an old-style upsert inserts a key-less row instead of overwriting a shared one.
    IF NEW.normalized_name IS NOT NULL THEN
      NEW.parked_normalized_name := NEW.normalized_name;
      NEW.normalized_name := NULL;
    END IF;
    -- API roles never create verified rows; the shared base changes only through migrations.
    IF NEW.status IS NULL OR NEW.status NOT IN ('unverified', 'quarantined') THEN
      NEW.status_reason := 'gate:' || coalesce(NEW.status, 'null');
      NEW.status := 'unverified';
    END IF;
    NEW.status_changed_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE by an API role: every column is a fact except last_used_at; created_by may only become NULL.
  v_used  := NEW.last_used_at;
  v_owner := NEW.created_by;
  IF (to_jsonb(NEW) - 'last_used_at' - 'created_by') IS DISTINCT FROM (to_jsonb(OLD) - 'last_used_at' - 'created_by')
     OR (v_owner IS NOT NULL AND v_owner IS DISTINCT FROM OLD.created_by) THEN
    RAISE WARNING 'food_items %: % tried to change fact/status columns; change ignored (use a migration)', OLD.id, current_user;
  END IF;
  NEW := OLD;
  NEW.last_used_at := greatest(OLD.last_used_at, v_used);
  IF v_owner IS NULL THEN NEW.created_by := NULL; END IF;
  RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION public.food_items_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS food_items_guard ON public.food_items;
CREATE TRIGGER food_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.food_items
  FOR EACH ROW EXECUTE FUNCTION public.food_items_guard();

-- ── §7 Client access (the app never reads or writes food_items; FK checks run as the table owner) ──
DROP POLICY IF EXISTS "Users can insert food items they create"  ON public.food_items;
DROP POLICY IF EXISTS "Users can update food items they created" ON public.food_items;
DROP POLICY IF EXISTS "Authenticated users can read food items"  ON public.food_items;
DROP POLICY IF EXISTS "Read verified or own food items"          ON public.food_items;
CREATE POLICY "Read verified or own food items" ON public.food_items
  FOR SELECT TO authenticated
  USING (status = 'verified' OR created_by = (SELECT auth.uid()));
REVOKE ALL ON public.food_items FROM anon, authenticated;
GRANT SELECT ON public.food_items TO authenticated;

-- ── §8 user_food_memory (the table itself is created above §1, for the lock order) ────────────
COMMENT ON TABLE public.user_food_memory IS
  'Per-user pointer from a normalized phrase to the food_items row that user resolved it to. Numbers live only in food_items. '
  'User-taught origins (label, correction, manual) outrank the shared verified exact hit; machine-learned ones (history, reference_match, usda_match, ai_estimate) do not.';
CREATE INDEX IF NOT EXISTS user_food_memory_food_item_idx ON public.user_food_memory (food_item_id);

-- A memory row may point only at: a verified row, the same user's own row, or a legacy shared AI/label
-- row that 050 un-shared (ownerless, parked key). Never at a quarantined row or another user's row.
CREATE OR REPLACE FUNCTION public.user_food_memory_check_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  t record;
BEGIN
  SELECT fi.status, fi.created_by, fi.source, fi.parked_normalized_name, fi.calories_per_100g
    INTO t
    FROM public.food_items fi
   WHERE fi.id = NEW.food_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_food_memory: food_item % does not exist', NEW.food_item_id USING ERRCODE = '23503';
  END IF;
  IF t.status = 'quarantined' OR t.calories_per_100g IS NULL OR NOT coalesce(
       t.status = 'verified'
       OR t.created_by IS NOT DISTINCT FROM NEW.user_id
       OR (t.created_by IS NULL AND t.parked_normalized_name IS NOT NULL
           AND coalesce(t.source, '') IN ('ai_estimated', 'label')),
       false) THEN
    RAISE EXCEPTION 'user_food_memory: food_item % is not usable by user %', NEW.food_item_id, NEW.user_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION public.user_food_memory_check_target() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_food_memory_check_target ON public.user_food_memory;
CREATE TRIGGER user_food_memory_check_target
  BEFORE INSERT OR UPDATE OF food_item_id, user_id ON public.user_food_memory
  FOR EACH ROW EXECUTE FUNCTION public.user_food_memory_check_target();
DROP TRIGGER IF EXISTS set_user_food_memory_updated_at ON public.user_food_memory;
CREATE TRIGGER set_user_food_memory_updated_at
  BEFORE UPDATE ON public.user_food_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_food_memory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_food_memory FROM PUBLIC, anon, authenticated, service_role;   -- undo the public default ACL
GRANT SELECT ON public.user_food_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_food_memory TO service_role;
DROP POLICY IF EXISTS "Users read own food memory" ON public.user_food_memory;
CREATE POLICY "Users read own food memory" ON public.user_food_memory
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- No client write policy: only the Edge Functions (service_role, BYPASSRLS) write, and they filter by user_id themselves.

-- ── §9 Backfill: users keep the numbers they got from the shared AI/label rows un-shared in §4 ──
-- Only pairs where the entry's numbers really came from that row (macro_source = source), only rows that
-- pass the rules, real users only (the eval account is excluded so evals start cold; decision D4).
INSERT INTO public.user_food_memory
  (user_id, normalized_name, display_name, food_item_id, origin, created_at, last_used_at)
SELECT fe.user_id, fi.parked_normalized_name, fi.name, fi.id, 'history',
       coalesce(min(fe.created_at), now()), coalesce(max(fe.created_at), now())
  FROM public.food_entries fe
  JOIN public.food_items fi ON fi.id = fe.food_item_id
  JOIN public.profiles  pr ON pr.id = fe.user_id
 WHERE fi.status = 'unverified'
   AND fi.status_reason = 'unshared_050'
   AND fi.source IN ('ai_estimated', 'label')
   AND fe.macro_source = fi.source
   AND fi.parked_normalized_name <> ''
   AND fe.user_id NOT IN (SELECT u.id FROM auth.users u WHERE u.email LIKE '%@steadyapp.internal')
 GROUP BY fe.user_id, fi.id, fi.parked_normalized_name, fi.name
ON CONFLICT (user_id, normalized_name) DO NOTHING;
-- Expected on 2026-11-12 data: ~165 rows, 18 users, ~135 distinct food_items.

-- ── §10 Self-checks (any failure rolls back everything above) ──────────────────────────────────
DO $chk$
DECLARE
  v_backup bigint; v_rows bigint; v_verified bigint; v_quar bigint; v_unver bigint;
  v_keyed_bad bigint; v_drift bigint; v_mem bigint; v_kachori text;
BEGIN
  SELECT count(*) INTO v_backup FROM backup._backup_food_items_050;
  SELECT count(*) INTO v_rows   FROM public.food_items;
  IF v_backup <> v_rows THEN
    RAISE EXCEPTION '050: backup has % rows but food_items has %', v_backup, v_rows;
  END IF;

  SELECT count(*) FILTER (WHERE status = 'verified'),
         count(*) FILTER (WHERE status = 'quarantined'),
         count(*) FILTER (WHERE status = 'unverified')
    INTO v_verified, v_quar, v_unver FROM public.food_items;

  SELECT count(*) INTO v_keyed_bad FROM public.food_items
   WHERE normalized_name IS NOT NULL AND (status <> 'verified' OR coalesce(source, '') NOT IN ('usda', 'indb', 'ifct'));
  IF v_keyed_bad > 0 THEN
    RAISE EXCEPTION '050: % non-reference or non-verified rows still hold the shared key', v_keyed_bad;
  END IF;

  -- No fact changed: only status columns and the key's location (normalized_name <-> parked) may differ.
  -- The backup's key is coalesced too, so a re-run over already-parked rows compares like with like.
  SELECT count(*) INTO v_drift
    FROM public.food_items f JOIN backup._backup_food_items_050 b USING (id)
   WHERE (f.source, f.name, f.created_by, f.calories_per_100g, f.protein_per_100g, f.carbs_per_100g,
          f.fat_per_100g, f.fiber_per_100g, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g,
          f.fdc_id, f.portions, coalesce(f.normalized_name, f.parked_normalized_name))
         IS DISTINCT FROM
         (b.source, b.name, b.created_by, b.calories_per_100g, b.protein_per_100g, b.carbs_per_100g,
          b.fat_per_100g, b.fiber_per_100g, b.calories, b.protein_g, b.carbs_g, b.fat_g, b.fiber_g,
          b.fdc_id, b.portions, coalesce(b.normalized_name, b.parked_normalized_name));
  IF v_drift > 0 THEN
    RAISE EXCEPTION '050: % rows changed facts', v_drift;
  END IF;

  SELECT count(*) INTO v_mem FROM public.user_food_memory;

  -- These three assert the PRODUCTION dataset (the INDB/IFCT/USDA rows come from seed scripts, not
  -- migrations), so they run only where it exists. A migrations-only replay (`db reset`, a preview
  -- branch, CI) has ~0 food_items and would otherwise always fail here. The checks above hold anywhere.
  IF v_backup >= 1000 THEN
    IF v_verified < 1500 THEN
      RAISE EXCEPTION '050: only % verified rows (expected ~1635); the shared cache would go cold', v_verified;
    END IF;

    SELECT status INTO v_kachori FROM public.food_items WHERE id = '5e470c02-c05c-4081-8577-9c7d0d7c5c85';
    IF v_kachori IS DISTINCT FROM 'quarantined' THEN
      RAISE EXCEPTION '050: INDB Khasta kachori is % (expected quarantined)', coalesce(v_kachori, 'missing');
    END IF;

    IF v_mem < 100 THEN
      RAISE EXCEPTION '050: memory backfill wrote only % rows (expected ~165)', v_mem;
    END IF;
  END IF;

  RAISE NOTICE '050 ok: % rows backed up; verified %, quarantined %, unverified %; memory %',
    v_backup, v_verified, v_quar, v_unver, v_mem;
END
$chk$;

NOTIFY pgrst, 'reload schema';
