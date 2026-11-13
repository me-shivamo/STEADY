"""Unit tests for scripts/recalc (migration 053). Standard library only:

    python3 -I -m unittest discover -s scripts/recalc/tests -v

They need the pinned sources in .cache/recalc/ (python3 -I scripts/recalc/recalc.py fetch) and are skipped,
loudly, without them. What they pin is spec §(d): the INDB rebuild is exact, the golden values hold, no
test-half lab dish leaks into the fitted parameters, keys and aliases never collide, the SQL never writes a
history table, and griddle dishes are refused deep-fry oil uptake.
"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import indb      # noqa: E402
import method as M  # noqa: E402
import recalc as R  # noqa: E402
import emit53 as E  # noqa: E402

READY = not indb.verify(quiet=True)
WHY = 'pinned sources missing: run python3 -I scripts/recalc/recalc.py fetch'


@unittest.skipUnless(READY, WHY)
class RecalcTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.book, cls.lab, cls.params, cls.plan = R.load_all()

    # §(d) reproduce all 1,014 INDB recipes x 5 nutrients at 2 dp
    def test_indb_rebuild_is_exact(self):
        ex, n, bad = indb.reproduction_report(self.book.fct, self.book.rec, self.book.pub)
        self.assertEqual(n, 1014)
        self.assertEqual(bad, [])
        self.assertEqual(ex, 1014)

    def test_overrides_rederive_from_indb(self):
        ov = indb.fit_overrides(self.book.rec, self.book.pub)
        have = {k: {kk: vv for kk, vv in v.items() if kk in indb.NUTS} for k, v in indb.load_overrides().items()}
        self.assertEqual(ov, have)

    # §(d) golden values (kcal per 100 g, 4P + 9F + 4C + 2fib), ±0.5
    def test_golden_values(self):
        P = R.prod_params(self.params)
        der = {d['variant_key']: d for d in self.plan['derivations']}
        roti_written = float(R.per100_from(M.predict(self.book, 'ASC096', 'flatbread_dry', P))['kcal'])
        self.assertAlmostEqual(roti_written, 261, delta=0.5)                      # spec's "roti 261"
        self.assertAlmostEqual(float(der['roti_plain']['values']['kcal']), 244.09, delta=0.5)   # shipped phulka
        self.assertAlmostEqual(float(der['poori']['values']['kcal']), 361, delta=0.5)
        self.assertAlmostEqual(float(der['dal_moong_washed']['values']['kcal']), 67, delta=0.5)
        self.assertAlmostEqual(float(der['chai_standard']['values']['kcal']), 61, delta=0.5)   # chai per 120 ml cup

    def test_founder_decision_values(self):
        der = {d['variant_key']: d for d in self.plan['derivations']}
        self.assertEqual(der['dal_mixed']['indb_code'], 'ASC155')                      # decision 1
        self.assertEqual(der['dal_mixed']['moisture_target_pct'], R.Decimal('84.30'))
        self.assertTrue(66 <= float(der['curry_rajma']['values']['kcal']) <= 75)       # decision 2
        self.assertTrue(66 <= float(der['curry_chole']['values']['kcal']) <= 75)
        self.assertNotIn('T506', [l['code'] for l in der['roti_plain']['lines'] if l['role'] == 'kept'])  # decision 3
        self.assertEqual(float(der['rice_white_usda168930']['values']['kcal']), 130.0)  # decision 4
        chai = float(der['chai_standard']['values']['kcal'])                           # decision 5, re-based 11-13
        self.assertTrue(60 <= chai <= 62, chai)
        roti_rows = [r for r in self.plan['new_rows'] if r['variant'] == 'roti_plain']
        self.assertEqual(sorted(r['key'] for r in roti_rows), ['chapati', 'chapati roti', 'phulka', 'roti', 'wheat roti'])
        for r in roti_rows:
            g = 30 if r['key'] == 'phulka' else 40                                     # 11-13: phulka 30 g
            self.assertEqual(r['portions'], [{'description': '1 piece', 'gramWeight': g}], r['key'])
        rice_rows = [r for r in self.plan['new_rows'] if r['variant'] == 'rice_white_usda168930']
        self.assertEqual(len(rice_rows), 6)
        self.assertTrue(all(r['portions'] == R.RICE_PORTIONS for r in rice_rows))

    # §(d) no test-half lab id appears in the parameters fitted for that fold
    def test_no_test_lab_id_in_fold_params(self):
        for tag in ('A', 'B'):
            f = self.params['fold_' + tag]
            test = set(f['test_ids'])
            self.assertFalse(test & set(f['calibration_ids']))
            self.assertFalse(test & set(f['alpha_rows']))
            self.assertEqual(test, {l for l in self.lab.matched if self.lab.fold_of(l) == tag})

    def test_frozen_split_matches_the_rule(self):
        fold = M.make_split(self.book, self.lab)
        self.assertEqual(fold, {l: self.lab.fold_of(l) for l in self.lab.matched})

    def test_calibration_reproduces_params(self):
        self.assertEqual(R.dumps(R.build_params(self.book, self.lab)), R.dumps(self.params))
        s = self.params['scores']['pooled']
        self.assertLessEqual(s['recalc']['med_abs'], R.GATES['pooled_med_abs'])
        self.assertLessEqual(abs(s['recalc']['mean_signed']), R.GATES['pooled_abs_bias'])

    # §(d) aliases and keys never overlap
    def test_aliases_and_keys_never_overlap(self):
        keys = {r['key'] for r in self.plan['new_rows']}
        keys |= {r['key'] for r in self.plan['snapshot']['rows'] if r['status'] == 'verified'}
        new_aliases = {a['alias'] for a in self.plan['aliases'] if a['kind'] == 'insert'}
        self.assertFalse(keys & new_aliases)
        self.assertEqual(len({r['key'] for r in self.plan['new_rows']}), len(self.plan['new_rows']))
        # the 052 reordered-words rule: an alias follows its row to that row's OWN successor
        succ = self.plan['successor']
        for a in self.plan['aliases']:
            if a['kind'] == 'repoint':
                self.assertEqual(a['target'], succ[a['expect']])

    # §(d) the SQL contains no write to food_entries, saved_entries or daily_*
    def test_sql_never_writes_history(self):
        sha = R.inputs_sha256()
        self.assertEqual(E.history_writes(E.migration_sql(self.plan, self.params, sha)), [])
        self.assertEqual(E.history_writes(E.rollback_sql(self.plan, sha)), [])
        self.assertTrue(E.history_writes('UPDATE public.food_entries SET calories = 0;'))   # the detector works
        self.assertTrue(E.history_writes('delete from daily_summaries;'))

    # §(d) griddle dishes are refused deep-fry oil uptake
    def test_griddle_dish_with_frying_oil_is_refused(self):
        P = R.prod_params(self.params)
        self.assertTrue(any(x['fry'] for x in M.parts(self.book, 'ASC148')), 'uttapam carries a frying-oil line')
        with self.assertRaises(SystemExit):
            M.predict(self.book, 'ASC148', 'batter_griddle', P)

    def test_frying_oil_is_dropped_and_absorbed_oil_added(self):
        d = next(x for x in self.plan['derivations'] if x['variant_key'] == 'poori')
        self.assertTrue(any(l['role'] == 'frying_oil_removed' for l in d['lines']))
        self.assertGreater(d['absorbed_oil_g'], 0)
        self.assertAlmostEqual(d['fat_components']['ingredient'] + d['fat_components']['added'],
                               float(d['values']['fat']), delta=0.02)

    def test_every_new_row_passes_rules_v1(self):
        for r in self.plan['new_rows']:
            self.assertEqual(E.food_item_issues_py(r['source'], r['name'], r['values']), [], r['name'])

    def test_quarantine_only_rows_really_count_frying_oil(self):
        for o in self.plan['old_rows']:
            if o['kind'] == 'quarantine_only' and o['why'] == 'frying_oil_counted':
                self.assertEqual(self.book.regime(o['row']['external_id']), 'C_all_frying_oil_counted')

    # §(d) deterministic: same inputs -> byte-identical outputs; ids are UUIDv5 of recalc_v1|variant|key
    def test_deterministic_outputs(self):
        a = R.render_all(self.book, self.lab, self.params, self.plan)
        b = R.render_all(self.book, self.lab, self.params, R.build_plan(self.book, self.lab, self.params,
                                                                        self.plan['snapshot']))
        self.assertEqual(a, b)
        r = next(x for x in self.plan['new_rows'] if x['key'] == 'roti')
        self.assertEqual(r['id'], R.uid('recalc_v1', 'roti_plain', 'roti'))
        self.assertEqual(E.search_check(a['search_check'], self.plan), a['search_check'])   # idempotent rewrite

    # 2026-11-13 review fixes ────────────────────────────────────────────────────────────────────────
    def test_locks_come_first_in_account_deletion_order(self):
        """Account deletion locks profiles -> food_items -> history -> memory; 053 and its down script must
        take food_items first (before §1's foreign key to it, too) or the two can deadlock."""
        sha = R.inputs_sha256()
        mig = E.migration_sql(self.plan, self.params, sha)
        body = mig[mig.index('$pre$;'):]
        order = [m.group(1) for m in E.re.finditer(r'^\s*LOCK TABLE public\.(\w+)', body, E.re.M)]
        self.assertEqual(order, ['food_items', 'food_entries', 'user_food_memory', 'food_aliases'])
        self.assertLess(body.index('LOCK TABLE public.food_items'), body.index('CREATE TABLE'))
        rb = E.rollback_sql(self.plan, sha)
        self.assertEqual([m.group(1) for m in E.re.finditer(r'^\s*LOCK TABLE public\.(\w+)', rb, E.re.M)],
                         ['food_items', 'food_entries', 'user_food_memory', 'food_aliases'])

    def test_rollback_drops_pointers_without_a_verified_predecessor_first(self):
        """The 7 fried successors replaced already-quarantined rows; the memory trigger refuses a pointer back
        to them, which used to abort the whole down script. They (and the no-predecessor rows) are dropped
        BEFORE the move-back UPDATE."""
        rb = E.rollback_sql(self.plan, R.inputs_sha256())
        drop = rb.index("down: memory pointers at 053 rows with no verified predecessor dropped")
        move = rb.index("down: memory pointers returned to the superseded rows")
        self.assertLess(drop, move)
        self.assertIn("b.id = r.old_id AND b.status = 'verified'", rb[:drop])
        fried_pred_quarantined = [o for o in self.plan['old_rows']
                                  if o['kind'] == 'supersede' and o['expect_status'] == 'quarantined']
        self.assertGreaterEqual(len(fried_pred_quarantined), 6)

    def test_rollback_restores_only_what_053_dropped(self):
        rb = E.rollback_sql(self.plan, R.inputs_sha256())
        i = rb.index('INSERT INTO public.user_food_memory')
        block = rb[i:rb.index("down: memory pointers dropped by 053 restored")]
        q_only = [o['old_id'] for o in self.plan['old_rows'] if o['kind'] == 'quarantine_only']
        for oid in q_only:
            self.assertIn(oid, block)
        self.assertIn('FROM public.profiles p WHERE p.id = b.user_id', block)          # account deleted -> skip
        self.assertIn('m.user_id = b.user_id AND m.normalized_name = b.normalized_name', block)

    def test_chawal_becomes_a_key_and_its_alias_retires(self):
        """fts mode reads keys only; after 053 the name search for 'chawal' found no plain rice (review)."""
        row = next(r for r in self.plan['new_rows'] if r['key'] == 'chawal')
        ref = next(x for x in self.plan['snapshot']['rows'] if x['id'].startswith('5f20d673'))
        self.assertEqual((row['values']['kcal'], row['portions']), (R.Decimal(ref['kcal']), R.RICE_PORTIONS))
        ret = [a for a in self.plan['aliases'] if a['kind'] == 'retire']
        ph = next(r for r in self.plan['new_rows'] if r['key'] == 'phulka')
        self.assertEqual([(a['alias'], a['target'], a['expect']) for a in ret],
                         [('chawal', row['id'], ref['id']), ('phulka', ph['id'], 'b84a7f73-62d6-4a46-b24a-3b2ded14dc45')])
        self.assertEqual(E.fts_after(self.plan, 'chawal'), ('exact', [row['id']]))
        self.assertNotIn('chawal rice', {r['key'] for r in self.plan['new_rows']})   # one key: no duplicate rows
        sha = R.inputs_sha256()
        self.assertIn("a.kind = 'retire' AND fa.alias = a.alias AND fa.food_item_id = a.expect_target",
                      E.migration_sql(self.plan, self.params, sha))
        self.assertIn("aliases 053 retired", E.rollback_sql(self.plan, sha))

    def test_fts_mode_still_offers_the_chai_row(self):
        chai = next(r['id'] for r in self.plan['new_rows'] if r['key'] == 'tea')
        kind, ids = E.fts_after(self.plan, 'chai')
        self.assertEqual(kind, 'name search')
        self.assertIn(chai, ids)
        self.assertEqual(E.fts_after(self.plan, 'tea'), ('exact', [chai]))

    def test_repointed_aliases_say_what_they_serve_now(self):
        rc = next(a for a in self.plan['aliases'] if a['alias'] == 'roti chapati')
        self.assertTrue(rc['note'].endswith('; 053: now 223963c6 (244.09 kcal/100 g, 1 piece = 40 g)'), rc['note'])
        rice = next(a for a in self.plan['aliases'] if a['alias'] == 'rice')
        self.assertTrue(rice['note'].endswith('; 053: now d4043769 (130 kcal/100 g, 1 cup = 158 g)'), rice['note'])

    def test_referee_describes_the_row_that_ships(self):
        """Lab-anchored rows ship at the anchor's water; the 'production' error must be that row's, not the
        class-average rebuild (sabudana khichdi was reported +85.9% for a row that is +4.9%)."""
        der = {d['variant_key']: d for d in self.plan['derivations']}
        for vk in ('sabudana_khichdi', 'pulao_mixed_veg', 'pakora_onion', 'khichdi_plain'):
            r = der[vk]['referee']
            v = der[vk]['values']
            e = 4 * float(v['protein']) + 9 * float(v['fat']) + 4 * (float(v['carbs']) + float(v['fiber']))
            self.assertAlmostEqual(r['production_err_pct'], (e / r['lab_kcal'] - 1) * 100, delta=0.2, msg=vk)
            self.assertIn('anchor', r['production_basis'])
        self.assertLess(abs(der['sabudana_khichdi']['referee']['production_err_pct']), 10)

    def test_validate_gates_the_shipped_piece_and_the_founder_roti_value(self):
        fails, notes = R.validate(self.book, self.lab, self.params, self.plan, quiet=True)
        self.assertEqual(fails, [])
        self.assertTrue(any(n.startswith('piece roti_plain, SHIPPED portion') and n.endswith('pass') for n in notes))
        self.assertTrue(any(n.startswith('founder value roti_plain') and n.endswith('pass') for n in notes))
        self.assertTrue(any(n.startswith('founder value chai_standard') and n.endswith('pass') for n in notes))
        self.assertEqual(sum(n.startswith('piece roti_plain, SHIPPED portion') for n in notes), 2)   # 40 g and 30 g
        self.assertEqual(sum(n.startswith('founder portions ') and n.endswith('pass') for n in notes),
                         len(R.FOUNDER_PORTIONS))

    def test_named_dal_templates_are_consistent(self):
        der = {d['variant_key']: d for d in self.plan['derivations']}
        whole = [float(der[k]['values']['kcal']) for k in ('dal_moong_whole', 'dal_masoor_whole', 'dal_moth_whole',
                                                            'dal_urad_whole')]
        self.assertLess(max(whole) - min(whole), 3.0, whole)                 # one template, one thickness
        self.assertNotIn('khichdi_rice_dal_porridge', der)                   # sweet porridge held back

    # founder decisions of 2026-11-13 (portions) ────────────────────────────────────────────────────────
    def test_chai_is_rebased_per_120_ml_cup(self):
        d = next(x for x in self.plan['derivations'] if x['variant_key'] == 'chai_standard')
        self.assertEqual([(l['code'], l['g']) for l in d['lines']], [('L002', 60.0), ('K505', 60.0), ('I502', 8.0),
                                                                     ('V510', 0.0)])
        self.assertEqual(d['batch_g'], 128.0)
        tea = next(r for r in self.plan['new_rows'] if r['key'] == 'tea')
        self.assertEqual(tea['portions'], R.CHAI_PORTIONS)
        self.assertEqual(tea['portions'][0], {'description': '1 cup', 'gramWeight': 128})     # the whole recipe
        self.assertAlmostEqual(float(tea['values']['kcal']) * 1.28, 77.5, delta=1.0)          # ~78 a cup (NIN 75)
        al = {a['alias']: a['target'] for a in self.plan['aliases'] if a['kind'] == 'insert'}
        self.assertEqual({k: al[k] for k in ('chai', 'masala chai', 'milk tea')},
                         dict.fromkeys(('chai', 'masala chai', 'milk tea'), tea['id']))

    def test_every_rice_row_and_the_rice_alias_carry_the_new_cup(self):
        """1 cup = 158 g on every rice key; the 052 'rice' alias row is superseded (053 edits no row in place) and
        the alias follows it to a copy row with the same numbers and the new portions."""
        old = next(o for o in self.plan['old_rows'] if o['old_id'].startswith('5f20d673'))
        self.assertEqual((old['kind'], old['relation'], old['expect_key']),
                         ('supersede', 'same_food_revised', 'cooked white rice'))
        succ = next(r for r in self.plan['new_rows'] if r['id'] == old['new_id'])
        self.assertEqual((succ['key'], succ['portions'][0]), ('cooked white rice', {'description': '1 cup', 'gramWeight': 158}))
        self.assertTrue(succ['is_canonical'])
        src = old['row']
        self.assertEqual([succ['values'][k] for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')],
                         [R.Decimal(src[k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')])
        for a in ('rice', 'white rice', 'steamed rice', 'chawal rice', 'chawal cooked rice'):
            al = next(x for x in self.plan['aliases'] if x['alias'] == a)
            self.assertEqual((al['kind'], al['target']), ('repoint', succ['id']), a)
        for r in self.plan['new_rows']:
            if r['variant'] == 'rice_white_usda168930':
                self.assertEqual(E.correct_portion('1 cup', r['portions']), 158, r['key'])
        pc = next(p for p in self.plan['portion_changes'] if p['food_item_id'] == succ['id'])
        self.assertEqual((pc['before'], pc['approved_by']), (src['portions'], 'founder 2026-11-13'))
        mig = E.migration_sql(self.plan, self.params, R.inputs_sha256())
        self.assertIn("verified FDC 168930 rows with other portions", mig)
        self.assertIn("WHERE r.id NOT IN (SELECT old_id FROM _plan053)", mig)     # a superseded copy source

    def test_dal_family_carries_the_katori_and_the_bowl(self):
        cls = {d['id']: d['cooking_class'] for d in self.plan['derivations']}
        dal = [r for r in self.plan['new_rows'] if cls[r['derivation_id']] == 'legume_curry']
        self.assertGreaterEqual(len(dal), 20)
        self.assertTrue({'dal', 'daal', 'dal tadka', 'mixed dal', 'moong dal', 'chana dal', 'sambar', 'chole',
                         'kidney bean curry rajmah curry', 'chickpeas curry safed channa curry'} <= {r['key'] for r in dal})
        pcs = {p['food_item_id']: p for p in self.plan['portion_changes']}
        for r in dal:
            self.assertEqual(r['portions'], R.DAL_PORTIONS, r['key'])
            self.assertEqual(r['portions'][0], {'description': '1 katori', 'gramWeight': 150})
            self.assertEqual(pcs[r['id']]['approved_by'], 'founder 2026-11-13', r['key'])
            self.assertEqual(E.correct_portion('1 bowl', r['portions']), 240)       # bowl -> "1 bowl (1 cup)"
            self.assertIsNone(E.correct_portion('1 katori', r['portions']))         # not a resolver unit (Phase 5)

    def test_phulka_has_its_own_key_and_piece(self):
        roti = next(r for r in self.plan['new_rows'] if r['key'] == 'roti')
        ph = next(r for r in self.plan['new_rows'] if r['key'] == 'phulka')
        self.assertEqual((ph['predecessor'], ph['derivation_id'], ph['values']), (None, roti['derivation_id'], roti['values']))
        self.assertEqual(ph['portions'], [{'description': '1 piece', 'gramWeight': 30}])
        self.assertEqual(ph['id'], R.uid('recalc_v1', 'roti_plain', 'phulka'))
        self.assertIn('founder 2026-11-13', ph['key_reason'])
        self.assertEqual(E.fts_after(self.plan, 'phulka'), ('exact', [ph['id']]))     # fts mode reads keys only
        self.assertEqual(E.correct_portion('2 pieces', ph['portions']), 60)
        ret = next(a for a in self.plan['aliases'] if a['kind'] == 'retire' and a['alias'] == 'phulka')
        # the permanent note records what the 052 alias served BEFORE 053 (the USDA chapati row), not its successor
        self.assertIn('Before 053 the alias served b84a7f73 (299 kcal/100 g, 1 piece = 43 g)', ret['note'])
        self.assertIn(f"({roti['values']['kcal']} kcal/100 g, 1 piece = 30 g; portions approved by founder 2026-11-13)",
                      ret['note'])
        rb = E.rollback_sql(self.plan, R.inputs_sha256())
        self.assertIn("WHERE b.alias IN ('chawal', 'phulka')", rb)                       # the down script restores it
        self.assertIn(('phulka', ph['id'], 'exact'), E.probes(self.plan))

    def test_chole_is_an_exact_key_on_a_copy_of_the_chickpea_curry(self):
        cc = next(r for r in self.plan['new_rows'] if r['key'] == 'chickpeas curry safed channa curry')
        ch = next(r for r in self.plan['new_rows'] if r['key'] == 'chole')
        self.assertEqual((ch['predecessor'], ch['derivation_id'], ch['values'], ch['portions']),
                         (None, cc['derivation_id'], cc['values'], R.DAL_PORTIONS))
        self.assertAlmostEqual(float(ch['values']['kcal']), 71.6, delta=0.1)
        self.assertEqual(E.fts_after(self.plan, 'chole'), ('exact', [ch['id']]))
        self.assertIn('founder 2026-11-13', ch['key_reason'])
        self.assertNotIn('chole', {a['alias'] for a in self.plan['aliases']})

    def test_portion_twin_matches_the_resolver_rules(self):
        """The Python twin of correctPortionFromMeasures (the jest test runs the real one on the same table)."""
        pm = {(x['key'], x['phrase']): x['grams'] for x in E.portion_matching(self.plan)}
        self.assertEqual(pm[('dal', '1 bowl')], 240)
        self.assertIsNone(pm[('dal', '1 katori')])
        self.assertEqual(pm[('tea', '1 cup')], 128)
        self.assertEqual(pm[('tea', '1 mug')], 128)            # mug folds into cup: the resolver cannot reach 200 g
        self.assertIsNone(pm[('tea', '1 cutting')])
        self.assertEqual(pm[('cooked rice', '1 cup')], 158)
        self.assertIsNone(pm[('cooked rice', '1 plate')])
        self.assertEqual(pm[('roti', '2 pieces')], 80)
        self.assertEqual(pm[('phulka', '1 piece')], 30)
        for ph in ('2 roti', '2 rotis', '3 chapati'):            # count + the food's own word: no unit, parser's guess
            self.assertIsNone(pm[('roti', ph)], ph)
        self.assertIsNone(pm[('phulka', '2 phulka')])           # so decision 4's 30 g needs "N pieces" (Phase 5)
        self.assertIsNone(E.correct_portion('200 ml', R.CHAI_PORTIONS))          # a measured amount is never corrected
        self.assertEqual(E.correct_portion('half bowl', R.DAL_PORTIONS), 120)

    def test_committed_outputs_are_current(self):
        out = R.render_all(self.book, self.lab, self.params, self.plan)
        for k, text in out.items():
            with open(R.OUTPUTS[k], encoding='utf-8') as fh:
                self.assertEqual(fh.read(), text, f'{k} is stale: run python3 -I scripts/recalc/recalc.py emit')


class OfflineTests(unittest.TestCase):
    """Run without the cache: pure helpers."""

    def test_round_half_up(self):
        self.assertEqual(str(R.d2(0.125)), '0.13')
        self.assertEqual(str(R.d2(2.675)), '2.68')

    def test_rules_twin_flags_frying_oil_dish(self):
        self.assertEqual(E.food_item_issues_py('indb', 'Khasta kachori',
                                               dict(kcal=713, protein=5, carbs=12, fat=72, fiber=2)), ['fat_dominant_dish'])
        self.assertEqual(E.food_item_issues_py('indb', 'Ghee', dict(kcal=880, protein=0, carbs=0, fat=99, fiber=0)), [])

    def test_snapshot_sql_is_read_only(self):
        sql = R.snapshot_sql()
        body = '\n'.join(l.split('--', 1)[0] for l in sql.splitlines()).upper()
        for word in ('INSERT ', 'UPDATE ', 'DELETE ', 'ALTER ', 'DROP ', 'CREATE ', 'TRUNCATE', 'GRANT ', 'COPY '):
            self.assertNotIn(word, body)


if __name__ == '__main__':
    unittest.main()
