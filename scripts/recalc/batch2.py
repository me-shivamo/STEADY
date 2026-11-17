"""scripts/recalc/batch2.py — generator for migration 058 "recalculate Indian dishes, batch 2" (recalc_v2).

  python3 -I scripts/recalc/batch2.py snapshot --sql       write data/batch2/snapshot.sql (a READ-ONLY query)
  python3 -I scripts/recalc/batch2.py snapshot --ingest F  turn the CLI output of that query into data/batch2/snapshot.json
  python3 -I scripts/recalc/batch2.py validate             every offline gate (values, energy rule, keys, ids, portions)
  python3 -I scripts/recalc/batch2.py emit                 write 058, its rollback, the review report,
                                                           out/derivations_v2.json and 058's lines of search-check.sql
  python3 -I scripts/recalc/batch2.py check                regenerate everything in memory and diff it against the
                                                           committed files (exit 1 on any difference)

WHY A SIBLING OF recalc.py AND NOT A MODE OF IT
  recalc.py is migration 053's generator, and 053 is live and run-once: its committed SQL embeds the SHA-256 of
  recalc.py, method.py, indb.py, emit53.py and every file it reads in data/, and `recalc.py check` diffs against
  it. Any edit there would change 053's bytes. So batch 2 lives here: it IMPORTS the 053 engine (the INDB rebuild,
  the per-line water accounting, the rounding and the 4P + 9F + 4C + 2fib rule) and never edits it; its own
  inputs live in data/batch2/; its ids are UUIDv5(recalc_v2|variant|key) in 053's namespace (calc version
  recalc_v2, so they can never collide with a recalc_v1 id); its outputs are its own files.

WHAT IT SHIPS (founder decisions, spec .claude/plans/v1.2-recalc-053-spec.md section (i): (i)1-5 of 2026-11-13, values from
docs/testing/dish-row-audit-2026-11-13.md as corrected by its adversarial review; (i)6 of 2026-11-15, dal makhani, from
docs/testing/dal-makhani-research-2026-11-14.md):
  * key_copy    exact keys on copy rows of a live 053 row, numbers unchanged (rajma, aloo sabzi, bhindi sabzi).
  * recipe_edit an INDB recipe rebuilt line by line, then founder-approved edits (swap a line, add a documented
                water line, set an oil line or a water line by a stated rule that this script SOLVES), then the 053
                moisture rule: 'target' at a lab anchor (Wc = dry matter / (1 - w*)) or 'keep' (Wc = W). Upma, poha,
                biryani, dal makhani (its water line simmered down to an external anchor's measured water).
  * copy_usda   a verified copy of a USDA SR Legacy food read from the pinned bulk file (pizza).
  Every superseded row is quarantined (key parked), never edited; aliases whose words become exact keys retire;
  memory follows its row; new rows get founder portion_units rows and a portion_category_map row (054 tables).

DETERMINISM: sorted output, 2-dp half-up rounding, UUIDv5 ids, no timestamps of our own. Same inputs -> same bytes.
"""
import csv
import hashlib
import io
import json
import os
import sys
import uuid
import zipfile
from decimal import Decimal, ROUND_HALF_EVEN

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:          # python3 -I does not put the script's own directory on sys.path
    sys.path.insert(0, HERE)

import indb      # noqa: E402
import method as M  # noqa: E402
import recalc as R  # noqa: E402

DATA2 = os.path.join(R.DATA, 'batch2')
REPO = R.REPO
CALC = 'recalc_v2'
MIG = '058'
FILE_STEM = '058_recalc_indian_v2'
NS = R.NS                                   # 053's namespace; the calc version in the name keeps ids apart
NS_PORTION_UNITS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://steady.chat/ns/portion_units/v1')   # scripts/portions/lib.ts
OUTPUTS = {
    'migration': os.path.join(REPO, 'supabase', 'migrations', FILE_STEM + '.sql'),
    'rollback': os.path.join(REPO, 'supabase', 'rollback', FILE_STEM + '_down.sql'),
    'report': os.path.join(REPO, 'docs', 'reviews', '058-recalc-indian-v2.md'),
    'derivations': os.path.join(HERE, 'out', 'derivations_v2.json'),
    'search_check': os.path.join(REPO, 'scripts', 'eval', 'search-check.sql'),
}
INPUT_FILES = [os.path.join(DATA2, n) for n in ('targets.csv', 'recipes.json', 'anchors.json', 'snapshot.json')] + \
              [os.path.join(R.DATA, n) for n in ('lab.csv', 'sources.json', 'overrides.json')]
CODE_FILES = ['batch2.py', 'emit58.py', 'indb.py', 'method.py', 'recalc.py']
USDA_SOURCES = os.path.join(REPO, 'scripts', 'usda', 'sources.json')
USDA_CACHE = os.path.join(REPO, '.cache', 'usda')
METHODS = ('key_copy', 'recipe_edit', 'copy_usda')
RELATIONS = R.RELATIONS
# Production vs migrations-only replay is decided in SQL (emit58.py, MARKER_053) from the rows 058 touches, cross-checked
# with 053's backup marker, as pending 056/057 do. A verified-row count cannot tell them apart: pending 055 inserts
# 11,986 verified rows on a replay too.

# Founder-quoted values (spec (i) and the review's corrected numbers). The shipped number must stay within these
# tolerances, so a method or input change cannot drift away from what was approved unnoticed.
FOUNDER_VALUES = {
    'upma_rava_labfat': dict(kcal=(222.0, 3.0, '%'), fat=(6.5, 0.1, 'g')),
    'biryani_chicken_home': dict(kcal=(162.4, 0.5, 'g'), protein=(6.55, 0.05, 'g'), carbs=(19.06, 0.05, 'g'),
                                 fat=(6.20, 0.05, 'g'), fiber=(2.05, 0.05, 'g')),
    'pizza_cheese_sr173292': dict(kcal=(266.0, 0.05, 'g'), protein=(11.4, 0.05, 'g'), carbs=(33.3, 0.05, 'g'),
                                  fat=(9.7, 0.05, 'g'), fiber=(2.3, 0.05, 'g')),
    # spec (i)6 quotes these to 2 dp (OSR139 at 74.7% water), so they must come out exactly
    'dal_makhani_home': dict(kcal=(110.40, 0.005, 'g'), protein=(4.74, 0.005, 'g'), carbs=(11.38, 0.005, 'g'),
                             fat=(4.38, 0.005, 'g'), fiber=(3.25, 0.005, 'g')),
}
# Generator outputs pinned against silent drift where the founder approved a RULE, not a number (spec (i)2: poha's
# oil is solved from lab 99's fat share). NOT founder values: they move into FOUNDER_VALUES once the founder has seen
# and confirmed the result. validate gates them exactly, so an INDB/IFCT or solver change cannot slip through `emit`.
PINNED_OUTPUTS = {
    'poha_home_labfat': dict(kcal=155.05, protein=4.14, carbs=23.84, fat=4.23, fiber=2.53),
}
# How a founder portion text names its units (scripts/portions/lib.ts FOUNDER_DESCRIPTION_UNITS, plus the slice).
DESC_UNITS = {'1 katori': ['katori'], '1 bowl (1 cup)': ['bowl', 'cup'], '1 cup': ['cup'], '1 plate': ['plate'],
              '1 slice': ['slice'], '1 piece': ['piece']}
CUP_ML = 240                                # the US cup, as 054's dal-family rows carry it


def portion_source_ref(approved_by):
    """portion_units.source_ref from the approval text ('founder 2026-11-15 (spec (i)6 ...)' -> 'founder:2026-11-15'),
    so the portion engine cites the approval each unit really has."""
    import re
    m = re.match(r'founder (\d{4}-\d{2}-\d{2})\b', approved_by or '')
    if not m:
        raise SystemExit(f'portion approval {approved_by!r} names no founder date')
    return f'founder:{m.group(1)}'
# Phrases the snapshot also scores (real-user words; never a dataset-v4 case).
SNAPSHOT_EXTRA = ('bhindi', 'bhindi subji', 'upma rava', 'cheese pizza', 'veg biryani', 'mutton biryani',
                  'kanda poha', 'rajma chawal')


# ── small helpers ──────────────────────────────────────────────────────────────────────────────────
d2 = R.d2
per100_from = R.per100_from
norm_key = R.norm_key


def uid(*parts):
    return str(uuid.uuid5(NS, '|'.join(parts)))


def pu_id(food_item_id, unit, size='M', context=None, region=None):
    """scripts/portions/lib.ts naturalKey for an active food row: food|<id>|<unit>|<size>|<context>|<region>|"""
    return str(uuid.uuid5(NS_PORTION_UNITS, '|'.join(['food', food_item_id, unit, size, context or '', region or '', ''])))


def read_csv2(name):
    with open(os.path.join(DATA2, name), newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh))


def read_json2(name):
    with open(os.path.join(DATA2, name), encoding='utf-8') as fh:
        return json.load(fh)


def split_list(s):
    return [x for x in (s or '').split('|') if x]


def inputs_sha256():
    h = hashlib.sha256()
    for p in INPUT_FILES:
        with open(p, 'rb') as fh:
            h.update(os.path.relpath(p, HERE).encode() + b'\0' + fh.read() + b'\0')
    for name in CODE_FILES:
        with open(os.path.join(HERE, name), 'rb') as fh:
            h.update(name.encode() + b'\0' + fh.read() + b'\0')
    return h.hexdigest()


def sig3(x):
    """FoodData Central's presentation: 3 significant figures, half-even (every live USDA row is stored so:
    SR 173291 10.85 -> 10.8, 11.25 -> 11.2, 172041 11.73 -> 11.7, 173282 8.97 -> 8.97)."""
    d = Decimal(str(x))
    if d == 0:
        return Decimal('0')
    q = d.quantize(Decimal(1).scaleb(d.adjusted() - 2), rounding=ROUND_HALF_EVEN)
    return Decimal(format(q.normalize(), 'f'))


def dec(s):
    return None if s is None else Decimal(str(s))


# ── recipe_edit: an INDB recipe, edited line by line, through the 053 engine ────────────────────────────
def fct_line(book, code, g, label, role):
    fx = book.fct[code]
    nut = {k: g * (fx.get(src) or 0.0) / 100 for k, src in
           (('P', 'protein_g'), ('C', 'carb_g'), ('F', 'fat_g'), ('Fib', 'fibre_g'), ('kcal', 'energy_kcal'))}
    return dict(i=None, code=code, name=fx['name'], text=label, g=float(g), water=M.est_water_g(code, float(g), fx),
                fry=False, exposed=code[:1] not in 'TIK', role=role, as_written=None, g_as_written=None, **nut)


def scaled(x, g_new, label):
    f = g_new / x['g']
    y = dict(x)
    for k in ('g', 'water', 'P', 'C', 'F', 'Fib', 'kcal'):
        y[k] = x[k] * f
    y.update(role='edited', g_as_written=x['g'], text=label)
    return y


def lab_fat_share(lab, lid):
    r = lab.lab[lid]
    return float(r['fat_g']) / (100.0 - float(r['water_g']))


def solve_fat_share(others, line, target):
    """Grams of `line` (an oil line) so that total fat / total dry matter = target: (F0 + a x) / (S0 + b x) = t."""
    S0 = sum(x['g'] - x['water'] for x in others)
    F0 = sum(x['F'] for x in others)
    a = line['F'] / line['g']
    b = (line['g'] - line['water']) / line['g']
    x = (target * S0 - F0) / (a - target * b)
    if not x > 0:
        raise SystemExit(f'fat-share rule needs {x:.2f} g of {line["code"]}: the other lines already carry more fat')
    return float(d2(x))


def solve_water_pct(others, line, target):
    """Grams of `line` (a water line) so that the dish's water share = target: (A0 + b x) / (W0 + x) = t, where A0 and
    W0 are the other lines' water and weight and b the line's own water share (1 for K505). Used for a pot that
    simmers down: the line may only LOSE water against the recipe as written, never gain it."""
    if line['code'] != 'K505' or abs(line['water'] - line['g']) > 1e-9:
        raise SystemExit(f"water rule on {line['code']}: only a plain water line (K505) can be simmered down")
    W0 = sum(x['g'] for x in others)
    A0 = sum(x['water'] for x in others)
    b = line['water'] / line['g']
    x = (target * W0 - A0) / (b - target)
    if not x > 0:
        raise SystemExit(f'water rule needs {x:.2f} g of water: the other lines are already wetter than the anchor')
    if x > line['g'] + 1e-9:
        raise SystemExit(f"water rule needs {x:.2f} g of water, more than the {line['g']:.2f} g written: a simmered "
                         f'pot can only lose water (the anchor is wetter than the recipe)')
    return float(d2(x))


def build_lines(book, lab, recipe, anchors=None):
    base = recipe['base']
    if not base.startswith('INDB:'):
        raise SystemExit(f'{base}: recipe_edit starts from an INDB recipe')
    code = base.split(':', 1)[1]
    lines = []
    for x in M.parts(book, code):
        if x['fry']:
            raise SystemExit(f'{code}: has a frying-oil line; batch 2 ships no deep-fried dish')
        lines.append(dict(x, role='kept', as_written=x['text'], g_as_written=None))
    solves = []
    for ed in recipe['edits']:
        op = ed['op']
        if op in ('replace', 'set_g'):
            hit = [x for x in lines if x['i'] == ed['i'] and x['role'] in ('kept', 'edited')]
            if len(hit) != 1 or hit[0]['code'] != ed['code']:
                raise SystemExit(f"{code}: edit expects line {ed['i']} to be {ed['code']}, found "
                                 f"{hit[0]['code'] if hit else 'nothing'}")
            tgt = hit[0]
        if op == 'replace':
            tgt['role'] = 'removed'
            tgt['text'] = ed['label']
            for w in ed['with']:
                lines.append(fct_line(book, w['code'], w['g'], w['label'], 'added'))
        elif op == 'add':
            lines.append(fct_line(book, ed['code'], ed['g'], ed['label'], 'added'))
        elif op == 'set_g':
            solves.append((ed, tgt))
        else:
            raise SystemExit(f'unknown edit {op}')
    for ed, tgt in solves:            # rules last: they depend on every other line
        rule = ed.get('rule') or {}
        if 'fat_share_of_dry_matter' in rule:
            lid = rule['fat_share_of_dry_matter']['lab']
            others = [x for x in lines if x is not tgt and x['role'] != 'removed']
            g = solve_fat_share(others, tgt, lab_fat_share(lab, lid))
        elif 'water_pct' in rule:
            a = (anchors or {})[rule['water_pct']['anchor']]
            others = [x for x in lines if x is not tgt and x['role'] != 'removed']
            g = solve_water_pct(others, tgt, float(a['water_g']) / 100)
        elif 'g' in ed:
            g = float(ed['g'])
        else:
            raise SystemExit(f'{code}: set_g needs g or a rule')
        y = scaled(tgt, g, ed['label'])
        # a simmered-down water line: the written grams still go into the pot, the difference leaves as steam, so the
        # yield factor is taken against the pot (EuroFIR: cooked / raw), not against what is left
        y['evaporated_g'] = tgt['g'] - g if 'water_pct' in rule else 0.0
        lines[lines.index(tgt)] = y
    return code, lines


def derive_edit(book, lab, anchors, t, recipe):
    code, lines = build_lines(book, lab, recipe, anchors)
    kept = [x for x in lines if x['role'] != 'removed']
    tot = M.comp_totals(kept)
    mo = recipe['moisture']
    if t['cooking_class'] != recipe['cooking_class']:
        raise SystemExit(f"{t['variant_key']}: cooking class differs from its recipe")
    if mo['rule'] == 'target':
        basis = mo['basis']
        if not basis.startswith('lab:'):
            raise SystemExit(f"{t['variant_key']}: a target moisture needs a lab anchor")
        if t['cooking_class'] not in M.ANCHOR_ONLY:
            raise SystemExit(f"{t['variant_key']}: lab anchors are only for {sorted(M.ANCHOR_ONLY)}")
        lid = basis.split(':', 1)[1]
        if lab.matched.get(lid, (None,))[0] != code:
            raise SystemExit(f'{t["variant_key"]}: lab {lid} is not the INDB match of {code} (anchors resolve for INDB codes only)')
        w_star = float(lab.lab[lid]['water_g']) / 100
        Wc = tot['S'] / (1 - w_star)
        rule, target_pct, mbasis = 'target', d2(w_star * 100), basis
    elif mo['rule'] == 'keep':
        Wc = tot['W']
        # every listed gram stays (Wc = W); a water line that was SET or SOLVED to an external anchor's measured water
        # (biryani: Khan 2019; dal makhani: CoFID 12-468) records that water as the target the lines reach
        wchk = (recipe.get('checks') or {}).get('water_pct')
        target_pct = d2(float(anchors[wchk['anchor']]['water_g'])) if wchk else None
        rule, mbasis = 'keep', mo['basis']
    else:
        raise SystemExit(f"{t['variant_key']}: moisture rule {mo['rule']}")
    s = 100.0 / Wc
    o = {k: tot[k] * s for k in ('P', 'C', 'F', 'Fib')}
    o['water'] = 100.0 * (1 - tot['S'] / Wc)
    vals = per100_from(o)
    evaporated = sum(x.get('evaporated_g') or 0.0 for x in kept)
    W_pot = tot['W'] + evaporated
    fa = 100.0 * tot['fat_lines'] / Wc
    base = None
    if fa > 0.005:
        bx = {k: (o[k] - (fa if k == 'F' else 0.0)) * 100 / (100 - fa) for k in ('P', 'C', 'F', 'Fib')}
        bv = per100_from({**bx, 'water': o['water']})
        base = {k: float(bv[k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}
    checks, fails = [], []
    for name, spec in sorted((recipe.get('checks') or {}).items()):
        if name == 'fat_share_of_dry_matter':
            want = lab_fat_share(lab, spec['lab']) * 100
            got = tot['F'] / tot['S'] * 100
            ok = abs(got - want) <= spec['tol_pct_points']
            checks.append(dict(check=name, lab=spec['lab'], want_pct=round(want, 3), got_pct=round(got, 3), ok=ok))
        elif name == 'water_pct':
            want = float(anchors[spec['anchor']]['water_g'])
            got = o['water']
            ok = abs(got - want) <= spec['tol_pct_points']
            checks.append(dict(check=name, anchor=spec['anchor'], want_pct=want, got_pct=round(got, 3), ok=ok))
        else:
            raise SystemExit(f'unknown check {name}')
        if not ok:
            fails.append(f"{t['variant_key']}: {name} {checks[-1]}")
    def grain_codes(cc):
        return cc['grain_codes'] if 'grain_codes' in cc else [cc['grain_code']]

    cross = []
    for cc in recipe.get('cross_checks') or []:
        a = anchors[cc['anchor']]
        codes = grain_codes(cc)
        grain = sum(x['g'] for x in kept if x['code'] in codes)
        dish_g = Wc * a['dry_grain_g'] / grain
        kcal = float(vals['kcal']) * dish_g / 100
        cross.append(dict(anchor=cc['anchor'], grain_code='+'.join(codes), dry_grain_g=a['dry_grain_g'],
                          dish_g=float(d2(dish_g)), kcal=float(d2(kcal)), reference_kcal=a['kcal'],
                          dev_pct=float(R.d1((kcal / a['kcal'] - 1) * 100)), cup_ml=a['cup_ml'],
                          density_g_per_ml=float(d2(dish_g / a['cup_ml']))))
    first = next(iter(recipe.get('cross_checks') or []), None)
    grain_code = '+'.join(grain_codes(first)) if first else None
    grain_g = sum(x['g'] for x in kept if x['code'] in grain_codes(first)) if first else None
    # servings the implied dry grain is reported for: the 054 plates for grain dishes (spec (i)5), the dal-family
    # katori and bowl for a legume curry
    plates = (100, 150, 240) if t['cooking_class'] == 'legume_curry' else (100, 150, 250)
    E_lab = 4 * float(vals['protein']) + 9 * float(vals['fat']) + 4 * (float(vals['carbs']) + float(vals['fiber']))
    ref = None
    if mo['rule'] == 'target':
        lid = mo['basis'].split(':', 1)[1]
        L = lab.lab[lid]
        ref = dict(lab_id=lid, lab_dish=L['dish'], lab_kcal=float(L['energy_kcal']), lab_water_g=float(L['water_g']),
                   lab_fat_g=float(L['fat_g']), shipped_lab_convention_kcal=float(d2(E_lab)),
                   err_pct=float(R.d1((E_lab / float(L['energy_kcal']) - 1) * 100)),
                   convention='lab: 4P + 9F + 4(CHO + fibre)', basis='recipe maths at the lab dish\'s own moisture; '
                   'not independent (the anchor is this dish)')
        # per macro, not only energy: the fat is matched by the oil rule, protein and carbohydrate are recipe maths
        # (lab CHO is by difference and includes fibre, so its available carbohydrate is CHO - fibre)
        lab_m = dict(protein=float(L['protein_g']), carbs=float(L['cho_g_by_difference']) - float(L['fiber_g']),
                     fat=float(L['fat_g']), fiber=float(L['fiber_g']))
        ref['macros_vs_lab'] = {k: dict(lab=round(lab_m[k], 2), shipped=float(vals[k]),
                                        diff_pct=float(R.d1((float(vals[k]) / lab_m[k] - 1) * 100)))
                                for k in ('protein', 'carbs', 'fat', 'fiber')}
        ref['protein_top_lines'] = [dict(code=x['code'], name=x['name'], g=float(d2(x['g'])), protein_g=float(d2(x['P'])))
                                    for x in sorted(kept, key=lambda y: -y['P'])[:2]]
    for spec in (recipe.get('checks') or {}).values():
        if 'anchor' in spec:
            a = anchors[spec['anchor']]
            ref = dict(anchor=spec['anchor'], citation=a['citation'], anchor_kcal=a['energy_kcal'],
                       anchor_water_g=a['water_g'], anchor_fat_g=a['fat_g'], anchor_protein_g=a['protein_g'],
                       shipped_lab_convention_kcal=float(d2(E_lab)),
                       err_pct=float(R.d1((E_lab / a['energy_kcal'] - 1) * 100)),
                       convention='anchor: 4P + 9F + 4(CHO + fibre)', basis='moisture set to the anchor; energy and fat are '
                       'recipe maths (a different recipe from the anchor\'s)')
            if a.get('energy_comparable') is False:
                # a different dish (dal makhani vs a plain urad dal): its water is the anchor, its energy is not
                del ref['err_pct']
                ref.update(shipped_water_g=float(d2(o['water'])), basis='moisture only: the water line is simmered '
                           'down to the anchor\'s measured water; the anchor is a different dish (no butter or cream), '
                           'so its energy and fat are not a check on this row')
    fat_lab = [c for c in checks if c['check'] == 'fat_share_of_dry_matter']
    if fat_lab and mo['rule'] == 'keep':
        L = lab.lab[fat_lab[0]['lab']]
        k = (100 - o['water']) / (100 - float(L['water_g']))       # the lab dish rehydrated to this row's water
        reh = dict(kcal=float(d2(float(L['energy_kcal']) * k)), fat=float(d2(float(L['fat_g']) * k)),
                   protein=float(d2(float(L['protein_g']) * k)))
        ref = dict(lab_id=fat_lab[0]['lab'], lab_dish=L['dish'], lab_kcal=float(L['energy_kcal']),
                   lab_water_g=float(L['water_g']), lab_fat_g=float(L['fat_g']),
                   lab_rehydrated_to_row_water=reh, shipped_lab_convention_kcal=float(d2(E_lab)),
                   err_vs_rehydrated_pct=float(R.d1((E_lab / reh['kcal'] - 1) * 100)),
                   convention='lab: 4P + 9F + 4(CHO + fibre)',
                   basis="fat rule only; the lab's 22.3% water is not a moisture anchor (drier than the unsoaked mix)")
    der = dict(variant_key=t['variant_key'], id=uid(CALC, t['variant_key']), calc_version=CALC, method=t['method'],
               method_sql='recipe_recalc', recipe_ref=t['recipe_ref'], base_recipe=f"INDB:{code}@"
               f"{indb.load_sources()['indb_repo']['commit'][:7]}", indb_code=code, indb_name=None,
               cooking_class=t['cooking_class'], moisture_rule=rule, moisture_target_pct=target_pct,
               moisture_basis=mbasis, yield_factor=d2(Wc / W_pot), alpha=None, frying_oil_removed_g=None,
               values=vals, water_exact=o['water'],
               fat_components=dict(ingredient=float(d2(o['F'] - fa)), added=float(d2(fa)), absorbed=0.0),
               base_per_100g=base, confidence=t['confidence'], review_note=t['review_note'],
               approved_by=t['approved_by'], energy_basis='FNP77:4P+9F+4CHOavl+2FIB',
               lines=[dict(i=x['i'], code=x['code'], name=x['name'], as_written=x['as_written'], label=x['text'],
                           g=float(d2(x['g'])), g_as_written=None if x['g_as_written'] is None else float(d2(x['g_as_written'])),
                           water_g=float(d2(x['water'])), role=x['role'])
                      for x in sorted(lines, key=lambda y: (y['i'] is None, y['i'] if y['i'] is not None else 0))],
               raw_w=float(d2(W_pot)), evaporated_g=float(d2(evaporated)), dry_matter_g=float(d2(tot['S'])),
               cooked_w=float(d2(Wc)),
               e_indb_conv=float(d2(tot['kcal'] * s)), checks=checks, cross_checks=cross, referee=ref,
               grain_code=grain_code, grain_g=grain_g,
               grain_per_plate_g={str(p): float(d2(p * grain_g / Wc)) for p in plates} if grain_g else None)
    der['indb_name'] = book.name(code)
    return der, fails


# ── copy_usda: one SR Legacy food from the pinned bulk file ─────────────────────────────────────────────
SR_NUTRIENTS = {'1008': 'kcal', '1003': 'protein', '1005': 'carbs', '1004': 'fat', '1079': 'fiber', '1051': 'water'}


def sr_food(fdc_id):
    pin = json.load(open(USDA_SOURCES, encoding='utf-8'))['sr']
    path = os.path.join(USDA_CACHE, pin['file'])
    if not os.path.exists(path):
        raise SystemExit(f'{path} missing: run `npx tsx scripts/import-usda.ts fetch` (pinned, SHA-256 checked)')
    blob = open(path, 'rb').read()
    if hashlib.sha256(blob).hexdigest() != pin['sha256']:
        raise SystemExit(f'{path}: SHA-256 differs from scripts/usda/sources.json')
    z = zipfile.ZipFile(io.BytesIO(blob))

    def rows(name):
        n = next(x for x in z.namelist() if x.endswith('/' + name))
        with z.open(n) as fh:
            yield from csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8'))

    desc = next(r['description'] for r in rows('food.csv') if r['fdc_id'] == str(fdc_id))
    raw = {SR_NUTRIENTS[r['nutrient_id']]: r['amount'] for r in rows('food_nutrient.csv')
           if r['fdc_id'] == str(fdc_id) and r['nutrient_id'] in SR_NUTRIENTS}
    return dict(fdc_id=fdc_id, description=desc, release=pin['release'], file=pin['file'], sha256=pin['sha256'], raw=raw)


def derive_usda(t):
    ds, kind, fdc = t['recipe_ref'].split(':')
    if (ds, kind) != ('USDA', 'SR'):
        raise SystemExit(f"{t['recipe_ref']}: copy_usda reads SR Legacy only")
    f = sr_food(int(fdc))
    vals = {k: sig3(f['raw'][k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}
    water = sig3(f['raw']['water'])
    vals['water'] = None
    return dict(variant_key=t['variant_key'], id=uid(CALC, t['variant_key']), calc_version=CALC, method='copy_usda',
                method_sql='copy_reference', recipe_ref=f"USDA:SR:{fdc}", cooking_class=None, moisture_rule='asis',
                moisture_target_pct=None, moisture_basis=f'copy:usda_sr:{fdc}', yield_factor=None, alpha=None,
                frying_oil_removed_g=None, values=vals, water_g=water,
                fat_components=dict(ingredient=float(vals['fat']), added=0.0, absorbed=0.0), base_per_100g=None,
                confidence=t['confidence'], review_note=t['review_note'], approved_by=t['approved_by'],
                energy_basis='USDA SR Legacy as published (Atwater specific factors); FDC 3-significant-figure presentation',
                lines=[dict(copy_of=f'usda_sr:{fdc}', description=f['description'], release=f['release'],
                            file=f['file'], sha256=f['sha256'], raw=f['raw'],
                            presented={k: str(v) for k, v in vals.items() if v is not None}, water=str(water))],
                referee=None, sr=f)


# ── plan ───────────────────────────────────────────────────────────────────────────────────────────
def parse_portions(s):
    return json.loads(s) if s else None


def units_for(food_item_id, portions, extra, approved_by, variant, cls, food_default=True):
    """Founder portion_units rows for one new row. food_default=False (a key copy whose source row has no food-level
    founder units): no unit is the row's no-amount default, so a log with no amount reads the category's serving, as
    it does for the source row (054's dry-sabzi / bhindi 150 g 'sabzi-no-amount' serving); the katori stays a unit."""
    out = []
    for i, p in enumerate(portions):
        units = DESC_UNITS.get(p['description'])
        if not units:
            raise SystemExit(f'{variant}: portion text {p["description"]!r} names no unit (DESC_UNITS)')
        for k, u in enumerate(units):
            out.append(dict(food_item_id=food_item_id, unit=u, size='M', grams=Decimal(str(p['gramWeight'])),
                            ml=Decimal(CUP_ML) if u == 'cup' else None, context=None,
                            is_default=(food_default and i == 0 and k == 0), source_text=p['description']))
    for e in extra or []:
        out.append(dict(food_item_id=food_item_id, unit=e['unit'], size=e['size'], grams=Decimal(str(e['grams'])),
                        ml=None, context=e.get('context'), is_default=bool(e.get('is_default')),
                        source_text=e['source_text']))
    for r in out:
        r.update(id=pu_id(food_item_id, r['unit'], r['size'], r['context']), approved_by=approved_by,
                 source_ref=portion_source_ref(approved_by),
                 evidence=f"migration 058 (scripts/recalc/batch2.py, variant {variant}); category {cls}; "
                          f"spec .claude/plans/v1.2-recalc-053-spec.md section (i)")
    return out


def values_of(row):
    return {k: dec(row[k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}


def build_plan(book, lab, anchors, snap):
    targets = read_csv2('targets.csv')
    recipes = read_json2('recipes.json')
    rows = {r['id']: r for r in snap['rows']}
    der, new_rows, old_rows, sources, fails = [], [], [], [], []
    successor = {}

    def add_row(t, dv, key, name, predecessor, fallback, source, ext, fdc, values, deriv_id, is_canonical, why, kind):
        """kind: 'successor' (takes a superseded row's key; fallback = that row), 'key_copy' (a new key on a copy of a
        live 053 row; fallback = the copy source) or 'new_key' (a new key on a new recipe; fallback = the same-food row
        its variant supersedes, so the down script can move a memory pointer instead of dropping it)."""
        if norm_key(key) != key:
            raise SystemExit(f"{t['variant_key']}: key {key!r} is not normalized")
        new_rows.append(dict(id=uid(CALC, t['variant_key'], key), variant=t['variant_key'], derivation_id=deriv_id,
                             name=name, source=source, external_id=ext, fdc_id=fdc, key=key, kind=kind,
                             portions=parse_portions(t['portions']), extra_units=parse_portions(t['extra_units']),
                             category=t['portion_category'], values=values, is_canonical=is_canonical,
                             predecessor=predecessor, fallback=fallback, method=t['method'],
                             status_reason=f"reviewed:{MIG}:{CALC}:{t['variant_key']}", key_reason=why,
                             portion_approved_by=t['portion_approved_by']))
        return new_rows[-1]['id']

    for t in targets:
        m = t['method']
        if m not in METHODS:
            raise SystemExit(f"{t['variant_key']}: method {m}")
        if not t['approved_by'] or not t['portion_approved_by'] or not t['portions'] or not t['portion_category']:
            raise SystemExit(f"{t['variant_key']}: every batch-2 row needs a key approval, portions, their approval and a category")
        keys, names = split_list(t['new_key']), split_list(t['new_name'])
        if len(keys) != len(names):
            raise SystemExit(f"{t['variant_key']}: new_key and new_name need one name per key")
        if m == 'key_copy':
            sid = t['recipe_ref'].split(':', 1)[1]
            src = rows[sid]
            dsrc = src.get('derivation') or {}
            if src['status'] != 'verified' or not src['derivation_id'] or dsrc.get('calc_version') != 'recalc_v1':
                raise SystemExit(f'{sid[:8]}: a key copy needs a verified 053 row with its derivation')
            if any(dec(dsrc[k]) != dec(src[k]) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')):
                raise SystemExit(f'{sid[:8]}: row numbers differ from its 053 derivation')
            if not keys:
                raise SystemExit(f"{t['variant_key']}: key_copy needs keys")
            sources.append(dict(src, variant=t['variant_key']))
            for key, name in zip(keys, names):
                add_row(t, None, key, name, None, sid, src['source'], src['external_id'], src['fdc_id'], values_of(src),
                        src['derivation_id'], False, f"new key, copy of {sid[:8]}; approved by {t['approved_by']}",
                        'key_copy')
            der.append(dict(variant_key=t['variant_key'], id=src['derivation_id'], calc_version='recalc_v1',
                            existing=True, method='key_copy', method_sql=None, copy_of=sid,
                            existing_variant=dsrc['variant_key'], values=values_of(src), confidence=dsrc.get('confidence'),
                            review_note=t['review_note'], approved_by=t['approved_by'], search_check=t['search_check'],
                            canonical_row=None))
            continue
        if m == 'recipe_edit':
            dv, f = derive_edit(book, lab, anchors, t, recipes[t['recipe_ref']])
            fails += f
            source, ext, fdc = 'indb', t['recipe_ref'], None
        else:
            dv = derive_usda(t)
            fdc_num = t['recipe_ref'].split(':')[2]
            # fdc_id deliberately NULL: an fdc-keyed portion_units row (FDC 173291's '1 pizza' = 897 g in 054, the
            # 2708614 rows of pending 056) attaches to any row carrying that fdc_id (portions.ts fdcRows).
            source, ext, fdc = 'usda', f'fdc:{fdc_num}@{CALC}', None
        dv['search_check'] = t['search_check']
        der.append(dv)
        rels = {}
        for part in split_list(t['supersedes'].replace(';', '|')):
            oid, rel = part.split(':')
            if rel not in RELATIONS:
                raise SystemExit(f'{oid[:8]}: relation {rel}')
            rels[oid] = rel
            r = rows[oid]
            nid = add_row(t, dv, r['key'], r['name'], oid, oid, source, ext, fdc, dv['values'], dv['id'],
                          oid == t['canonical'], f'key taken over from {oid[:8]}', 'successor')
            successor[oid] = nid
            old_rows.append(dict(old_id=oid, variant=t['variant_key'], kind='supersede', new_id=nid, relation=rel,
                                 expect_key=r['key'], row=r, reason=f'reviewed:{MIG}:superseded:{rel}:{nid[:8]}',
                                 expect_memory=int(snap['memory'].get(oid, 0))))
        # a new key of a superseding variant falls back (down script, memory) to the same-food row the variant
        # supersedes; never to a row that was the wrong food for its phrase
        same_food = t['canonical'] if rels.get(t['canonical']) == 'same_food_revised' else None
        for key, name in zip(keys, names):
            add_row(t, dv, key, name, None, same_food, source, ext, fdc, dv['values'], dv['id'], False,
                    f"new key, approved by {t['approved_by']}", 'new_key')
        dv['canonical_row'] = successor.get(t['canonical'])
    by_id = {r['id']: r for r in new_rows}
    by_key = {r['key']: r for r in new_rows}
    # portions: founder portion_units rows (054's table) + one category-map row per new row
    units, cmap = [], []
    src_food_units = {u['food_item_id'] for u in snap['portion_units'] if u['food_item_id']}
    for r in new_rows:
        # a key copy serves exactly what its source serves: where the source has no food-level founder units (aloo
        # 1abbe3e2, bhindi cd15763a), its no-amount serving is the category's, so the copy sets no default either
        r['food_default'] = r['kind'] != 'key_copy' or r['fallback'] in src_food_units
        units += units_for(r['id'], r['portions'], r['extra_units'], r['portion_approved_by'], r['variant'], r['category'],
                           food_default=r['food_default'])
        cmap.append(dict(food_item_id=r['id'], category=r['category'],
                         note=f"058 {r['variant']} ({r['key']}): founder portions, spec (i)"))
    # aliases (053's rules): an alias whose words become an exact key retires, allowed only when the key row carries
    # the very numbers the alias would serve after 058 (its row's successor, or its row) and the same portions or a
    # founder-approved portion change; an alias at a superseded row follows it to its successor.
    alias_ops = []
    for a in sorted(snap['aliases'], key=lambda x: x['alias']):
        old_t = a['food_item_id']
        if old_t in successor:
            st = by_id[successor[old_t]]
            serves = (st['values'], st['portions'])
        else:
            src = rows.get(old_t)
            serves = None if src is None else (values_of(src), src['portions'])
        if a['alias'] in by_key:
            nr = by_key[a['alias']]
            same_nums = serves is not None and all(nr['values'][k] == serves[0][k] for k in ('kcal', 'protein', 'carbs',
                                                                                           'fat', 'fiber'))
            if nr['predecessor'] is not None or not same_nums:
                raise SystemExit(f"alias {a['alias']!r} would equal the new key of {nr['id'][:8]}, which is not a copy of "
                                 f"what the alias serves ({old_t[:8]})")
            b = rows[old_t]
            pchg = '' if nr['portions'] == serves[1] else f"; portions approved by {nr['portion_approved_by']}"
            note = (f"{MIG}: retired; the exact key '{a['alias']}' on {nr['id'][:8]} serves the phrase in every search "
                    f"mode ({nr['values']['kcal']} kcal/100 g, {R.fmt_portions(nr['portions'])}{pchg}). Before {MIG} "
                    f"the alias served {old_t[:8]} ({b['kcal']} kcal/100 g, {R.fmt_portions(b['portions'])}), in ranked "
                    f"mode only")
            alias_ops.append(dict(kind='retire', alias=a['alias'], expect=old_t, target=nr['id'], note=note,
                                  old_note=a['note']))
        elif old_t in successor:
            nr = by_id[successor[old_t]]
            alias_ops.append(dict(kind='repoint', alias=a['alias'], expect=old_t, target=nr['id'], old_note=a['note'],
                                  note=f"{a['note']}; {MIG}: now {nr['id'][:8]} ({nr['values']['kcal']} kcal/100 g)"))
    memory = [dict(old_id=o['old_id'], new_id=o['new_id'], n=int(snap['memory'].get(o['old_id'], 0)))
              for o in old_rows]
    plan = dict(derivations=sorted(der, key=lambda d: d['variant_key']), new_rows=sorted(new_rows, key=lambda r: r['id']),
                old_rows=sorted(old_rows, key=lambda r: r['old_id']), sources=sorted(sources, key=lambda r: r['id']),
                aliases=sorted(alias_ops, key=lambda a: (a['kind'], a['alias'])), memory=memory, successor=successor,
                units=sorted(units, key=lambda u: u['id']), category_map=sorted(cmap, key=lambda c: c['food_item_id']),
                snapshot=snap, fails=fails)
    check_plan(plan)
    return plan


def check_plan(plan):
    """Invariants the migration re-checks in SQL; failing here means the inputs are wrong."""
    snap = plan['snapshot']
    keys_new = [r['key'] for r in plan['new_rows']]
    if len(keys_new) != len(set(keys_new)):
        raise SystemExit('two new rows take the same key')
    olds = {o['old_id'] for o in plan['old_rows']}
    for h in snap['key_holders']:
        if h['normalized_name'] in keys_new and h['id'] not in olds:
            raise SystemExit(f"key {h['normalized_name']!r} is already held by {h['id'][:8]}")
    retired = {a['alias'] for a in plan['aliases'] if a['kind'] == 'retire'}
    for a in snap['aliases']:
        if a['alias'] in keys_new and a['alias'] not in retired:
            raise SystemExit(f"new key {a['alias']!r} is also an alias")
    for o in plan['old_rows']:
        if o['row']['created_by_null'] is not True or o['row']['status'] != 'verified':
            raise SystemExit(f"{o['old_id'][:8]}: 058 only supersedes verified, ownerless reference rows")
        if o['old_id'] in {s['id'] for s in plan['sources']}:
            raise SystemExit(f"{o['old_id'][:8]} is both superseded and a copy source")
        if o['relation'] == 'wrong_food_for_phrase' and o['expect_memory']:
            # a user-taught pointer at a wrong-food row would silently become another food (home sausage pizza ->
            # chain cheese pizza) with the user's own portions: that needs a decision, not a repoint
            raise SystemExit(f"{o['old_id'][:8]}: {o['expect_memory']} memory pointers at a wrong_food_for_phrase row; "
                             f"decide drop vs repoint before 058 ships")
    for r in plan['new_rows']:
        if r['kind'] == 'new_key' and r['fallback'] is not None and r['fallback'] not in plan['successor']:
            raise SystemExit(f"{r['key']}: fallback {r['fallback'][:8]} is not a row this variant supersedes")
    cats = set(snap['categories'])
    for r in plan['new_rows']:
        if r['fdc_id'] is not None:
            raise SystemExit(f"{r['key']}: 058 rows carry no fdc_id (fdc-keyed portion units must not attach)")
        if r['category'] not in cats:
            raise SystemExit(f"{r['key']}: portion category {r['category']} missing in the snapshot")
    present = set(snap.get('planned_ids_present') or [])
    if present:
        raise SystemExit(f'planned ids already exist live: {sorted(present)}')
    ids = [u['id'] for u in plan['units']]
    if len(ids) != len(set(ids)):
        raise SystemExit('two portion units share an id')


# ── snapshot (READ-ONLY query, run by a person with the CLI) ────────────────────────────────────────────
def touched_ids():
    """(id, kind, variant) for every live row 058 reads: superseded rows and copy sources."""
    out = []
    for t in read_csv2('targets.csv'):
        if t['method'] == 'key_copy':
            out.append((t['recipe_ref'].split(':', 1)[1], 'source', t['variant_key']))
        for part in split_list(t['supersedes'].replace(';', '|')):
            out.append((part.split(':')[0], 'supersede', t['variant_key']))
    return sorted(set(out))


def snapshot_phrases():
    ph = set(SNAPSHOT_EXTRA)
    for t in read_csv2('targets.csv'):
        ph.update(split_list(t['new_key']))
    return sorted(ph)


def snapshot_sql():
    ids = touched_ids()
    idv = ',\n    '.join(f"('{i}'::uuid, '{k}', '{v}')" for i, k, v in ids)
    phrases = snapshot_phrases()
    ph = ', '.join("'" + p + "'" for p in phrases)
    new_ids = sorted(uid(CALC, t['variant_key'], k) for t in read_csv2('targets.csv') for k in split_list(t['new_key']))
    nid = ', '.join(f"'{i}'" for i in new_ids)
    cats = sorted({t['portion_category'] for t in read_csv2('targets.csv')})
    cv = ', '.join(f"'{c}'" for c in cats)
    return f"""-- scripts/recalc/data/batch2/snapshot.sql — GENERATED by `batch2.py snapshot --sql` from data/batch2/targets.csv. READ-ONLY.
-- Run:  npx supabase db query --linked -o json -f scripts/recalc/data/batch2/snapshot.sql > <scratch>/snapshot2_raw.json
--       python3 -I scripts/recalc/batch2.py snapshot --ingest <scratch>/snapshot2_raw.json
-- One SELECT, no writes. Returns the rows 058 supersedes or copies (numbers as text, so they round-trip exactly) with
-- their 053 derivation, every alias, who holds a key 058 assigns or touches, memory pointer COUNTS, the portion rows
-- and category-map rows of those rows, and, per phrase, the verified exact holder and real-user usage COUNTS (the
-- eval account excluded). No user id, email or private food name leaves the database.
WITH ids(id, kind, variant) AS (VALUES
    {idv}),
ph(q) AS (SELECT unnest(ARRAY[{ph}]::text[])
          UNION SELECT coalesce(fi.normalized_name, fi.parked_normalized_name) FROM public.food_items fi JOIN ids ON ids.id = fi.id),
usage AS (
  SELECT p.q, count(*) AS e, count(DISTINCT fe.user_id) AS u
    FROM ph p JOIN public.food_entries fe
      ON btrim(regexp_replace(regexp_replace(lower(fe.food_name), '[^[:alnum:][:space:]]', ' ', 'g'), '\\s+', ' ', 'g')) = p.q
   WHERE fe.user_id NOT IN (SELECT u.id FROM auth.users u WHERE u.email LIKE '%@steadyapp.internal')
   GROUP BY 1
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
  'verified_keyless', (SELECT count(*) FROM public.food_items WHERE status = 'verified' AND normalized_name IS NULL),
  'rows', (SELECT jsonb_agg(jsonb_build_object(
      'id', fi.id, 'kind', ids.kind, 'variant', ids.variant, 'source', fi.source, 'name', fi.name,
      'external_id', fi.external_id, 'fdc_id', fi.fdc_id::text, 'normalized_name', fi.normalized_name,
      'parked_normalized_name', fi.parked_normalized_name, 'key', coalesce(fi.normalized_name, fi.parked_normalized_name),
      'status', fi.status, 'status_reason', fi.status_reason, 'created_by_null', fi.created_by IS NULL,
      'kcal', fi.calories_per_100g::text, 'protein', fi.protein_per_100g::text, 'carbs', fi.carbs_per_100g::text,
      'fat', fi.fat_per_100g::text, 'fiber', fi.fiber_per_100g::text, 'portions', fi.portions,
      'derivation_id', di.derivation_id, 'is_canonical', di.is_canonical,
      'derivation', (SELECT jsonb_build_object('calc_version', d.calc_version, 'variant_key', d.variant_key,
                       'kcal', d.kcal::text, 'protein', d.protein_g::text, 'carbs', d.carbs_g::text, 'fat', d.fat_g::text,
                       'fiber', d.fiber_g::text, 'confidence', d.confidence) FROM public.food_derivations d WHERE d.id = di.derivation_id))
      ORDER BY fi.id)
    FROM public.food_items fi JOIN ids ON ids.id = fi.id LEFT JOIN public.food_derivation_items di ON di.food_item_id = fi.id),
  'aliases', (SELECT jsonb_agg(jsonb_build_object('alias', a.alias, 'food_item_id', a.food_item_id, 'note', a.note)
                               ORDER BY a.alias) FROM public.food_aliases a),
  'key_holders', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', fi.id, 'normalized_name', fi.normalized_name,
                                                               'status', fi.status) ORDER BY fi.normalized_name), '[]')
                    FROM public.food_items fi WHERE fi.normalized_name IN (SELECT q FROM ph)),
  'memory', (SELECT coalesce(jsonb_object_agg(m.food_item_id, m.n), '{{}}')
               FROM (SELECT food_item_id, count(*) n FROM public.user_food_memory
                      WHERE food_item_id IN (SELECT id FROM ids) GROUP BY 1) m),
  'portion_units', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', pu.id, 'food_item_id', pu.food_item_id,
                       'fdc_id', pu.fdc_id::text, 'unit', pu.unit, 'size', pu.size, 'grams', pu.grams::text,
                       'ml', pu.ml::text, 'context', pu.context, 'is_default', pu.is_default, 'source', pu.source,
                       'status', pu.status, 'source_text', pu.source_text) ORDER BY pu.id), '[]')
                      FROM public.portion_units pu
                     WHERE pu.food_item_id IN (SELECT id FROM ids)
                        OR pu.fdc_id IN (SELECT fi.fdc_id FROM public.food_items fi JOIN ids ON ids.id = fi.id)),
  'category_map', (SELECT coalesce(jsonb_object_agg(m.food_item_id, m.category), '{{}}')
                     FROM public.portion_category_map m WHERE m.food_item_id IN (SELECT id FROM ids)),
  'categories', (SELECT coalesce(jsonb_agg(c.category ORDER BY c.category), '[]') FROM public.portion_categories c
                  WHERE c.category IN ({cv})),
  'planned_ids_present', (SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), '[]') FROM (
        SELECT fi.id FROM public.food_items fi WHERE fi.id::text IN ({nid})
        UNION SELECT pu.food_item_id FROM public.portion_units pu WHERE pu.food_item_id::text IN ({nid})) x),
  'fdc_peers', (SELECT coalesce(jsonb_object_agg(fi.fdc_id::text, (SELECT count(*) FROM public.food_items o
                   WHERE o.fdc_id = fi.fdc_id AND o.status = 'verified' AND o.id <> fi.id)), '{{}}')
                  FROM public.food_items fi JOIN ids ON ids.id = fi.id WHERE fi.fdc_id IS NOT NULL),
  'fts', (SELECT jsonb_object_agg(p.q, jsonb_build_object(
      'exact', (SELECT fi.id FROM public.food_items fi WHERE fi.normalized_name = p.q AND fi.status = 'verified'),
      'live', (SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), '[]') FROM (SELECT fi.id FROM public.food_items fi
                 WHERE fi.status = 'verified' AND fi.calories_per_100g IS NOT NULL
                   AND to_tsvector('english', fi.name) @@ websearch_to_tsquery('english', p.q) ORDER BY fi.id LIMIT 3) x)))
            FROM ph p),
  'phrase_usage', (SELECT coalesce(jsonb_object_agg(u.q, jsonb_build_object('entries', u.e, 'users', u.u)), '{{}}') FROM usage u),
  'usage_by_row', (SELECT coalesce(jsonb_object_agg(x.food_item_id, jsonb_build_object('entries', x.e, 'users', x.u)), '{{}}')
                     FROM (SELECT food_item_id, count(*) e, count(DISTINCT user_id) u FROM real GROUP BY 1) x)
) AS snapshot;
"""


def ingest_snapshot(raw_path):
    raw = open(raw_path, encoding='utf-8').read()
    obj = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
    snap = obj['rows'][0]['snapshot'] if 'rows' in obj else obj
    if isinstance(snap, str):
        snap = json.loads(snap)
    snap['_note'] = ('Output of data/batch2/snapshot.sql (read-only) against the live project. Counts only: no user id, '
                     'email or private food name. Re-take it right before `db push`; migration 058 compares every '
                     'touched row, alias and key holder against these values and refuses to run if any changed.')
    with open(os.path.join(DATA2, 'snapshot.json'), 'w', encoding='utf-8') as fh:
        fh.write(R.dumps(snap))
    missing = sorted({i for i, _, _ in touched_ids()} - {r['id'] for r in snap['rows']})
    print(f"snapshot {snap['taken_at']}: {len(snap['rows'])} rows, {len(snap['aliases'])} aliases, verified "
          f"{snap['verified_count']}, migrations ..{snap['migrations'][-1]}; missing {missing}")
    return 1 if missing else 0


# ── validation ───────────────────────────────────────────────────────────────────────────────────────
def validate(plan, quiet=False):
    import emit53
    import emit58
    fails, notes = list(plan['fails']), []
    der = {d['variant_key']: d for d in plan['derivations']}
    for d in plan['derivations']:
        for c in d.get('checks') or []:
            notes.append(f"{d['variant_key']}: {c['check']} {c['got_pct']}% (want {c['want_pct']}%) -> "
                         f"{'pass' if c['ok'] else 'FAIL'}")
        for c in d.get('cross_checks') or []:
            notes.append(f"{d['variant_key']}: {c['dry_grain_g']} g dry grain = {c['dish_g']} g dish = {c['kcal']} kcal vs "
                         f"{c['anchor']} {c['reference_kcal']} ({c['dev_pct']:+}%, {c['density_g_per_ml']} g/ml in a "
                         f"{c['cup_ml']} ml measure; reported, not gated)")
        if d.get('grain_per_plate_g'):
            notes.append(f"{d['variant_key']}: dry {d['grain_code']} per serving {d['grain_per_plate_g']} g "
                         f"({'/'.join(d['grain_per_plate_g'])} g)")
    for vk, want in sorted(FOUNDER_VALUES.items()):
        v = der[vk]['values']
        for k, (w, tol, unit) in sorted(want.items()):
            got = float(v[k])
            dev = (got / w - 1) * 100 if unit == '%' else got - w
            ok = abs(dev) <= tol
            notes.append(f"founder value {vk} {k}: {got} vs {w} ({dev:+.2f}{'%' if unit == '%' else ''}, tol {tol}) -> "
                         f"{'pass' if ok else 'FAIL'}")
            if not ok:
                fails.append(f'{vk} {k} = {got}, founder {w}')
    for vk, want in sorted(PINNED_OUTPUTS.items()):
        v = der[vk]['values']
        for k, w in sorted(want.items()):
            ok = abs(float(v[k]) - w) <= 0.005
            notes.append(f"pinned output {vk} {k}: {v[k]} vs {w} (exact; awaiting founder sign-off) -> "
                         f"{'pass' if ok else 'FAIL'}")
            if not ok:
                fails.append(f'{vk} {k} = {v[k]}, pinned {w}: the inputs or the solver moved (re-check with the founder)')
    for r in plan['new_rows']:
        v = r['values']
        iss = emit53.food_item_issues_py(r['source'], r['name'], v)
        if iss:
            fails.append(f"{r['key']} ({r['variant']}): food_item_issues {iss}")
        if r['method'] == 'recipe_edit':
            e = 4 * v['protein'] + 9 * v['fat'] + 4 * v['carbs'] + 2 * v['fiber']
            if abs(v['kcal'] - e) > Decimal('0.5'):
                fails.append(f"{r['key']}: kcal {v['kcal']} != 4P+9F+4C+2fib {e}")
        if r['id'] != uid(CALC, r['variant'], r['key']):
            fails.append(f"{r['key']}: id is not UUIDv5({CALC}|{r['variant']}|{r['key']})")
        if r['fdc_id'] is not None:
            fails.append(f"{r['key']}: carries fdc_id {r['fdc_id']}")
        mine = [u for u in plan['units'] if u['food_item_id'] == r['id']]
        n_def = sum(1 for u in mine if u['is_default'] and u['context'] is None)
        if n_def != (1 if r['food_default'] else 0):
            fails.append(f"{r['key']}: {n_def} no-context default servings (want {1 if r['food_default'] else 0}: "
                         f"{'its own' if r['food_default'] else 'the category serves it, as for its copy source'})")
        for p in r['portions']:
            if not any(u['source_text'] == p['description'] and u['grams'] == Decimal(str(p['gramWeight'])) for u in mine):
                fails.append(f"{r['key']}: portion {p} has no portion_units row (054's compare-and-swap invariant)")
    # key copies: their portion_units match the copy source's own 054 founder rows, where it has any
    src_units = {}
    for u in plan['snapshot']['portion_units']:
        if u['food_item_id']:
            src_units.setdefault(u['food_item_id'], set()).add((u['unit'], u['size'], dec(u['grams']), dec(u['ml']),
                                                                u['context'], u['is_default'], u['source_text']))
    for r in plan['new_rows']:
        if r['method'] == 'key_copy' and r['fallback'] in src_units:
            mine = {(u['unit'], u['size'], u['grams'], u['ml'], u['context'], u['is_default'], u['source_text'])
                    for u in plan['units'] if u['food_item_id'] == r['id']}
            if mine != src_units[r['fallback']]:
                fails.append(f"{r['key']}: portion units differ from its copy source {r['fallback'][:8]}")
    pizza = [r for r in plan['new_rows'] if r['variant'] == 'pizza_cheese_sr173292']
    for r in pizza:
        mine = [(u['unit'], u['size'], float(u['grams']), u['context']) for u in plan['units'] if u['food_item_id'] == r['id']]
        if mine != [('slice', 'M', 110.0, None)]:
            fails.append(f'pizza portion units {mine}, founder: 1 slice = 110 g only')
    notes.append(f"keys: {len(plan['new_rows'])} new rows; aliases retired "
                 f"{', '.join(a['alias'] for a in plan['aliases'] if a['kind'] == 'retire') or 'none'}; repointed "
                 f"{', '.join(a['alias'] for a in plan['aliases'] if a['kind'] == 'repoint') or 'none'}")
    sha = inputs_sha256()
    for label, text in (('migration', emit58.migration_sql(plan, sha)), ('rollback', emit58.rollback_sql(plan, sha))):
        bad = emit53.history_writes(text)
        if bad:
            fails.append(f'{label} writes history tables: {bad}')
    if not quiet:
        for n_ in notes:
            print('  ·', n_)
        for f_ in fails:
            print('  ✗', f_)
        print(f"validate: {'OK' if not fails else 'FAILED'} ({len(plan['new_rows'])} new rows, {len(plan['old_rows'])} "
              f"quarantined, {len(plan['units'])} portion units, {len(plan['category_map'])} category-map rows)")
    return fails, notes


# ── outputs ─────────────────────────────────────────────────────────────────────────────────────────
def load_all():
    book = M.Book()
    lab = R.lab_obj()
    anchors = read_json2('anchors.json')
    snap = read_json2('snapshot.json')
    return book, lab, anchors, build_plan(book, lab, anchors, snap)


def render_all(plan):
    import emit58
    sha = inputs_sha256()
    fails, notes = validate(plan, quiet=True)
    if fails:
        raise SystemExit('validate failed; nothing emitted:\n  ' + '\n  '.join(fails))
    with open(OUTPUTS['search_check'], encoding='utf-8') as fh:
        sc_text = fh.read()
    return {
        'migration': emit58.migration_sql(plan, sha),
        'rollback': emit58.rollback_sql(plan, sha),
        'report': emit58.report_md(plan, notes, sha),
        'derivations': R.dumps(emit58.derivations_json(plan, sha)),
        'search_check': emit58.search_check(sc_text, plan),
    }


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    cmd = argv[0]
    if cmd == 'snapshot':
        if '--sql' in argv:
            with open(os.path.join(DATA2, 'snapshot.sql'), 'w', encoding='utf-8') as fh:
                fh.write(snapshot_sql())
            print('wrote data/batch2/snapshot.sql')
            return 0
        if '--ingest' in argv:
            return ingest_snapshot(argv[argv.index('--ingest') + 1])
        print('snapshot --sql | --ingest FILE')
        return 2
    if cmd == 'validate':
        _, _, _, plan = load_all()
        fails, _ = validate(plan)
        return 1 if fails else 0
    if cmd in ('emit', 'check'):
        _, _, _, plan = load_all()
        out = render_all(plan)
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
        if snapshot_sql() != open(os.path.join(DATA2, 'snapshot.sql'), encoding='utf-8').read():
            diffs.append('scripts/recalc/data/batch2/snapshot.sql (targets.csv changed; re-run snapshot --sql and re-take it)')
        for d in diffs:
            print('  ✗ differs:', d)
        print('check: OK, regenerated outputs are identical' if not diffs else f'check: FAILED ({len(diffs)})')
        return 1 if diffs else 0
    print('unknown command', cmd)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
