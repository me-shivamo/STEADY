"""scripts/recalc/recalc.py — generator for migration 053 "recalculate Indian dishes" (recalc_v1).

  python3 -I scripts/recalc/recalc.py fetch [--seed DIR]   pinned INDB + IFCT files -> .cache/recalc/ (SHA-256 checked)
  python3 -I scripts/recalc/recalc.py verify               re-hash the cache, rebuild all 1,014 INDB recipes exactly,
                                                           re-derive data/overrides.json
  python3 -I scripts/recalc/recalc.py calibrate [--write]  both folds + the production refit -> data/params.json
  python3 -I scripts/recalc/recalc.py snapshot --sql       write data/snapshot.sql (a READ-ONLY query) from targets.csv
  python3 -I scripts/recalc/recalc.py snapshot --ingest F  turn the CLI output of that query into data/snapshot.json
  python3 -I scripts/recalc/recalc.py validate             every gate in spec §(e) that can run offline
  python3 -I scripts/recalc/recalc.py emit                 write the migration, the rollback, the review report,
                                                           out/derivations.json and the search-check expected ids
  python3 -I scripts/recalc/recalc.py check                regenerate everything in memory and diff it against the
                                                           committed files (exit 1 on any difference)

HOW THE PIECES FIT
  The INDB engine (indb.py) rebuilds INDB's published numbers from the raw recipe lines; the method (method.py)
  turns a recipe into the dish as served; this file turns founder decisions (data/targets.csv) plus a read-only
  snapshot of the live rows (data/snapshot.json) into ONE reviewed migration. The migration never computes a
  number: every value it writes is a literal generated here, so the SQL file is the complete, diffable record
  of what changes, and `check` proves the file is exactly what these inputs produce.

  The snapshot is taken by a person with the Supabase CLI (the script itself never connects to a database):
    python3 -I scripts/recalc/recalc.py snapshot --sql
    npx supabase db query --linked -o json -f scripts/recalc/data/snapshot.sql > <scratch>/snapshot_raw.json
    python3 -I scripts/recalc/recalc.py snapshot --ingest <scratch>/snapshot_raw.json

DETERMINISM: sorted output, fixed 2-dp decimals rounded half-up, UUIDv5 ids from recalc_v1|variant|key, no
  timestamps of our own (the snapshot's taken_at is an input). Same inputs -> byte-identical outputs.
"""
import csv
import hashlib
import json
import os
import sys
import uuid
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:          # python3 -I does not put the script's own directory on sys.path
    sys.path.insert(0, HERE)

import indb      # noqa: E402
import method as M  # noqa: E402

DATA = os.path.join(HERE, 'data')
REPO = indb.REPO
CALC = 'recalc_v1'
NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://steady.chat/food/recalc')   # fixed namespace for every 053 id
FOUNDER = 'founder 2026-11-12'
OUTPUTS = {
    'migration': os.path.join(REPO, 'supabase', 'migrations', '053_recalc_indian_v1.sql'),
    'rollback': os.path.join(REPO, 'supabase', 'rollback', '053_recalc_indian_v1_down.sql'),
    'report': os.path.join(REPO, 'docs', 'reviews', '053-recalc-indian-v1.md'),
    'derivations': os.path.join(HERE, 'out', 'derivations.json'),
    'search_check': os.path.join(REPO, 'scripts', 'eval', 'search-check.sql'),
}
INPUT_FILES = ['sources.json', 'overrides.json', 'lab.csv', 'lab_split.csv', 'targets.csv', 'params.json',
               'snapshot.json', 'custom_recipes.json']
CODE_FILES = ['indb.py', 'method.py', 'recalc.py', 'emit53.py']
RELATIONS = ('same_food_revised', 'wrong_state_for_phrase', 'wrong_food_for_phrase', 'new_variant')

# Gates (spec §(e)). The four pooled numbers are the spec's; "each shipped cooking type must pass on its own"
# is made concrete here, BEFORE looking at any shipped value: a class-average type passes at a pooled median
# |error| <= 25%; an anchor-only type (its dishes use their own lab moisture) passes when the recipe maths alone
# (error at the lab's moisture) is <= 15%; steamed batter ships at confidence C by founder decision and is
# reported, not gated; the one composite (aloo paratha) must be within 25% on its own lab dish.
GATES = dict(pooled_med_abs=22.0, pooled_abs_bias=10.0, pooled_fat_med_abs=3.0, recipe_maths_med_abs=10.0,
             class_med_abs=25.0, anchor_recipe_maths_med_abs=15.0, composite_dish_abs=25.0, piece_vs_nin=25.0,
             golden_tol=0.5)
GOLDEN = {  # spec §(d) golden values, kcal per 100 g on the 4P + 9F + 4C + 2fib convention, within ±0.5
    # roti_as_written is the spec's "roti 261" (INDB recipe with its 1 tsp ghee, report only). The shipped plain
    # phulka drops the ghee LINE and re-applies the dry-flatbread target moisture (35.3%): 244. The spec's "~239"
    # was a shortcut (fat mass subtracted from the cooked roti, which leaves it 1.2 points wetter than the class
    # target); the founder's decision is "plain phulka, no ghee, about 239", and dropping the line is the method.
    'roti_as_written': 261.48, 'roti_plain_shipped': 244.09, 'poori': 361, 'dal_moong_washed': 67,
    # chai re-based per 120 ml cup (founder 2026-11-13): 60 g milk + 60 g water + 8 g sugar, "about 61"
    'chai_standard': 60.54,
}
NIN_PIECE = [  # spec §(e)3: per-piece sanity vs NIN household values (kcal per piece)
    ('roti_plain', 'roti, INDB piece', None, 80.0, 'NIN phulka 80 kcal'),
    ('poori', 'poori, INDB piece', None, 80.0, 'NIN puri 80 kcal'),
]
# The same NIN reference against the piece users actually log: the stored portions[0] of every row whose variant
# carries an approved piece portion (the roti family, 1 piece = 40 g; its 'phulka' key, 1 piece = 30 g), gated per
# piece size. INDB's own piece (27 g) is what the spec gated, but a later portion change to 50 g (+53% vs NIN)
# would have passed it; this one would fail. Medu vada has no NIN household value in the repo's sources, so its
# piece is reported and stays ungated.
NIN_SHIPPED_PIECE = {'roti_plain': (80.0, 'NIN phulka 80 kcal')}
# Values the founder approved in words (spec §(h)); the shipped number must stay within FOUNDER_TOL of them, so a
# method change cannot drift away from the decision unnoticed. Roti: "plain phulka, about 239"; the shipped 244.09
# is +2.1% (the ghee LINE dropped, then the 35.3% class moisture re-applied; see GOLDEN), named in the report.
# Kept out of GATES on purpose: GATES is embedded in params.json, which `check` re-fits byte for byte.
FOUNDER_VALUES = {'roti_plain': (239.0, 'founder 2026-11-12: plain phulka "about 239"'),
                  'chai_standard': (61.0, 'founder 2026-11-13: chai re-based per 120 ml cup, "about 61 kcal/100 g"')}
FOUNDER_TOL = 3.0   # percent
# Portions the founder fixed (docs/research/reports/Indian portion sizes and cooking yields.md, "Migration 053 imports
# the US cup three times"). Every row of each family must carry exactly these, in this order (the first is the
# default serving), and its logged portion change must carry that approval, so a targets.csv edit cannot leave one
# key on the old US cup. 'legume_curry' = every dal and legume-curry row 053 ships, by cooking class; the others are
# by variant, and by key for phulka (a key wins over its variant, a variant over its class). `validate` gates it.
# Descriptions are chosen for the resolver as it is (macroResolver.ts correctPortionFromMeasures; Python twin
# emit53.correct_portion, checked against the real function by __tests__/unit/recalc053.test.ts): it folds
# bowl / cup / glass / mug into the FIRST portion whose description says "cup", and piece / slice / item / pc into the
# first that says piece / item / slice; katori, plate and cutting are no unit at all there (the parser's gram guess
# stands). So the dal bowl says "(1 cup)" to be reachable, and the chai mug must NOT say cup (it would shadow the
# 128 g cup or be shadowed by it). What each unit resolves to is in the review report (Phase 5 follow-ups).
FOUNDER_PORTIONS_BY = 'founder 2026-11-13'
DAL_PORTIONS = [{'description': '1 katori', 'gramWeight': 150}, {'description': '1 bowl (1 cup)', 'gramWeight': 240}]
RICE_PORTIONS = [{'description': '1 cup', 'gramWeight': 158}, {'description': '1 katori', 'gramWeight': 130},
                 {'description': '1 plate', 'gramWeight': 250}]
CHAI_PORTIONS = [{'description': '1 cup', 'gramWeight': 128}, {'description': '1 cutting', 'gramWeight': 75},
                 {'description': '1 mug', 'gramWeight': 200}]
FOUNDER_PORTIONS = {  # (kind, name) -> (portions, approved_by); kind 'class' | 'variant' | 'key'
    ('class', 'legume_curry'): (DAL_PORTIONS, FOUNDER_PORTIONS_BY),
    ('variant', 'rice_white_usda168930'): (RICE_PORTIONS, FOUNDER_PORTIONS_BY),
    ('variant', 'chai_standard'): (CHAI_PORTIONS, FOUNDER_PORTIONS_BY),
    ('variant', 'roti_plain'): ([{'description': '1 piece', 'gramWeight': 40}], FOUNDER),   # decision 3, kept 11-13
    ('key', 'phulka'): ([{'description': '1 piece', 'gramWeight': 30}], FOUNDER_PORTIONS_BY),
}


def founder_portions(row, cooking_class):
    """(family label, portions, approved_by) the founder fixed for this new row, or None."""
    for kind, name in (('key', row['key']), ('variant', row['variant']), ('class', cooking_class)):
        if (kind, name) in FOUNDER_PORTIONS:
            port, by = FOUNDER_PORTIONS[(kind, name)]
            return f'{kind} {name}', port, by
    return None


# ── small helpers ──────────────────────────────────────────────────────────────────────────────────
def d2(x):
    """Round half-up to 2 dp, as a Decimal (the only rounding used for stored values)."""
    return Decimal(repr(float(x))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def d1(x):
    return Decimal(repr(float(x))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)


def uid(*parts):
    return str(uuid.uuid5(NS, '|'.join(parts)))


def read_csv(name):
    with open(os.path.join(DATA, name), newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh))


def read_json(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as fh:
        return json.load(fh)


def dumps(obj):
    return json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=False, default=str) + '\n'


def inputs_sha256():
    h = hashlib.sha256()
    for name in INPUT_FILES:
        with open(os.path.join(DATA, name), 'rb') as fh:
            h.update(name.encode() + b'\0' + fh.read() + b'\0')
    for name in CODE_FILES:
        with open(os.path.join(HERE, name), 'rb') as fh:
            h.update(name.encode() + b'\0' + fh.read() + b'\0')
    return h.hexdigest()


def lab_obj():
    return M.Lab(read_csv('lab.csv'), read_csv('lab_split.csv'))


# ── calibration -> params.json ─────────────────────────────────────────────────────────────────────
def build_params(book, lab):
    res, prod = M.calibrate(book, lab)
    sc = M.scores(res)

    def fold(tag):
        r = res[tag]
        p = r['params']
        return dict(test_ids=r['test_ids'], calibration_ids=r['cal_ids'], alpha=round(p['alpha'], 6),
                    alpha_rows=p['alpha_rows'], w_star_pct={k: round(v * 100, 3) for k, v in sorted(p['w'].items())},
                    rule=dict(sorted(p['rule'].items())), rule_scores=p['rule_scores'])

    return dict(
        _note='Generated by `recalc.py calibrate --write`; `check` re-fits and fails on any drift. Folds: params '
              'fitted on calibration_ids only and scored on test_ids. production: refit on every lab dish, so after '
              'it the lab is no longer an independent referee for those dishes.',
        calc_version=CALC, energy_lab_convention='4P + 9F + 4(CHO + fibre)',
        energy_steady_convention='FNP77: 4P + 9F + 4 CHO_avl + 2 fibre',
        fold_A=fold('A'), fold_B=fold('B'),
        production=dict(lab_ids_used=sorted(lab.matched, key=int) + sorted(
                            (l for v in lab.unmatched.values() for l in v), key=int),
                        alpha=round(prod['alpha'], 6), alpha_rows=prod['alpha_rows'],
                        w_star_pct={k: round(v * 100, 3) for k, v in sorted(prod['w'].items())},
                        rule=dict(sorted(prod['rule'].items())), rule_scores=prod['rule_scores']),
        scores=sc, gates=GATES)


def prod_params(params):
    p = params['production']
    return dict(alpha=p['alpha'], w={k: v / 100 for k, v in p['w_star_pct'].items()}, rule=dict(p['rule']))


# ── derivations ────────────────────────────────────────────────────────────────────────────────────
def parse_drop(spec, book, code):
    out = []
    for part in filter(None, (spec or '').split(';')):
        i, fc = part.split(':')
        line = book.rec[code][int(i)]
        if line['food_code'] != fc:
            raise SystemExit(f'{code}: drop line {i} is {line["food_code"]}, targets.csv says {fc}')
        out.append(int(i))
    return tuple(out)


def custom_parts(book, spec):
    out = []
    for i, ln in enumerate(spec['lines']):
        fx = book.fct[ln['code']]
        g = float(ln['g'])
        nut = {k: g * (fx.get(src) or 0.0) / 100 for k, src in
               (('P', 'protein_g'), ('C', 'carb_g'), ('F', 'fat_g'), ('Fib', 'fibre_g'), ('kcal', 'energy_kcal'))}
        out.append(dict(i=i, code=ln['code'], name=fx['name'], text=ln['label'], g=g,
                        water=M.est_water_g(ln['code'], g, fx), fry=False, exposed=ln['code'][:1] not in 'TIK', **nut))
    return out


def per100_from(o):
    """Stored per-100 g values: macros rounded, then kcal recomputed from the ROUNDED macros so that
    kcal = 4P + 9F + 4C + 2fib holds exactly on the stored row."""
    p, c, f, fb = d2(o['P']), d2(o['C']), d2(o['F']), d2(o['Fib'])
    k = (4 * p + 9 * f + 4 * c + 2 * fb).quantize(Decimal('0.01'))
    return dict(kcal=k, protein=p, carbs=c, fat=f, fiber=fb, water=d2(o['water']))


def line_rows(book, code, drop, pr):
    kept = {x['i'] for x in pr['lines']}
    rows = []
    for x in M.parts(book, code):
        role = 'frying_oil_removed' if x['fry'] else ('dropped_by_variant' if x['i'] not in kept else 'kept')
        rows.append(dict(i=x['i'], code=x['code'], name=x['name'], as_written=x['text'], g=float(d2(x['g'])),
                         water_g=float(d2(x['water'])), role=role))
    return rows


def derive(book, lab, params, t, snap_rows):
    """One targets.csv row -> its derivation (numbers + full accounting)."""
    P = prod_params(params)
    m, ref = t['method'], t['recipe_ref']
    der = dict(variant_key=t['variant_key'], id=uid(CALC, t['variant_key']), calc_version=CALC, method=m,
               cooking_class=t['cooking_class'] or None, confidence=t['confidence'], review_note=t['review_note'],
               approved_by=t['approved_by'], energy_basis='FNP77:4P+9F+4CHOavl+2FIB')
    if m == 'copy_reference':
        src = snap_rows[t['canonical']]
        vals = dict(kcal=Decimal(src['kcal']), protein=Decimal(src['protein']), carbs=Decimal(src['carbs']),
                    fat=Decimal(src['fat']), fiber=Decimal(src['fiber']), water=None)
        der.update(recipe_ref=ref, method_sql='copy_reference', moisture_rule='asis', moisture_target_pct=None,
                   moisture_basis=f"copy:{src['id']}", yield_factor=None, alpha=None, frying_oil_removed_g=None,
                   values=vals, fat_components=dict(ingredient=float(vals['fat']), added=0.0, absorbed=0.0),
                   base_per_100g=None, lines=[dict(copy_of=src['id'], source=src['source'], name=src['name'],
                                                   external_id=src['external_id'], fdc_id=src['fdc_id'])],
                   referee=None, copy_source=src)
        return der
    if m == 'recipe_custom':
        spec = read_json('custom_recipes.json')[ref]
        ls = custom_parts(book, spec)
        t_ = M.comp_totals(ls)
        Wc = t_['W']
        s = 100.0 / Wc
        o = {k: t_[k] * s for k in ('P', 'C', 'F', 'Fib')}
        o['water'] = 100.0 * (1 - t_['S'] / Wc)
        vals = per100_from(o)
        der.update(recipe_ref=ref, method_sql='recipe_recalc', moisture_rule='keep', moisture_target_pct=None,
                   moisture_basis='keep:all listed water stays', yield_factor=Decimal('1.00'), alpha=None,
                   frying_oil_removed_g=None, values=vals,
                   fat_components=dict(ingredient=float(vals['fat']), added=0.0, absorbed=0.0), base_per_100g=None,
                   lines=[dict(i=x['i'], code=x['code'], name=x['name'], as_written=x['text'], g=float(d2(x['g'])),
                               water_g=float(d2(x['water'])), role='kept') for x in ls],
                   referee=None, e_indb_conv=float(d2(t_['kcal'] * s)), batch_g=float(d2(Wc)))
        return der
    code = ref.split(':', 1)[1]
    drop = parse_drop(t['drop_lines'], book, code)
    comps = M.parse_components(t['components'])
    basis = t['moisture_basis']
    w_override = None
    if basis.startswith('lab:'):
        lid = basis.split(':', 1)[1]
        w_override = float(lab.lab[lid]['water_g']) / 100
        if t['cooking_class'] not in M.ANCHOR_ONLY:
            raise SystemExit(f"{t['variant_key']}: lab anchors are only for {sorted(M.ANCHOR_ONLY)}")
    elif basis == 'class' and t['cooking_class'] in M.ANCHOR_ONLY - {'batter_steamed'}:
        raise SystemExit(f"{t['variant_key']}: {t['cooking_class']} failed the class-average test; anchor or keep")
    force = 'keep' if basis == 'keep' else None
    pr = M.predict(book, code, t['cooking_class'], P, components=comps, drop=drop, force_rule=force,
                   w_override=w_override)
    vals = per100_from(pr)
    fa = pr['fat_added_per100']
    base = None
    if fa > 0.005:
        bx = {k: (pr[k] - (fa if k == 'F' else 0.0)) * 100 / (100 - fa) for k in ('P', 'C', 'F', 'Fib')}
        bv = per100_from({**bx, 'water': pr['water']})
        base = dict(kcal=float(bv['kcal']), protein=float(bv['protein']), carbs=float(bv['carbs']),
                    fat=float(bv['fat']), fiber=float(bv['fiber']))
    rule = 'components' if comps else pr['components'][0]['rule']
    wt = pr['components'][0]['w_target'] if not comps else None
    mb = (f'lab:{basis.split(":", 1)[1]}' if basis.startswith('lab:') else
          'components:dough=class:flatbread_fat@recalc_v1,filling=keep' if comps else
          'keep:all listed water stays' if rule == 'keep' else f"class:{t['cooking_class']}@{CALC}")
    der.update(recipe_ref=f"INDB:{code}@{indb.load_sources()['indb_repo']['commit'][:7]}", method_sql='recipe_recalc',
               indb_code=code, indb_name=book.name(code), regime=pr['regime'], moisture_rule=rule,
               moisture_target_pct=d2(wt * 100) if wt is not None else None, moisture_basis=mb,
               yield_factor=d2(pr['yf']), alpha=Decimal(repr(P['alpha'])).quantize(Decimal('0.001'))
               if pr['A_g'] > 0 else None,
               frying_oil_removed_g=d2(pr['fry_removed_g']) if pr['fry_removed_g'] else None, values=vals,
               fat_components=dict(ingredient=float(d2(pr['F'] - fa)), added=float(d2(fa)),
                                   absorbed=float(d2(pr['A_per100']))),
               base_per_100g=base, lines=line_rows(book, code, drop, pr), components=[
                   {k: (float(d2(v)) if isinstance(v, float) else v) for k, v in c.items()} for c in pr['components']],
               raw_w=float(d2(pr['raw_w'])), kept_w=float(d2(pr['kept_w'])), cooked_w=float(d2(pr['Wc'])),
               absorbed_oil_g=float(d2(pr['A_g'])), e_indb_conv=float(d2(pr['E_indb_conv'])),
               indb_published=dict(kcal=float(d2(book.pub[code]['energy_kcal'])),
                                   protein=float(d2(book.pub[code]['protein_g'])),
                                   carbs=float(d2(book.pub[code]['carb_g'])), fat=float(d2(book.pub[code]['fat_g'])),
                                   fiber=float(d2(book.pub[code]['fibre_g']))),
               referee=referee(book, lab, params, code, pr, basis, bool(drop)))
    return der


def referee(book, lab, params, code, shipped, basis, dropped):
    """The lab dish that scores this recipe, if any: the held-out error (fold where it was a test dish) and the
    error of the row 053 SHIPS against that dish (not independent: the production fit saw every lab dish).

    WHY `shipped` is derive()'s own prediction and not a fresh lab_predict(): a lab-anchored dish ships at its
    anchor's water (w_override) and a variant may drop a line (plain roti drops the ghee), while lab_predict()
    rebuilds the recipe as written at the class-average moisture. The two differ a lot for anchored dishes
    (sabudana khichdi: +85.9% at the class moisture vs +4.9% for the row that ships), and the founder report and
    food_derivations.referee must describe the number users get. The held-out error stays the class rule fitted
    without this dish, the only independent score the lab can give."""
    hits = [l for l, (c, cls) in lab.matched.items() if c == code and cls != 'raw_asis']
    if not hits:
        return None
    lid = hits[0]
    S = lab.split[lid]
    tag = S['test_fold']
    fp = params['fold_' + tag]
    Pf = dict(alpha=fp['alpha'], w={k: v / 100 for k, v in fp['w_star_pct'].items()}, rule=fp['rule'])
    El = float(lab.lab[lid]['energy_kcal'])
    held = M.lab_predict(book, lab, lid, Pf)['E_lab']
    pub = book.pub[code]
    indb_E = 4 * pub['protein_g'] + 9 * pub['fat_g'] + 4 * (pub['carb_g'] + pub['fibre_g'])
    if basis.startswith('lab:'):
        anchor = basis.split(':', 1)[1]
        how = (f'shipped row at the lab {anchor} anchor moisture'
               + (' (this dish: recipe maths only)' if anchor == lid else ' (a different lab dish)'))
    elif basis == 'components':
        how = 'shipped row (dough at the production class moisture, filling kept as listed)'
    else:
        how = 'shipped row at the production class moisture'
    if dropped:
        how += ', variant with a recipe line dropped'
    return dict(lab_id=lid, lab_dish=lab.lab[lid]['dish'], match=S['match'], lab_kcal=El,
                lab_water_g=float(lab.lab[lid]['water_g']), lab_fat_g=float(lab.lab[lid]['fat_g']),
                test_fold=tag, heldout_err_pct=float(d1((held / El - 1) * 100)),
                production_err_pct=float(d1((shipped['E_lab'] / El - 1) * 100)),
                production_basis=how + '; not independent', indb_err_pct=float(d1((indb_E / El - 1) * 100)),
                convention='lab: 4P + 9F + 4(CHO + fibre)')


# ── plan: targets + snapshot -> rows to insert / quarantine, aliases, memory ───────────────────────
def norm_key(s):
    import re
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]|_', ' ', s.lower())).strip()


def parse_portions(s):
    if not s or s == 'inherit':
        return None
    return json.loads(s)


def fmt_portions(port):
    return ', '.join(f"{p['description']} = {p['gramWeight']:g} g" for p in port) if port else 'no portion'


def add_key_row(new_rows, portion_changes, t, dv, key, name, port, is_canonical, key_approved_by):
    """A row with no predecessor: an exact key nobody holds today, carrying derivation dv's numbers. Its portions
    are logged as a portion change (before = none) with the approval in t; the key itself with key_approved_by."""
    if norm_key(key) != key:
        raise SystemExit(f"{t['variant_key']}: new key {key!r} is not normalized")
    nid = uid(CALC, t['variant_key'], key)
    m = t['method']
    if m == 'copy_reference':
        src = dv['copy_source']
        source, ext, fdc = src['source'], src['external_id'], src['fdc_id']
    elif m == 'recipe_recalc':
        source, ext, fdc = 'indb', f"{dv['indb_code']}@{CALC}", None     # the same external_id as its copy rows
    else:
        source, ext, fdc = 'indb', t['recipe_ref'], None
    new_rows.append(dict(id=nid, variant=t['variant_key'], derivation_id=dv['id'], name=name, source=source,
                         external_id=ext, fdc_id=fdc, key=key, portions=port, values=dv['values'],
                         is_canonical=is_canonical, predecessor=None,
                         status_reason=f"reviewed:053:{CALC}:{t['variant_key']}",
                         key_reason=f'new key, approved by {key_approved_by}'))
    portion_changes.append(dict(food_item_id=nid, predecessor=None, before=None, after=port,
                                approved_by=t['portion_approved_by'], variant=t['variant_key']))
    return nid


def build_plan(book, lab, params, snap):
    targets = read_csv('targets.csv')
    rows = {r['id']: r for r in snap['rows']}
    aliases = {a['alias']: a for a in snap['aliases']}
    der, new_rows, old_rows, alias_ops, portion_changes, memory = [], [], [], [], [], []
    successor = {}
    for t in targets:
        m = t['method']
        if m == 'key_copy':
            continue                      # second pass below: it needs its variant's derivation and rows
        if m == 'quarantine_only':
            for part in t['supersedes'].split(';'):
                oid, why = part.split(':')
                r = rows[oid]
                old_rows.append(dict(old_id=oid, variant=t['variant_key'], kind='quarantine_only', new_id=None,
                                     relation=None, why=why, expect_key=r['key'], expect_status=r['status'],
                                     expect_kcal=r['kcal'], row=r,
                                     reason=f'reviewed:053:quarantine_only:{why}'))
            continue
        if m == 'alias_only':
            tgt = rows[t['canonical']]
            for a in t['new_aliases'].split('|'):
                alias_ops.append(dict(kind='insert', alias=a, target=tgt['id'], expect=None, variant=t['variant_key'],
                                      note=f"053 founder default; {t['review_note']}"))
            continue
        dv = derive(book, lab, params, t, rows)
        dv['search_check'] = t['search_check']
        der.append(dv)
        src_label = t['recipe_ref'].split(':', 1)[0]
        for part in filter(None, t['supersedes'].split(';')):
            oid, rel = part.split(':')
            assert rel in RELATIONS, rel
            r = rows[oid]
            key = r['key']
            nid = uid(CALC, t['variant_key'], key)
            successor[oid] = nid
            if m == 'copy_reference':
                src = dv['copy_source']
                source, ext, fdc = src['source'], src['external_id'], src['fdc_id']
            else:
                source, ext, fdc = 'indb', (f"{dv['indb_code']}@{CALC}" if m == 'recipe_recalc' else t['recipe_ref']), None
            port = parse_portions(t['portions'])
            if port is None:
                port = r['portions']
                if m == 'copy_reference' and t['portions'] == 'inherit':
                    port = r['portions']
            new = dict(id=nid, variant=t['variant_key'], derivation_id=dv['id'], name=r['name'], source=source,
                       external_id=ext, fdc_id=fdc, key=key, portions=port, values=dv['values'],
                       is_canonical=(oid == t['canonical']), predecessor=oid,
                       status_reason=f"reviewed:053:{CALC}:{t['variant_key']}",
                       key_reason=f'key taken over from {oid[:8]}')
            new_rows.append(new)
            old_rows.append(dict(old_id=oid, variant=t['variant_key'], kind='supersede', new_id=nid, relation=rel,
                                 expect_key=key, expect_status=r['status'], expect_kcal=r['kcal'], row=r,
                                 reason=f'reviewed:053:superseded:{rel}:{nid[:8]}'))
            if json.dumps(port, sort_keys=True) != json.dumps(r['portions'], sort_keys=True):
                if not t['portion_approved_by']:
                    raise SystemExit(f"{t['variant_key']}: portions change for {oid[:8]} without portion_approved_by")
                portion_changes.append(dict(food_item_id=nid, predecessor=oid, before=r['portions'], after=port,
                                            approved_by=t['portion_approved_by'], variant=t['variant_key']))
        # Rows with no predecessor: an exact key nobody holds today (new_key, '|'-separated, one new_name each).
        # The chai row is one ('tea'); the rice family adds 'chawal' as a copy row, because the fts resolver
        # (RESOLVER_SEARCH=fts, live today) reads exact keys only, never aliases, and its name search orders by
        # id: once 053 quarantined "Boiled rice (Uble chawal)" the commonest Hindi word for rice found curd rice /
        # rice kheer / sweet rice first and no plain rice at all (review 2026-11-13). A key works in every mode;
        # the 052 alias of the same word retires below (an alias equal to a key never fires). One key only: each
        # extra copy row with 'chawal' in its key is one more identical rice row in every ranked "X chawal" list.
        new_keys = [k for k in (t['new_key'] or '').split('|') if k]
        new_names = [k for k in (t['new_name'] or '').split('|') if k]
        if len(new_keys) != len(new_names):
            raise SystemExit(f"{t['variant_key']}: new_key and new_name need one name per key")
        for key, name in zip(new_keys, new_names):
            nid = add_key_row(new_rows, portion_changes, t, dv, key, name, parse_portions(t['portions']),
                              is_canonical=(t['canonical'] == 'new'), key_approved_by=t['approved_by'])
        if m == 'recipe_custom':
            for a in filter(None, t['new_aliases'].split('|')):
                alias_ops.append(dict(kind='insert', alias=a, target=nid, expect=None, variant=t['variant_key'],
                                      note=f"053 founder decision 5 (standard home chai); {a} -> the 'tea' row"))
        dv['canonical_row'] = (successor.get(t['canonical']) if t['canonical'] in successor else
                               (uid(CALC, t['variant_key'], t['new_key']) if t['canonical'] == 'new' else None))
        dv['family_reference_row'] = t['canonical'] if t['canonical'] not in successor and t['canonical'] != 'new' else None
    # key_copy: one more exact key on a copy row of an existing variant (same derivation, same numbers) with its OWN
    # portions and approval: 'phulka' is the roti family's numbers with a 30 g piece. Ids stay recalc_v1|variant|key.
    for t in targets:
        if t['method'] != 'key_copy':
            continue
        vk = t['recipe_ref'].split(':', 1)[1]
        dv = next((d for d in der if d['variant_key'] == vk), None)
        if dv is None or not t['portions'] or t['portions'] == 'inherit' or not t['portion_approved_by']:
            raise SystemExit(f"{t['variant_key']}: key_copy needs an existing variant, its own portions and an approval")
        tv = next(x for x in targets if x['variant_key'] == vk)
        new_keys = [k for k in (t['new_key'] or '').split('|') if k]
        new_names = [k for k in (t['new_name'] or '').split('|') if k]
        if not new_keys or len(new_keys) != len(new_names):
            raise SystemExit(f"{t['variant_key']}: new_key and new_name need one name per key")
        for key, name in zip(new_keys, new_names):
            add_key_row(new_rows, portion_changes, dict(tv, portion_approved_by=t['portion_approved_by']), dv, key,
                        name, parse_portions(t['portions']), is_canonical=False, key_approved_by=t['approved_by'])
        dv['search_check'] = ';'.join(filter(None, [dv.get('search_check'), t['search_check']]))
        dv.setdefault('key_copies', []).append(dict(variant_key=t['variant_key'], keys=new_keys,
                                                    review_note=t['review_note'], approved_by=t['approved_by']))
    # aliases that point at a superseded row follow it to its own successor (copy rows carry identical numbers,
    # and an alias made of an exact key's words must serve that key's row: 052's reordered-words rule)
    # The note is the alias's evidence; 052's notes quote the old row's numbers ("the chapati row (299, 1 piece =
    # 43 g)"), so a repoint appends what the alias serves now instead of leaving a stale figure behind.
    q_only = {o['old_id'] for o in old_rows if o['kind'] == 'quarantine_only'}
    by_id = {r['id']: r for r in new_rows}
    by_key = {r['key']: r for r in new_rows}
    approved = {p['food_item_id']: p['approved_by'] for p in portion_changes if p['approved_by']}
    for a, rec in sorted(aliases.items()):
        if rec['food_item_id'] in q_only:
            raise SystemExit(f'alias {a!r} points at quarantine-only row {rec["food_item_id"][:8]}')
        # What the alias would serve after 053 if it stayed: its row's successor, else its row as it is.
        old_t = rec['food_item_id']
        if old_t in successor:
            st = by_id[successor[old_t]]
            serves = (st['values'], st['portions'])
        else:
            src = rows.get(old_t)
            serves = None if src is None else (
                {k: Decimal(src[k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}, src['portions'])
        # An alias whose words become an exact key retires: exact keys win over aliases, so it would never fire
        # again, and 052/053 refuse an alias equal to a key. Allowed only when the new key row is a no-predecessor
        # copy carrying the very numbers the alias would serve after 053 (so its per-100 g never changes and fts mode
        # gains the phrase). Its portions must match too, unless the key row's own portions are a founder-approved
        # portion change ('phulka': 1 piece = 30 g where the alias, kept, would serve the roti family's 40 g after
        # 053). Anything else is a content change and must be planned by hand.
        if a in by_key:
            nr = by_key[a]
            same_nums = serves is not None and all(nr['values'][k] == serves[0][k]
                                                   for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber'))
            same_port = serves is not None and nr['portions'] == serves[1]
            if nr['predecessor'] is not None or not same_nums or not (same_port or nr['id'] in approved):
                raise SystemExit(f"alias {a!r} would equal the new key of {nr['id'][:8]}, which is not a copy of "
                                 f"what the alias serves ({old_t[:8]})")
            # The note is the permanent record (food_aliases backup, food_value_changes.reason, the report), so its
            # "before" is what the alias served BEFORE 053: its 052 row as the snapshot has it. 'phulka' went from
            # the USDA chapati row (299 kcal/100 g, 1 piece = 43 g) to 244.09 and 30 g; the post-053 successor the
            # guard above compares against is only what the alias would have served had it stayed.
            b = rows[old_t]
            appr = f"; portions approved by {approved[nr['id']]}" if nr['id'] in approved else ''
            kept = (f"; kept, it would have served {successor[old_t][:8]} after 053 ({serves[0]['kcal']} kcal/100 g, "
                    f"{fmt_portions(serves[1])})" if old_t in successor else '')
            note = (f"053: retired; the exact key '{a}' on {nr['id'][:8]} serves the phrase in every search mode "
                    f"({nr['values']['kcal']} kcal/100 g, {fmt_portions(nr['portions'])}{appr}). Before 053 the alias "
                    f"served {old_t[:8]} ({b['kcal']} kcal/100 g, {fmt_portions(b['portions'])}){kept}")
            alias_ops.append(dict(kind='retire', alias=a, target=nr['id'], expect=old_t, variant=nr['variant'], note=note))
            continue
        if old_t in successor:
            nr = by_id[successor[old_t]]
            pp = (nr['portions'] or [None])[0]
            now = f"{nr['values']['kcal']} kcal/100 g" + (f", {pp['description']} = {pp['gramWeight']:g} g" if pp else '')
            alias_ops.append(dict(kind='repoint', alias=a, target=nr['id'], expect=old_t, variant=None,
                                  note=f"{rec['note']}; 053: now {nr['id'][:8]} ({now})"))
    for o in old_rows:
        n = snap['memory'].get(o['old_id'], 0)
        memory.append(dict(old_id=o['old_id'], new_id=o['new_id'], n=n,
                           kind='memory_repoint' if o['new_id'] else 'memory_drop'))
    alias_ops.sort(key=lambda a: (a['kind'], a['alias']))
    new_rows.sort(key=lambda r: r['id'])
    old_rows.sort(key=lambda r: r['old_id'])
    plan = dict(derivations=sorted(der, key=lambda d: d['variant_key']), new_rows=new_rows, old_rows=old_rows,
                aliases=alias_ops, portion_changes=sorted(portion_changes, key=lambda p: p['food_item_id']),
                memory=sorted(memory, key=lambda m: m['old_id']), successor=successor, snapshot=snap,
                refs=sorted({t['canonical'] for t in targets if t['method'] in ('copy_reference', 'alias_only')}))
    check_plan(plan)
    return plan


def check_plan(plan):
    """Invariants the migration also re-checks in SQL; failing here means the inputs are wrong."""
    snap = plan['snapshot']
    keys_new = [r['key'] for r in plan['new_rows']]
    if len(keys_new) != len(set(keys_new)):
        raise SystemExit('two new rows take the same key')
    all_keys = {r['key'] for r in snap['rows'] if r['status'] == 'verified'} | set(keys_new) | {
        h['normalized_name'] for h in snap['key_holders']}
    new_alias = [a['alias'] for a in plan['aliases'] if a['kind'] == 'insert']
    existing = {a['alias'] for a in snap['aliases']}
    for a in new_alias:
        if a in all_keys:
            raise SystemExit(f'new alias {a!r} equals an exact key')
        if a in existing:
            raise SystemExit(f'new alias {a!r} already exists')
        if norm_key(a) != a:
            raise SystemExit(f'alias {a!r} is not normalized')
    retired = {a['alias'] for a in plan['aliases'] if a['kind'] == 'retire'}
    for k in keys_new:
        if (k in existing and k not in retired) or k in new_alias:
            raise SystemExit(f'new key {k!r} is also an alias')
    for h in snap['key_holders']:
        if h['normalized_name'] in keys_new and h['id'] not in {o['old_id'] for o in plan['old_rows']}:
            raise SystemExit(f"key {h['normalized_name']!r} is already held by {h['id'][:8]}")
    olds = [o['old_id'] for o in plan['old_rows']]
    if len(olds) != len(set(olds)):
        raise SystemExit('a row is superseded twice')
    for o in plan['old_rows']:
        if o['row']['created_by_null'] is not True:
            raise SystemExit(f"{o['old_id'][:8]} is owned; 053 only touches ownerless reference rows")


# ── snapshot ──────────────────────────────────────────────────────────────────────────────────────
def snapshot_ids(with_kind=False):
    ids, variant_of, kind_of, phrases = set(), {}, {}, set()
    for t in read_csv('targets.csv'):
        for part in filter(None, t['supersedes'].split(';')):
            oid = part.split(':')[0]
            ids.add(oid)
            variant_of[oid] = t['variant_key']
            kind_of[oid] = 'quarantine_only' if t['method'] == 'quarantine_only' else 'supersede'
        if t['canonical'] and t['canonical'] != 'new':
            ids.add(t['canonical'])
            kind_of.setdefault(t['canonical'], 'ref')
        phrases.update(filter(None, (t['new_key'] or '').split('|')))
        phrases.update(filter(None, t['new_aliases'].split('|')))
    if with_kind:
        return sorted(ids), variant_of, kind_of, sorted(phrases)
    return sorted(ids), variant_of, sorted(phrases)


def new_names():
    """Names of the rows 053 creates with no predecessor (their fts matches are not in the live base yet)."""
    out = []
    for t in read_csv('targets.csv'):
        out += [x for x in (t['new_name'] or '').split('|') if x]
    return sorted(set(out))


# Phrases the snapshot also scores in fts mode (RESOLVER_SEARCH=fts, the live default), on top of every 052 alias,
# every key or alias 053 adds and the key of every row it quarantines or copies: everyday words the 2026-11-13
# review asked about. Real-user phrasing only, never a dataset-v4 case (held out).
FTS_EXTRA = ('chole', 'dal chawal', 'chawal dal')


def snapshot_sql():
    ids, variant_of, kind_of, phrases = snapshot_ids(with_kind=True)
    idv = ',\n    '.join(f"('{i}'::uuid, '{variant_of.get(i, '')}', '{kind_of[i]}')" for i in ids)
    ph = ', '.join(f"'{p}'" for p in phrases)
    fx = ', '.join(f"'{p}'" for p in sorted(set(phrases) | set(FTS_EXTRA)))
    nn = ', '.join("'" + n.replace("'", "''") + "'" for n in new_names())
    return f"""-- scripts/recalc/data/snapshot.sql — GENERATED by `recalc.py snapshot --sql` from data/targets.csv. READ-ONLY.
-- Run:  npx supabase db query --linked -o json -f scripts/recalc/data/snapshot.sql > <scratch>/snapshot_raw.json
--       python3 -I scripts/recalc/recalc.py snapshot --ingest <scratch>/snapshot_raw.json
-- One SELECT, no writes. Returns the rows 053 touches (as text, so numbers round-trip exactly), every alias,
-- who already holds a key or phrase 053 adds, memory pointer COUNTS and real-user usage COUNTS (the eval
-- account excluded). No user id, email or private food name leaves the database.
-- fts / phrase_usage: for every phrase 053 touches (its new keys and aliases, every 052 alias, the key of every
-- row it quarantines or copies, a few everyday words), what the fts resolver (RESOLVER_SEARCH=fts) finds
-- and which rows real users' entries of exactly that phrase landed on. The report simulates fts after 053
-- from these ('base' = verified rows 053 leaves alone, 'plan' = rows whose successor keeps their name,
-- 'new_names' = names of no-predecessor rows that match). A private row is reported as 'private', never by id.
WITH ids(id, variant, kind) AS (VALUES
    {idv}),
fq(q) AS (
  SELECT unnest(ARRAY[{fx}]::text[])
  UNION SELECT a.alias FROM public.food_aliases a
  UNION SELECT coalesce(fi.normalized_name, fi.parked_normalized_name)
          FROM public.food_items fi JOIN ids i ON i.id = fi.id
),
fts AS (
  SELECT f.q, fi.id, fi.status, ids.kind
    FROM fq f JOIN public.food_items fi
      ON to_tsvector('english', fi.name) @@ websearch_to_tsquery('english', f.q)
    LEFT JOIN ids ON ids.id = fi.id
   WHERE (fi.status = 'verified' AND fi.calories_per_100g IS NOT NULL) OR ids.kind = 'supersede'
),
usage AS (
  SELECT f.q, CASE WHEN fe.food_item_id IS NULL THEN 'none' WHEN fi.created_by IS NULL THEN fe.food_item_id::text
                   ELSE 'private' END AS fid, count(*) AS e, count(DISTINCT fe.user_id) AS u,
         (percentile_cont(0.5) WITHIN GROUP (ORDER BY fe.quantity_g::float8))::numeric(10, 1)::text AS median_g
    FROM fq f JOIN public.food_entries fe
      ON btrim(regexp_replace(regexp_replace(lower(fe.food_name), '[^[:alnum:][:space:]]', ' ', 'g'), '\\s+', ' ', 'g')) = f.q
    LEFT JOIN public.food_items fi ON fi.id = fe.food_item_id
   WHERE fe.user_id NOT IN (SELECT u.id FROM auth.users u WHERE u.email LIKE '%@steadyapp.internal')
   GROUP BY 1, 2
),
saved AS (
  SELECT se.user_id,
         (SELECT array_agg(DISTINCT i.variant ORDER BY i.variant)
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(se.entries) = 'array' THEN se.entries ELSE '[]'::jsonb END) e
            JOIN ids i ON i.id::text = e->>'food_item_id' WHERE i.kind <> 'ref') AS vs
    FROM public.saved_entries se
   WHERE se.user_id NOT IN (SELECT u.id FROM auth.users u WHERE u.email LIKE '%@steadyapp.internal')
),
real AS (
  SELECT fe.food_item_id, fe.user_id FROM public.food_entries fe
   WHERE fe.food_item_id IN (SELECT id FROM ids)
     AND fe.user_id NOT IN (SELECT u.id FROM auth.users u WHERE u.email LIKE '%@steadyapp.internal')
)
SELECT jsonb_build_object(
  'taken_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'migrations', (SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
  'verified_count', (SELECT count(*) FROM public.food_items WHERE status = 'verified'),
  'rows', (SELECT jsonb_agg(jsonb_build_object(
      'id', fi.id, 'source', fi.source, 'name', fi.name, 'external_id', fi.external_id, 'fdc_id', fi.fdc_id::text,
      'normalized_name', fi.normalized_name, 'parked_normalized_name', fi.parked_normalized_name,
      'key', coalesce(fi.normalized_name, fi.parked_normalized_name), 'status', fi.status,
      'status_reason', fi.status_reason, 'created_by_null', fi.created_by IS NULL,
      'kcal', fi.calories_per_100g::text, 'protein', fi.protein_per_100g::text, 'carbs', fi.carbs_per_100g::text,
      'fat', fi.fat_per_100g::text, 'fiber', fi.fiber_per_100g::text, 'portions', fi.portions) ORDER BY fi.id)
    FROM public.food_items fi WHERE fi.id IN (SELECT id FROM ids)),
  'aliases', (SELECT jsonb_agg(jsonb_build_object('alias', a.alias, 'food_item_id', a.food_item_id, 'note', a.note)
                               ORDER BY a.alias) FROM public.food_aliases a),
  'key_holders', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', fi.id, 'normalized_name', fi.normalized_name)
                                            ORDER BY fi.normalized_name), '[]')
                    FROM public.food_items fi WHERE fi.normalized_name IN ({ph})),
  'memory', (SELECT coalesce(jsonb_object_agg(m.food_item_id, m.n), '{{}}')
               FROM (SELECT food_item_id, count(*) n FROM public.user_food_memory
                      WHERE food_item_id IN (SELECT id FROM ids) GROUP BY 1) m),
  'usage_by_row', (SELECT coalesce(jsonb_object_agg(x.food_item_id, jsonb_build_object('entries', x.e, 'users', x.u)), '{{}}')
                     FROM (SELECT food_item_id, count(*) e, count(DISTINCT user_id) u FROM real GROUP BY 1) x),
  'usage_by_variant', (SELECT coalesce(jsonb_object_agg(x.variant, jsonb_build_object('entries', x.e, 'users', x.u)), '{{}}')
                         FROM (SELECT i.variant, count(*) e, count(DISTINCT r.user_id) u
                                 FROM real r JOIN ids i ON i.id = r.food_item_id WHERE i.variant <> '' GROUP BY 1) x),
  'fts', (SELECT jsonb_object_agg(f.q, jsonb_build_object(
      'exact', (SELECT fi.id FROM public.food_items fi WHERE fi.normalized_name = f.q AND fi.status = 'verified'),
      'live', (SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), '[]') FROM (SELECT t.id FROM fts t
                 WHERE t.q = f.q AND t.status = 'verified' ORDER BY t.id LIMIT 3) x),
      'base', (SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), '[]') FROM (SELECT t.id FROM fts t
                 WHERE t.q = f.q AND t.status = 'verified' AND coalesce(t.kind, 'ref') = 'ref' ORDER BY t.id LIMIT 3) x),
      'plan', (SELECT coalesce(jsonb_agg(t.id ORDER BY t.id), '[]') FROM fts t WHERE t.q = f.q AND t.kind = 'supersede'),
      'new_names', (SELECT coalesce(jsonb_agg(n ORDER BY n), '[]') FROM unnest(ARRAY[{nn}]::text[]) n
                     WHERE to_tsvector('english', n) @@ websearch_to_tsquery('english', f.q))))
            FROM fq f),
  'fts_rows', (SELECT coalesce(jsonb_object_agg(fi.id, jsonb_build_object('name', fi.name, 'source', fi.source,
                 'kcal', fi.calories_per_100g::text, 'portions', fi.portions)), '{{}}')
                 FROM public.food_items fi WHERE fi.created_by IS NULL
                  AND (fi.id IN (SELECT t.id FROM fts t WHERE t.status = 'verified' AND coalesce(t.kind, 'ref') = 'ref')
                       OR fi.id::text IN (SELECT fid FROM usage))),
  'phrase_usage', (SELECT coalesce(jsonb_object_agg(x.q, x.rows), '{{}}') FROM (
      SELECT q, jsonb_agg(jsonb_build_object('food_item_id', fid, 'entries', e, 'users', u, 'median_g', median_g)
                          ORDER BY e DESC, fid) AS rows FROM usage GROUP BY q) x),
  -- saved meals re-log their stored numbers and food_item_id (savedEntriesStore.logSavedEntry): how many real
  -- ones carry a row 053 quarantines (counts and variants only)
  'saved_meals', (SELECT jsonb_build_object('meals', count(*), 'users', count(DISTINCT sv.user_id),
                    'with_053_rows', count(*) FILTER (WHERE sv.vs IS NOT NULL),
                    'users_with_053_rows', count(DISTINCT sv.user_id) FILTER (WHERE sv.vs IS NOT NULL),
                    'variants', (SELECT coalesce(jsonb_agg(DISTINCT v ORDER BY v), '[]')
                                   FROM saved, unnest(saved.vs) v))
                    FROM saved sv)
) AS snapshot;
"""


def ingest_snapshot(raw_path):
    raw = open(raw_path, encoding='utf-8').read()
    obj = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
    snap = obj['rows'][0]['snapshot'] if 'rows' in obj else obj
    if isinstance(snap, str):
        snap = json.loads(snap)
    for r in snap['rows']:
        if r['portions'] is not None and not isinstance(r['portions'], list):
            r['portions'] = json.loads(r['portions'])
    snap['_note'] = ('Output of data/snapshot.sql (read-only) against the live project. Counts only: no user id, '
                     'email or private food name. Re-take it right before `db push`; the migration compares every '
                     'touched row against these values and refuses to run if any changed.')
    with open(os.path.join(DATA, 'snapshot.json'), 'w', encoding='utf-8') as fh:
        fh.write(dumps(snap))
    ids, _, _ = snapshot_ids()
    missing = sorted(set(ids) - {r['id'] for r in snap['rows']})
    print(f"snapshot {snap['taken_at']}: {len(snap['rows'])} rows, {len(snap['aliases'])} aliases, "
          f"verified {snap['verified_count']}; missing {missing}")
    return 1 if missing else 0


# ── validation (spec §(e), offline part) ───────────────────────────────────────────────────────────
def validate(book, lab, params, plan, quiet=False):
    import emit53
    fails, notes = [], []
    sc = params['scores']['pooled']
    G = GATES
    r = sc['recalc']
    if r['med_abs'] > G['pooled_med_abs']:
        fails.append(f"pooled median |error| {r['med_abs']}% > {G['pooled_med_abs']}%")
    if abs(r['mean_signed']) > G['pooled_abs_bias']:
        fails.append(f"pooled |mean bias| {r['mean_signed']}% > {G['pooled_abs_bias']}%")
    if r['fat_med_abs'] > G['pooled_fat_med_abs']:
        fails.append(f"pooled median fat error {r['fat_med_abs']} g > {G['pooled_fat_med_abs']} g")
    rm = sc['recalc_recipe_maths_only']
    if rm['med_abs'] > G['recipe_maths_med_abs']:
        fails.append(f"recipe-maths-only error {rm['med_abs']}% > {G['recipe_maths_med_abs']}%")
    notes.append(f"lab: pooled {r['med_abs']}% median |err|, bias {r['mean_signed']:+}%, fat {r['fat_med_abs']} g, "
                 f"recipe maths only {rm['med_abs']}% (n={r['n']})")
    pc = params['scores']['per_class_pooled']
    shipped = sorted({d['cooking_class'] for d in plan['derivations'] if d['method'] == 'recipe_recalc'})
    for cls in shipped:
        if cls in ('beverage',):
            continue
        v = pc.get(cls)
        if cls == 'batter_steamed':
            notes.append(f"class {cls}: {v['recalc_med_abs'] if v else 'n/a'}% (confidence C by founder decision; not gated)")
            continue
        if cls == 'composite':
            e = abs(next(d for d in plan['derivations'] if d['variant_key'] == 'paratha_aloo')['referee']['heldout_err_pct'])
            ok = e <= G['composite_dish_abs']
            notes.append(f"class composite (aloo paratha only): held-out {e}% -> {'pass' if ok else 'FAIL'}")
            if not ok:
                fails.append(f'aloo paratha held-out {e}% > {G["composite_dish_abs"]}%')
            continue
        if not v:
            fails.append(f'shipped class {cls} has no lab dish')
            continue
        if cls in M.ANCHOR_ONLY:
            ok = v['recipe_maths_med_abs'] <= G['anchor_recipe_maths_med_abs']
            notes.append(f"class {cls} (lab anchors): recipe maths {v['recipe_maths_med_abs']}% -> {'pass' if ok else 'FAIL'}")
        else:
            ok = v['recalc_med_abs'] <= G['class_med_abs']
            notes.append(f"class {cls}: {v['indb_med_abs']}% -> {v['recalc_med_abs']}% (n={v['n']}) -> {'pass' if ok else 'FAIL'}")
        if not ok:
            fails.append(f'class {cls} fails its own gate')
    # every generated row passes the rules (the jest test runs the real validate.ts over the same rows)
    for n in plan['new_rows']:
        v = n['values']
        iss = emit53.food_item_issues_py(n['source'], n['name'], v)
        if iss:
            fails.append(f"{n['name']} ({n['variant']}): food_item_issues {iss}")
        if any(d['id'] == n['derivation_id'] and d['method_sql'] == 'recipe_recalc' for d in plan['derivations']):
            e = 4 * v['protein'] + 9 * v['fat'] + 4 * v['carbs'] + 2 * v['fiber']
            if abs(v['kcal'] - e) > Decimal('0.5'):
                fails.append(f"{n['name']}: kcal {v['kcal']} != 4P+9F+4C+2fib {e}")
    # golden values
    P = prod_params(params)
    der = {d['variant_key']: d for d in plan['derivations']}
    roti_w = M.predict(book, 'ASC096', 'flatbread_dry', P)
    gold = {'roti_as_written': float(per100_from(roti_w)['kcal']),
            'roti_plain_shipped': float(der['roti_plain']['values']['kcal']),
            'poori': float(der['poori']['values']['kcal']), 'dal_moong_washed': float(der['dal_moong_washed']['values']['kcal']),
            'chai_standard': float(der['chai_standard']['values']['kcal'])}
    for k, want in GOLDEN.items():
        got = gold[k]
        ok = abs(got - want) <= G['golden_tol']
        notes.append(f'golden {k}: {got} (want {want}±{G["golden_tol"]}) -> {"pass" if ok else "FAIL"}')
        if not ok:
            fails.append(f'golden {k} = {got}, want {want}')
    # per piece vs NIN (spec §(e)3): INDB's own piece = cooked batch / pieces
    for vk, label, _g, nin, ref in NIN_PIECE:
        d = der[vk]
        s = book.serv[d['indb_code']]
        pieces = float(s['no_of_servings']) * float(s['size_of_servings'])
        g = d['cooked_w'] / pieces
        kcal = float(d['values']['kcal']) * g / 100
        dev = (kcal / nin - 1) * 100
        ok = abs(dev) <= G['piece_vs_nin']
        notes.append(f'piece {label}: {g:.0f} g = {kcal:.0f} kcal vs {ref} ({dev:+.0f}%) -> {"pass" if ok else "FAIL"}')
        if not ok:
            fails.append(f'{label} {dev:+.0f}% vs NIN')
    for vk, (nin, ref) in sorted(NIN_SHIPPED_PIECE.items()):
        rows_v = [r for r in plan['new_rows'] if r['variant'] == vk]
        if not rows_v or any(not r['portions'] or 'piece' not in r['portions'][0]['description'] for r in rows_v):
            fails.append(f'{vk}: a shipped row has no piece portion')
            continue
        by_g = {}
        for r in rows_v:
            by_g.setdefault(r['portions'][0]['gramWeight'], []).append(r['key'])
        for g_, keys in sorted(by_g.items(), reverse=True):     # one gate per piece size (roti 40 g, phulka 30 g)
            g = float(g_)
            kcal = float(der[vk]['values']['kcal']) * g / 100
            dev = (kcal / nin - 1) * 100
            ok = abs(dev) <= G['piece_vs_nin']
            notes.append(f"piece {vk}, SHIPPED portion ({', '.join(sorted(keys))}): {g:g} g = {kcal:.1f} kcal vs {ref} "
                         f"({dev:+.0f}%) -> {'pass' if ok else 'FAIL'}")
            if not ok:
                fails.append(f'{vk} shipped piece {g:g} g {dev:+.0f}% vs NIN')
    # founder-fixed portions: every row of each family carries exactly them, and its logged change their approval
    cls_of = {d['id']: d['cooking_class'] for d in plan['derivations']}
    pcs = {p['food_item_id']: p for p in plan['portion_changes']}
    fam = {}
    for r in plan['new_rows']:
        fp = founder_portions(r, cls_of.get(r['derivation_id']))
        if fp is None:
            continue
        label, port, by = fp
        fam.setdefault(label, []).append(r['key'])
        if r['portions'] != port:
            fails.append(f"{r['key']} ({label}): portions {fmt_portions(r['portions'])}, founder fixed {fmt_portions(port)}")
        pc = pcs.get(r['id'])
        if pc is not None and pc['approved_by'] != by:
            fails.append(f"{r['key']} ({label}): portion change approved by {pc['approved_by']!r}, want {by!r}")
    for (kind, name), (port, by) in sorted(FOUNDER_PORTIONS.items()):
        keys = fam.get(f'{kind} {name}', [])
        if not keys:
            fails.append(f'founder portions for {kind} {name}: no 053 row carries them')
            continue
        notes.append(f"founder portions {kind} {name} ({by}): {fmt_portions(port)} on {len(keys)} "
                     f"row{'s' if len(keys) != 1 else ''} -> pass"
                     if not any(f"({kind} {name})" in x for x in fails) else
                     f"founder portions {kind} {name}: FAIL")
    mv = der['vada_medu']
    s = book.serv['BFP436']
    g = mv['cooked_w'] / (float(s['no_of_servings']) * float(s['size_of_servings']))
    notes.append(f"piece medu vada (INDB): {g:.0f} g = {float(mv['values']['kcal']) * g / 100:.0f} kcal (reported only: "
                 f"no NIN household value for medu vada in the repo's sources, so this piece is ungated)")
    for vk, (want, ref) in sorted(FOUNDER_VALUES.items()):
        got = float(der[vk]['values']['kcal'])
        dev = (got / want - 1) * 100
        ok = abs(dev) <= FOUNDER_TOL
        notes.append(f'founder value {vk}: shipped {got} vs {ref} ({dev:+.1f}%, tolerance ±{FOUNDER_TOL:g}%) -> '
                     f'{"pass" if ok else "FAIL"}')
        if not ok:
            fails.append(f'{vk} = {got}, {dev:+.1f}% from the founder-approved {want}')
    # quarantine-only INDB rows must really count a pan of frying oil
    for o in plan['old_rows']:
        if o['kind'] == 'quarantine_only' and o['why'] == 'frying_oil_counted':
            code = o['row']['external_id']
            if book.regime(code) != 'C_all_frying_oil_counted':
                fails.append(f'{code} is listed as frying-oil-counted but INDB regime is {book.regime(code)}')
    # the SQL never writes history
    sql = emit53.migration_sql(plan, params, inputs_sha256())
    rb = emit53.rollback_sql(plan, inputs_sha256())
    for label, text in (('migration', sql), ('rollback', rb)):
        bad = emit53.history_writes(text)
        if bad:
            fails.append(f'{label} writes history tables: {bad}')
    if not quiet:
        for n_ in notes:
            print('  ·', n_)
        for f_ in fails:
            print('  ✗', f_)
        print(f"validate: {'OK' if not fails else 'FAILED'} ({len(plan['new_rows'])} new rows, "
              f"{len(plan['old_rows'])} quarantined, {sum(a['kind'] == 'repoint' for a in plan['aliases'])} aliases "
              f"repointed, {sum(a['kind'] == 'insert' for a in plan['aliases'])} added, "
              f"{sum(a['kind'] == 'retire' for a in plan['aliases'])} retired)")
    return fails, notes


# ── outputs ───────────────────────────────────────────────────────────────────────────────────────
def render_all(book, lab, params, plan):
    import emit53
    h = inputs_sha256()
    fails, notes = validate(book, lab, params, plan, quiet=True)
    if fails:
        raise SystemExit('validate failed; nothing emitted:\n  ' + '\n  '.join(fails))
    with open(OUTPUTS['search_check'], encoding='utf-8') as fh:
        sc_text = fh.read()
    return {
        'migration': emit53.migration_sql(plan, params, h),
        'rollback': emit53.rollback_sql(plan, h),
        'report': emit53.report_md(book, lab, params, plan, notes, h),
        'derivations': dumps(emit53.derivations_json(plan, h)),
        'search_check': emit53.search_check(sc_text, plan),
    }


def load_all():
    book = M.Book()
    lab = lab_obj()
    params = read_json('params.json')
    snap = read_json('snapshot.json')
    plan = build_plan(book, lab, params, snap)
    return book, lab, params, plan


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    cmd = argv[0]
    if cmd == 'fetch':
        seed = argv[argv.index('--seed') + 1] if '--seed' in argv else None
        indb.fetch(seed)
        return 0
    if cmd == 'verify':
        bad = indb.verify()
        if bad:
            return 1
        book = M.Book()
        ex, n, mism = indb.reproduction_report(book.fct, book.rec, book.pub)
        print(f'  INDB rebuilt: {ex}/{n} recipes exact on all 5 nutrients at 2 dp' + (f'; mismatches {mism[:10]}' if mism else ''))
        ov = indb.fit_overrides(book.rec, book.pub)
        have = {k: {kk: vv for kk, vv in v.items() if kk in indb.NUTS} for k, v in indb.load_overrides().items()}
        same = ov == have
        print(f"  overrides.json re-derived from INDB.xlsx: {'identical' if same else 'DIFFERENT'}")
        return 0 if (ex == n and same) else 1
    if cmd == 'calibrate':
        book = M.Book()
        p = build_params(book, lab_obj())
        s = p['scores']['pooled']
        print(f"pooled recalc {s['recalc']}\npooled INDB   {s['indb']}\nrecipe maths  {s['recalc_recipe_maths_only']}")
        print(f"production alpha {p['production']['alpha']} w* {p['production']['w_star_pct']}")
        if '--write' in argv:
            with open(os.path.join(DATA, 'params.json'), 'w', encoding='utf-8') as fh:
                fh.write(dumps(p))
            print('wrote data/params.json')
        return 0
    if cmd == 'snapshot':
        if '--sql' in argv:
            with open(os.path.join(DATA, 'snapshot.sql'), 'w', encoding='utf-8') as fh:
                fh.write(snapshot_sql())
            print('wrote data/snapshot.sql')
            return 0
        if '--ingest' in argv:
            return ingest_snapshot(argv[argv.index('--ingest') + 1])
        print('snapshot --sql | --ingest FILE')
        return 2
    if cmd == 'validate':
        book, lab, params, plan = load_all()
        fails, _ = validate(book, lab, params, plan)
        return 1 if fails else 0
    if cmd in ('emit', 'check'):
        book, lab, params, plan = load_all()
        out = render_all(book, lab, params, plan)
        if cmd == 'emit':
            for k, text in out.items():
                os.makedirs(os.path.dirname(OUTPUTS[k]), exist_ok=True)
                with open(OUTPUTS[k], 'w', encoding='utf-8') as fh:
                    fh.write(text)
                print('wrote', os.path.relpath(OUTPUTS[k], REPO))
            return 0
        diffs = []
        for k, text in out.items():
            cur = open(OUTPUTS[k], encoding='utf-8').read() if os.path.exists(OUTPUTS[k]) else None
            if cur != text:
                diffs.append(os.path.relpath(OUTPUTS[k], REPO))
        p2 = build_params(book, lab)
        if dumps(p2) != dumps(params):
            diffs.append('scripts/recalc/data/params.json (calibration no longer reproduces it)')
        if snapshot_sql() != open(os.path.join(DATA, 'snapshot.sql'), encoding='utf-8').read():
            diffs.append('scripts/recalc/data/snapshot.sql (targets.csv changed; re-run snapshot --sql and re-take it)')
        for d in diffs:
            print('  ✗ differs:', d)
        print('check: OK, regenerated outputs are identical' if not diffs else f'check: FAILED ({len(diffs)})')
        return 1 if diffs else 0
    print('unknown command', cmd)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
