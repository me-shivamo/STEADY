"""recalc_v1: recalculate an INDB recipe as SERVED (cooked weight, frying oil absorbed, not counted whole), and
the calibration that fits its three free parameters against lab-analysed cooked Indian dishes.

THE METHOD (spec .claude/plans/v1.2-recalc-053-spec.md §(a); judged and pre-registered before scoring)
  Per kept ingredient line i: grams g_i (indb.amount_g), water w_i (IFCT 2017 moisture where the code has it;
  water lines count fully as water; fats, salt and leaveners 0; UK/US rows by difference, 100 - P - F - C -
  fibre - 1 g ash).
    Frying-oil lines are DROPPED: a fat line (code T*) annotated with "fry" text and >= 100 g, i.e. the pan of
    oil, which INDB counts as if every gram were eaten. A dish that is not deep-fried must not carry one: the
    generator refuses it (uttapam ASC148 has one) and a person has to edit the recipe.
    W = sum g_i, S = sum (g_i - w_i) = dry matter, N^k = sum g_i * n_i^k
    S_exp = dry matter of the fried part, excluding fats (T*), sugars (I*) and water/salt/leaveners (K*)
    A = alpha * S_exp                       oil the food actually absorbs, fried classes only
    Wc = (S + A) / (1 - w*)                 "target": cooked weight at the class's target moisture
    Wc = W + A                              "keep": every listed gram of water stays (a dish that lists no water
                                            at all, INDB regime D/D2, falls back to target)
    Wc = sum of components' Wc              stuffed paratha: dough to the flatbread-with-fat target, filling kept
    YF = Wc / W                             yield factor, EuroFIR definition
    x^k = 100 * (N^k + A*[k = fat]) / Wc    and water = 100 * (1 - (S + A) / Wc)
    E = 4P + 9F + 4 CHO_avl + 2 fibre       FAO FNP 77 factors (INDB stores available carbohydrate). Lab
                                            comparisons use the lab's own 4P + 9F + 4(CHO + fibre).

  Free parameters, fitted on the CALIBRATION half only: alpha (median of per-dish back-solved oil uptake), the
  per-class target moisture w* (median lab water of the class's calibration dishes, plus class-only lab dishes
  that have no INDB recipe and so can never be a test dish), and keep-vs-target per flexible class (whichever
  scores better on the calibration rows). The split is frozen in data/lab_split.csv: within a cooking class,
  dishes sorted by INDB recipe name alternate test/calibration (fold A); fold B swaps the halves.

WHY NOT JUST USE THE LAB'S MOISTURE FOR EVERY DISH IT HAS: when the recipe differs from the lab's dish, the lab
  moisture is the wrong anchor (bhindi anchored to the lab gives 183 vs lab 156; the sabzi class average gives
  141). Anchors are used only in classes that FAILED the class-average test (fritters, grain dishes, steamed
  batter), and the dish's confidence drops to C when the anchor's recipe is a mismatch.
"""
import math
import re
import statistics as st

import indb

FRY_TXT = re.compile(r'fr[yi]|fryng', re.I)
NO_WATER = {'G528', 'K501', 'K500', 'K504', 'K507'}  # salt, soda / baking powder etc.: ~0 moisture
WATER_CODE = 'K505'

FRIED = {'fried_bread', 'fritter', 'fried_namkeen', 'fried_syrup'}
ALWAYS_TARGET = FRIED | {'flatbread_dry', 'flatbread_fat', 'batter_griddle'}
FLEX = {'grain_boiled', 'grain_dish_dry', 'legume_curry', 'veg_dry', 'batter_steamed'}
BATTER_GRIDDLE_PROXY = 'flatbread_fat'   # no non-composite griddle-batter lab dish exists: pre-registered proxy
# Classes whose class-average moisture FAILED the held-out test: a dish there takes its own lab anchor, or keeps
# its recipe water (grains), never the class average.
ANCHOR_ONLY = {'fritter', 'grain_boiled', 'grain_dish_dry', 'batter_steamed'}


def est_water_g(code, g, f):
    if code == WATER_CODE:
        return g
    if code in NO_WATER or not f:
        return 0.0
    if f.get('water_g') is not None:          # IFCT 2017 measured moisture
        return g * f['water_g'] / 100.0
    if code.startswith('T'):
        return 0.0
    s = sum((f.get(k) or 0.0) for k in ('protein_g', 'fat_g', 'carb_g', 'fibre_g'))
    return g * max(0.0, 100.0 - s - 1.0) / 100.0   # UK/US rows carry no water column: by difference, ~1 g ash


# ── INDB "regime": how a recipe's own number was built (only D / D2 change a rule here) ──────────────
_NAME = [  # (signal, regex on the lower-cased recipe name); order matters for the primary method below
    ('deep_fry', r'poori|\bpuri\b|pakor|pakod|bhajia|\bbhaji(?!.*pav)|samosa|kachori|\bvada|\bvadas\b|wada|bonda|bhatur|jalebi|'
                 r'imarti|gulab jamun|malpua|mathri|namak par|shakarpar|chakli|murukku|\bsev\b|fritter|crispy|kofta|'
                 r'chips|nugget|doughnut|aigrette|balushahi|gujiya|karanji|boondi|papdi|bhalla|deep fried|namkeen|'
                 r'fried(?! rice)|manchurian|gobi 65|chilli paneer|chilli chicken|muthia'),
    ('shallow_fry_griddle', r'parantha|paratha|parotta|cheela|chilla|dosa|uttapam|uttappam|pesarattu|thepla|omelet|'
                            r'pancake|french toast|tikki|cutlet|shallow|appam|adai|puran ?poli|puranpoli|crepe|chop'),
    ('dry_griddle', r'\broti\b|chapati|phulka|bhakri|rumali|missi'),
    ('tandoor_grill_roast', r'tandoor|tikka|kebab|kabab|seekh|grill|barbecue|roast|naan|kulcha|steak'),
    ('bake', r'cake|cookie|biscuit|bread(?! pakor)|\bbun\b|pizza|\bpie\b|tart|muffin|bake|gratin|souffle|gateau|brownie|'
             r'loaf|scone|nankhatai|pastry|quiche|lasagn|casserole|macaroon|meringue|puffs|eclair|patties|swiss roll|'
             r'straws|flan|\\bbuns\\b|horns|shells|swans|pavlova|melting moments|coconut finger|chhena poda|handvo|'
             r'duchee?se|nests|basket|towers|putharekulu'),
    ('steam', r'idli|dhokla|khaman|momo|idiyappam|puttu|modak|patra|steamed|dumpling|khandvi|muthia'),
    ('boil_simmer', r'\bdal\b|daal|curry|sambar|rasam|kadhi|soup|stew|khichdi|khichri|khitchdi|porridge|daliya|kheer|'
                    r'payasam|rice|pulao|pulav|biryani|biriyani|upma|poha|halwa|korma|rajma|chole|channa|chana|'
                    r'makhani|sabzi|sabji|subji|bhujia|bhartha|bharta|keema|yakhni|consomme|stock|canjee|kanji|'
                    r'custard|pudding|noodle|pasta|spaghetti|macaroni|chowmein|fettuccine|matar|paneer|aloo|'
                    r'masala|gravy|jam\b|murabba|squash|syrup|sauce|rabri|basundi|ladoo|burfi|chikki'),
    ('raw_assembled', r'salad|raita|chutney|juice|shake|lassi|sharbat|smoothie|sandwich|panna|pickle|achar|achaar|'
                      r'dressing|\bdip\b|chaat|\bchat\b|lemonade|cooler|punch|jaljeera|thandai|shrikhand|kachumber|'
                      r'kosambari|sprouted .* salad|mintade|jal jeera|infused|gingo|lem-o-gin|flakes|puffed|khakhra|'
                      r'panch phoran|paste'),
    ('beverage', r'\btea\b|coffee|chai|kehwa|\bmilk\b|cocoa|drink|shake|lassi|sharbat'),
]
_NAME = [(s, re.compile(p)) for s, p in _NAME]
_BREAD = re.compile(r'\broti\b|chapati|phulka|paratha|parantha|thepla|naan|kulcha|bhakri|poli|missi')
_BATTER_WET = re.compile(r'dosa|idli|uttap|cheela|chilla|pesarattu|khichdi|khichri|khitchdi|porridge|daliya|\bdal\b|'
                         r'dhokla|khaman|upma|kanji|canjee|soup|curry|kheer|payasam|sambar|kadhi|halwa')
_PRIO = ['deep_fry', 'bake', 'tandoor_grill_roast', 'steam', 'shallow_fry_griddle', 'dry_griddle',
         'temper_fry', 'boil_simmer', 'chilled_set', 'raw_assembled', 'beverage']


def regime(lines, fct):
    """INDB build regime of one recipe: C (frying oil counted), A (dough water, no yield), D (wet dish, no water
    listed), D2 (dry grain/legume, no cooking water), B (wet, all water kept) or other."""
    name = lines[0]['recipe_name'].strip().lower()
    per100, w, detail = indb.compute(lines, fct)
    deep = water = est_w = dry_starch = liquid = 0.0
    for ln, g, f in detail:
        fc = ln['food_code']
        if not fc or g is None:
            continue
        ew = est_water_g(fc, g, f)
        est_w += ew
        if fc[:1] in 'AB' and g and ew / g < 0.2:
            dry_starch += g
        if fc == WATER_CODE or (fc[:1] == 'L' and g and ew / g > 0.8):
            liquid += g
        txt = ' '.join([ln['ingredient_name_org'], ln['amount_org'], ln['unit_org']])
        if fc.startswith('T') and FRY_TXT.search(txt) and g >= 100:
            deep += g
        if fc == WATER_CODE:
            water += g
    sig = [s for s, rx in _NAME if rx.search(name)]
    primary = 'deep_fry' if deep else next((p for p in _PRIO if p in sig), 'unknown')
    if deep:
        return 'C_all_frying_oil_counted'
    if _BREAD.search(name) and water and 'deep_fry' not in sig:
        return 'A_dough_water_no_yield'
    if (_BATTER_WET.search(name) and water == 0 and w and 100 * est_w / w < 45 and per100['energy_kcal'] >= 150
            and not re.search(r'burfi|powder|premix|roti|poli|halwa|ladoo', name)):
        return 'D_wet_dish_no_water_listed'
    if (dry_starch >= 15 and liquid < dry_starch and primary in ('boil_simmer', 'steam')
            and not re.search(r'burfi|powder|premix|roti|poli|halwa|ladoo|chikki|biscuit|mix|masala$|sandwich|'
                              r'cake|cookie|bread|pizza', name)):
        return 'D2_dry_grain_or_legume_no_cooking_water'
    if water and (water / w) >= 0.4:
        return 'B_wet_all_water_kept'
    return 'other'


# ── per-line accounting ───────────────────────────────────────────────────────────────────────────
class Book:
    """The loaded INDB world: ingredient table, recipe lines, published values, regimes (memoised)."""

    def __init__(self):
        indb.require_sources()
        self.fct = indb.load_fct()
        self.rec = indb.load_recipes()
        self.pub = indb.load_published()
        self.serv = indb.load_servings()
        self._regime = {}

    def regime(self, code):
        if code not in self._regime:
            self._regime[code] = regime(self.rec[code], self.fct)
        return self._regime[code]

    def name(self, code):
        return self.rec[code][0]['recipe_name'].strip()


def parts(book, code, drop=()):
    """One dict per weighed ingredient line: grams, water, macros, and whether it is the pan of frying oil.
    `drop` lists line indices removed on purpose (a founder-approved variant, e.g. phulka without ghee)."""
    _, _, det = indb.compute(book.rec[code], book.fct)
    out = []
    for i, (ln, g, fx) in enumerate(det):
        fc = ln['food_code']
        if not fc or g is None or i in drop:
            continue
        txt = ' '.join([ln['ingredient_name_org'], ln['amount_org'], ln['unit_org']])
        fry = fc.startswith('T') and bool(FRY_TXT.search(txt)) and g >= 100
        nut = {k: g * ((fx or {}).get(src) or 0.0) / 100 for k, src in
               (('P', 'protein_g'), ('C', 'carb_g'), ('F', 'fat_g'), ('Fib', 'fibre_g'), ('kcal', 'energy_kcal'))}
        out.append(dict(i=i, code=fc, name=ln['food_name'], text=txt.strip(), g=g, water=est_water_g(fc, g, fx),
                        fry=fry, exposed=fc[:1] not in ('T', 'I', 'K'), **nut))
    return out


def comp_totals(lines):
    t = dict(W=0.0, water=0.0, P=0.0, C=0.0, F=0.0, Fib=0.0, kcal=0.0, Sexp=0.0, fry_g=0.0, fry_kcal_per_g=0.0,
             fat_lines=0.0)
    for x in lines:
        if x['fry']:
            t['fry_g'] += x['g']
            t['fry_kcal_per_g'] = x['kcal'] / x['g'] if x['g'] else 0.0
            continue
        t['W'] += x['g']
        t['water'] += x['water']
        for k in ('P', 'C', 'F', 'Fib', 'kcal'):
            t[k] += x[k]
        if x['exposed']:
            t['Sexp'] += x['g'] - x['water']
        if x['code'][:1] == 'T':
            t['fat_lines'] += x['F']
    t['S'] = t['W'] - t['water']
    return t


def parse_components(spec):
    """'dough:flatbread_fat:0,7,9,10|filling:keep:1,2' -> [(name, class, [line indices]), ...]"""
    if not spec:
        return None
    out = []
    for part in spec.split('|'):
        name, cls, idx = part.split(':')
        out.append((name, cls, [int(x) for x in idx.split(',') if x != '']))
    return out


def components_of(book, code, cls, components=None, drop=()):
    ls = parts(book, code, drop)
    if components:
        idx = {x['i'] for x in ls if not x['fry']}
        named = [i for _, _, ii in components for i in ii]
        if sorted(named) != sorted(idx):
            raise SystemExit(f'{code}: components do not cover the kept lines exactly '
                             f'(unnamed {sorted(idx - set(named))}, unknown {sorted(set(named) - idx)})')
        fry = [x for x in ls if x['fry']]
        out = []
        for k, (name, ccls, ii) in enumerate(components):
            sel = [x for x in ls if x['i'] in ii] + (fry if k == 0 else [])   # the shell carries the frying
            out.append((name, ccls, comp_totals(sel)))
        return out, ls
    return [('whole', cls, comp_totals(ls))], ls


def rule_for(cls, P):
    if cls in ALWAYS_TARGET:
        return 'target'
    if cls in FLEX:
        return P['rule'].get(cls, 'keep')
    return 'asis'


def wstar(cls, P):
    return P['w'].get(BATTER_GRIDDLE_PROXY if cls == 'batter_griddle' else cls)


def predict(book, code, cls, P, *, components=None, drop=(), force_rule=None, w_override=None):
    """Per-100 g of the dish as served, plus the accounting the review report shows."""
    reg = book.regime(code)
    comps, ls = components_of(book, code, cls, components, drop)
    if any(x['fry'] for x in ls) and not (cls in FRIED or (components and comps[0][1] in FRIED)):
        raise SystemExit(f'{code}: a deep-frying oil line in a dish classed {cls}; edit the recipe by hand first '
                         f'(griddle dishes are refused deep-fry oil uptake)')
    tot = dict(W=0.0, S=0.0, P=0.0, C=0.0, F=0.0, Fib=0.0, kcal=0.0, A=0.0, fat_added=0.0, fry_g=0.0)
    comp_out = []
    for name, ccls, t in comps:
        A = P['alpha'] * t['Sexp'] if (ccls in FRIED and t['fry_g'] > 0) else 0.0
        if ccls in ('keep', 'asis'):
            rule = 'keep'
        else:
            rule = force_rule or rule_for(ccls, P)
            if rule == 'asis':
                rule = 'keep'
        if rule == 'keep' and ccls in FLEX and reg[:2] in ('D_', 'D2'):
            rule = 'target'          # a wet dish whose recipe lists no water cannot "keep" water it never had
        w = None
        if rule == 'target':
            w = w_override if (w_override is not None and len(comps) == 1) else wstar(ccls, P)
            Wc = (t['S'] + A) / (1 - w)
        else:
            Wc = t['W'] + A
        comp_out.append(dict(name=name, cls=ccls, rule=rule, w_target=w, W=t['W'], S=t['S'], Sexp=t['Sexp'], A=A,
                             Wc=Wc, fry_g=t['fry_g']))
        tot['W'] += Wc
        tot['S'] += t['S'] + A
        tot['A'] += A
        tot['fry_g'] += t['fry_g']
        for k in ('P', 'C', 'F', 'Fib'):
            tot[k] += t[k]
        tot['F'] += A
        tot['kcal'] += t['kcal'] + A * t['fry_kcal_per_g']
        tot['fat_added'] += t['fat_lines'] + A
    s = 100.0 / tot['W']
    o = {k: tot[k] * s for k in ('P', 'C', 'F', 'Fib')}
    o['water'] = 100.0 * (1 - tot['S'] / tot['W'])
    o['E_lab'] = 4 * o['P'] + 9 * o['F'] + 4 * (o['C'] + o['Fib'])
    o['E'] = 4 * o['P'] + 9 * o['F'] + 4 * o['C'] + 2 * o['Fib']
    o['E_indb_conv'] = tot['kcal'] * s          # INDB/IFCT's own energy (ingredient kcal summed), same yield
    o['A_per100'] = tot['A'] * s
    o['fat_added_per100'] = tot['fat_added'] * s
    o['A_g'] = tot['A']
    o['fry_removed_g'] = tot['fry_g']
    o['raw_w'] = sum(x['g'] for x in ls)
    o['kept_w'] = sum(x['g'] for x in ls if not x['fry'])
    o['Wc'] = tot['W']
    o['yf'] = tot['W'] / o['kept_w']
    o['regime'] = reg
    o['components'] = comp_out
    o['lines'] = ls
    return o


def backsolve_alpha(book, code, cls, lab):
    (_, _, t), = components_of(book, code, cls)[0]
    w, phi = f(lab['water_g']) / 100, f(lab['fat_g']) / 100
    d = (1 - w) - phi
    A = max((phi * t['S'] - (1 - w) * t['F']) / d, 0.0) if d > 0 else 0.0
    return A / t['Sexp'] if t['Sexp'] else None


def f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def lerr(pred, ref):
    return math.log(pred / ref)


def pct(e):
    return 100 * (math.exp(e) - 1)


# ── calibration ──────────────────────────────────────────────────────────────────────────────────
class Lab:
    """data/lab.csv (numbers) + data/lab_split.csv (which INDB recipe, which class, which fold)."""

    def __init__(self, lab_rows, split_rows):
        self.lab = {r['lab_id']: r for r in lab_rows}
        self.split = {r['lab_id']: r for r in split_rows}
        self.matched = {l: (r['indb_code'], r['cooking_class']) for l, r in self.split.items()
                        if r['role'] in ('matched', 'composite', 'raw_control')}
        self.unmatched = {}
        for l, r in self.split.items():
            if r['role'] == 'class_only':
                self.unmatched.setdefault(r['cooking_class'], []).append(l)
        self.components = {r['indb_code']: parse_components(r['components'])
                           for r in self.split.values() if r['components']}

    def fold_of(self, lid):
        return self.split[lid]['test_fold']


def make_split(book, lab):
    """The deterministic split rule. data/lab_split.csv freezes its output; tests check they agree."""
    strata = {}
    for lid, (code, cls) in lab.matched.items():
        strata.setdefault(cls, []).append(lid)
    fold = {}
    for cls, ids in strata.items():
        ids.sort(key=lambda l: (book.rec[lab.matched[l][0]][0]['recipe_name'].strip().lower(), int(l)))
        for k, l in enumerate(ids):
            fold[l] = 'A' if k % 2 == 0 else 'B'   # 'A' = a TEST dish in fold A (calibration in fold B)
    return fold


def lab_predict(book, lab, lid, P, force_rule=None):
    code, cls = lab.matched[lid]
    return predict(book, code, cls, P, components=lab.components.get(code) if cls == 'composite' else None,
                   force_rule=force_rule)


def fit(book, lab, cal_ids):
    """Fit alpha, w* per class and keep-vs-target per flexible class on calibration lab ids only."""
    P = dict(w={}, rule={}, alpha=None, alpha_rows={}, rule_scores={})
    classes = set(c for _, c in lab.matched.values()) | set(lab.unmatched) | {'fried_bread', 'flatbread_fat'}
    for cls in sorted(classes):
        if cls in ('composite', 'raw_asis'):
            continue
        ws = [f(lab.lab[l]['water_g']) / 100 for l in cal_ids if lab.matched[l][1] == cls]
        ws += [f(lab.lab[l]['water_g']) / 100 for l in lab.unmatched.get(cls, [])]
        if ws:
            P['w'][cls] = st.median(ws)
    al = []
    for l in sorted(cal_ids, key=int):
        code, cls = lab.matched[l]
        if cls in FRIED:
            a = backsolve_alpha(book, code, cls, lab.lab[l])
            if a is not None:
                P['alpha_rows'][l] = round(a, 3)
                al.append(a)
    P['alpha'] = st.median(al) if al else 0.25
    for cls in sorted(FLEX):
        rows = [l for l in cal_ids if lab.matched[l][1] == cls]
        if not rows or cls not in P['w']:
            P['rule'][cls] = 'keep'
            continue
        sc = {}
        for r in ('keep', 'target'):
            P['rule'][cls] = r
            sc[r] = st.mean(abs(lerr(lab_predict(book, lab, l, P)['E_lab'], f(lab.lab[l]['energy_kcal'])))
                            for l in rows)
        P['rule'][cls] = 'target' if sc['target'] < sc['keep'] else 'keep'
        P['rule_scores'][cls] = {k: round(pct(v), 1) for k, v in sc.items()}
    return P


def score_row(book, lab, lid, P):
    code, cls = lab.matched[lid]
    L = lab.lab[lid]
    El, Fl, wl = f(L['energy_kcal']), f(L['fat_g']), f(L['water_g'])
    pr = lab_predict(book, lab, lid, P)
    pub = book.pub[code]
    indb_E = 4 * pub['protein_g'] + 9 * pub['fat_g'] + 4 * (pub['carb_g'] + pub['fibre_g'])
    S = lab.split[lid]
    d = dict(lab_id=lid, code=code, cls=cls, name=book.name(code)[:34], lab_E=El, lab_F=Fl, lab_w=wl,
             new_E=pr['E_lab'], new_F=pr['F'], new_w=pr['water'], indb_E=indb_E, indb_F=pub['fat_g'],
             e_new=lerr(pr['E_lab'], El), e_indb=lerr(indb_E, El),
             e_new_comp=lerr(pr['E_lab'] / (1 - pr['water'] / 100), El / (1 - wl / 100)),
             internal_ok=L['paper_internal_check_ok'] == 'True')
    if S['usda_row']:
        p, c, fat = f(S['usda_protein_g']), f(S['usda_carbs_g']), f(S['usda_fat_g'])
        ue = 4 * p + 9 * fat + 4 * c
        d.update(usda=S['usda_row'], usda_E=ue, usda_F=fat, e_usda=lerr(ue, El))
    return d


def summarise(rows, key, fkey=None):
    if not rows:
        return dict(n=0)
    e = [pct(r[key]) for r in rows]
    out = dict(n=len(rows), med_abs=round(st.median(abs(x) for x in e), 1), mean_signed=round(st.mean(e), 1),
               med_signed=round(st.median(e), 1), within20=sum(abs(x) <= 20 for x in e))
    if fkey:
        fe = [r[fkey] - r['lab_F'] for r in rows]
        out.update(fat_med_abs=round(st.median(abs(x) for x in fe), 1), fat_mean_signed=round(st.mean(fe), 1))
    return out


def calibrate(book, lab):
    """Both folds (fit on one half, score the other) and the production refit on every lab dish."""
    fold = {l: lab.fold_of(l) for l in lab.matched}
    res = {}
    for tag in ('A', 'B'):
        test = sorted((l for l in lab.matched if fold[l] == tag), key=int)
        cal = sorted((l for l in lab.matched if fold[l] != tag), key=int)
        P = fit(book, lab, cal)
        res[tag] = dict(params=P, test_ids=test, cal_ids=cal, rows=[score_row(book, lab, l, P) for l in test])
    prod = fit(book, lab, sorted(lab.matched, key=int))
    return res, prod


def scores(res):
    pooled = res['A']['rows'] + res['B']['rows']
    out = {}
    for label, rows in (('fold_A_test', res['A']['rows']), ('fold_B_test', res['B']['rows']), ('pooled', pooled)):
        cooked = [r for r in rows if r['cls'] != 'raw_asis']
        fr = [r for r in cooked if r['cls'] in FRIED or r['code'] in ('ASC361', 'ASC360')]
        us = [r for r in cooked if 'usda_E' in r]
        out[label] = dict(
            indb=summarise(cooked, 'e_indb', 'indb_F'), recalc=summarise(cooked, 'e_new', 'new_F'),
            recalc_recipe_maths_only=summarise(cooked, 'e_new_comp'),
            fried_indb=summarise(fr, 'e_indb', 'indb_F'), fried_recalc=summarise(fr, 'e_new', 'new_F'),
            not_fried_indb=summarise([r for r in cooked if r not in fr], 'e_indb', 'indb_F'),
            not_fried_recalc=summarise([r for r in cooked if r not in fr], 'e_new', 'new_F'),
            usda_subset=dict(indb=summarise(us, 'e_indb', 'indb_F'), recalc=summarise(us, 'e_new', 'new_F'),
                             usda=summarise(us, 'e_usda', 'usda_F')),
            raw_control=summarise([r for r in rows if r['cls'] == 'raw_asis'], 'e_new'))
    by = {}
    for r in pooled:
        by.setdefault(r['cls'], []).append(r)
    out['per_class_pooled'] = {c: dict(n=len(rs),
                                       indb_med_abs=round(st.median(abs(pct(r['e_indb'])) for r in rs), 1),
                                       recalc_med_abs=round(st.median(abs(pct(r['e_new'])) for r in rs), 1),
                                       recalc_mean=round(st.mean(pct(r['e_new']) for r in rs), 1),
                                       recipe_maths_med_abs=round(st.median(abs(pct(r['e_new_comp'])) for r in rs), 1),
                                       dishes={r['code']: round(pct(r['e_new']), 1) for r in sorted(rs, key=lambda r: r['code'])})
                               for c, rs in sorted(by.items())}
    return out
