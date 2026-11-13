# usage: build_bluetokai.py out.csv nonutri.txt menu_CODE1.json [menu_CODE2.json ...]
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cafe_csvlib as csvlib
out, nonutri_path, files = sys.argv[1], sys.argv[2], sys.argv[3:]
API = "https://rdx8azn9lh.execute-api.ap-south-1.amazonaws.com/default/rista-tab-menu-api?requestType=menu&branchCode="
KEEP = {"Brewed Coffee", "Food", "Other Beverages", "Suchali's Artisan Bakehouse", "Bread Option", "Retail", "Packed Treats", "Addons"}
rows, seen, nonutri, seen_nn = [], {}, [], set()
for path in files:
    code = re.search(r'menu_(CA-\d+)\.json', path).group(1)
    d = json.load(open(path, encoding='utf-8'), parse_float=str, parse_int=str)['data']
    cat = {c['categoryId']: c['name'] for c in d['categories']}
    sub = {s['subCategoryId']: s['name'] for c in d['categories'] for s in c.get('subCategories', [])}
    tags = {t['itemTagId']: t['name'] for t in d['itemTags']}
    groups = {i['itemId']: i for i in d['items'] if i['type'] == 'Group'}
    milk = {}
    for o in d['optionSets']:
        if 'milk' in o['displayName'].lower():
            milk[o['optionSetId']] = o
    for i in d['items']:
        c = cat.get(i.get('categoryId'))
        if c not in KEEP or i['type'] not in ('Simple', 'Variant'):
            continue
        x = i.get('extraInfo') or {}
        name = i['itemName'].strip()
        var = ", ".join(v['value'] for v in (i.get('variantValues') or []))
        key = (name.lower(), var.lower())
        if 'calorieCount' not in x:
            if key not in seen_nn:
                seen_nn.add(key); nonutri.append(f"{c} | {sub.get(i.get('subCategoryId'), '')} | {name}{' ('+var+')' if var else ''}")
            continue
        sig = str(x.get('calorieCount'))
        alt = ''
        if key in seen:
            if seen[key][1] == sig:
                r = rows[seen[key][0]]; r['page_or_section'] = r['page_or_section'].replace(')', f', {code})', 1)
                continue
            first = rows[seen[key][0]]
            if 'Values differ by cafe' not in first['notes']:
                first['notes'] = (first['notes'] + '. ' if first['notes'] else '') + 'Values differ by cafe: another cafe menu lists different nutrition for this item (see the other row with the same name)'
            alt = f'Values differ by cafe: this row is the listing at cafe {code}; another cafe lists kcal={first["kcal"]}'
            key = key + (code,)
        tagn = [tags.get(t, '') for t in i.get('itemTagIds', [])]
        tl = [t.lower() for t in tagn]
        veg = 'non-veg' if 'non-vegetarian' in tl else ('egg' if 'egg' in tl else ('vegan' if 'vegan' in tl else ('veg' if any(t in ('vegetarian','veg') for t in tl) else '')))
        unit = (x.get('portionSizeUnit') or '').lower()
        ps = x.get('portionSize')
        sg = sm = ''
        sd = ''
        if ps not in (None, ''):
            if unit in ('grams', 'gram', 'g', 'gms'): sg = ps; sd = f"{ps} g portion"
            elif unit in ('ml',): sm = ps; sd = f"{ps} ml portion"
            else: sd = f"portion {ps} {unit}".strip()
        if x.get('serves') not in (None, ''):
            sd += f"; serves {x.get('serves')} {x.get('serveSizeUnit') or ''}".rstrip()
        notes = []
        extra = {k: x.get(k) for k in ('saturated','transFat','cholesterol') if x.get(k) not in (None, '')}
        if extra: notes.append("Also published: " + ", ".join(f"{k}={v}{' mg' if k=='cholesterol' else ' g'}" for k, v in extra.items()))
        if x.get('allergyInformation'): notes.append("Allergens: " + ", ".join(x['allergyInformation']))
        ms = [milk[o] for o in i.get('optionSetIds', []) if o in milk]
        for o in ms:
            opts = [f"{op['optionName'].strip()}{' (default)' if op['isDefault'] else ''}{' +Rs'+str(op['price']) if str(op['price']) not in ('0','0.0') else ''}" for op in o['options']]
            notes.append("Milk options on menu: " + "; ".join(opts) + ". Published nutrition is for the base item as listed (milk not specified; presumably regular dairy milk); no per-milk values published")
        if ps in (None, ''): notes.append("Portion size not published")
        if alt: notes.append(alt)
        if 'Protein' in tagn: notes.append("Tagged Protein")
        g = groups.get(i.get('groupItemId'))
        rows.append(dict(brand="Blue Tokai Coffee Roasters", country="IN", item=name, variant_or_size=(var + ('; ' if var and alt else '') + (f'cafe {code} listing' if alt else '')), serving_desc=sd, serving_g=sg, serving_ml=sm,
            kcal=x.get('calorieCount',''), protein_g=x.get('protein',''), carbs_g=x.get('carbohydrates',''), fat_g=x.get('totalFat',''), fiber_g=x.get('fiber',''),
            sugar_g=x.get('sugar',''), sodium_mg=x.get('sodium',''), veg_nonveg=veg,
            source_url=API+code, source_title="Blue Tokai official digital cafe menu (menu.bluetokaicoffee.com/?cafeCode="+code+") - menu data feed loaded by that page",
            source_date_or_version="retrieved 2026-11-13 (live menu, no version published)",
            page_or_section=f"{c} > {sub.get(i.get('subCategoryId'), '')} (cafes {code})", notes=". ".join(notes)))
        seen[key] = (len(rows)-1, sig)
csvlib.write(out, rows)
open(nonutri_path, 'w', encoding='utf-8').write("\n".join(nonutri) + "\n")
print(len(nonutri), "items without nutrition")
