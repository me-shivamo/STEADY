"""INDB recipe engine for recalc_v1 (migration 053): pinned sources, the ingredient table, and a port of
INDB.do's per-100 g recipe block. Python standard library only; run everything with `python3 -I`.

WHY A PORT AND NOT INDB'S PUBLISHED NUMBERS
  INDB (Vijayakumar et al., Curr Dev Nutr 2024;8(7):103790) publishes one number per recipe: the summed
  nutrients of the RAW ingredient lines divided by their RAW weight. No cooking yield, and every gram of
  deep-frying oil in the pan counted as eaten (khasta kachori 713 kcal/100 g). To recalculate a dish as served
  we need the lines themselves, so this module rebuilds INDB from its inputs and proves the rebuild is exact
  (all 1,014 recipes x 5 nutrients at 2 dp, tests/test_recalc.py) before recalc_v1 changes anything.

  INDB.do's steps, in order:
    1. amount_g from (amount, unit, first letter of food_code), using INDB.do's ordered `replace` rules (a later
       rule overwrites an earlier one; an unmatched unit is Stata missing -> the line adds 0 g and 0 nutrients).
    2. lines with no food_code are dropped.
    3. per-line nutrient = amount_g * value/100 (a missing value counts 0).
    4. per 100 g = recipe total / (sum of amount_g / 100).

  The ingredient table is INDB's temp_fct = US_fct + UK_fct + NIN_fct. NIN_fct.xlsx (IFCT 2017 + 2004) is not
  public; IFCT 2017 from the npm package @ifct2017/compositions stands in for it, and the five values INDB
  used that are in no public table (four IFCT 2004 items, plus IFCT 2017 lemon juice carbohydrate, which INDB
  filled differently) are back-solved from INDB.xlsx by least squares (fit_overrides below) and committed in
  data/overrides.json with that provenance.

SOURCES (data/sources.json): pinned URLs + SHA-256, fetched into the gitignored .cache/recalc/ by
  `recalc.py fetch` and re-hashed on every load. Raw files are untrusted data: we only unzip and parse XML/CSV,
  never execute anything from them. Licences: INDB's paper is CC BY 4.0 but the repo has no LICENSE file, and
  IFCT values are ICMR-NIN copyright, so only DERIVED values (with attribution) are committed, never the files.
"""
import csv
import hashlib
import io
import json
import os
import re
import shutil
import tarfile
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
REPO = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(REPO, '.cache', 'recalc')

NUTS = ['energy_kj', 'energy_kcal', 'carb_g', 'protein_g', 'fat_g', 'fibre_g']
KEY5 = ['energy_kcal', 'protein_g', 'carb_g', 'fat_g', 'fibre_g']
KJ_TO_KCAL = 0.239  # INDB paper: FAO factor, 1 kJ = 0.239 kcal (IFCT 2017 publishes kJ only)


# ── sources ──────────────────────────────────────────────────────────────────────────────────────
def load_sources():
    with open(os.path.join(DATA, 'sources.json'), encoding='utf-8') as fh:
        return json.load(fh)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def cache_path(*parts):
    return os.path.join(CACHE, *parts)


def _download(url, dest, want_sha):
    """Fetch url -> dest atomically; refuse (and delete) anything whose SHA-256 differs from the pin."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.part'
    req = urllib.request.Request(url, headers={'User-Agent': 'recalc-fetch/1'})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, 'wb') as out:
        shutil.copyfileobj(resp, out)
    got = sha256_file(tmp)
    if got != want_sha:
        os.remove(tmp)
        raise SystemExit(f'fetch: {url} has sha256 {got}, pinned {want_sha}. Refusing it.')
    os.replace(tmp, dest)


def fetch(seed_dir=None):
    """Download every pinned file into .cache/recalc/ (or copy it from seed_dir when a file with the right
    hash is already there: an offline re-seed from an earlier download). Each file is hash-checked."""
    src = load_sources()
    indb = src['indb_repo']
    raw = f"https://raw.githubusercontent.com/{indb['repo']}/{indb['commit']}"
    jobs = [(f'{raw}/{name}', cache_path('indb', name), sha) for name, sha in sorted(indb['files'].items())]
    ifct = src['ifct2017_npm']
    jobs.append((ifct['url'], cache_path('ifct', ifct['tarball']), ifct['sha256']))
    for url, dest, sha in jobs:
        if os.path.exists(dest) and sha256_file(dest) == sha:
            print(f'  ok (cached)  {os.path.relpath(dest, REPO)}')
            continue
        seeded = False
        if seed_dir:
            for root, _dirs, files in os.walk(seed_dir):
                for fn in files:
                    p = os.path.join(root, fn)
                    if os.path.getsize(p) < 200_000_000 and sha256_file(p) == sha:
                        os.makedirs(os.path.dirname(dest), exist_ok=True)
                        shutil.copyfile(p, dest)
                        seeded = True
                        break
                if seeded:
                    break
        if not seeded:
            _download(url, dest, sha)
        print(f"  ok ({'seeded' if seeded else 'fetched'}) {os.path.relpath(dest, REPO)}")
    _extract_ifct_index()


def _extract_ifct_index():
    ifct = load_sources()['ifct2017_npm']
    tgz = cache_path('ifct', ifct['tarball'])
    dest = cache_path('ifct', 'index.csv')
    if os.path.exists(dest) and sha256_file(dest) == ifct['index_csv_sha256']:
        return
    with tarfile.open(tgz, 'r:gz') as tf:
        member = tf.getmember('package/index.csv')          # the one file we read; never extractall()
        data = tf.extractfile(member).read()
    if hashlib.sha256(data).hexdigest() != ifct['index_csv_sha256']:
        raise SystemExit('fetch: package/index.csv inside the pinned IFCT tarball has an unexpected hash')
    with open(dest, 'wb') as fh:
        fh.write(data)


def verify(quiet=False):
    """Re-hash every cached source against data/sources.json. Returns the list of problems ([] = ok)."""
    src = load_sources()
    bad = []
    for name, sha in sorted(src['indb_repo']['files'].items()):
        p = cache_path('indb', name)
        if not os.path.exists(p):
            bad.append(f'missing {os.path.relpath(p, REPO)} (run: python3 -I scripts/recalc/recalc.py fetch)')
        elif sha256_file(p) != sha:
            bad.append(f'hash mismatch {os.path.relpath(p, REPO)}')
    ifct = src['ifct2017_npm']
    for p, sha in ((cache_path('ifct', ifct['tarball']), ifct['sha256']),
                   (cache_path('ifct', 'index.csv'), ifct['index_csv_sha256'])):
        if not os.path.exists(p):
            bad.append(f'missing {os.path.relpath(p, REPO)} (run: python3 -I scripts/recalc/recalc.py fetch)')
        elif sha256_file(p) != sha:
            bad.append(f'hash mismatch {os.path.relpath(p, REPO)}')
    if not quiet:
        for b in bad:
            print('  ✗', b)
    return bad


def require_sources():
    bad = verify(quiet=True)
    if bad:
        raise SystemExit('sources not ready:\n  ' + '\n  '.join(bad))


# ── minimal .xlsx reader (first sheet, cached cell values only) ───────────────────────────────────
_NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
_MEMO = {}


def _col_idx(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _clean(v):
    # The prototypes read TSV exports in which tabs/newlines inside a cell became spaces; keep that exactly.
    return v.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')


def read_xlsx(path):
    """[[cell, ...], ...] of the first sheet. Formulas give their cached value; no third-party parser."""
    if path in _MEMO:
        return _MEMO[path]
    with zipfile.ZipFile(path) as z:
        ss = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si', _NS):
                ss.append(''.join(t.text or '' for t in si.iter('{%s}t' % _NS['m'])))
        root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in root.iter('{%s}row' % _NS['m']):
        cells = {}
        for c in row.findall('m:c', _NS):
            t = c.get('t')
            v = c.find('m:v', _NS)
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % _NS['m']))
            elif v is None:
                val = ''
            elif t == 's':
                val = ss[int(v.text)]
            else:
                val = v.text or ''
            cells[_col_idx(c.get('r'))] = _clean(val)
        if cells:
            rows.append([cells.get(i, '') for i in range(max(cells) + 1)])
    _MEMO[path] = rows
    return rows


def table(name):
    """INDB repo sheet `name` (e.g. 'recipes.xlsx') as a list of dicts keyed by its header row."""
    rows = read_xlsx(cache_path('indb', name))
    h = rows[0]
    return [dict(zip(h, r + [''] * (len(h) - len(r)))) for r in rows[1:]]


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None  # 'N', 'Tr', 'NA', '' -> missing (INDB.do turns these into 0)


# ── unit conversion: INDB.do's replace rules, in file order. (unit, food-code categories or None, g per unit)
RULES = [
    ('g', None, 1),
    ('tsp', 'GHBU', 2), ('tbsp', 'DGHBU', 7), ('tsp', 'D', 2), ('tbsp', 'F', 40),
    ('ml', 'GHIVX', 1), ('tsp', 'A', 2.5), ('tsp', 'M', 5), ('tbsp', 'A', 7), ('tsp', 'V', 2),
    ('tsp', 'T', 4), ('tbsp', 'T', 13.5), ('tsp', 'XW', 6), ('tbsp', 'XW', 20),
    ('tsp', 'I', 4), ('tbsp', 'I', 12), ('C', 'I', 200), ('tbsp', 'Z', 15),
    ('tsp', 'L', 5), ('tbsp', 'L', 15), ('C', 'L', 240), ('ml', 'L', 1),
    ('sprig', 'GUCA', 2), ('tsp', 'C', 0.5), ('tbsp', 'C', 5), ('tsp', 'T', 4), ('ml', 'T', 1),
    ('C', None, 240),  # "cups liquid": overwrites the sugar 200 g/cup rule above, as INDB.do does
    ('ml', 'K', 1), ('ml', 'E', 1), ('tsp', 'KE', 5), ('tsp', 'E', 5), ('tbsp', 'KE', 15),
    ('tbsp', 'E', 15), ('tbsp', 'V', 8), ('C', 'L', 240), ('small', 'G', 2),
]


def amount_g(amount, unit, food_code, food_name=''):
    cat = food_code[:1]
    a = num(amount)
    g = None
    for u, cats, fac in RULES:
        if unit == u and (cats is None or cat in cats):
            g = a * fac if a is not None else None
    if food_name == 'FENUGREEK LEAVES':
        g = a * 2 if a is not None else None
    if unit == 'pinch':
        g = 0.125
    return g  # None = Stata missing: the line adds 0 g and 0 nutrients


def load_fct(use_overrides=True):
    """code -> {nutrient: value or None, 'water_g', 'source', 'name'}. Same composition as INDB's temp_fct."""
    fct = {}
    for name, src in (('UK_fct.xlsx', 'uk_cofid'), ('US_fct.xlsx', 'usda')):
        for r in table(name):
            if not r['food_code']:
                continue
            d = {k: num(r[k]) for k in NUTS}
            d.update(source=src, name=r['food_name'], water_g=None)
            fct[r['food_code']] = d
    with open(cache_path('ifct', 'index.csv'), newline='', encoding='utf-8') as fh:
        rows = list(csv.reader(fh))
    h = [c.split('; ')[-1] for c in rows[0]]
    for r in rows[1:]:
        r = dict(zip(h, r))
        kj = num(r['enerc'])
        fct[r['code']] = {
            'energy_kj': kj, 'energy_kcal': kj * KJ_TO_KCAL if kj is not None else None,
            'carb_g': num(r['choavldf']), 'protein_g': num(r['protcnt']),
            'fat_g': num(r['fatce']), 'fibre_g': num(r['fibtg']),
            'water_g': num(r['water']), 'source': 'ifct2017', 'name': r['name'],
        }
    if use_overrides:
        for code, vals in sorted(load_overrides().items()):
            d = fct.setdefault(code, {'source': 'backsolved', 'name': vals.get('name', ''), 'water_g': None})
            for k in NUTS:
                if k in vals:
                    d[k] = vals[k]
            d['source'] = 'backsolved' if d['source'] == 'backsolved' else d['source'] + '+backsolved'
    return fct


def load_overrides():
    with open(os.path.join(DATA, 'overrides.json'), encoding='utf-8') as fh:
        return {k: v for k, v in json.load(fh).items() if not k.startswith('_')}


def load_recipes():
    by = {}
    for r in table('recipes.xlsx'):
        by.setdefault(r['recipe_code'], []).append(r)
    return by


def load_published():
    return {r['food_code']: {**{k: num(r[k]) for k in NUTS}, 'name': r['food_name']} for r in table('INDB.xlsx')}


def load_servings():
    return {r['recipe_code']: r for r in table('recipes_servingsize.xlsx')}


def compute(lines, fct):
    """INDB's own per-100 g (raw weight, no yield). Returns (per100, total_g, [(line, g, fct_row), ...])."""
    tot = dict.fromkeys(NUTS, 0.0)
    wsum = 0.0
    detail = []
    for ln in lines:
        code = ln['food_code']
        if not code:
            detail.append((ln, None, None))
            continue
        g = amount_g(ln['amount'], ln['unit'], code, ln['food_name'])
        f = fct.get(code)
        if g is not None:
            wsum += g
            if f:
                for k in NUTS:
                    v = f.get(k)
                    if v is not None:
                        tot[k] += g * v / 100.0
        detail.append((ln, g, f))
    per100 = {k: (tot[k] / (wsum / 100.0) if wsum else None) for k in NUTS}
    return per100, wsum, detail


def reproduction_report(fct, recipes, pub):
    """How many recipes the port reproduces exactly (all 5 nutrients to 0.01). Returns (exact, n, mismatches)."""
    exact, bad = 0, []
    for code, lines in recipes.items():
        p = pub.get(code)
        if not p:
            continue
        per100, _w, _ = compute(lines, fct)
        ok = all(round(per100[k] or 0.0, 2) == round(p[k] or 0.0, 2) or abs((per100[k] or 0.0) - (p[k] or 0.0)) < 0.0051
                 for k in KEY5)
        exact += ok
        if not ok:
            bad.append(code)
    return exact, len(pub), bad


# ── back-solved ingredient values (data/overrides.json) ───────────────────────────────────────────
UNKNOWN = {'O064': NUTS, 'F500': NUTS, 'D501': NUTS, 'D091': NUTS, 'E033': ['carb_g']}


def _solve(A, b):
    n = len(A[0])
    M = [[sum(A[r][i] * A[r][j] for r in range(len(A))) for j in range(n)] +
         [sum(A[r][i] * b[r] for r in range(len(A)))] for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        if abs(M[c][c]) < 1e-12:
            raise ValueError('singular')
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]


def fit_overrides(recipes, pub):
    """Least-squares values for the ingredients INDB used that no public table has. Each recipe containing
    one gives a linear equation: published*W/100 - known contribution = sum_i g_i * x_i / 100."""
    fct = load_fct(use_overrides=False)
    out = {}
    for k in NUTS:
        codes = [c for c, ks in UNKNOWN.items() if k in ks]
        A, b = [], []
        for rc, lines in recipes.items():
            g_unknown = dict.fromkeys(codes, 0.0)
            known, w = 0.0, 0.0
            for ln in lines:
                code = ln['food_code']
                if not code:
                    continue
                g = amount_g(ln['amount'], ln['unit'], code, ln['food_name'])
                if g is None:
                    continue
                w += g
                if code in g_unknown:
                    g_unknown[code] += g
                elif code in fct and fct[code].get(k) is not None:
                    known += g * fct[code][k] / 100.0
            if any(g_unknown.values()) and pub[rc][k] is not None:
                A.append([g_unknown[c] / 100.0 for c in codes])
                b.append(pub[rc][k] * w / 100.0 - known)
        cols = [i for i in range(len(codes)) if any(row[i] for row in A)]
        x = _solve([[row[i] for i in cols] for row in A], b)
        for i, xi in zip(cols, x):
            out.setdefault(codes[i], {})[k] = round(xi, 4) + 0.0   # + 0.0 turns -0.0 into 0.0
    return out
