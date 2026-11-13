#!/usr/bin/env python3
"""Key/alias collision study for the brand rows (read-only on the repo files it is given).

usage: python3 -I qa_keys.py <combined_csv> <live_keys_snapshot_csv> <indb_json> <out_csv> <out_json>

- bare-name collisions: a brand item name (normalizeName) that already is a STEADY live key/alias
  or an INDB dish name -> must never be keyed bare.
- proposed brand-scoped key "<brand> <item> <size>" uniqueness inside the brand data.
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict

BRAND_KEY = {
    'mcdonalds_india_west_south': 'mcdonalds', 'mcdonalds_india_north_east': 'mcdonalds',
    'burger_king_india': 'burger king', 'dominos': 'dominos', 'pizza_hut': 'pizza hut',
    'lapinoz_pizza': 'la pinoz', 'kfc_india': 'kfc', 'subway_india': 'subway', 'taco_bell_india': 'taco bell',
    'starbucks_india': 'starbucks', 'cafe_coffee_day': 'ccd', 'blue_tokai': 'blue tokai', 'barista': 'barista',
    'behrouz_biryani': 'behrouz', 'faasos': 'faasos', 'haldirams': 'haldirams', 'wow_momo': 'wow momo',
    'theobroma': 'theobroma', 'amul': 'amul', 'naturals_ice_cream': 'naturals',
}


def norm(s):
    s = (s or '').lower()
    s = re.sub(r'[^\w\s]|_', ' ', s, flags=re.UNICODE)
    return re.sub(r'\s+', ' ', s).strip()


def main():
    combined, live, indb, out_csv, out_json = sys.argv[1:6]
    live_keys = {}
    with open(live, newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            live_keys[norm(r['phrase'])] = r['kind']
    indb_names = {}
    with open(indb, encoding='utf-8') as fh:
        for d in json.load(fh):
            n = norm(d['name'])
            indb_names[n] = d['name']
            # INDB names often carry a local name in brackets: "Hot tea (Garam Chai)"
            m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', d['name'])
            if m:
                indb_names.setdefault(norm(m.group(1)), d['name'])
                indb_names.setdefault(norm(m.group(2)), d['name'])

    rows = list(csv.DictReader(open(combined, newline='', encoding='utf-8')))
    coll = []
    seen = set()
    for r in rows:
        n = norm(r['item'])
        if not n or (r['brand_slug'], n) in seen:
            continue
        seen.add((r['brand_slug'], n))
        hit_live = live_keys.get(n)
        hit_indb = indb_names.get(n)
        if hit_live or hit_indb:
            coll.append({'brand_slug': r['brand_slug'], 'item': r['item'], 'normalized': n,
                         'steady_live_key_kind': hit_live or '', 'indb_name': hit_indb or ''})
    with open(out_csv, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['brand_slug', 'item', 'normalized', 'steady_live_key_kind', 'indb_name'])
        w.writeheader()
        w.writerows(coll)

    # brand-scoped key uniqueness among rows that pass QA without error/conflict
    keys = defaultdict(list)
    for r in rows:
        if r['qa_severity'] in ('error', 'conflict'):
            continue
        k = norm(' '.join([BRAND_KEY.get(r['brand_slug'], r['brand_slug']), r['item'], r['variant_or_size'],
                           'veg' if r['veg_nonveg'] == 'veg' and r['brand_slug'] in ('pizza_hut',) else '']))
        keys[k].append(r)
    dup = {k: [(x['brand_slug'], x['source_row']) for x in v] for k, v in keys.items() if len(v) > 1}
    cross = defaultdict(set)  # same normalized item across brands (fine when brand-scoped)
    for r in rows:
        cross[norm(r['item'])].add(r['brand_slug'])
    cross_multi = {k: sorted(v) for k, v in cross.items() if len(v) > 1}
    res = {'bare_name_collisions': len(coll),
           'bare_collision_by_brand': dict(Counter(c['brand_slug'] for c in coll)),
           'examples': coll[:60],
           'brand_scoped_keys_checked': sum(len(v) for v in keys.values()),
           'brand_scoped_key_dups': len(dup), 'brand_scoped_dup_examples': list(dup.items())[:25],
           'same_item_name_across_brands': len(cross_multi),
           'cross_examples': list(cross_multi.items())[:30]}
    with open(out_json, 'w', encoding='utf-8') as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
    print({k: v for k, v in res.items() if not isinstance(v, (list, dict))})
    print(res['bare_collision_by_brand'])


if __name__ == '__main__':
    main()
