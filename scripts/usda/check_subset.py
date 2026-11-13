"""Independent recount of the USDA import subset (v1.2 Phase 7, spec (h) Python).

Reads the three pinned FoodData Central zips straight from the gitignored cache (.cache/usda/, filled by
`npx tsx scripts/import-usda.ts fetch`), re-implements the subset rules and the energy choice in Python,
and compares the counts with scripts/usda/manifest.json (written by the TypeScript generator).
Exit 0 = they agree; 1 = they differ (both numbers printed); 2 = a pinned file is missing or wrong.

    python3 -I scripts/usda/check_subset.py

Standard library only. The files are untrusted data: parsed, never executed.
"""
import csv
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(REPO, '.cache', 'usda')

SR_EXCLUDED_GROUPS = {'Baby Foods': 'baby food', 'American Indian/Alaska Native Foods': 'American Indian / Alaska Native food'}
SR_CHAIN_GROUPS = {'Fast Foods', 'Restaurant Foods'}
SR_BRAND = re.compile(r"^[A-Z0-9][A-Z0-9 .'&-]{2,},")
FNDDS_EXCLUDED = re.compile(r'baby|formula|human milk', re.I)


def pinned_zip(pin):
    path = os.path.join(CACHE, pin['file'])
    if not os.path.exists(path):
        print(f'missing {path}: run `npx tsx scripts/import-usda.ts fetch`', file=sys.stderr)
        sys.exit(2)
    data = open(path, 'rb').read()
    if len(data) != pin['bytes'] or hashlib.sha256(data).hexdigest() != pin['sha256']:
        print(f'{pin["file"]} differs from its pin', file=sys.stderr)
        sys.exit(2)
    return zipfile.ZipFile(io.BytesIO(data))


def member(z, base):
    names = [n for n in z.namelist() if n.rsplit('/', 1)[-1] == base]
    if len(names) != 1:
        raise SystemExit(f'zip: expected one {base}, found {names}')
    return io.TextIOWrapper(z.open(names[0]), encoding='utf-8', newline='')


def main():
    pins = json.load(open(os.path.join(HERE, 'sources.json')))
    manifest = json.load(open(os.path.join(HERE, 'manifest.json')))

    # Foundation (JSON): energy 2048, then 1008, then 2047
    zf = pinned_zip(pins['foundation'])
    jname = [n for n in zf.namelist() if n.endswith('.json')]
    foundation = json.load(io.TextIOWrapper(zf.open(jname[0]), encoding='utf-8'))['FoundationFoods']
    kept = Counter()
    excluded = Counter()
    energy = Counter()
    fo_ndb = set()
    for x in foundation:
        ids = {}
        for fn in x.get('foodNutrients', []):
            i = (fn.get('nutrient') or {}).get('id')
            if fn.get('amount') is not None and i not in ids:
                ids[i] = fn['amount']
        e = next((i for i in (2048, 1008, 2047) if i in ids), None)
        if e is None:
            excluded['foundation: Foundation food with no energy value'] += 1
            continue
        kept['foundation'] += 1
        energy[f'foundation:{e}'] += 1
        fo_ndb.add(str(x.get('ndbNumber')))

    # SR Legacy (CSV)
    zs = pinned_zip(pins['sr'])
    groups = {r['id']: r['description'] for r in csv.DictReader(member(zs, 'food_category.csv'))}
    ndb = {r['fdc_id']: r['NDB_number'] for r in csv.DictReader(member(zs, 'sr_legacy_food.csv'))}
    for r in csv.DictReader(member(zs, 'food.csv')):
        g = groups.get(r['food_category_id'], '')
        if g in SR_EXCLUDED_GROUPS:
            excluded['sr: ' + SR_EXCLUDED_GROUPS[g]] += 1
        elif SR_BRAND.match(r['description']) or g in SR_CHAIN_GROUPS:
            excluded['sr: fast food, restaurant or brand row'] += 1
        elif ndb.get(r['fdc_id']) in fo_ndb:
            excluded['sr: SR row replaced by a Foundation food with the same NDB number'] += 1
        else:
            kept['sr'] += 1
            energy['sr:1008'] += 1

    # FNDDS (CSV): energy is the OLD nutrient number 208
    zn = pinned_zip(pins['fndds'])
    wweia = {r['wweia_food_category']: r['wweia_food_category_description'] for r in csv.DictReader(member(zn, 'wweia_food_category.csv'))}
    has_energy = {r['fdc_id'] for r in csv.DictReader(member(zn, 'food_nutrient.csv')) if r['nutrient_id'] == '208' and r['amount'] != ''}
    for r in csv.DictReader(member(zn, 'food.csv')):
        if FNDDS_EXCLUDED.search(wweia.get(r['food_category_id'], '')):
            excluded['fndds: baby food, infant formula or human milk'] += 1
        elif r['fdc_id'] not in has_energy:
            excluded['fndds: FNDDS food with no energy value'] += 1
        else:
            kept['fndds'] += 1
            energy['fndds:208'] += 1

    got = {'subset': {**{d: kept[d] for d in ('foundation', 'sr', 'fndds')}, 'total': sum(kept.values())},
           'excluded': dict(sorted(excluded.items())), 'energy_ids': dict(sorted(energy.items()))}
    want = {k: manifest[k] for k in got}
    bad = [k for k in got if got[k] != want[k]]
    for k in got:
        print(f"{'ok  ' if k not in bad else 'DIFF'} {k}: python {json.dumps(got[k], sort_keys=True)}")
        if k in bad:
            print(f'     manifest {json.dumps(want[k], sort_keys=True)}')
    if got['subset']['total'] != 12290:
        print(f"note: the spec's subset is 12,290 foods; this recount gives {got['subset']['total']}")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
