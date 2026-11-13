#!/usr/bin/env python3
"""QA pass over the brand nutrition CSVs. Never changes a published number.

usage: python3 -I qa_validate.py <data_dir> <qa_out_dir> <combined_csv> <summary_json>

Reads every <slug>.csv in data_dir (skips files starting with "_"), adds
brand_slug, source_row, basis, qa_severity, qa_flag and writes:
  - combined_csv            all brands, original 20 columns + the 5 QA columns
  - qa_out_dir/<slug>.csv   the same per brand (originals in data_dir untouched)
  - summary_json            counts and examples for the report
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

COLS = ['brand', 'country', 'item', 'variant_or_size', 'serving_desc', 'serving_g', 'serving_ml',
        'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'veg_nonveg',
        'source_url', 'source_title', 'source_date_or_version', 'page_or_section', 'notes']
NUM = ['serving_g', 'serving_ml', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']
NUTR = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']
EXTRA = ['brand_slug', 'source_row', 'basis', 'qa_severity', 'qa_flag']

# tier of every code: error = numbers internally impossible / likely wrong,
# conflict = same name, different numbers (needs a pick), caveat = usable with care
TIER = {
    'no_kcal': 'error', 'negative_value': 'error', 'atwater_mismatch': 'error',
    'kcal_density_gt_900': 'error', 'macro_mass_gt_serving': 'error', 'sugar_gt_carbs': 'error',
    'satfat_gt_fat': 'error', 'added_sugar_gt_sugar': 'error', 'possible_kj_as_kcal': 'error',
    'sodium_exceeds_pure_salt': 'error', 'per100_kcal_mismatch': 'error', 'size_not_monotonic': 'error',
    'sodium_implausibly_low': 'caveat', 'fails_steady_rules_v1': 'caveat',
    'duplicate_conflict': 'conflict', 'name_collision': 'conflict', 'listed_twice_conflict': 'conflict',
    'duplicate_exact': 'caveat', 'size_label_ambiguous': 'caveat', 'no_serving_size': 'caveat', 'per100_no_portion': 'caveat',
    'macros_incomplete': 'caveat', 'nonnumeric_value': 'caveat', 'collector_noted': 'caveat',
}
RANK = {'': 0, 'caveat': 1, 'conflict': 2, 'error': 3}

NUMRE = re.compile(r'^\s*-?\d+(?:\.\d+)?\s*$')
BOUNDRE = re.compile(r'^\s*[<>]\s*=?\s*(\d+(?:\.\d+)?)\s*$')
PER100RE = re.compile(r'^\s*per\s*100\s*(g|gm|gms|grams?|ml|mL)\b', re.I)
PORTIONRE = re.compile(r'serving size|scoop|glass|pack|label serving|unit|full cake|whole|piece|slice', re.I)
NOPORTIONRE = re.compile(r'no serving size printed|weight in grams NOT published|size weights not published', re.I)

SATRE = re.compile(r'sat(?:urated)?(?:[ _]fat)?(?:_g)?\s*[=: ]\s*(<?\s*\d+(?:\.\d+)?)', re.I)
ADDSUGRE = re.compile(r'added[ _]sugars?(?:_g)?\s*[=: ]\s*(<?\s*\d+(?:\.\d+)?)', re.I)
PER100KCALRE = re.compile(r'per 100 g:\s*(\d+(?:\.\d+)?)\s*kcal', re.I)
PWRE = re.compile(r'product_weight_g=(\d+(?:\.\d+)?)')
SPPRE = re.compile(r'servings_per_product=(\d+(?:\.\d+)?)')
COLLECTRE = re.compile(r'(CHECK:|QA:|SUSPECT|CONFLICT|source error|source typo|likely a typo|'
                       r'source[- ]internal inconsistency|source inconsistency|looks inconsistent|'
                       r'exceed Regular|claims \d+\s*g protein|GREEN \(veg\) symbol)', re.I)


def norm(s):
    """Same as macroResolver.normalizeName() in STEADY (lowercase, non-alnum -> space)."""
    s = (s or '').lower()
    s = re.sub(r'[^\w\s]|_', ' ', s, flags=re.UNICODE)
    return re.sub(r'\s+', ' ', s).strip()


def num(v):
    """(value, text_flag). Plain decimals -> float; '<2.0' -> 2.0 with a flag; '' -> None."""
    v = (v or '').strip()
    if not v:
        return None, None
    if NUMRE.match(v):
        return float(v), None
    m = BOUNDRE.match(v)
    if m:
        return float(m.group(1)), v
    return None, v


def fmt(x):
    if x is None:
        return ''
    return ('%.1f' % x).rstrip('0').rstrip('.')


def basis_of(r):
    m = PER100RE.match(r['serving_desc'] or '')
    if m:
        return 'per_100ml' if m.group(1).lower() == 'ml' else 'per_100g'
    return 'per_serve'


def note_val(rx, notes):
    m = rx.search(notes or '')
    if not m:
        return None
    t = m.group(1).replace(' ', '')
    if t.startswith('<'):
        return None  # below a bound: cannot prove an inequality with it
    try:
        return float(t)
    except ValueError:
        return None


def check_row(r):
    flags = []
    v = {}
    for c in NUM:
        val, txt = num(r[c])
        v[c] = val
        if txt is not None:
            if val is None:
                flags.append(('nonnumeric_value', '%s=%r' % (c, txt)))
            else:
                flags.append(('nonnumeric_value', '%s=%r (checked as %s)' % (c, txt, fmt(val))))
    k, p, cb, f = v['kcal'], v['protein_g'], v['carbs_g'], v['fat_g']
    basis = basis_of(r)

    # (4) impossible: negatives, missing kcal
    neg = [c for c in NUM if v[c] is not None and v[c] < 0]
    if neg:
        flags.append(('negative_value', ','.join(neg)))
    if k is None:
        flags.append(('no_kcal', 'kcal not published'))

    # (1) Atwater
    if k is not None and None not in (p, cb, f):
        est = 4 * p + 4 * cb + 9 * f
        diff = k - est
        if (k > 0 and abs(diff) > 0.15 * k and abs(diff) > 15) or (k == 0 and est > 15):
            pct = (diff / k * 100) if k else float('inf')
            flags.append(('atwater_mismatch', 'kcal %s vs 4P+4C+9F %s (%+.0f%%)' % (fmt(k), fmt(est), pct)))
            # (5) unit error: kJ printed in the kcal column
            if est >= 25 and 3.6 <= k / est <= 4.8:
                flags.append(('possible_kj_as_kcal', 'kcal/est = %.2f (kJ/kcal = 4.184)' % (k / est)))
    elif k is not None:
        miss = [c for c in ('protein_g', 'carbs_g', 'fat_g') if v[c] is None]
        flags.append(('macros_incomplete', 'Atwater not checkable; missing ' + ','.join(miss)))

    # weight the numbers refer to
    wg = wml = None
    derived = False
    if basis == 'per_100g':
        wg = 100.0
    elif basis == 'per_100ml':
        wml = 100.0
    else:
        wg, wml = v['serving_g'], v['serving_ml']
        if wg is None and wml is None:
            pw, sp = note_val(PWRE, r['notes']), note_val(SPPRE, r['notes'])
            if pw and sp:
                wg, derived = pw / sp, True

    # (2) missing serving size
    if basis == 'per_serve' and v['serving_g'] is None and v['serving_ml'] is None:
        if derived:
            flags.append(('no_serving_size', 'per-serving weight derivable: product_weight_g/servings_per_product in notes'))
        else:
            flags.append(('no_serving_size', 'per-serve values, serve weight/volume not published'))
    if basis in ('per_100g', 'per_100ml'):
        desc = r['serving_desc'] + ' ' + r['notes']
        if NOPORTIONRE.search(desc) or not PORTIONRE.search(r['serving_desc']):
            flags.append(('per100_no_portion', 'values per 100 %s; no portion size published' % ('ml' if wml else 'g')))

    # (4) density and mass
    w, unit = (wg, 'g') if wg else ((wml, 'ml') if wml else (None, None))
    if w and k is not None:
        dens = k / w * 100
        if dens > 900:
            flags.append(('kcal_density_gt_900', '%s kcal per 100 %s%s' % (fmt(dens), unit, ' (derived serve wt)' if derived else '')))
    if w and None not in (p, cb, f):
        mass = p + cb + f
        lim = w + 0.5 if unit == 'g' else 1.1 * w + 0.5
        if mass > lim:
            flags.append(('macro_mass_gt_serving', 'P+C+F %s g > serving %s %s' % (fmt(mass), fmt(w), unit)))
    s = v['sugar_g']
    if s is not None and cb is not None and s > cb * 1.02 + 0.5:
        flags.append(('sugar_gt_carbs', 'sugar %s g > carbs %s g' % (fmt(s), fmt(cb))))
    sat = note_val(SATRE, r['notes'])
    if sat is not None and f is not None and sat > f * 1.02 + 0.1:
        flags.append(('satfat_gt_fat', 'sat fat %s g (notes) > total fat %s g' % (fmt(sat), fmt(f))))
    add = note_val(ADDSUGRE, r['notes'])
    if add is not None and s is not None and add > s * 1.02 + 0.5:
        flags.append(('added_sugar_gt_sugar', 'added sugar %s g (notes) > total sugar %s g' % (fmt(add), fmt(s))))

    # (5) sodium unit
    na = v['sodium_mg']
    # sodium is not used for calories/macros, so a low value is a caveat. Milk, egg, meat and
    # flour always bring sodium: < 5 mg with >= 3 g protein is a unit/scale problem in the source.
    if na is not None and na < 5 and p is not None and p >= 3:
        flags.append(('sodium_implausibly_low', 'sodium %s mg with %s g protein (milk/meat/flour alone would give far more; unit or scale error in source?)' % (fmt(na), fmt(p))))
    # pure salt is 39.3% sodium; more than that is impossible (mg/g mix-up or wrong weight)
    if na is not None and wg and na > 393 * wg:
        flags.append(('sodium_exceeds_pure_salt', 'sodium %s mg in %s g' % (fmt(na), fmt(wg))))

    # Theobroma-style per-100 g kcal in notes vs per-serve kcal/serving_g
    p100 = note_val(PER100KCALRE, r['notes'])
    if p100 and k is not None and v['serving_g']:
        calc = k / v['serving_g'] * 100
        if abs(calc - p100) > max(0.05 * p100, 5):
            flags.append(('per100_kcal_mismatch', 'per-serve implies %s kcal/100 g, notes say %s' % (fmt(calc), fmt(p100))))

    m = COLLECTRE.search(r['notes'] or '')
    if m:
        flags.append(('collector_noted', 'notes: "%s..."' % m.group(1)))
    return flags, basis, v, (wg if not derived else None)


def section_of(o):
    # "p.14, Beverage Core > Espresso" -> "beverage core > espresso" (sizes of one item can span pages)
    return re.sub(r'^\s*(?:p\.?\s*\d+|pdf page \d+[^-]*-?)\s*,?\s*', '', o['r']['page_or_section'].lower()).strip()


def byitem_all(out):
    d = defaultdict(list)
    for o in out:
        d[(o['slug'], norm(o['r']['item']), o['r']['veg_nonveg'].strip().lower())].append(o)
    return d


def rules_v1(per100, name):
    """Port of STEADY validate.ts rules v1 (energy/macro range, sum, Atwater 20%+20 fibre-aware)."""
    k, p, c, f, fb = per100
    out = []
    if k is None:
        return ['missing_energy']
    p, c, f, fb = (x or 0 for x in (p, c, f, fb))
    if k < 0 or k > 900:
        out.append('energy_out_of_range')
    if min(p, c, f, fb) < 0 or max(p, c, f, fb) > 100:
        out.append('macro_out_of_range')
    if p + c + f > 100.5:
        out.append('macro_sum_over_100')
    tol = 0.2 * k + 20
    if k < 4 * p + 9 * f + 4 * max(c - fb, 0) - tol or k > 4 * p + 9 * f + 4 * c + 4 * fb + tol:
        out.append('atwater_mismatch')
    return out


def main():
    data_dir, qa_dir, combined, summary_path = sys.argv[1:5]
    os.makedirs(qa_dir, exist_ok=True)
    files = sorted(fn for fn in os.listdir(data_dir) if fn.endswith('.csv') and not fn.startswith('_'))
    allrows = []
    for fn in files:
        slug = fn[:-4]
        with open(os.path.join(data_dir, fn), newline='', encoding='utf-8') as fh:
            rd = csv.DictReader(fh)
            assert rd.fieldnames == COLS, (fn, rd.fieldnames)
            for i, r in enumerate(rd, start=2):
                allrows.append((slug, i, r))

    out = []
    for slug, line, r in allrows:
        flags, basis, v, wg = check_row(r)
        out.append({'slug': slug, 'line': line, 'r': r, 'flags': flags, 'basis': basis, 'v': v, 'wg': wg})

    # (3) duplicates within a brand file
    full = defaultdict(list)
    byname = defaultdict(list)
    for o in out:
        r = o['r']
        nt = tuple(r[c].strip() for c in NUTR)
        o['nt'] = nt
        vn = r['veg_nonveg'].strip().lower()
        full[(o['slug'], norm(r['item']), norm(r['variant_or_size']), vn, norm(r['serving_desc']),
              r['serving_g'].strip(), r['serving_ml'].strip())].append(o)
        byname[(o['slug'], norm(r['item']), norm(r['variant_or_size']), vn)].append(o)
    for key, grp in full.items():
        if len(grp) < 2:
            continue
        tuples = set(g['nt'] for g in grp)
        if len(tuples) == 1:
            for g in grp[1:]:
                g['flags'].append(('duplicate_exact', 'same item/size/serve and numbers as row %d' % grp[0]['line']))
        else:
            for g in grp:
                others = ','.join(str(x['line']) for x in grp if x is not g)
                g['flags'].append(('duplicate_conflict', 'same item/size/serve, different numbers from row(s) %s' % others))
    for key, grp in byname.items():
        if len(grp) < 2 or len(set(g['nt'] for g in grp)) < 2:
            continue
        # same food at different portion sizes (kcal per g/ml constant) is not a collision
        dens = []
        for g in grp:
            w = g['v']['serving_g'] or g['v']['serving_ml']
            dens.append(g['v']['kcal'] / w if (w and g['v']['kcal'] is not None) else None)
        if None not in dens and max(dens) > 0 and (max(dens) - min(dens)) <= 0.05 * max(dens):
            for g in grp:
                if any(c == 'duplicate_conflict' for c, _ in g['flags']):
                    continue
                sizes = ', '.join('row %d = %s' % (x['line'], (x['r']['serving_g'] + ' g') if x['r']['serving_g'] else (x['r']['serving_ml'] + ' ml'))
                                  for x in grp)
                g['flags'].append(('size_label_ambiguous', 'same item+size label at different weights (%s); numbers scale with weight, so the size label is missing or wrong' % sizes))
            continue
        for g in grp:
            if any(c == 'duplicate_conflict' for c, _ in g['flags']):
                continue
            diff = [x for x in grp if x is not g and x['nt'] != g['nt']]
            if diff:
                g['flags'].append(('name_collision', 'same item+variant name as row(s) %s with different numbers (serving text differs)'
                                   % ','.join(str(x['line']) for x in diff)))

    # STEADY rules v1 on derived per-100 g values (only where a gram basis is known)
    v1 = Counter()
    v1_rows = []
    for o in out:
        v = o['v']
        if o['basis'] == 'per_100g':
            fac = 1.0
        elif o['basis'] == 'per_serve' and o['wg']:
            fac = 100.0 / o['wg']
        else:
            v1['not_derivable'] += 1
            continue
        per100 = tuple(None if v[c] is None else v[c] * fac for c in ('kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'))
        iss = rules_v1(per100, o['r']['item'])
        v1['derivable'] += 1
        if iss:
            v1['fail'] += 1
            o['flags'].append(('fails_steady_rules_v1', '%s on derived per-100 g (%s kcal, P%s C%s F%s)' % (
                ','.join(iss), fmt(per100[0]), fmt(per100[1]), fmt(per100[2]), fmt(per100[3]))))
            ours = set(c for c, _ in o['flags'])
            v1_rows.append({'slug': o['slug'], 'line': o['line'], 'item': o['r']['item'], 'issues': iss,
                            'also_flagged_by_qa': bool(ours & {'atwater_mismatch', 'kcal_density_gt_900', 'macro_mass_gt_serving'})})
    # bigger serve of the same item must not have fewer or equal kcal
    # (Starbucks Short and Tall Cappuccino both print 104 kcal)
    for key, grp in byitem_all(out).items():
        for unit in ('serving_g', 'serving_ml'):
            sized = [g for g in grp if g['basis'] == 'per_serve' and g['v'][unit] and g['v']['kcal'] is not None]
            sized.sort(key=lambda g: g['v'][unit])
            for i, a in enumerate(sized):
                for b in sized[i + 1:]:
                    if section_of(a) != section_of(b) or a['v']['kcal'] < 20:
                        continue  # other listing/table (handled as a conflict) or ~0 kcal drink
                    if b['v'][unit] > a['v'][unit] * 1.05 and b['v']['kcal'] <= a['v']['kcal']:
                        u = 'g' if unit == 'serving_g' else 'ml'
                        d = 'row %d (%s %s) %s kcal vs row %d (%s %s) %s kcal' % (
                            a['line'], fmt(a['v'][unit]), u, fmt(a['v']['kcal']),
                            b['line'], fmt(b['v'][unit]), u, fmt(b['v']['kcal']))
                        for g in (a, b):
                            if not any(c == 'size_not_monotonic' for c, _ in g['flags']):
                                g['flags'].append(('size_not_monotonic', 'larger serve has no more kcal: ' + d))

    # same item published twice under a source/location label ("cafe CA-052 listing",
    # "as listed under Dunked Range", "Just Sundaes menu - Sundae", "unlabelled column 1")
    LISTRE = re.compile(r'listing|listed under|unlabelled|\bmenu - |store-page|store page|cafe CA-', re.I)
    byitem = defaultdict(list)
    for o in out:
        byitem[(o['slug'], norm(o['r']['item']), o['r']['veg_nonveg'].strip().lower())].append(o)
    for key, grp in byitem.items():
        if len(grp) < 2 or len(set(g['nt'] for g in grp)) < 2:
            continue
        if not any(LISTRE.search(g['r']['variant_or_size']) for g in grp):
            continue
        cand = [g for g in grp if LISTRE.search(g['r']['variant_or_size']) or not g['r']['variant_or_size'].strip()]
        if len(cand) < 2 or len(set(g['nt'] for g in cand)) < 2:
            continue
        dens = []
        for g in cand:
            w = g['v']['serving_g'] or g['v']['serving_ml']
            dens.append(g['v']['kcal'] / w if (w and g['v']['kcal'] is not None) else None)
        if None not in dens and max(dens) > 0 and (max(dens) - min(dens)) <= 0.05 * max(dens):
            continue  # same food at two published sizes, numbers scale with weight
        for g in cand:
            if any(c in ('duplicate_conflict', 'name_collision') for c, _ in g['flags']):
                continue
            others = ','.join(str(x['line']) for x in cand if x is not g and x['nt'] != g['nt'])
            g['flags'].append(('listed_twice_conflict', 'same item published again with different numbers (rows %s; variant label %r)'
                               % (others, g['r']['variant_or_size'])))

    # write
    hdr = COLS + EXTRA
    per_slug = defaultdict(list)
    for o in out:
        sev = max((TIER[c] for c, _ in o['flags']), key=lambda t: RANK[t], default='')
        o['sev'] = sev
        o['qa'] = '; '.join('%s: %s' % (c, d) for c, d in o['flags'])
        row = dict(o['r'])
        row.update({'brand_slug': o['slug'], 'source_row': o['line'], 'basis': o['basis'],
                    'qa_severity': sev or 'clean', 'qa_flag': o['qa']})
        o['row'] = row
        per_slug[o['slug']].append(row)
    with open(combined, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=hdr)
        w.writeheader()
        for o in out:
            w.writerow(o['row'])
    for fn in files:
        slug = fn[:-4]
        with open(os.path.join(qa_dir, slug + '.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=hdr)
            w.writeheader()
            for row in per_slug.get(slug, []):
                w.writerow(row)

    # summary
    summ = {'files': {}, 'codes': {}, 'rules_v1': {}}
    for fn in files:
        slug = fn[:-4]
        rows = [o for o in out if o['slug'] == slug]
        sev = Counter(o['sev'] or 'clean' for o in rows)
        codes = Counter(c for o in rows for c in set(c for c, _ in o['flags']))
        vn = Counter(o['r']['veg_nonveg'] or '(blank)' for o in rows)
        first = rows[0]['r'] if rows else {}
        srcs = Counter((o['r']['source_url'], o['r']['source_title'], o['r']['source_date_or_version']) for o in rows)
        has = {c: sum(1 for o in rows if o['r'][c].strip()) for c in NUM}
        summ['files'][slug] = {'brand': first.get('brand', ''), 'rows': len(rows), 'severity': dict(sev),
                               'codes': dict(codes), 'veg': dict(vn), 'has': has,
                               'basis': dict(Counter(o['basis'] for o in rows)),
                               'sources': [list(k) + [n] for k, n in srcs.most_common()],
                               'distinct_items': len(set(norm(o['r']['item']) for o in rows))}
    ex = defaultdict(list)
    for o in out:
        for c, d in o['flags']:
            ex[c].append({'slug': o['slug'], 'line': o['line'], 'item': o['r']['item'],
                          'variant': o['r']['variant_or_size'], 'detail': d})
    summ['codes'] = {c: {'n': len(l), 'tier': TIER[c], 'examples': l} for c, l in ex.items()}

    summ['rules_v1'] = {'counts': dict(v1), 'failures': v1_rows}
    summ['total_rows'] = len(out)
    summ['severity'] = dict(Counter(o['sev'] or 'clean' for o in out))
    with open(summary_path, 'w', encoding='utf-8') as fh:
        json.dump(summ, fh, indent=1, ensure_ascii=False)
    print('rows', len(out), 'severity', summ['severity'])
    print('codes', {c: x['n'] for c, x in sorted(summ['codes'].items(), key=lambda kv: -kv[1]['n'])})
    print('rules_v1', dict(v1))


if __name__ == '__main__':
    main()
