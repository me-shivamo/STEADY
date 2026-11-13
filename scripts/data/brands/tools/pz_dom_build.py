# Build Domino's India CSV from parsed transcription records.
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pz_csv
recs = json.load(open(sys.argv[1])); out = sys.argv[2]
PAGE = 'https://pizzaonline.dominos.co.in/jfl-discovery-ui/en/dt/nutritional-info'
IMG = 'https://pizzaonline.dominos.co.in/jfl-discovery-ui/public/dist/default/images/global/nutrition/{}.jpg'
TITLE = "Domino's Pizza India (Jubilant FoodWorks) - Nutritional Info page, 'Baking Goodness' nutrition charts (images MNI-01..MNI-47)"
VER = 'chart images Last-Modified 2026-10-28; retrieved 2026-11-13'
CRUST = {'NHT': 'New Hand Tossed', 'PAN': 'Fresh Pan', 'THIN': 'Thin Crust', 'CB': 'Cheese Burst', 'MGTHIN': 'Thin Crust (multigrain range)',
         'SIDE': '', 'DESSERT': '', 'DIP': '', 'BEV': ''}
SERVES = {'Regular': 'Regular serves 1', 'Medium': 'Medium serves 2', 'Large': 'Large serves 4'}
def f(x):
    try: return float(x)
    except Exception: return None
rows = []
for r in recs:
    v = r['vals']; name = r['item']; notes = []
    m = re.match(r'^(.*?)\s*\((.*)\)\s*$', name)
    section = ''
    if m:
        base, ann = m.group(1), m.group(2)
        if ann.startswith('No Onion'):
            name = base; notes.append('NONG = No Onion No Garlic (as labelled on the chart)')
        else:
            name = base
            for part in [a.strip() for a in ann.split(',')]:
                if 'second listing' in part:
                    notes.append('this item appears twice in the official charts with different values; this row is the ' + part + ' (looks like a separate recipe/range; ask Domino\'s which applies)')
                elif part == 'Multigrain': section = 'Multigrain Pizza'
                elif part == 'Gourmet Pizza': section = 'Gourmet Pizza'
                elif part == 'Multigrain Pizza page': section = 'Multigrain Pizza page'
                elif part == 'NONG page': section = 'NONG page'
                elif part == 'South Pizza': section = 'South Pizza'
                elif part == 'pasta': section = 'Pasta (single serve)'
                else: notes.append(part)
    crust = CRUST.get(r['crust'], r['crust']); size = r['size']
    if r['crust'] == 'MGTHIN': section = 'Multigrain Pizza'
    variant = ' - '.join(x for x in [crust, size] if x)
    if r['crust'] in ('NHT', 'PAN', 'THIN', 'CB', 'MGTHIN'):
        sdesc = f'1 serve = {r["slices"]} slices ({SERVES.get(size, size)})'
    elif r['crust'] == 'BEV':
        sdesc = f'1 serve ({size})'
    else:
        sdesc = '1 single serve'
    sml = ''
    mm = re.match(r'(\d+)\s*ml', size)
    if r['crust'] == 'BEV' and mm: sml = mm.group(1)
    if r['note']: notes.append(r['note'])
    extra = []
    for k, lab in [('SF', 'sat_fat_g'), ('TF', 'trans_fat_g'), ('AS', 'added_sugar_g'), ('CH', 'cholesterol_mg')]:
        if v.get(k) not in (None,): extra.append(f'{lab}={v.get(k)}')
    notes.append('also published: ' + ', '.join(extra))
    E, P, C, F = (f(v.get(k)) for k in 'E P C F'.split())
    if None not in (E, P, C, F) and E > 50 and abs(4 * P + 4 * C + 9 * F - E) > 10:
        notes.append(f'source-internal inconsistency: 4P+4C+9F={4*P+4*C+9*F:.1f} vs published kcal {v.get("E")} (kept as published)')
    if r['img'] in ('MNI-28', 'MNI-29', 'MNI-30', 'MNI-31') or r['item'].startswith('Unthinkable Pizza (Multigrain'):
        notes.append("the chart's sodium %RDA row on these multigrain pages appears shifted by one column relative to the mg values; mg value kept as printed under this item")
    if r['img'] == 'MNI-47' and r['item'] in ('Cheesy Dip', 'Harissa Dip'):
        notes.append('in the chart the values for this dip are printed two rows lower than their labels; read in label order (energy first)')
    def g(k):
        x = v.get(k)
        return '' if x in (None, '-') else x
    rows.append({'brand': "Domino's Pizza", 'country': 'IN', 'item': name, 'variant_or_size': variant, 'serving_desc': sdesc,
                 'serving_g': '', 'serving_ml': sml, 'kcal': g('E'), 'protein_g': g('P'), 'carbs_g': g('C'), 'fat_g': g('F'),
                 'fiber_g': '', 'sugar_g': g('TS'), 'sodium_mg': g('NA'), 'veg_nonveg': r['veg'], 'source_url': PAGE,
                 'source_title': TITLE, 'source_date_or_version': VER,
                 'page_or_section': IMG.format(r['img']) + (f' ({section})' if section else ''),
                 'notes': '; '.join(n for n in notes if n)})
pz_csv.write(out, rows)
print('rows', len(rows))
