"""Every item in the research report's portion tables has a 054 seed row (spec (h), Python).

Parses docs/research/reports/Indian portion sizes and cooking yields.md independently of the
TypeScript generator: each row of the measures table and the four item tables must be listed in
EXPECTED below, either with the seed rows that carry it (checked against
scripts/portions/data/portion_units_seed.csv) or with an explicit "not a portion row" note. Where a
row's own cells give plain numbers (bold default + "S / L"), those numbers must equal the seed's.
A new row in the report therefore fails this test until someone maps it.

Run:  python3 -I -m unittest discover -s scripts/portions/tests -v      (from the repo root)
"""
import csv
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
REPORT = os.path.join(REPO, 'docs', 'research', 'reports', 'Indian portion sizes and cooking yields.md')
SEED = os.path.join(REPO, 'scripts', 'portions', 'data', 'portion_units_seed.csv')
PHULKA = 'f1cf4b91-0c2c-58d6-8e16-0849b57c59d3'

# The tables whose rows are portion items (the others compare 053 and the old hint, or list gaps).
SECTIONS = ('## NIN weighed four katoris', '### Breads and grains', '### Dals, curries and sabzi',
            '### Dairy and drinks', '### Single-ingredient staples')


def R(scope, key, unit, values, kind='grams', context='', region=''):
    """values: {size: number}; kind: 'grams' or 'ml'."""
    return dict(scope=scope, key=key, unit=unit, values=values, kind=kind, context=context, region=region)


NOT_A_ROW = 'not a portion row'
# item label (first cell, as printed) -> (expected seed rows, auto-check the row's own numbers?) or a note
EXPECTED = {
    # measures
    'Katori, brim capacity': f'{NOT_A_ROW}: anchors the as-served katori ladder (spec (e))',
    'Katori of a liquid dish (dal, curd, kadhi), as served': (
        [R('generic', 'generic', 'katori', {'S': 100, 'M': 150, 'L': 250}, 'ml'),
         R('category', 'liquid_dish', 'katori', {'S': 100, 'M': 150, 'L': 250})], True),
    'Katori of a solid dish (rice, sabzi, poha)': f'{NOT_A_ROW}: resolved by dish density and the dish rows',
    'Bowl (serving bowl)': ([R('generic', 'generic', 'bowl', {'S': 150, 'M': 240, 'L': 320}, 'ml')], False),
    'Glass / tumbler': ([R('generic', 'generic', 'glass', {'S': 150, 'M': 200, 'L': 275}, 'ml', region='IN')], False),
    'Teacup': ([R('category', 'tea', 'cup', {'S': 90, 'M': 120, 'L': 150}, 'ml', region='IN'),
                R('category', 'tea', 'cutting', {'S': 60, 'M': 75, 'L': 90}, 'ml'),
                R('category', 'tea', 'mug', {'S': 150, 'M': 200, 'L': 250}, 'ml')], False),
    '"Cup" as a measure': ([R('generic', 'generic', 'cup', {'M': 240}, 'ml')], False),
    'Teaspoon, measuring / household': ([R('generic', 'generic', 'tsp', {'S': 4, 'M': 5, 'L': 6}, 'ml')], False),
    'Tablespoon, measuring / household': ([R('generic', 'generic', 'tbsp', {'S': 9, 'M': 15, 'L': 18}, 'ml'),
                                           R('generic', 'generic', 'spoon', {'S': 6, 'M': 9, 'L': 13}, 'ml')], False),
    'Ghee or oil, 1 tsp / 1 tbsp': ([R('category', 'fat', 'tsp', {'S': 3.5, 'M': 5, 'L': 8}),
                                     R('category', 'fat', 'tbsp', {'S': 8, 'M': 13, 'L': 18})], False),
    'Ladle (karchi), plate': f'{NOT_A_ROW}: no measured data (gap); a ladle goes to the fallback, the plate to the old hint',
    # breads and grains
    '#1 Roti / chapati, home wheat': ([R('category', 'flatbread', 'piece', {'S': 25, 'M': 35, 'L': 50})], True),
    '#2 Phulka (thin, puffed, no fat)': ([R('food', PHULKA, 'piece', {'S': 22, 'M': 30, 'L': 40})], True),
    'Restaurant / tandoori roti': ([R('category', 'flatbread_tandoor', 'piece', {'S': 45, 'M': 60, 'L': 80}),
                                    R('category', 'flatbread', 'piece', {'S': 45, 'M': 60, 'L': 80}, context='restaurant')], True),
    '#3 Plain paratha': ([R('category', 'paratha', 'piece', {'S': 35, 'M': 50, 'L': 80}),
                          R('category', 'paratha', 'piece', {'S': 80, 'M': 100, 'L': 120}, context='restaurant')], True),
    '#4 Aloo paratha': ([R('category', 'stuffed_paratha', 'piece', {'S': 70, 'M': 100, 'L': 150})], True),
    '#10–11 Rice, yield': f'{NOT_A_ROW}: composition (053 recalculation), not a portion',
    '#11 Rice, 1 katori (200 ml)': ([R('category', 'cooked_rice', 'katori', {'S': 100, 'M': 130, 'L': 240})], True),
    'Rice, 1 cup (240 ml)': ([R('category', 'cooked_rice', 'cup', {'M': 158})], True),
    '#10 Rice, 1 plate (home meal)': ([R('category', 'cooked_rice', 'plate', {'S': 150, 'M': 250, 'L': 350})], True),
    '#12 Poha, 1 plate': ([R('category', 'poha_upma', 'plate', {'S': 100, 'M': 150, 'L': 250})], True),
    '#13 Upma, 1 plate': ([R('category', 'poha_upma', 'plate', {'S': 100, 'M': 150, 'L': 250})], True),
    '#25 Idli': ([R('category', 'idli', 'piece', {'S': 25, 'M': 40, 'L': 60})], True),
    '#24 Plain dosa, home': ([R('category', 'dosa', 'piece', {'S': 40, 'M': 60, 'L': 100}),
                              R('category', 'masala_dosa', 'piece', {'S': 180, 'M': 195, 'L': 210})], True),
    '#23 Chicken biryani, home plate': ([R('category', 'biryani', 'plate', {'S': 200, 'M': 300, 'L': 400})], True),
    '#23 Chicken biryani, restaurant / delivery': ([R('category', 'biryani', 'plate', {'S': 350, 'M': 450, 'L': 600}, context='restaurant')], True),
    # dals, curries and sabzi
    '#5 Dal / dal tadka, medium': ([R('category', 'liquid_dish', 'katori', {'S': 100, 'M': 150, 'L': 250})], True),
    '#6 Rajma curry': ([R('category', 'liquid_dish', 'katori', {'S': 100, 'M': 150, 'L': 250})], True),
    'Chole (kabuli chana)': ([R('category', 'liquid_dish', 'katori', {'S': 100, 'M': 150, 'L': 250})], True),
    '#7 Dry aloo sabzi': ([R('category', 'dry_sabzi', 'katori', {'S': 75, 'M': 120, 'L': 200})], True),
    '#7 Bhindi sabzi': ([R('category', 'sabzi_bhindi', 'katori', {'S': 75, 'M': 110, 'L': 175})], True),
    '#8 Paneer gravy': ([R('category', 'paneer_gravy', 'katori', {'S': 100, 'M': 150, 'L': 250})], True),
    '#9 Curd, 1 katori': ([R('category', 'curd', 'katori', {'S': 100, 'M': 150, 'L': 200})], True),
    # dairy and drinks
    '#15 Chai, home': ([R('category', 'tea', 'cup', {'M': 120}, 'ml', region='IN'),
                        R('category', 'tea', 'cutting', {'S': 60, 'L': 90}, 'ml'),
                        R('category', 'tea', 'mug', {'S': 150, 'M': 200}, 'ml')], False),
    '#16 Glass of milk': ([R('category', 'milk', 'glass', {'S': 150, 'M': 200, 'L': 300}, 'ml', region='IN')], True),
    '#17 Glass of chaas': ([R('category', 'buttermilk', 'glass', {'S': 150, 'M': 200, 'L': 300}, 'ml', region='IN')], True),
    '#14 Bowl of oats with milk': ([R('category', 'cereal_dry', 'bowl', {'S': 20, 'M': 35, 'L': 55}),
                                    R('category', 'milk', 'serving', {'M': 175}, 'ml')], False),
    # staples
    '#18 Whey, 1 scoop': ([R('category', 'protein_powder', 'scoop', {'S': 30, 'M': 32, 'L': 38.5})], False),
    '#19 2-egg omelette': ([R('category', 'omelette', 'serving', {'S': 90, 'M': 100, 'L': 150}),
                            R('category', 'masala_omelette', 'serving', {'M': 125}),
                            R('category', 'egg', 'piece', {'S': 44, 'M': 50, 'L': 56})], False),
    '#20 Banana, Cavendish (Robusta, Grand Naine)': ([R('category', 'banana', 'piece', {'S': 101, 'M': 118, 'L': 136})], True),
    '#20 Banana, Yelakki / elaichi': ([R('category', 'banana_small', 'piece', {'S': 40, 'M': 50, 'L': 60})], True),
    '#21 Peanuts, 1 handful': ([R('category', 'peanut', 'handful', {'S': 15, 'M': 33, 'L': 58}),
                                R('category', 'nuts', 'handful', {'S': 15, 'M': 33, 'L': 58}),
                                R('category', 'peanut', 'piece', {'M': 1.0}),
                                R('category', 'nuts', 'tbsp', {'M': 9})], True),
    '#22 Ghee, 1 spoon': ([R('category', 'fat', 'spoon', {'S': 3.5, 'M': 5, 'L': 8}),
                           R('category', 'fat', 'tbsp', {'S': 8, 'M': 13, 'L': 18})], False),
}


def report_items():
    """(section, first cell, cells) for every body row of the portion tables."""
    out, sec = [], None
    with open(REPORT, encoding='utf-8') as f:
        text = f.read()
    for line in text.split('\n'):
        if line.startswith('#'):
            sec = line
            continue
        if not sec or not sec.startswith(SECTIONS) or not line.startswith('|') or line.startswith('|---'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if cells[0] in ('Measure', 'Sheet item'):
            continue
        out.append((sec, cells[0], cells))
    return out


def own_numbers(cells):
    """The row's own M (first bold number) and S / L (a leading 'a / b' or 'a / b / c' in column 3)."""
    got = {}
    m = re.search(r'\*\*[^*0-9]*([0-9]+(?:\.[0-9]+)?)', cells[1])
    if m:
        got['M'] = float(m.group(1))
    sl = re.match(r'^([0-9]+(?:\.[0-9]+)?)(?: g| ml)?(?: \([^)]*\))? / ([0-9]+(?:\.[0-9]+)?)(?: g| ml)?(?: \([^)]*\))?(?: / ([0-9]+(?:\.[0-9]+)?))?', cells[2]) if len(cells) > 2 else None
    if sl:
        if sl.group(3):
            got.update(S=float(sl.group(1)), M=float(sl.group(2)), L=float(sl.group(3)))
        else:
            got.update(S=float(sl.group(1)), L=float(sl.group(2)))
    return got


def seed_rows():
    with open(SEED, encoding='utf-8') as f:
        return list(csv.DictReader(f))


class ResearchCoverage(unittest.TestCase):
    def test_every_report_item_is_mapped(self):
        items = report_items()
        self.assertGreater(len(items), 40)
        missing = [label for _, label, _ in items if label not in EXPECTED]
        self.assertEqual(missing, [], 'research rows with no seed mapping (add them to EXPECTED)')
        stale = sorted(set(EXPECTED) - {label for _, label, _ in items})
        self.assertEqual(stale, [], 'EXPECTED names a row the report no longer has')

    def test_every_mapped_item_has_its_seed_rows(self):
        rows = seed_rows()
        problems = []
        for label, exp in EXPECTED.items():
            if isinstance(exp, str):
                self.assertTrue(exp.startswith(NOT_A_ROW), label)
                continue
            for want in exp[0]:
                for size, value in want['values'].items():
                    hit = [r for r in rows
                           if r['scope'] == want['scope'] and r['key'] == want['key'] and r['unit'] == want['unit']
                           and r['size'] == size and r['context'] == want['context'] and r['region'] == want['region']
                           and r['status'] in ('active', 'proposed')
                           and r[want['kind']] != '' and abs(float(r[want['kind']]) - value) < 1e-9]
                    if not hit:
                        problems.append(f"{label}: {want['scope']}/{want['key']} {want['unit']} {size} = {value} {want['kind']}")
        self.assertEqual(problems, [])

    def test_the_rows_own_numbers_match_the_seed(self):
        problems = []
        for _, label, cells in report_items():
            exp = EXPECTED.get(label)
            if not isinstance(exp, tuple) or not exp[1]:
                continue
            first = exp[0][0]
            for size, value in own_numbers(cells).items():
                if size in first['values'] and abs(first['values'][size] - value) > 1e-9:
                    problems.append(f'{label}: report {size} = {value}, seed {first["values"][size]}')
        self.assertEqual(problems, [])

    def test_retired_hints_are_kept_for_the_audit_trail(self):
        retired = {(r['key'], r['unit'], r['grams'] or r['ml']) for r in seed_rows() if r['status'] == 'retired'}
        for want in [('generic', 'glass', '245'), ('tea', 'cup', '240'), ('paratha', 'piece', '80'), ('dosa', 'piece', '85'),
                     ('biryani', 'plate', '400'), ('coffee', 'cup', '240')]:
            self.assertIn(want, retired)


if __name__ == '__main__':
    unittest.main()
