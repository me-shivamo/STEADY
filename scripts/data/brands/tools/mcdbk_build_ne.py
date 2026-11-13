# usage: python3 -I mcdbk_build_ne.py <ne_rows.json> <menu2026_rows.json|-> <out.csv>
import sys, os, json, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
from mcdbk_common import atwater_note, write
src = json.load(open(sys.argv[1]))
menu = json.load(open(sys.argv[2])) if sys.argv[2] != '-' else []
URL = 'https://mcdindia.com/wp-content/uploads/2025/12/product-nutritional-information-bookletpdf.pdf'
TITLE = "Product Nutritional Information Booklet - McDonald's India (North & East, Connaught Plaza Restaurants Pvt Ltd); embedded on https://mcdindia.com/nutritional-information/"
VER = 'uploaded Dec 2025 (file Last-Modified 24 Dec 2025; page modified 8 Jan 2026)'
RENAME = {'Cripsy Veggie Burger': ('Crispy Veggie Burger', '"Cripsy" spelling as published.'),
          'Minute Made Pulpy Orange': ('Minute Maid Pulpy Orange', '"Minute Made" spelling as published.'),
          'Veg Mc Muffin': ('Veg McMuffin', ''), 'Egg Mc Muffin': ('Egg McMuffin', ''), 'Sausage Mc Muffin': ('Sausage McMuffin', ''),
          'Veg Supreme Mc Muffin': ('Veg Supreme McMuffin', ''), 'McSwirl Mangodip': ('McSwirl Mango dip', '')}
VARIANT_OVERRIDE = {
    'McFlavor Fries': (['unlabelled (110 g)', 'unlabelled (155 g)'], 'The PDF does not label the two sizes; weights are close to plain Fries Medium (109 g) / Large (154 g).'),
    'Cold Coffee': (['unlabelled (300 ml)', 'unlabelled (270 ml)'], 'The PDF gives two unlabelled serve sizes (column headers just say "Serve Size / Per Serve"). No Total Sugars row published.'),
    'Masala Chai': (['unlabelled (150 ml)', 'unlabelled (90 ml)'], 'The PDF gives two unlabelled serve sizes. Only energy, fats, added sugar and sodium published.'),
    'McFloat': (['unlabelled column 1', 'unlabelled column 2', 'Sprite Float'], 'Columns 1-2 are unlabelled in the PDF; their values are identical to West & South "Coke Float" (138.76 kcal) and "Fanta Float" (151.56 kcal). Protein, carbs and sugars not published.'),
}
SPECIFIC = {'Sundae Chocolate': 'Column headers read "Regular" (91.79 g) and "Mini" (132.08 g) - the larger serve is labelled Mini in the PDF (likely means Medium); kept as published.',
            'Saucy Wrap - Chicken': 'The PDF shows a GREEN (veg) symbol for this chicken item - treated as non-veg from the item name; source error.',
            'Nuggets': 'Published as "Nuggets" with a non-veg mark (chicken McNuggets); allergens listed as Gluten, Fish. Carbs/sugars/cholesterol not published.',
            'Fries': 'Carbs/sugars/cholesterol not published on this page.',
            'Hot Coffee': 'Black coffee as served (200 ml). Add-ons published separately: Milk Tub (Creamer for Coffee) 10 g = 14 kcal; Sugar Sachet 5 g = 20 kcal.',
            'Cheesy Mushroom Burger': ''}
# same kcal also printed on the Apr-2026 N&E menu PDF (corroboration; menu page -> menu name)
MENU_SEEN = {'303.35': (2, 'Veg McMuffin'), '347.96': (3, 'Veg Supreme McMuffin'), '136.8': (5, 'Hash Brown'), '283.46': (6, 'Egg & Cheese Muffin'),
             '281.44': (8, 'Sausage McMuffin'), '339.52': (10, 'McAloo Tikki Burger'), '262.77': (11, 'McEgg Burger'), '387.88': (12, 'McVeggie Burger'),
             '313.44': (13, 'Veg Surprise Burger'), '482.33': (14, 'Crispy Veggie Burger'), '396.77': (15, 'McChicken Burger'), '832.67': (16, 'Veg Maharaja Mac'),
             '274.17': (18, 'Chicken McGrill Burger'), '345.11': (20, 'Filet O Fish Burger'), '646.52': (21, 'McSpicy Paneer Burger'),
             '507.72': (22, 'McCrispy Chicken Burger'), '382.26': (23, 'Butter Paneer Grilled Burger'), '289.81': (49, 'Peri Peri Fries (menu panel = standard regular serving)'),
             '225.21': (50, 'Pizza Puff'), '212.6': (51, 'Chicken Puff'), '215.77': (53, 'Fries (menu panel = standard regular serving)'), '283.78': (54, 'Saucy Wrap - Egg'),
             '312.1': (55, 'Saucy Wrap - Chicken'), '386.92': (56, 'Saucy Wrap - Aloo'), '168.58': (57, 'Chicken McNuggets'), '674.68': (58, 'McSpicy Paneer Wrap'),
             '116.36': (59, 'McFlurry (Oreo)'), '154.19': (60, 'McFlurry (Choco Crunch)'), '85.73': (61, 'Soft Serve Cone'), '147.28': (62, 'Bobaaa Sundae'),
             '193.73': (63, 'Mango Soft Serve Sundae'), '121.64': (64, 'Sundae (Chocolate)'), '100.99': (65, 'Sundae (Strawberry)'),
             '203.26': (66, 'Sundae (Chocolate Brownie)'), '150.03': (67, 'Mango McSwirl'), '160.14': (68, 'Chocolate McSwirl'), '173.54': (69, 'Butterscotch McSwirl')}
out = []; seen = {}
for r in src:
    if 'error' in r: continue
    raw = ' '.join(r['names']).strip()
    vm = re.match(r'^(.*?)\s*\((V\d[^)]*)\)$', raw)
    vtag = vm.group(2) if vm else ''
    base = vm.group(1).strip() if vm else raw
    item, note0 = RENAME.get(base, (base, ''))
    heads = r['heads']
    vov = VARIANT_OVERRIDE.get(base)
    n = len(r['serve'])
    green, red = r['green_px'], r['red_px']
    veg = 'veg' if green > 100 and red == 0 else ('non-veg' if red > 100 and green == 0 else '')
    if base == 'Saucy Wrap - Chicken': veg = 'non-veg'
    for i in range(n):
        s, u = r['serve'][i]
        var = vov[0][i] if vov else (heads[i] if i < len(heads) and heads[i] and not re.search(r'serve|serving|RDA|Recommended', heads[i], re.I) else '')
        v = {k: (vals[i] if i < len(vals) else '') for k, vals in r['vals'].items()}
        key = (item, s, u, v.get('kcal'), v.get('protein'), v.get('fat'), v.get('sodium'))
        if key in seen:
            seen[key]['_dups'].append(f"p{r['page']}" + (f' ({vtag})' if vtag else '') + (f' header "{var}"' if var else '')); continue
        notes = []
        for k, lab in (('satfat', 'sat_fat_g'), ('trans', 'trans_fat_g'), ('chol', 'cholesterol_mg'), ('addsugar', 'added_sugar_g')):
            if v.get(k, '') != '': notes.append(f'{lab}={v[k]}')
        if raw != item: notes.append(f'published name: "{raw}"')
        if note0: notes.append(note0)
        if vov: notes.append(vov[1])
        if SPECIFIC.get(base): notes.append(SPECIFIC[base])
        if r.get('allergen'): notes.append('allergens: ' + r['allergen'])
        ms = MENU_SEEN.get(v.get('kcal', ''))
        if ms: notes.append(f'same kcal shown on Apr-2026 menu PDF p{ms[0]} as "{ms[1]}" (item is on the current menu)')
        a = atwater_note(v.get('kcal'), v.get('protein'), v.get('carb'), v.get('fat'))
        if a: notes.append(a)
        u2 = (u or '').lower()
        row = {'brand': "McDonald's India (North & East)", 'country': 'IN', 'item': item, 'variant_or_size': var,
               'serving_desc': f'per serve as published: {s} {u}'.strip(), 'serving_g': s if u2 in ('g', 'gm') else '', 'serving_ml': s if u2 == 'ml' else '',
               'kcal': v.get('kcal', ''), 'protein_g': v.get('protein', ''), 'carbs_g': v.get('carb', ''), 'fat_g': v.get('fat', ''), 'fiber_g': '',
               'sugar_g': v.get('sugar', ''), 'sodium_mg': v.get('sodium', ''), 'veg_nonveg': veg, 'source_url': URL, 'source_title': TITLE,
               'source_date_or_version': VER + (f'; item sheet {vtag}' if vtag else ''), 'page_or_section': f"p{r['page']}", 'notes': '; '.join(notes), '_dups': []}
        seen[key] = row; out.append(row)
for row in out:
    if row['_dups']: row['notes'] += ('; ' if row['notes'] else '') + 'identical values repeated on ' + ', '.join(row['_dups'])
    del row['_dups']
out.extend(menu)
write(sys.argv[3], out)
print('rows', len(out), collections.Counter(o['veg_nonveg'] for o in out))
for o in out: print(o['page_or_section'], '|', o['item'], '|', o['variant_or_size'], '|', o['serving_g'] or o['serving_ml'], o['kcal'], o['protein_g'], o['carbs_g'], o['fat_g'], o['sugar_g'], o['sodium_mg'], o['veg_nonveg'])
