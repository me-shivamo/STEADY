# Parse La Pino'z category pages (official site) -> per-100 g nutrition rows.
# usage: python3 -I pz_lapinoz.py out.csv out_debug.json page1.html [page2.html ...]
import sys, re, html, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pz_csv
out, dbg = sys.argv[1], sys.argv[2]
pages = sys.argv[3:]
card_re = re.compile(r'<div class="pcat-item-card"\s+id="item-([^"]*)" data-item-slug="([^"]*)" data-item-id="(\d+)">(.*?)(?=<div class="pcat-item-card"|<footer|$)', re.S)
nut_re = re.compile(r'\[\s*Fat\s*-\s*([\d.]+)\s*per\s*([\d.]+)\s*g\s*,\s*Protein\s*-\s*([\d.]+)\s*per\s*([\d.]+)\s*g\s*,\s*Carbohydrate\s*-\s*([\d.]+)\s*per\s*([\d.]+)\s*g\s*,\s*Sugar\s*-\s*([\d.]+)\s*per\s*([\d.]+)\s*g\s*,\s*Calories\s*-\s*([\d.]+)\s*k\.?\s*cal\s*\]\s*(Nutritional information per 100\s*g)?', re.I)
items = {}; order = []; nonut = []
for p in pages:
    cat = os.path.basename(p).replace('products_', '').replace('.html', '')
    d = open(p, encoding='utf-8', errors='replace').read()
    for m in card_re.finditer(d):
        idslug, slug, iid, body = m.groups()
        name = re.search(r'class="pcat-item-link">(.*?)</a>', body, re.S)
        name = html.unescape(re.sub(r'\s+', ' ', name.group(1)).strip()) if name else slug
        desc = re.search(r'class="pcat-item-desc[^"]*">(.*?)</p>', body, re.S)
        desc = html.unescape(re.sub(r'\s+', ' ', desc.group(1)).strip()) if desc else ''
        marker = re.search(r'class="(veg-marker[^"]*)"', body)
        vn = '' if not marker else ('non-veg' if 'nonveg' in marker.group(1) else 'veg')
        price = re.search(r'pcat-item-price">\s*₹\s*([\d,.]+)', body)
        price = price.group(1) if price else ''
        br = re.search(r'\[([^\]]*?(?:Fat|Calories)[^\]]*)\]\s*(Nutritional information per 100\s*g)?', desc, re.I)
        if br is None:
            nonut.append({'category': cat, 'name': name, 'slug': slug, 'veg': vn, 'desc': desc[:300]})
            continue
        vals = {}; irregular = []
        for mm in re.finditer(r'(Fat|Protein|Carbohydrate|Sugar|Calories)\s*-\s*([\d.]+)\s*([^,\]]*)', br.group(1), re.I):
            k = mm.group(1).lower(); vals[k] = mm.group(2); suf = mm.group(3).strip()
            std = (k == 'calories' and suf.lower() in ('k.cal', 'kcal', 'k cal')) or (k != 'calories' and suf.lower() in ('per 100 g', 'per 100g', ''))
            if not std: irregular.append(f'{mm.group(1)} unit text "{suf}"')
            if k != 'calories' and suf == '': irregular.append(f'{mm.group(1)} has no "per 100 g" inside the bracket')
        key = (name.lower(), br.group(0))
        if key in items:
            items[key]['categories'].append(cat); continue
        rec = {'category': cat, 'categories': [cat], 'name': name, 'slug': slug, 'id': iid, 'veg': vn, 'price': price,
               'fat': vals.get('fat', ''), 'protein': vals.get('protein', ''), 'carbs': vals.get('carbohydrate', ''),
               'sugar': vals.get('sugar', ''), 'kcal': vals.get('calories', ''), 'raw': br.group(0), 'irregular': irregular,
               'suffix': bool(br.group(2))}
        items[key] = rec; order.append(key)
rows = []
for k in order:
    r = items[k]
    notes = ['per 100 g as published in the item description on lapinozpizza.in; same values shown for every size (size weights not published)']
    if r['irregular']:
        notes.append('irregular unit text in source (values kept as published): ' + '; '.join(r['irregular']) + ' | raw: ' + r['raw'])
    if not r['suffix']:
        notes.append('no trailing "Nutritional information per 100g" label on this item')
    notes.append('listed price INR ' + r['price'] + ' (smallest/default size)' if r['price'] else '')
    notes.append('also listed under: ' + ', '.join(c for c in r['categories'][1:]) if len(r['categories']) > 1 else '')
    rows.append({'brand': "La Pino'z Pizza", 'country': 'IN', 'item': r['name'], 'variant_or_size': 'all sizes (per 100 g)',
                 'serving_desc': 'per 100 g', 'serving_g': '100', 'serving_ml': '', 'kcal': r['kcal'], 'protein_g': r['protein'],
                 'carbs_g': r['carbs'], 'fat_g': r['fat'], 'fiber_g': '', 'sugar_g': r['sugar'], 'sodium_mg': '', 'veg_nonveg': r['veg'],
                 'source_url': 'https://lapinozpizza.in/products/' + r['category'], 'source_title': "La Pino'z Pizza official website - menu category page (item description)",
                 'source_date_or_version': 'retrieved 2026-11-13', 'page_or_section': r['category'] + ' / item ' + r['slug'] + ' (id ' + r['id'] + ')',
                 'notes': '; '.join(n for n in notes if n)})
pz_csv.write(out, rows)
json.dump({'rows': len(rows), 'no_nutrition': nonut}, open(dbg, 'w'), indent=1, ensure_ascii=False)
print('rows', len(rows), 'cards without nutrition', len(nonut))
