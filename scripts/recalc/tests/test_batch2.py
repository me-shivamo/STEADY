"""Unit tests for scripts/recalc/batch2.py (migration 058, recalc_v2). Standard library only:

    python3 -I -m unittest discover -s scripts/recalc/tests -v

They need the pinned INDB/IFCT sources in .cache/recalc/ and the pinned USDA SR Legacy zip in .cache/usda/, and are
skipped, loudly, without them. What they pin: the founder's values (spec (i)1-6), the energy rule, the keys and ids,
the solved oil and water lines, the portions, that 053's committed output is untouched, and that `check` is green.
"""
import json
import os
import sys
import unittest
from decimal import Decimal

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import indb      # noqa: E402
import recalc as R  # noqa: E402
import batch2 as B  # noqa: E402
import emit58 as E  # noqa: E402
import emit53  # noqa: E402

READY = not indb.verify(quiet=True) and os.path.exists(os.path.join(B.USDA_CACHE, 'FoodData_Central_sr_legacy_food_csv_2018-04.zip'))
WHY = 'pinned sources missing: python3 -I scripts/recalc/recalc.py fetch; npx tsx scripts/import-usda.ts fetch'


@unittest.skipUnless(READY, WHY)
class Batch2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.book, cls.lab, cls.anchors, cls.plan = B.load_all()
        cls.der = {d['variant_key']: d for d in cls.plan['derivations']}
        cls.by_key = {r['key']: r for r in cls.plan['new_rows']}
        cls.sha = B.inputs_sha256()

    # values: the founder-approved numbers (spec (i), review-corrected) ─────────────────────────────────────────
    def test_upma_lab101_anchor_with_lab_fat(self):
        d = self.der['upma_rava_labfat']
        v = d['values']
        self.assertEqual(d['moisture_rule'], 'target')
        self.assertEqual(d['moisture_basis'], 'lab:101')
        self.assertEqual(d['moisture_target_pct'], Decimal('48.00'))
        self.assertAlmostEqual(float(v['kcal']), 222, delta=0.5)            # "about 222 kcal"
        self.assertAlmostEqual(float(v['fat']), 6.5, delta=0.05)            # "F 6.5"
        oil = next(x for x in d['lines'] if x['code'] == 'T508')
        self.assertEqual((oil['g_as_written'], oil['g'], oil['role']), (15.0, 6.23, 'edited'))
        fs = next(c for c in d['checks'] if c['check'] == 'fat_share_of_dry_matter')
        self.assertTrue(fs['ok'])
        self.assertAlmostEqual(fs['want_pct'], 12.5, places=3)
        self.assertEqual(d['confidence'], 'C')
        # disclosed per macro, not only energy: fat matches lab 101 by the rule, protein is recipe maths
        m = d['referee']['macros_vs_lab']
        self.assertEqual((m['fat']['lab'], m['fat']['shipped']), (6.5, 6.5))
        self.assertEqual((m['protein']['lab'], m['carbs']['lab']), (4.2, 34.4))           # C_avl = 41.0 - 6.6
        self.assertGreater(m['protein']['diff_pct'], 50)

    def test_poha_soak_water_lab_fat_and_nin_cross_check(self):
        d = self.der['poha_home_labfat']
        v = d['values']
        self.assertEqual(d['moisture_rule'], 'keep')
        water = [x for x in d['lines'] if x['code'] == 'K505']
        self.assertEqual([(w['g'], w['role']) for w in water], [(60.0, 'added')])    # BFP045's 60 ml per 40 g poha
        oil = next(x for x in d['lines'] if x['code'] == 'T508')
        self.assertEqual(oil['g_as_written'], 10.0)
        self.assertLess(oil['g'], 10.0)
        fs = next(c for c in d['checks'] if c['check'] == 'fat_share_of_dry_matter')
        self.assertTrue(fs['ok'])
        self.assertAlmostEqual(fs['want_pct'], 9.1 / 77.7 * 100, places=3)          # Pune kanda pohe, lab 99
        nin = d['cross_checks'][0]
        self.assertEqual((nin['anchor'], nin['dry_grain_g'], nin['reference_kcal']), ('nin_poha_cup', 50, 270))
        self.assertAlmostEqual(nin['kcal'], float(v['kcal']) * nin['dish_g'] / 100, delta=0.01)
        self.assertEqual(d['confidence'], 'C')
        self.assertIn('150', d['grain_per_plate_g'])
        # spec (i)2 approved a rule, not a number: the rule's result is pinned exactly (batch2.PINNED_OUTPUTS) until the
        # founder confirms it, so an INDB/IFCT or solver change cannot drift it through `emit`
        self.assertEqual({k: v[k] for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')},
                         dict(kcal=Decimal('155.05'), protein=Decimal('4.14'), carbs=Decimal('23.84'), fat=Decimal('4.23'),
                              fiber=Decimal('2.53')))
        self.assertEqual(oil['g'], 1.34)
        self.assertEqual(B.PINNED_OUTPUTS['poha_home_labfat'], dict(kcal=155.05, protein=4.14, carbs=23.84, fat=4.23, fiber=2.53))
        self.assertNotIn('poha_home_labfat', B.FOUNDER_VALUES)                       # not founder-quoted (yet)

    def test_biryani_chicken_khan2019_water(self):
        d = self.der['biryani_chicken_home']
        v = d['values']
        want = dict(protein=6.55, carbs=19.06, fat=6.20, fiber=2.05)
        for k, w in want.items():
            self.assertAlmostEqual(float(v[k]), w, delta=0.005, msg=k)
        self.assertAlmostEqual(float(v['kcal']), 162.4, delta=0.5)
        self.assertAlmostEqual(d['water_exact'], 65.0, delta=0.05)                   # Khan 2019's measured water
        codes = {x['code']: x for x in d['lines']}
        self.assertEqual(codes['O064']['role'], 'removed')
        self.assertEqual((codes['N003']['g'], codes['N002']['g'], codes['T508']['g']), (50.0, 50.0, 16.0))
        self.assertEqual((codes['K505']['g'], codes['K505']['role']), (75.0, 'added'))
        self.assertEqual(d['confidence'], 'C')
        self.assertEqual((d['moisture_rule'], d['moisture_target_pct']), ('keep', Decimal('65.00')))   # the anchor's water

    def test_dal_makhani_osr139_simmered_to_cofid_water(self):
        # spec (i)6 (founder 2026-11-15): OSR139 as coded, oil as written, 74.7% water from CoFID 12-468
        d = self.der['dal_makhani_home']
        v = d['values']
        self.assertEqual({k: v[k] for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')},
                         dict(kcal=Decimal('110.40'), protein=Decimal('4.74'), carbs=Decimal('11.38'), fat=Decimal('4.38'),
                              fiber=Decimal('3.25')))
        self.assertAlmostEqual(d['water_exact'], 74.7, delta=0.005)
        self.assertEqual((d['moisture_rule'], d['cooking_class'], d['confidence']), ('keep', 'legume_curry', 'C'))
        self.assertEqual(d['moisture_target_pct'], Decimal('74.70'))                 # recorded, not NULL: the line was solved to it
        lines = {x['i']: x for x in d['lines']}
        # only the water line changes; every other OSR139 line ships as coded (B003 split urad, G554 dried ginger kept)
        self.assertEqual([x['i'] for x in d['lines'] if x['role'] != 'kept'], [19])
        water = lines[19]
        self.assertEqual((water['code'], water['g_as_written'], water['role']), ('K505', 960.0, 'edited'))
        self.assertAlmostEqual(water['g'], 534.96, delta=0.01)
        self.assertEqual((lines[0]['code'], lines[15]['code'], lines[20]['code'], lines[20]['g']), ('B003', 'G554', 'T501', 40.5))
        self.assertEqual(d['raw_w'], 1413.43)                                          # what goes into the pot
        self.assertAlmostEqual(d['evaporated_g'], 425.04, delta=0.01)
        self.assertEqual(d['yield_factor'], Decimal('0.70'))
        chk = next(c for c in d['checks'] if c['check'] == 'water_pct')
        self.assertTrue(chk['ok'])
        self.assertEqual(chk['anchor'], 'cofid_12_468_urad_dahl')
        self.assertNotIn('err_pct', d['referee'])                                     # a different dish: water only
        nin = d['cross_checks'][0]
        self.assertEqual((nin['anchor'], nin['grain_code'], nin['dry_grain_g']), ('nin_dhal_half_cup', 'B003+B020', 20))
        self.assertGreater(nin['kcal'], nin['reference_kcal'])                       # butter and cream: above plain dhal
        r = self.by_key['dal makhani']
        self.assertEqual((r['predecessor'], r['is_canonical']), ('6afbebf2-7c87-49ae-b9cc-32d74bc214ed', True))
        for k in ('dal makhni', 'daal makhani'):
            self.assertEqual(self.by_key[k]['values'], r['values'], k)
            self.assertEqual(self.by_key[k]['derivation_id'], r['derivation_id'], k)
            self.assertIsNone(self.by_key[k]['predecessor'])
            self.assertEqual((self.by_key[k]['kind'], self.by_key[k]['fallback']), ('new_key', r['predecessor']), k)

    def test_water_rule_only_simmers_down(self):
        others = [dict(g=100.0, water=50.0)]
        line = dict(code='K505', g=200.0, water=200.0)
        x = B.solve_water_pct(others, line, 0.75)
        self.assertAlmostEqual((50.0 + x) / (100.0 + x), 0.75, places=3)
        with self.assertRaises(SystemExit):                                           # wetter than written: refused
            B.solve_water_pct(others, dict(code='K505', g=50.0, water=50.0), 0.75)
        with self.assertRaises(SystemExit):                                           # only a plain water line
            B.solve_water_pct(others, dict(code='L002', g=200.0, water=176.0), 0.75)

    def test_pizza_is_sr173292_at_fdc_presentation(self):
        d = self.der['pizza_cheese_sr173292']
        v = d['values']
        self.assertEqual({k: v[k] for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')},
                         dict(kcal=Decimal('266'), protein=Decimal('11.4'), carbs=Decimal('33.3'), fat=Decimal('9.69'),
                              fiber=Decimal('2.3')))
        self.assertEqual(d['lines'][0]['description'], 'Fast Food, Pizza Chain, 14" pizza, cheese topping, regular crust')
        r = self.by_key['pizza']
        self.assertIsNone(r['fdc_id'])                                                # no fdc-keyed unit can attach
        self.assertEqual(r['source'], 'usda')
        units = [(u['unit'], float(u['grams'])) for u in self.plan['units'] if u['food_item_id'] == r['id']]
        self.assertEqual(units, [('slice', 110.0)])

    def test_energy_basis_is_stored_per_derivation(self):
        # the pizza copy's C is USDA's total carbohydrate and its kcal USDA's published energy; the recipe rows are FNP77
        self.assertTrue(self.der['pizza_cheese_sr173292']['energy_basis'].startswith('USDA SR Legacy as published'))
        for vk in ('upma_rava_labfat', 'poha_home_labfat', 'biryani_chicken_home', 'dal_makhani_home'):
            self.assertEqual(self.der[vk]['energy_basis'], 'FNP77:4P+9F+4CHOavl+2FIB', vk)
        sql = E.migration_sql(self.plan, self.sha)
        self.assertIn('base_per_100g, energy_basis, confidence', sql)
        self.assertIn("'USDA SR Legacy as published", sql)

    def test_sig3_is_fdc_presentation(self):
        self.assertEqual([str(B.sig3(x)) for x in ('10.85', '11.25', '11.73', '8.97', '266', '2.30', '33.33')],
                         ['10.8', '11.2', '11.7', '8.97', '266', '2.3', '33.3'])

    def test_key_copies_carry_their_source_numbers_unchanged(self):
        rows = {r['id']: r for r in self.plan['snapshot']['rows']}
        for key, src in (('rajma', '7653a3be'), ('rajma curry', '7653a3be'), ('aloo sabzi', '1abbe3e2'),
                         ('aalu ki sabzi', '1abbe3e2'), ('bhindi sabzi', 'cd15763a'), ('bhindi sabji', 'cd15763a')):
            r = self.by_key[key]
            s = next(x for i, x in rows.items() if i.startswith(src))
            self.assertEqual(r['values'], B.values_of(s), key)
            self.assertEqual(r['derivation_id'], s['derivation_id'], key)            # the 053 derivation, reused
            self.assertIsNone(r['predecessor'])
            self.assertEqual(r['fallback'], s['id'])
        self.assertEqual(float(self.by_key['rajma']['values']['kcal']), 66.76)
        self.assertEqual(float(self.by_key['aloo sabzi']['values']['kcal']), 115.46)
        self.assertEqual(float(self.by_key['bhindi sabzi']['values']['kcal']), 141.28)

    # energy convention ─────────────────────────────────────────────────────────────────────────────────────
    def test_recalculated_rows_follow_the_energy_rule(self):
        for r in self.plan['new_rows']:
            if r['method'] != 'recipe_edit':
                continue
            v = r['values']
            e = 4 * v['protein'] + 9 * v['fat'] + 4 * v['carbs'] + 2 * v['fiber']
            self.assertLessEqual(abs(v['kcal'] - e), Decimal('0.5'), r['key'])

    def test_every_row_passes_rules_v1(self):
        for r in self.plan['new_rows']:
            self.assertEqual(emit53.food_item_issues_py(r['source'], r['name'], r['values']), [], r['key'])

    # keys and ids ──────────────────────────────────────────────────────────────────────────────────────────
    def test_keys_are_the_approved_set(self):
        self.assertEqual(sorted(self.by_key), sorted([
            'rajma', 'rajma curry', 'aloo sabzi', 'aloo ki sabzi', 'aloo sabji', 'aalu ki sabzi', 'bhindi sabzi',
            'bhindi ki sabzi', 'bhindi sabji', 'upma', 'rava upma', 'semolina upma suji rava upma', 'biryani',
            'chicken biryani', 'pizza', 'poha', 'dal makhani', 'dal makhni', 'daal makhani']))
        for k in self.by_key:
            self.assertEqual(R.norm_key(k), k)

    def test_ids_are_uuidv5_recalc_v2(self):
        for r in self.plan['new_rows']:
            self.assertEqual(r['id'], B.uid('recalc_v2', r['variant'], r['key']))
            self.assertNotEqual(r['id'], R.uid('recalc_v1', r['variant'], r['key']))
        for d in self.plan['derivations']:
            if not d.get('existing'):
                self.assertEqual(d['id'], B.uid('recalc_v2', d['variant_key']))
        self.assertEqual(self.by_key['pizza']['id'], 'bb72c009-df58-54ce-bf85-27d8dad3cc80')

    def test_portion_unit_ids_follow_lib_ts(self):
        # 054's own row for 7653a3be katori M, recomputed with the scripts/portions/lib.ts natural key
        self.assertEqual(B.pu_id('7653a3be-6680-578e-a90f-7dadf4b9898c', 'katori'), '825f4194-7304-587b-ab62-5a4e10c331e8')

    def test_superseded_rows_and_successors(self):
        olds = {o['old_id'][:8]: o for o in self.plan['old_rows']}
        self.assertEqual(sorted(olds), ['137f6250', '14a2b0ba', '6afbebf2', 'a6958211', 'd1146229'])
        self.assertEqual(olds['6afbebf2']['relation'], 'same_food_revised')
        self.assertEqual(olds['d1146229']['relation'], 'wrong_food_for_phrase')
        for o in self.plan['old_rows']:
            succ = next(r for r in self.plan['new_rows'] if r['id'] == o['new_id'])
            self.assertEqual(succ['key'], o['expect_key'])
            self.assertEqual(succ['predecessor'], o['old_id'])

    def test_aliases_that_equal_a_key_retire(self):
        self.assertEqual(sorted(a['alias'] for a in self.plan['aliases'] if a['kind'] == 'retire'),
                         ['aalu ki sabzi', 'aloo sabji', 'bhindi ki sabzi', 'rajma', 'upma'])
        for a in self.plan['aliases']:
            self.assertIn(a['alias'], self.by_key)
            self.assertEqual(self.by_key[a['alias']]['id'], a['target'])

    def test_every_phrase_variant_normalizes_to_its_key(self):
        ph = E.phrases(self.plan)
        self.assertEqual(len(ph), 4 * len(self.plan['new_rows']))                    # key, Title, SHOUTED!, padded
        self.assertIn(('  RAJMA  ', 'rajma', self.by_key['rajma']['id']), ph)
        for p, k, i in ph:
            self.assertEqual(R.norm_key(p), k)
            self.assertEqual(self.by_key[k]['id'], i)

    # rollback fallbacks ─────────────────────────────────────────────────────────────────────────────────────
    def test_every_new_row_has_a_rollback_fallback(self):
        # the down script moves a memory pointer to the row's fallback instead of dropping it (user-taught portions kept)
        want = {'upma': '137f6250', 'rava upma': '137f6250', 'chicken biryani': 'a6958211', 'dal makhni': '6afbebf2',
                'daal makhani': '6afbebf2'}
        for k, f in want.items():
            self.assertEqual((self.by_key[k]['kind'], self.by_key[k]['fallback'][:8]), ('new_key', f), k)
        for r in self.plan['new_rows']:
            self.assertIsNotNone(r['fallback'], r['key'])
        down = E.rollback_sql(self.plan, self.sha)
        self.assertNotIn('DELETE FROM public.user_food_memory', down)                # nothing has nowhere to go

    def test_wrong_food_memory_is_refused(self):
        snap = json.loads(json.dumps(self.plan['snapshot']))
        snap['memory']['d1146229-34b7-46ab-a28f-42cb826d1157'] = 1                    # a pointer at the home pizza
        with self.assertRaises(SystemExit):
            B.build_plan(self.book, self.lab, self.anchors, snap)

    # portions ───────────────────────────────────────────────────────────────────────────────────────────────
    def test_portions_per_spec_i(self):
        want = {'rajma': [('katori', 150), ('bowl', 240), ('cup', 240)], 'aloo sabzi': [('katori', 120)],
                'bhindi sabzi': [('katori', 110)], 'upma': [('plate', 150)], 'poha': [('plate', 150)],
                'pizza': [('slice', 110)], 'biryani': [('plate', 300), ('plate', 450)],
                'chicken biryani': [('plate', 300), ('plate', 450)],
                'dal makhani': [('katori', 150), ('bowl', 240), ('cup', 240)],
                'dal makhni': [('katori', 150), ('bowl', 240), ('cup', 240)],
                'daal makhani': [('katori', 150), ('bowl', 240), ('cup', 240)]}
        for key, units in want.items():
            r = self.by_key[key]
            got = sorted((u['unit'], float(u['grams'])) for u in self.plan['units'] if u['food_item_id'] == r['id'])
            self.assertEqual(got, sorted((a, float(b)) for a, b in units), key)
        # a key copy serves what its source serves: aloo / bhindi sources have no food-level unit, so their copies set no
        # no-amount default (the category's 150 g sabzi serving answers, as for the source); rajma's source has its katori
        for key in ('aloo sabzi', 'aloo ki sabzi', 'aloo sabji', 'aalu ki sabzi', 'bhindi sabzi', 'bhindi ki sabzi', 'bhindi sabji'):
            r = self.by_key[key]
            self.assertFalse(r['food_default'], key)
            self.assertEqual([u['is_default'] for u in self.plan['units'] if u['food_item_id'] == r['id']], [False], key)
        for key in ('rajma', 'rajma curry', 'dal makhani', 'upma', 'poha', 'biryani', 'pizza'):
            r = self.by_key[key]
            self.assertEqual(sum(1 for u in self.plan['units'] if u['food_item_id'] == r['id'] and u['is_default']
                                 and u['context'] is None), 1, key)
        # source_ref carries each unit's own approval date (spec (i)6 is 2026-11-15)
        for u in self.plan['units']:
            want_ref = 'founder:2026-11-15' if u['approved_by'].startswith('founder 2026-11-15') else 'founder:2026-11-13'
            self.assertEqual(u['source_ref'], want_ref)
        self.assertEqual({u['source_ref'] for u in self.plan['units'] if u['food_item_id'] == self.by_key['dal makhni']['id']},
                         {'founder:2026-11-15'})
        rest = [u for u in self.plan['units'] if u['food_item_id'] == self.by_key['biryani']['id'] and u['context']]
        self.assertEqual([(u['context'], float(u['grams']), u['is_default']) for u in rest], [('restaurant', 450.0, True)])
        cats = {c['food_item_id']: c['category'] for c in self.plan['category_map']}
        self.assertEqual({k: cats[r['id']] for k, r in self.by_key.items() if k in want},
                         {'rajma': 'liquid_dish', 'aloo sabzi': 'dry_sabzi', 'bhindi sabzi': 'sabzi_bhindi', 'upma': 'poha_upma',
                          'poha': 'poha_upma', 'pizza': 'pizza', 'biryani': 'biryani', 'chicken biryani': 'biryani',
                          'dal makhani': 'liquid_dish', 'dal makhni': 'liquid_dish', 'daal makhani': 'liquid_dish'})

    # safety ─────────────────────────────────────────────────────────────────────────────────────────────────
    def test_sql_never_writes_history_and_locks_inside_a_do_block(self):
        sql = E.migration_sql(self.plan, self.sha)
        self.assertEqual(emit53.history_writes(sql), [])
        self.assertEqual(emit53.history_writes(E.rollback_sql(self.plan, self.sha)), [])
        top = [l for l in sql.splitlines() if l.startswith('LOCK TABLE')]
        self.assertEqual(top, [])                                                     # 25P01 outside a block
        i_lock = sql.index('DO $locks$')
        self.assertLess(sql.index('backup._backup_food_items_058'), i_lock)            # run-once guard first
        self.assertLess(i_lock, sql.index('CREATE TEMP TABLE _fp058'))
        self.assertIn('RAISE EXCEPTION \'058: rows changed since the snapshot', sql)

    def test_replay_is_decided_by_rows_and_053_marker_not_a_count(self):
        # pending 055 inserts 11,986 verified rows on a replay too, so a row-count bar would misread a replay
        sql = E.migration_sql(self.plan, self.sha)
        self.assertNotIn('< 1500', sql)
        self.assertIn("v_marker boolean := pg_catalog.to_regclass('backup._backup_food_items_053') IS NOT NULL", sql)
        self.assertIn('IF v_have = 0 AND NOT v_marker THEN', sql)
        self.assertIn('IF NOT v_marker THEN', sql)

    def test_key_checks_are_scoped_to_058s_rows(self):
        # pending 055's key-less verified rows must not block 058's apply, rollback or re-apply
        sql = E.migration_sql(self.plan, self.sha)
        down = E.rollback_sql(self.plan, self.sha)
        for text in (sql, down):
            self.assertNotIn("verified rows without a key', v_n", text)
            self.assertIn("status = 'verified' AND normalized_name IS NULL", text)
        self.assertIn('keyless_before', sql)
        self.assertIn('v_keyless', down)
        # and the down script's own completeness checks
        self.assertIn('portion_category_map rows left', down)
        self.assertIn('verified rows % (expected %)', down)
        self.assertIn('active food-scoped portion calibrations', down)
        self.assertIn('active food-scoped portion calibrations', sql)
        self.assertIn('memory pointers at superseded rows changed since the snapshot', sql)
        self.assertIn("p.relation <> 'wrong_food_for_phrase'", sql)

    def test_search_check_pass_header_follows_the_cases(self):
        with open(B.OUTPUTS['search_check'], encoding='utf-8') as fh:
            text = fh.read()
        self.assertIn('--   alias  11/11  ', text)
        self.assertIn('--   top1   >= 21/23  ', text)
        self.assertIn('--   top5   6/6   ', text)

    def test_053_output_is_untouched(self):
        # batch 2 hashes none of 053's inputs into 053, and edits none of 053's code: its committed file must be what
        # recalc.py generates (this is `recalc.py check` for the migration and rollback)
        book, lab, params, plan = R.load_all()
        out = R.render_all(book, lab, params, plan)
        for k in ('migration', 'rollback', 'derivations', 'search_check'):
            with open(R.OUTPUTS[k], encoding='utf-8') as fh:
                self.assertEqual(fh.read(), out[k], k)

    def test_committed_outputs_are_current(self):
        out = B.render_all(self.plan)
        for k, text in out.items():
            with open(B.OUTPUTS[k], encoding='utf-8') as fh:
                self.assertEqual(fh.read(), text, k)
        with open(os.path.join(B.DATA2, 'snapshot.sql'), encoding='utf-8') as fh:
            self.assertEqual(fh.read(), B.snapshot_sql())

    def test_deterministic(self):
        a = B.render_all(self.plan)
        b = B.render_all(B.build_plan(self.book, self.lab, self.anchors, B.read_json2('snapshot.json')))
        self.assertEqual(a, b)

    def test_drifted_snapshot_is_refused(self):
        snap = json.loads(json.dumps(self.plan['snapshot']))
        snap['key_holders'].append(dict(id='00000000-0000-0000-0000-000000000001', normalized_name='rajma', status='verified'))
        with self.assertRaises(SystemExit):
            B.build_plan(self.book, self.lab, self.anchors, snap)
        snap = json.loads(json.dumps(self.plan['snapshot']))
        snap['aliases'].append(dict(alias='chicken biryani', food_item_id=snap['rows'][0]['id'], note='x'))
        with self.assertRaises(SystemExit):
            B.build_plan(self.book, self.lab, self.anchors, snap)


class OfflineTests(unittest.TestCase):
    def test_snapshot_sql_is_read_only(self):
        sql = B.snapshot_sql()
        body = '\n'.join(l.split('--', 1)[0] for l in sql.splitlines())
        import re
        self.assertIsNone(re.search(r'\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b', body.upper()))
        self.assertEqual(body.count(';'), 1)                                       # one statement

    def test_solve_fat_share(self):
        others = [dict(g=100.0, water=50.0, F=1.0)]
        line = dict(g=10.0, water=0.0, F=9.99)
        x = B.solve_fat_share(others, line, 0.10)
        self.assertAlmostEqual((1.0 + 0.999 * x) / (50.0 + x), 0.10, places=3)


if __name__ == '__main__':
    unittest.main()
