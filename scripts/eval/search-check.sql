-- scripts/eval/search-check.sql — read-only ranking gate for search_foods (v1.2 Phase 4, migration 052).
--
-- WHY: Jest cannot test result ORDER (SQL decides it), and the resolver offers the matcher search_foods'
-- rows in exactly the order returned. This gate pins that order on the real verified base before any
-- deploy (spec §(d) G0) and after any later migration that touches food_items, food_aliases or the
-- function.
--
-- Run twice; the two outputs must be byte-identical (search_foods is a total order):
--   npx supabase db query --linked -o csv -f scripts/eval/search-check.sql > /tmp/g1.csv
--   npx supabase db query --linked -o csv -f scripts/eval/search-check.sql > /tmp/g2.csv && cmp /tmp/g1.csv /tmp/g2.csv
-- Plus timing: EXPLAIN (ANALYZE) SELECT * FROM public.search_foods('paneer butter masala', 5);   -- <= 20 ms
--
-- PASS (with all of 052's founder defaults seeded):
--   alias  12/12  the curated phrase returns its alias row first, match_kind 'alias'
--   top1   >= 17/19  the expected verified row is ranked first (2 misses allowed, as the judge set it)
--   top5   6/6   the expected row is somewhere in the top 5 (what the matcher sees)
--   known  reported only: a right row EXISTS but search does not offer it; pass shows whether it is in the
--          top 5 (f until the fix lands). masala chai -> Hot tea (Garam Chai) waits on a founder alias
--          ("chai"/"tea" default, listed in 052's OPEN FOR THE FOUNDER); the tail slot then serves it.
--   none   reported only: queries with no right row in the base. Their score1 is Phase 8's calibration
--          input (protein bar scores 0.67 on a WRONG row, so a score is not a confidence).
-- A scored rule whose probe returns no rows reads f, never blank: a quarantined alias target or a dropped
-- row must fail the gate, not vanish from it.
--
-- Probes are real-user phrases and spelling variants only; nothing from dataset-v4 (held out), which a
-- 2026-11-12 review found five of (veg pulao j12, kachori j14, coca cola c04, misal j09, whiskey k12) and
-- replaced. One alias probe is v4-adjacent by founder choice: chaas (0 real logs) is v4 k11's food, so the
-- run A/B report lists k11 among the alias-touched cases and labels it founder-chosen, not evidence-backed.
-- The milk, rice and potato rows moved from top1/top5 to 'alias' when the founder approved the generic-word
-- defaults. butter naan is the tail-slot case (Naan was outside the top 5); baked salmon is the raw-row
-- tie-break case (Salmon (raw) used to win the tie); whole wheat toast is a modifier-word case where a raw
-- row still ranks first on score ("Wheat, whole (raw)" 0.63), left for Phase 8 to weigh.
-- When 053 repoints the roti family (and revisits chaas and rice), update the expected ids here with it.
WITH cases(q, want, rule) AS (VALUES
  ('curd',                 '50d9a39a-bd2c-4f55-a78e-0416f7a4d63f'::uuid, 'alias'),
  ('phulka',               'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'alias'),
  ('chaas',                '29c65def-14f9-424e-b9e8-fa04bb2f78fd'::uuid, 'alias'),
  ('upma',                 '23c96f47-d375-406e-81d3-4654a4a88c55'::uuid, 'alias'),
  ('rajma',                '20752111-d150-4ecd-8128-821f1324c79f'::uuid, 'alias'),
  ('almonds',              'a1f3ed09-8be4-4cb9-9431-e70715a9f90b'::uuid, 'alias'),
  ('maggie noodles',       '6c3c915d-8147-4642-b381-805477205024'::uuid, 'alias'),
  ('coconut chutney',      '9ca15288-e06a-4ef4-9a93-772bd439d2a6'::uuid, 'alias'),
  ('milk',                 '3857270e-27e9-487c-bc51-bb97dea319c7'::uuid, 'alias'),
  ('rice',                 '5f20d673-2247-44bf-9517-6f7d58ff4930'::uuid, 'alias'),
  ('chawal',               '5f20d673-2247-44bf-9517-6f7d58ff4930'::uuid, 'alias'),
  ('potato',               '98d43a5d-e07d-431a-a766-c1579ab88ad5'::uuid, 'alias'),
  ('chapatti',             'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'top1'),
  ('chapathi',             'b84a7f73-62d6-4a46-b24a-3b2ded14dc45'::uuid, 'top1'),
  ('idly',                 'bece02c8-1c8a-4f85-8de0-6d90879b1a32'::uuid, 'top1'),
  ('curd rice',            '1796a1e7-1c74-4782-a729-838eddb264f4'::uuid, 'top1'),
  ('dahi chawal',          '1796a1e7-1c74-4782-a729-838eddb264f4'::uuid, 'top1'),
  ('paneer butter masala', '717f6316-613d-415e-93dc-260add7d8480'::uuid, 'top1'),
  ('daal makhani',         '6afbebf2-7c87-49ae-b9cc-32d74bc214ed'::uuid, 'top1'),
  ('dal makhni',           '6afbebf2-7c87-49ae-b9cc-32d74bc214ed'::uuid, 'top1'),
  ('bhindi subji',         'bd763856-cf67-4ca1-a8e3-661668d969ee'::uuid, 'top1'),
  ('aloo ki sabzi',        'a74d35bb-168f-4be9-9ce4-9eebc2cc4b09'::uuid, 'top1'),
  ('mattar paneer',        'b95d5b62-eb98-4990-bf09-9956d7df5ff2'::uuid, 'top1'),
  ('upma rava',            '23c96f47-d375-406e-81d3-4654a4a88c55'::uuid, 'top1'),
  ('sabudana khichri',     '92ef8305-7232-4636-8a90-190e109ad67d'::uuid, 'top1'),
  ('panir tikka',          '1807172a-318f-420c-a731-df230d4c8123'::uuid, 'top1'),
  ('oatmeal',              'fbc428a0-a978-4059-bcf3-76eb58080d90'::uuid, 'top1'),
  ('chai',                 'ad73a078-8182-44f4-a6e8-ca384f844abc'::uuid, 'top1'),
  ('fish curry',           'd2116f4b-76b6-4c9d-b23c-23414b7e2cdd'::uuid, 'top1'),
  ('egg curry',            'b45eb1ef-7100-424b-a698-ee10adcfb26a'::uuid, 'top1'),
  ('baked salmon',         '666f2bf0-7dbc-4186-9358-a16517eb8029'::uuid, 'top1'),   -- 6 real logs / 2 users
  ('khichdi',              '67d06648-33d0-464e-9194-a3e4b06cdbf2'::uuid, 'top5'),
  ('omelette',             '66c491f0-9acf-402b-b0e1-b0ec6c3ff6d6'::uuid, 'top5'),
  ('bhindi',               'bd763856-cf67-4ca1-a8e3-661668d969ee'::uuid, 'top5'),
  ('jeera rice',           '71f1d26d-1cdf-47d6-8971-7bb4fdbdb7b1'::uuid, 'top5'),
  ('butter naan',          'b128efb5-7ed1-49eb-bc12-c307e3e51ac9'::uuid, 'top5'),   -- 1 real log; tail slot
  ('whole wheat toast',    'f1c4938f-d96c-41d3-8024-119b430ae252'::uuid, 'top5'),   -- 4 real logs / 2 users
  ('masala chai',          'ad73a078-8182-44f4-a6e8-ca384f844abc'::uuid, 'known'),  -- 8 real logs; founder alias
  ('protein bar', NULL, 'none'), ('rolled oats', NULL, 'none'), ('mixed berries', NULL, 'none'))
SELECT c.rule, c.q,
       CASE WHEN c.rule = 'none' THEN NULL
            ELSE coalesce(CASE c.rule WHEN 'alias' THEN r.ids[1] = c.want AND r.kinds[1] = 'alias'
                                      WHEN 'top1'  THEN r.ids[1] = c.want
                                      ELSE c.want = ANY (r.ids) END,   -- top5, known
                          false) END                              AS pass,   -- no rows -> f, not blank
       r.kinds[1] AS kind1, round(r.scores[1]::numeric, 2) AS score1, r.names[1:3] AS top3
  FROM cases c
  CROSS JOIN LATERAL (
    SELECT array_agg(s.id ORDER BY s.o) ids, array_agg(s.match_kind ORDER BY s.o) kinds,
           array_agg(s.score ORDER BY s.o) scores, array_agg(s.name ORDER BY s.o) names
      FROM (SELECT x.*, row_number() OVER () AS o FROM public.search_foods(c.q, 5) x) s) r
 ORDER BY c.rule, c.q;
