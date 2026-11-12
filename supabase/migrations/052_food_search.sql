-- 052_food_search.sql — v1.2 Phase 4 "Repeatable search"
-- (v1.2-accuracy.md calls this 050_food_search.sql; 050 is food_trust and 051 is reserved by the Phase 3
--  spec (D13) for food_entries_food_item_id_idx + reviewed demotions. Nothing here depends on 051, and no
--  message below names a number, so the file can be renamed if the founder renumbers.)
-- Spec: .claude/plans/v1.2-phase4-spec.md (judge report). This file is its tested §(a) plus the founder's
-- decisions below; the ranking gate is scripts/eval/search-check.sql.
--
-- FOUNDER DECISIONS (2026-11-12, spec §(f); every default accepted)
--   1. Number 052; 051 stays reserved for D13. The "recalculate Indian dishes" step will be 053.
--   2. Generic words get a default row (§5): milk -> whole cow milk (IFCT, 72.9); rice / chawal / white rice /
--      steamed rice -> USDA cooked white rice (130); potato -> boiled potato (87). These are the most-logged
--      words (milk 25 real logs / 10 users, rice 16 / 7), and search alone ranks "Milk cake" or a raw row
--      first for them. NOT done here, on purpose: the exact key "cooked rice" (532c9124…) still serves 97 kcal
--      of glutinous-rice numbers. 052 changes no food_items row, so until 053 fixes the rice family, "rice" /
--      "steamed rice" (130) disagree with the exact keys "cooked rice" (97), "steamed white rice" (de152ca1…,
--      151) and "cooked basmati rice" (10f3afce…, 97). §5 lists the family for 053.
--   3. Roti family: phulka -> the USDA chapati row (299, 1 piece = 43 g), the row the exact key chapati serves.
--      The parser's "roti chapati" pairs -> the row the exact key "chapati roti" serves (INDB 202.31), so word
--      order never changes the number. The family's exact keys already disagree (roti 297, chapati 299,
--      chapati roti 202); 053 repoints the whole family to recalculated Indian values, and §5 lists every row
--      it must move together (two alias TARGETS plus five exact keys).
--   4. chaas -> the existing "buttermilk (chaas)" row (62), the same row as the exact key; revisited in 053.
--   5. Rollout by the RESOLVER_SEARCH function secret: fts -> eval_only -> ranked. No separate canary function.
--
-- OPEN FOR THE FOUNDER (053 or a small alias-only follow-up, same TARGETS/ALIASES pattern as §5). Generic words
--   used by as many real users as "potato" still rank a dish first: tea (4 users) -> Iced tea, Hot tea (Garam
--   Chai) is #5; eggs (4 logs / 2 users) -> scrambled eggs, the exact row egg is #5; chicken (3 / 2) -> Chilli
--   chicken; oats (4 / 2) and rolled oats (6 / 2) -> Oats burfi / Rolled sandwich. And masala chai (8 logs)
--   has no alias: a "chai" or "tea" default pointing at Hot tea (Garam Chai) would also serve it through the
--   tail slot (§4). Content decisions, not code, so 052 leaves them alone.
--
-- WHAT IT DOES
--   §1 pg_trgm in schema extensions (trusted) and loads its library for this session (see §4).
--   §2 food_aliases: curated phrase -> one VERIFIED food_items row ("curd" -> dahi). Server-only, migration-written.
--   §3 GIN trigram index on food_items.normalized_name. Since 050 only verified rows hold that key, and it is
--      macroResolver.normalizeName(name) ("Chapati/Roti" -> "chapati roti"), so it is a ready verified-only corpus.
--   §4 search_foods(q, k): exact key > exact alias > strict word similarity > head-noun match > not a raw row >
--      whole-string similarity > source (indb, ifct, usda) > id, and the last slot is kept for the query's last
--      word when that word is itself a key or alias ("butter naan" -> Naan). A total order: same data + same q =
--      same rows, same order.
--   §5 Seeds 29 aliases (20 dish and spelling aliases + 9 generic-word defaults), each joined on its target's id
--      AND the key that row must still have AND verified (a moved row is skipped and §6 fails). Every alias is
--      backed by real-user logs or a founder decision; none comes from the held-out eval set.
--   §6 Self-checks (privileges, alias health, determinism across plans and session settings); NOTIFY pgrst.
-- WHAT IT DOES NOT DO
--   - insert/update/delete any food_items, food_entries, saved_entries or user_food_memory row (no backup needed)
--   - drop food_items_fts_idx (the deployed resolver's textSearch path still uses it; cleanup migration later)
--   - search unverified/private rows; install unaccent or vector
-- COMPATIBILITY: additive. Deployed functions never call these objects. Order: apply -> scripts/eval/search-check.sql
--   -> deploy with RESOLVER_SEARCH unset (= today's behaviour). The Phase 4 resolver treats a missing table or
--   function as "no alias / no DB candidates", so the wrong order degrades to USDA-only, never a 500.
--   If 052 reaches production before 051 exists, 051 later sorts BEFORE an applied migration, and `db push`
--   refuses it until it is run with --include-all (051 does not depend on 052, so the order is harmless).
-- LOCKS: food_items only: SHARE ROW EXCLUSIVE (§2 foreign key), then SHARE (§3 index build, already covered),
--   held to commit; milliseconds at ~2.4k rows / 1.6 MB. Resolver private-row inserts and last_used_at touches
--   wait that long. No profiles, auth.users or food_entries lock, so it cannot join account deletion's lock chain
--   (050 LOCK ORDER). Push it alone, never in the same `db push` as the 051 index migration.
-- PRIVILEGES (048/049): the function is REVOKEd from PUBLIC, anon, authenticated and GRANTed to service_role only
--   (048's per-schema default does not remove the built-in PUBLIC grant, so the REVOKE is required). food_aliases:
--   RLS on, no policies, SELECT for service_role only; the public default ACL (arwdDxtm for anon/authenticated)
--   is revoked.
-- TRANSACTION: the CLI applies this file as one implicit transaction (no BEGIN/COMMIT/CONCURRENTLY).

SELECT pg_catalog.set_config('lock_timeout', '5s', true);

-- ── §1 Extension ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- §4's "SET pg_trgm.strict_word_similarity_threshold" is refused for a non-superuser (Supabase's postgres role)
-- with "permission denied to set parameter" when pg_trgm's library is not loaded in the session. Calling any
-- pg_trgm function loads it. Every later migration that redefines search_foods must keep this line.
-- The same trap breaks a LOGICAL RESTORE (disaster recovery, moving projects) into a database that already has
-- pg_trgm: pg_dump writes CREATE EXTENSION IF NOT EXISTS (a no-op there, so nothing loads the library) and then
-- this function's SET clause, long before the trigram index that would load it; with --single-transaction the
-- whole restore rolls back. Load the library in the restoring session first, then restore as usual:
--   psql --single-transaction -v ON_ERROR_STOP=1 -c "SELECT extensions.similarity('a','a')" -f schema.sql ...
-- Restoring into a project WITHOUT pg_trgm works as is (the real CREATE EXTENSION loads the library).
SELECT extensions.similarity('a', 'a') AS pg_trgm_loaded;

-- ── §2 food_aliases ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_aliases (
  alias        text PRIMARY KEY
               CHECK (alias <> '' AND alias = btrim(regexp_replace(regexp_replace(lower(alias),
                      '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g'))),   -- = macroResolver.normalizeName()
  food_item_id uuid NOT NULL REFERENCES public.food_items(id) ON DELETE RESTRICT,
  note         text NOT NULL CHECK (btrim(note) <> ''),                       -- the evidence for this alias
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.food_aliases IS
  'v1.2 Phase 4. Curated phrase -> verified food_items row. Same trust as a verified exact key: written only by '
  'reviewed migrations, read only by service_role. Matched EXACTLY, never fuzzily. Every reader filters '
  'status = verified, so an alias whose target is later quarantined stops serving instead of serving a bad row. '
  'Precedence: user-taught memory > verified exact key > alias > machine-learned memory > search.';
ALTER TABLE public.food_aliases ENABLE ROW LEVEL SECURITY;                          -- no policies on purpose
REVOKE ALL ON public.food_aliases FROM PUBLIC, anon, authenticated, service_role;   -- undo the public default ACL
GRANT SELECT ON public.food_aliases TO service_role;

-- ── §3 Trigram index (serves `q <<% normalized_name`; NULL keys = non-verified rows never match) ──
CREATE INDEX IF NOT EXISTS food_items_normalized_name_trgm_idx
  ON public.food_items USING gin (normalized_name extensions.gin_trgm_ops);

-- ── §4 search_foods ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_foods(q text, k integer DEFAULT 5)
RETURNS TABLE (
  id uuid, name text, source text,
  calories_per_100g numeric, protein_per_100g numeric, carbs_per_100g numeric,
  fat_per_100g numeric, fiber_per_100g numeric, portions jsonb,
  match_kind  text,     -- 'exact' | 'alias' | 'trgm'
  score       real,     -- 1 for exact/alias; else strict_word_similarity(q, key) in [0.3, 1]
  name_sim    real,     -- similarity(q, key) over whole strings
  head_match  boolean,  -- q is the row's head noun ("milk" vs "Milk, whole, Cow"), and the row is not a raw
                        -- ingredient unless q says raw. NOT a confidence: score + name_sim + head_match are raw
                        -- signals that Phase 8 calibrates before anything is auto-accepted.
  matched_key text      -- the normalized_name or alias that matched
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET pg_trgm.strict_word_similarity_threshold = 0.3     -- pins the <<% cut-off for every caller (§6 proves it)
AS $fn$
  WITH input AS (
    SELECT n.qn, n.lim,
           CASE WHEN position(' ' IN n.qn) > 0 THEN substring(n.qn FROM '[^ ]+$') END AS tail   -- see TAIL SLOT
      FROM (SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(search_foods.q, '')),
                         '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g'))   AS qn,
                   least(greatest(coalesce(search_foods.k, 5), 1), 10)          AS lim) n
  ),
  keyed AS (
    SELECT fi.id AS food_item_id, fi.normalized_name AS mkey, false AS via_alias, false AS is_tail
      FROM input i
      JOIN public.food_items fi ON i.qn OPERATOR(extensions.<<%) fi.normalized_name   -- GIN index
     WHERE i.qn <> ''
    UNION ALL
    SELECT a.food_item_id, a.alias, true, false                         -- exact only: fuzzy aliases leak
      FROM input i
      JOIN public.food_aliases a ON a.alias = i.qn
    UNION ALL
    -- The tail's own exact key or alias row (TAIL SLOT below). Keyed on the row's normalized_name, never on the
    -- alias text, so it scores exactly as the trigram branch would score it: the slot adds a row, never a score.
    SELECT fi.id, fi.normalized_name, false, true
      FROM input i
      JOIN public.food_items fi ON fi.normalized_name = i.tail           -- unique index
    UNION ALL
    SELECT fi.id, fi.normalized_name, false, true
      FROM input i
      JOIN public.food_aliases a ON a.alias = i.tail
      JOIN public.food_items fi ON fi.id = a.food_item_id AND fi.status = 'verified'
  ),
  scored AS (
    SELECT kd.food_item_id, kd.mkey, kd.is_tail,
           CASE WHEN kd.mkey <> i.qn THEN 0 WHEN kd.via_alias THEN 1 ELSE 2 END        AS kind_rank,
           CASE WHEN kd.mkey = i.qn THEN 1::real
                ELSE extensions.strict_word_similarity(i.qn, kd.mkey) END               AS score,
           extensions.similarity(i.qn, kd.mkey)                                         AS name_sim
      FROM keyed kd CROSS JOIN input i
  ),
  best AS (                                   -- one line per food: its best-matching key
    SELECT DISTINCT ON (s.food_item_id) s.food_item_id, s.mkey, s.kind_rank, s.score, s.name_sim,
           bool_or(s.is_tail) OVER (PARTITION BY s.food_item_id) AS tail_hit   -- whichever key won the line
      FROM scored s
     WHERE s.kind_rank > 0 OR s.score >= 0.3  -- a constant, not the session setting
        OR s.is_tail                          -- a long query scores its tail word low; the slot keeps it anyway
     ORDER BY s.food_item_id, s.kind_rank DESC, s.score DESC, s.name_sim DESC, s.mkey
  ),
  ranked AS (
    SELECT fi.id, fi.name, fi.source,
           fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g,
           fi.portions,
           CASE b.kind_rank WHEN 2 THEN 'exact' WHEN 1 THEN 'alias' ELSE 'trgm' END AS match_kind,
           b.score, b.name_sim, h.head_match, b.mkey, b.tail_hit,
           row_number() OVER (
             ORDER BY b.kind_rank DESC, b.score DESC, h.head_match DESC,
                      -- A tie between "X, raw" and a cooked dish goes to the dish (rajmah -> Rajmah curry,
                      -- baked salmon -> salmon fillet, puffed rice -> Murmura; 3 top-1 changes in ~200
                      -- probes). The cost: a food eaten raw can lose its IFCT raw rows from the top 5
                      -- ("carrot" now offers carrot cake / kheer); USDA's raw rows still reach the matcher.
                      rw.raw_row,
                      b.name_sim DESC,
                      CASE fi.source WHEN 'indb' THEN 1 WHEN 'ifct' THEN 2 WHEN 'usda' THEN 3 ELSE 9 END,
                      fi.id) AS rn
      FROM best b
      JOIN public.food_items fi ON fi.id = b.food_item_id
      CROSS JOIN input i
      CROSS JOIN LATERAL (SELECT fi.normalized_name ~ '\mraw\M' AND i.qn !~ '\mraw\M' AS raw_row) rw
      CROSS JOIN LATERAL (
        SELECT (i.qn = fi.normalized_name
                OR i.qn = btrim(regexp_replace(regexp_replace(lower(split_part(split_part(fi.name, ',', 1), '(', 1)),
                                '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g')))
               AND NOT rw.raw_row AS head_match
      ) h
     WHERE fi.status = 'verified'
       AND fi.calories_per_100g IS NOT NULL
  )
  -- TAIL SLOT. Trigram score rewards the longest shared word, so "butter naan" ties 12 butter rows at 0.58 and
  -- the exact row Naan (0.42) never reaches the top 5; the same for garlic naan, plain dosa, tandoori roti and
  -- every "X chawal". When a 2+-word query's LAST word is itself a verified exact key or alias (naan, dosa,
  -- roti, chawal -> the rice alias), that row takes the last slot if it is not already in the top k. No score
  -- changes and rows 1..k-1 are untouched, so search_foods(q, 1) is still the plain top-1. Still a total order.
  SELECT r.id, r.name, r.source,
         r.calories_per_100g, r.protein_per_100g, r.carbs_per_100g, r.fat_per_100g, r.fiber_per_100g,
         r.portions, r.match_kind, r.score, r.name_sim, r.head_match, r.mkey
    FROM ranked r CROSS JOIN input i
   WHERE r.rn < i.lim
      OR r.rn = coalesce((SELECT min(t.rn) FROM ranked t WHERE t.tail_hit AND t.rn > i.lim AND i.lim > 1), i.lim)
   ORDER BY r.rn
$fn$;
COMMENT ON FUNCTION public.search_foods(text, integer) IS
  'v1.2 Phase 4. Ranked, deterministic search over VERIFIED food_items + exact food_aliases. Server-only '
  '(service_role). score/name_sim/head_match are raw signals, not a calibrated confidence (Phase 8).';
REVOKE EXECUTE ON FUNCTION public.search_foods(text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_foods(text, integer) TO service_role;

-- ── §5 Seed aliases. Evidence = real-user food_entries (eval account excluded), checked 2026-11-12 ──
-- Two lists. TARGETS declares each verified row once, with the key that row must still hold; ALIASES only
-- name a target. Pointing a whole family somewhere else is therefore one edit of one target, never a hunt
-- through repeated uuids.
--
-- THE ROTI FAMILY is the two targets 'roti' and 'roti pair' (founder decision 3). It is NOT one row today: the
-- exact keys already split it, and 052 changes no food_items row. What 052 guarantees is narrower: an alias
-- never disagrees with the exact key of the same words. So phulka goes where the exact key chapati goes, and
-- the parser's "roti chapati" pairs go where the exact key "chapati roti" goes (INDB 202.31, no portions);
-- "2 roti/chapati" and "2 chapati/roti" were 299 vs 202 kcal/100 g with different gram handling when that
-- pair pointed at the chapati row. 053 (recalculated Indian dishes) repoints both targets with
--     UPDATE public.food_aliases SET food_item_id = '<recalculated row>'
--      WHERE food_item_id IN ('b84a7f73-62d6-4a46-b24a-3b2ded14dc45', '6f236ba8-be48-419f-9925-ba4e937635f4');
-- in the same migration that moves every exact key of the family:
--     roti         7d360df0…  USDA 297, 1 piece = 68 g        chapati      b84a7f73…  USDA 299, 1 piece = 43 g
--     chapati roti 6f236ba8…  INDB 202.31, no portions        wheat roti   5aca1a95…  USDA 297, 1 piece = 68 g
--     butter roti  caceb539…  USDA 297, no portions (a different food? 053 decides, on purpose)
-- §6 pins what each of these words serves today, so 053 cannot move one without editing the others' probes.
--
-- THE RICE FAMILY is 053's to revisit the same way: the 'rice' target (cooked white rice, 130, 1 cup = 186 g)
-- disagrees with the exact keys cooked rice (532c9124…, 97, glutinous numbers, 1 cup = 174 g), steamed white
-- rice (de152ca1…, USDA 151, no portions) and cooked basmati rice (10f3afce…, 97); "boiled rice" ranks INDB
-- Boiled rice (Uble chawal, 117) first. So "steamed rice" (alias, 130) and "steamed white rice" (exact, 151)
-- differ today. The 'buttermilk' (chaas) target is revisited in 053 too.
--
-- A target whose row lost its key or status since 2026-11-12 seeds none of its aliases, and §6's count fails.
INSERT INTO public.food_aliases (alias, food_item_id, note)
SELECT a.alias, fi.id, a.note
  FROM (VALUES
    -- target            food_items.id                                  the key that row must still hold
    ('roti',             'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'chapati'),            -- USDA 299; 053 repoints
    ('roti pair',        '6f236ba8-be48-419f-9925-ba4e937635f4'::uuid, 'chapati roti'),       -- INDB 202.31; 053 repoints
    ('buttermilk',      '29c65def-14f9-424e-b9e8-fa04bb2f78fd'::uuid, 'buttermilk chaas'),   -- USDA 62; 053 revisits
    ('dahi',             '50d9a39a-bd2c-4f55-a78e-0416f7a4d63f'::uuid, 'dahi'),
    ('dal',              '7e0fac32-ada1-4dbb-9db4-e7869967551a'::uuid, 'dal'),
    ('almond',           'a1f3ed09-8be4-4cb9-9431-e70715a9f90b'::uuid, 'almond'),
    ('rajma curry',      '20752111-d150-4ecd-8128-821f1324c79f'::uuid, 'kidney bean curry rajmah curry'),
    ('upma',             '23c96f47-d375-406e-81d3-4654a4a88c55'::uuid, 'semolina upma suji rava upma'),
    ('sabudana khichdi', '92ef8305-7232-4636-8a90-190e109ad67d'::uuid, 'sago khitchdi khichri sabudana khitchdi khichri'),
    ('bhindi sabzi',     'bd763856-cf67-4ca1-a8e3-661668d969ee'::uuid, 'okra lady s fingers fry bhindi sabzi sabji subji'),
    ('aloo sabzi',       'a74d35bb-168f-4be9-9ce4-9eebc2cc4b09'::uuid, 'potato curry aloo ki sabzi'),
    ('matar paneer',     'b95d5b62-eb98-4990-bf09-9956d7df5ff2'::uuid, 'pea paneer curry matar paneer'),
    ('instant noodles',  '6c3c915d-8147-4642-b381-805477205024'::uuid, 'cooked instant noodles'),
    ('coconut chutney',  '9ca15288-e06a-4ef4-9a93-772bd439d2a6'::uuid, 'coconut chutney nariyal ki chutney'),
    -- generic-word defaults (founder decision 2)
    ('milk',             '3857270e-27e9-487c-bc51-bb97dea319c7'::uuid, 'milk whole cow'),     -- IFCT 72.9
    ('rice',             '5f20d673-2247-44bf-9517-6f7d58ff4930'::uuid, 'cooked white rice'),  -- USDA 130, 1 cup = 186 g
    ('potato',           '98d43a5d-e07d-431a-a766-c1579ab88ad5'::uuid, 'boiled potato')       -- USDA 87
  ) AS t(target, food_item_id, expect_key)
  JOIN (VALUES
    -- alias                      target              evidence (food_aliases.note)
    ('phulka',                   'roti',             'founder: roti = chapati = phulka; the chapati row (299, 1 piece = 43 g) like the exact key chapati'),
    ('roti chapati',             'roti pair',        'parser bilingual pair; 1 real log; same row as the exact key chapati roti'),
    ('whole wheat roti chapati', 'roti pair',        '1 real log; same row as the exact key chapati roti'),
    ('chaas',                    'buttermilk',       'founder: chaas -> Indian buttermilk; same row as the exact key buttermilk chaas'),
    ('curd',                     'dahi',             'founder: curd = dahi; 6 real logs / 2 users'),
    ('curd yogurt',              'dahi',             'parser bilingual pair; 1 real log'),
    ('dahi yogurt',              'dahi',             'parser bilingual pair; 1 real log'),
    ('dal lentil curry',         'dal',              'parser bilingual pair; 6 real logs / 4 users'),
    ('almonds',                  'almond',           '17 real logs / 5 users'),
    ('rajma',                    'rajma curry',      'search alone ranks raw rajmah 299 first; 1 real log'),
    ('upma',                     'upma',             '2 real users; search alone ranks rice upma first'),
    ('sabudana khichdi',         'sabudana khichdi', '2 real users'),
    ('bhindi ki sabzi',          'bhindi sabzi',     '3 real logs'),
    ('aloo sabji',               'aloo sabzi',       '2 real logs'),
    ('aalu ki sabzi',            'aloo sabzi',       '1 real log'),
    ('matar paneer',             'matar paneer',     '1 real log'),
    ('mutter paneer',            'matar paneer',     '1 real log'),
    ('maggi noodles',            'instant noodles',  '2 real users'),
    ('maggie noodles',           'instant noodles',  '3 real logs'),
    ('coconut chutney',          'coconut chutney',  '4 real logs / 3 users'),
    -- generic-word defaults (founder decision 2): search alone ranks Milk cake / a raw row first for these
    ('milk',                     'milk',             'founder default; 25 real logs / 10 users'),
    ('pasteurized cow milk',     'milk',             'founder default; 2 real logs'),
    ('rice',                     'rice',             'founder default; 16 real logs / 7 users'),
    ('chawal',                   'rice',             'founder default; 3 real logs / 2 users'),
    ('white rice',               'rice',             'founder default; 2 real users'),
    ('steamed rice',             'rice',             'founder default; 10 real logs / 2 users'),
    ('chawal rice',              'rice',             'founder default; parser bilingual pair; 3 real logs'),
    ('chawal cooked rice',       'rice',             'founder default; parser bilingual pair; 2 real logs'),
    ('potato',                   'potato',           'founder default; 2 real users')
  ) AS a(alias, target, note) ON a.target = t.target
  JOIN public.food_items fi
    ON fi.id = t.food_item_id AND fi.status = 'verified' AND fi.normalized_name = t.expect_key
ON CONFLICT (alias) DO NOTHING;

-- ── §6 Self-checks (any failure rolls back everything above) ──────────────────────────────────
DO $chk$
DECLARE
  v_expected constant int := 29;   -- 20 dish/spelling aliases + 9 generic-word defaults (§5)
  v_bad bigint; v_dead text; v_alias bigint; v_top record;
  v_probe text[] := ARRAY['milk','rice','chicken','curd','chapatti','idly','curd rice','dahi chawal',
                          'paneer butter masala','daal makhani','khichdi','omelette','masala chai','kadhi',
                          'upma rava','bhindi subji','maggie noodles','sabudana khichri','jeera rice',
                          'butter naan','rajma chawal','baked salmon','rajmah','roti chapati'];   -- tail slot, raw rows
  v_run jsonb[] := '{}';
  v_cur jsonb;
  r record;
BEGIN
  -- (a) alias health: verified targets only; no alias equal to an exact key (the exact hit would always win)
  SELECT count(*) INTO v_bad FROM public.food_aliases a JOIN public.food_items fi ON fi.id = a.food_item_id
   WHERE fi.status <> 'verified' OR fi.calories_per_100g IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'food_search: % aliases point at non-verified rows', v_bad; END IF;
  SELECT string_agg(a.alias, ', ') INTO v_dead
    FROM public.food_aliases a JOIN public.food_items fi ON fi.normalized_name = a.alias;
  IF v_dead IS NOT NULL THEN
    RAISE EXCEPTION 'food_search: aliases equal to an exact key never fire: %', v_dead;
  END IF;
  -- An alias that is an exact key with its words reordered must serve that key's row: "roti chapati" and the
  -- key "chapati roti" are the same two words, so they may not give two numbers (it was 299 vs 202).
  SELECT string_agg(a.alias || ' (key ' || fi.normalized_name || ')', ', ') INTO v_dead
    FROM public.food_aliases a
    JOIN public.food_items fi
      ON fi.normalized_name IS NOT NULL AND fi.id <> a.food_item_id
     AND (SELECT array_agg(w ORDER BY w) FROM regexp_split_to_table(fi.normalized_name, ' ') w)
       = (SELECT array_agg(w ORDER BY w) FROM regexp_split_to_table(a.alias, ' ') w);
  IF v_dead IS NOT NULL THEN
    RAISE EXCEPTION 'food_search: aliases disagree with the exact key of the same words: %', v_dead;
  END IF;

  -- (b) privileges (048/049): no app-client role reaches either object; service_role can run the search
  IF has_table_privilege('anon', 'public.food_aliases', 'SELECT')
     OR has_table_privilege('authenticated', 'public.food_aliases', 'SELECT')
     OR has_table_privilege('service_role', 'public.food_aliases', 'INSERT')
     OR has_table_privilege('service_role', 'public.food_aliases', 'UPDATE')
     OR has_table_privilege('service_role', 'public.food_aliases', 'DELETE')
     OR has_function_privilege('anon', 'public.search_foods(text, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_foods(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'food_search: food_aliases or search_foods is reachable/writable by an API role';
  END IF;
  -- search_foods is SECURITY INVOKER, so service_role also needs SELECT on food_items itself (it has it today:
  -- the resolver's exact read uses it). Checked, not assumed: without it every ranked search would fail.
  IF NOT (has_table_privilege('service_role', 'public.food_aliases', 'SELECT')
          AND has_table_privilege('service_role', 'public.food_items', 'SELECT')
          AND has_function_privilege('service_role', 'public.search_foods(text, integer)', 'EXECUTE')
          AND has_function_privilege('service_role', 'extensions.strict_word_similarity(text, text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'extensions.similarity(text, text)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'food_search: service_role cannot run search_foods';
  END IF;

  -- (c) determinism on any data: same answer with index scans, with forced sequential scans, and with a hostile
  --     session threshold (the function's own SET must win). set_config(..., true) is transaction-local.
  FOR i IN 1..3 LOOP
    IF i = 2 THEN
      PERFORM pg_catalog.set_config('enable_bitmapscan', 'off', true);
      PERFORM pg_catalog.set_config('enable_indexscan',  'off', true);
    ELSIF i = 3 THEN
      PERFORM pg_catalog.set_config('enable_bitmapscan', 'on', true);
      PERFORM pg_catalog.set_config('enable_indexscan',  'on', true);
      PERFORM pg_catalog.set_config('pg_trgm.strict_word_similarity_threshold', '0.9', true);
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_array(p.ord, s.id, s.match_kind, s.score) ORDER BY p.ord, s.o), '[]')
      INTO v_cur
      FROM unnest(v_probe) WITH ORDINALITY AS p(q, ord)
      CROSS JOIN LATERAL (SELECT x.*, row_number() OVER () AS o FROM public.search_foods(p.q, 5) x) s;
    v_run := v_run || v_cur;
  END LOOP;
  PERFORM pg_catalog.set_config('pg_trgm.strict_word_similarity_threshold', '0.5', true);
  IF v_run[1] IS DISTINCT FROM v_run[2] OR v_run[1] IS DISTINCT FROM v_run[3] THEN
    RAISE EXCEPTION 'food_search: search_foods is not deterministic across plans / session settings';
  END IF;

  -- (d) production data only (seed rows come from scripts; a migrations-only replay has ~0). Same guard as 050 §10.
  IF (SELECT count(*) FROM public.food_items WHERE status = 'verified') >= 1500 THEN
    SELECT count(*) INTO v_alias FROM public.food_aliases;
    IF v_alias <> v_expected THEN
      RAISE EXCEPTION 'food_search: % of % aliases seeded; a target lost its key or status since 2026-11-12', v_alias, v_expected;
    END IF;
    -- The roti family is NOT one row yet (founder decision 3; §5). Pinned here word by word, so that 053 has
    -- to move the whole family together: phulka agrees with chapati, "roti chapati" with "chapati roti",
    -- and roti / wheat roti / butter roti stay on their own USDA rows until 053 recalculates them.
    FOR r IN SELECT * FROM (VALUES
        ('curd',                 '50d9a39a-bd2c-4f55-a78e-0416f7a4d63f'::uuid, 'alias'),
        ('chapati',              'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'exact'),
        ('phulka',               'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'alias'),
        ('chapatti',             'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'trgm'),
        ('chapati roti',         '6f236ba8-be48-419f-9925-ba4e937635f4'::uuid, 'exact'),
        ('roti chapati',         '6f236ba8-be48-419f-9925-ba4e937635f4'::uuid, 'alias'),
        ('roti',                 '7d360df0-5ad0-4307-a6cf-9bedfa7545de'::uuid, 'exact'),
        ('wheat roti',           '5aca1a95-e516-484b-8bf5-c2653b262c94'::uuid, 'exact'),
        ('butter roti',          'caceb539-f8f0-42d6-b622-5afe9b945822'::uuid, 'exact'),
        ('paneer butter masala', '717f6316-613d-415e-93dc-260add7d8480'::uuid, 'trgm'),
        ('milk',                 '3857270e-27e9-487c-bc51-bb97dea319c7'::uuid, 'alias'),
        ('rice',                 '5f20d673-2247-44bf-9517-6f7d58ff4930'::uuid, 'alias'),
        ('potato',               '98d43a5d-e07d-431a-a766-c1579ab88ad5'::uuid, 'alias')) AS t(q, id, kind)
    LOOP
      SELECT * INTO v_top FROM public.search_foods(r.q, 1);
      IF v_top.id IS DISTINCT FROM r.id OR v_top.match_kind IS DISTINCT FROM r.kind THEN
        RAISE EXCEPTION 'food_search: search_foods(%) top = % (%), expected % (%)', r.q, v_top.id, v_top.match_kind, r.id, r.kind;
      END IF;
    END LOOP;
    -- TAIL SLOT: Naan (0.42) is outside the top 5 on score alone (12 butter rows tie at 0.58). The slot puts it
    -- last in a list of 5, and never in a list of 1 (top-1 is untouched).
    IF NOT EXISTS (SELECT 1 FROM public.search_foods('butter naan', 5) x
                    WHERE x.id = 'b128efb5-7ed1-49eb-bc12-c307e3e51ac9')
       OR EXISTS (SELECT 1 FROM public.search_foods('butter naan', 1) x
                   WHERE x.id = 'b128efb5-7ed1-49eb-bc12-c307e3e51ac9') THEN
      RAISE EXCEPTION 'food_search: tail slot broken: butter naan must offer Naan in a top 5, not as top 1';
    END IF;
    FOR r IN SELECT p.q, string_agg(s.name || ' [' || s.source || '] ' || s.match_kind || ' ' || round(s.score::numeric, 2), ' | ') AS top
               FROM unnest(ARRAY['cooked rice','chicken','masala chai','butter naan']) AS p(q)   -- cooked rice: 97 until 053
               CROSS JOIN LATERAL public.search_foods(p.q, 3) s GROUP BY p.q
    LOOP
      RAISE NOTICE 'food_search probe % -> %', r.q, r.top;
    END LOOP;
  END IF;
  RAISE NOTICE 'food_search ok: % aliases', (SELECT count(*) FROM public.food_aliases);
END
$chk$;

NOTIFY pgrst, 'reload schema';
