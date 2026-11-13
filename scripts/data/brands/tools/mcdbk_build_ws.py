# usage: python3 -I mcdbk_build_ws.py <ws_words.json> <ws_rows_table.json> <ws_veg.json> <out.csv>
import sys, os, json, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
from mcdbk_common import split_variant, atwater_note, write, fnum
words = json.load(open(sys.argv[1])); table = json.load(open(sys.argv[2])); vegrows = json.load(open(sys.argv[3]))
F = ['protein', 'fat', 'satfat', 'trans', 'chol', 'carb', 'sugar', 'addsugar', 'sodium']
# names rendered as vector outlines (no text layer) - read visually from the rendered PDF, keyed by (serve, kcal)
VISUAL = {('87 g', '228.21'): 'Pizza Puff', ('200 ml', '6.80'): 'L1 Coffee', ('205 ml', '35.80'): 'L1 Coffee with milk',
          ('80 g', '341.68'): 'Double Chocochips Muffin', ('80 g', '329.29'): 'Vanilla Chocochips Muffin',
          ('119 g', '309.35'): 'Veg McMuffin', ('100 g', '273.78'): 'Double Cheese McMuffin', ('123.2 g', '278.27'): 'Spicy Egg McMuffin',
          ('112 g', '281.44'): 'Sausage Mc Muffin', ('157 g', '354.46'): 'Sausage Mc Muffin with egg', ('112 g', '283.46'): 'Egg McMuffin',
          ('362.5 ml', '264.53'): 'Iced Coffee 14 oZ', ('327.5 ml', '391.66'): 'Classic Cold Coffee 14 oZ',
          ('291.5 ml', '185.34'): 'Iced Coffee 10 oz', ('296.5 ml', '331.17'): 'Classic Cold Coffee 10 oz',
          ('304 ml', '357.09'): 'Hazelnut Cold Coffee 10 oz'}
def tserve(s):
    s = (s or '').replace('m l', 'ml')
    return s + 'l' if s.endswith(' m') else s
rows = []
for w in words:
    t = None
    for c in table:
        if tserve(c['serve']) == w['serve'] and (c['kcal'] or '').replace('l ', '').split(' ')[0] == w['kcal']: t = c; break
    r = {'serve': w['serve'], 'kcal': w['kcal'], 'section': (t['section'] if t else None) or w['section'], 'block': w['block'], 'top': w['top']}
    for k in F:
        v = w[k]
        if not v and t: v = (t[k] or '').split(' ')[0]   # words layer missed a value on a split line; table cell verified visually
        r[k] = v
    name = w['name'] or (t['name'] if t and t['name'] not in ('', 'oz') else '')
    if 'per serve percentage' in name: name = name.split(' per serve percentage')[0]
    r['name'] = VISUAL.get((w['serve'], w['kcal']), name)
    r['name_source'] = 'visual (outlined text in PDF)' if (w['serve'], w['kcal']) in VISUAL else 'text layer'
    rows.append(r)
have = {(r['serve'], r['kcal']) for r in rows}
for c in table:
    key = (tserve(c['serve']), (c['kcal'] or '').replace('l ', '').split(' ')[0])
    if key not in have:
        r = {'serve': key[0], 'kcal': key[1], 'section': c['section'], 'block': c['table'], 'top': c['bbox'][1], 'name': c['name'], 'name_source': 'text layer'}
        for k in F: r[k] = (c[k] or '').split(' ')[0]
        rows.append(r); have.add(key)
rows.sort(key=lambda r: (r['block'], r['top']))
last = None
for r in rows:
    if r['section']: last = r['section']
    else: r['section'] = last
# veg / non-veg from page-1 marks, joined on serve size + kcal (page 1 rounds kcal)
def veg_for(r):
    k = fnum(r['kcal'])
    c = [v for v in vegrows if v['serve'] == r['serve'] and fnum(v['kcal']) is not None and abs(fnum(v['kcal']) - k) <= 1.01]
    if len(c) == 1 and len(c[0]['veg']) == 1: return c[0]['veg'][0], ''
    c2 = [v for v in vegrows if v['serve'] == r['serve'] and v['name'] and v['name'].lower().replace('™', '').replace('®', '')[:12] == r['name'].lower().replace('™', '').replace('®', '')[:12]]
    if len(c2) == 1 and len(c2[0]['veg']) == 1:
        return c2[0]['veg'][0], f"page-1 kcal {c2[0]['kcal']} differs from page-2 kcal {r['kcal']}"
    if re.search(r'chicken|egg|fish|sausage|mutton|filet', r['name'], re.I):
        return '', 'veg/non-veg mark not matched to page 1'
    return 'veg', 'veg/non-veg mark not matched to page 1; veg inferred from item name (no meat/egg/fish in name)'
URL = 'https://www.mcdonaldsindia.com/pdf/2024/nutrition-information.pdf'
TITLE = "McDonald's Nutritional Information Per Serve (McDonald's India West & South, Westlife Foodworld) - linked as 'Nutrition information' from mcdonaldsindia.com/nutrition.html"
VER = 'pdf/2024 path; file Last-Modified 10 Apr 2024 (no newer version linked as of 13 Nov 2026)'
SPECIFIC = {'Tomato Ketchup Sachets': 'Published total fat 23.45 g for an 8 g sachet is a source typo (its %RDA cell shows 0.00); kept as published.',
            'Veg Nuggets (2pc)': 'Published protein 13.03 g for 2 pc vs 6.06 g for 4 pc - source inconsistency; kept as published.',
            'McSpicy Premium Chicken Burger': 'Published cholesterol 302.61 mg looks high; kept as published.'}
COFFEE = 'McCafe espresso drinks: milk type is not stated in the PDF (default dairy milk assumed by McCafe); no alternative-milk values published.'
out = []
for r in rows:
    name = r['name']
    item, var = split_variant(name)
    if re.match(r'^(Regular|Medium|Large) Fries$', name): item, var = 'Fries', name.split()[0]
    if item == 'Fanta Oragne': item = 'Fanta Orange'
    m = re.match(r'^(Regular|Medium) (Soft Serve: .*)$', name)
    if m: item, var = m.group(2), m.group(1)
    num, unit = r['serve'].split(' ')
    veg, vnote = veg_for(r)
    notes = [f"sat_fat_g={r['satfat']}", f"trans_fat_g={r['trans']}", f"cholesterol_mg={r['chol']}", f"added_sugar_g={r['addsugar']}"]
    if var: notes.append(f'published name: "{name}"')
    if r['name_source'] != 'text layer': notes.append('item name read visually (name is drawn as outlines, not text, in the PDF)')
    if vnote: notes.append(vnote)
    if r['section'] == 'McCAFE MENU' and re.search(r'Cappuccino|Latte|Flat White|Mocha|Babycino|Hot Chocolate|Machiato|Cold Coffee|Iced Coffee|Frappe|Shake', name): notes.append(COFFEE)
    if 'Fanta Oragne' in name: notes.append('"Oragne" spelling as published.')
    if name in SPECIFIC: notes.append(SPECIFIC[name])
    a = atwater_note(r['kcal'], r['protein'], r['carb'], r['fat'])
    if a: notes.append(a)
    out.append({'brand': "McDonald's India (West & South)", 'country': 'IN', 'item': item, 'variant_or_size': var,
                'serving_desc': f"per serve as published: {r['serve']}", 'serving_g': num if unit == 'g' else '', 'serving_ml': num if unit == 'ml' else '',
                'kcal': r['kcal'], 'protein_g': r['protein'], 'carbs_g': r['carb'], 'fat_g': r['fat'], 'fiber_g': '', 'sugar_g': r['sugar'],
                'sodium_mg': r['sodium'], 'veg_nonveg': veg, 'source_url': URL, 'source_title': TITLE, 'source_date_or_version': VER,
                'page_or_section': f"p2 - {r['section']}", 'notes': '; '.join(notes)})
write(sys.argv[4], out)
print('rows', len(out), collections.Counter(o['veg_nonveg'] for o in out))
for o in out:
    if not o['veg_nonveg'] or 'CHECK' in o['notes'] or 'differs' in o['notes'] or not o['item']: print(o['item'], '|', o['variant_or_size'], o['kcal'], '|', o['notes'][-170:])
