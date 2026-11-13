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
-- PASS (with all of 052's founder defaults seeded, and 053's):
--   alias  13/13  the curated phrase returns its alias row first, match_kind 'alias'
--   top1   >= 19/21  the expected verified row is ranked first (2 misses allowed, as the judge set it)
--   top5   6/6   the expected row is somewhere in the top 5 (what the matcher sees)
--   known  reported only: a right row EXISTS but search does not offer it; pass shows whether it is in the
--          top 5 (f until the fix lands). None left: 053 made masala chai a gated alias case (founder
--          decision 5, the standard home chai row with key 'tea').
-- 053 (recalculated Indian dishes) rewrote the ids in the cases block below: every id of a row 053 quarantined
-- is replaced by its successor, and the chai / tea / masala chai / eggs lines take the rule and row the founder
-- chose. That rewrite is generated (scripts/recalc/recalc.py emit; `check` diffs it), so edit those lines through
-- scripts/recalc/data/targets.csv, not here. 'chawal' moved from alias to top1: 053 made it an exact key on a
-- copy of the same rice row (its 052 alias retired), so it works in fts mode too. 'phulka' moved the same way
-- (founder 2026-11-13: its own exact key on a copy of the roti row, 1 piece = 30 g; its 052 alias retired).
-- THESE IDS ARE 053's: this version of the gate passes only on a database WITH 053 applied. Run it before 053 is
-- pushed, or after 053's down script (R1), and it reports a false failure (on a local copy of the 052-only live
-- base it scores alias 7/13, top1 12/21, top5 4/6; with 053 applied locally, alias 13/13, top1 21/21, top5 6/6,
-- both measured 2026-11-13). Ship this file in the same change as the 053 push, and revert its cases block to the
-- pre-053 version (git history) together with R1; supabase/rollback/053_recalc_indian_v1_down.sql says the same.
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
-- 053 kept chaas on its 052 row (founder default); 'rice' follows its 052 row 5f20d673 to that row's 053 copy
-- (same numbers, the founder's 2026-11-13 rice portions: 053 changes no row in place); the roti family moved
-- with its keys.
WITH cases(q, want, rule) AS (VALUES
  ('curd',                 '50d9a39a-bd2c-4f55-a78e-0416f7a4d63f'::uuid, 'alias'),
  ('phulka',               'f1cf4b91-0c2c-58d6-8e16-0849b57c59d3'::uuid, 'top1'),
  ('chaas',                '29c65def-14f9-424e-b9e8-fa04bb2f78fd'::uuid, 'alias'),
  ('upma',                 '137f6250-64aa-5339-a2d7-baa92e0ea192'::uuid, 'alias'),
  ('rajma',                '7653a3be-6680-578e-a90f-7dadf4b9898c'::uuid, 'alias'),
  ('almonds',              'a1f3ed09-8be4-4cb9-9431-e70715a9f90b'::uuid, 'alias'),
  ('maggie noodles',       '6c3c915d-8147-4642-b381-805477205024'::uuid, 'alias'),
  ('coconut chutney',      '9ca15288-e06a-4ef4-9a93-772bd439d2a6'::uuid, 'alias'),
  ('milk',                 '3857270e-27e9-487c-bc51-bb97dea319c7'::uuid, 'alias'),
  ('rice',                 'd4043769-d2f2-5413-afd8-18a21da162aa'::uuid, 'alias'),
  ('chawal',               'db851c61-ef57-5f7d-bad8-c1dcdf45b0bc'::uuid, 'top1'),
  ('potato',               '98d43a5d-e07d-431a-a766-c1579ab88ad5'::uuid, 'alias'),
  ('eggs',                 '3d3e2c25-938d-4923-a457-2b5e7ae4ffb7'::uuid, 'alias'),   -- 053 founder default; 4 logs / 2 users
  ('chapatti',             '14b8ee17-b6f3-513f-a138-f19317e79b04'::uuid, 'top1'),
  ('chapathi',             '14b8ee17-b6f3-513f-a138-f19317e79b04'::uuid, 'top1'),
  ('idly',                 'bece02c8-1c8a-4f85-8de0-6d90879b1a32'::uuid, 'top1'),
  ('curd rice',            '1796a1e7-1c74-4782-a729-838eddb264f4'::uuid, 'top1'),
  ('dahi chawal',          '1796a1e7-1c74-4782-a729-838eddb264f4'::uuid, 'top1'),
  ('paneer butter masala', '717f6316-613d-415e-93dc-260add7d8480'::uuid, 'top1'),
  ('daal makhani',         '6afbebf2-7c87-49ae-b9cc-32d74bc214ed'::uuid, 'top1'),
  ('dal makhni',           '6afbebf2-7c87-49ae-b9cc-32d74bc214ed'::uuid, 'top1'),
  ('bhindi subji',         'cd15763a-7373-54fe-860c-ba3d2e8c4c1c'::uuid, 'top1'),
  ('aloo ki sabzi',        '1abbe3e2-6f5c-50ac-81b7-f79909d6c43a'::uuid, 'top1'),
  ('mattar paneer',        'b95d5b62-eb98-4990-bf09-9956d7df5ff2'::uuid, 'top1'),
  ('upma rava',            '137f6250-64aa-5339-a2d7-baa92e0ea192'::uuid, 'top1'),
  ('sabudana khichri',     '37fce53a-f292-5ff9-b889-15c6f8ce2b9f'::uuid, 'top1'),
  ('panir tikka',          '1807172a-318f-420c-a731-df230d4c8123'::uuid, 'top1'),
  ('oatmeal',              'fbc428a0-a978-4059-bcf3-76eb58080d90'::uuid, 'top1'),
  ('chai',                 'e21a4369-e513-534a-8968-4e4240e871d0'::uuid, 'alias'),
  ('tea',                  'e21a4369-e513-534a-8968-4e4240e871d0'::uuid, 'top1'),                                         -- 053 chai row's exact key; 4 real users
  ('fish curry',           'd2116f4b-76b6-4c9d-b23c-23414b7e2cdd'::uuid, 'top1'),
  ('egg curry',            'b45eb1ef-7100-424b-a698-ee10adcfb26a'::uuid, 'top1'),
  ('baked salmon',         '666f2bf0-7dbc-4186-9358-a16517eb8029'::uuid, 'top1'),   -- 6 real logs / 2 users
  ('khichdi',              'f82c154f-1cfc-56fd-9db1-c7ad5dac56db'::uuid, 'top5'),
  ('omelette',             '66c491f0-9acf-402b-b0e1-b0ec6c3ff6d6'::uuid, 'top5'),
  ('bhindi',               'cd15763a-7373-54fe-860c-ba3d2e8c4c1c'::uuid, 'top5'),
  ('jeera rice',           '71f1d26d-1cdf-47d6-8971-7bb4fdbdb7b1'::uuid, 'top5'),
  ('butter naan',          'b128efb5-7ed1-49eb-bc12-c307e3e51ac9'::uuid, 'top5'),   -- 1 real log; tail slot
  ('whole wheat toast',    'f1c4938f-d96c-41d3-8024-119b430ae252'::uuid, 'top5'),   -- 4 real logs / 2 users
  ('masala chai',          'e21a4369-e513-534a-8968-4e4240e871d0'::uuid, 'alias'),  -- 8 real logs; founder alias
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
