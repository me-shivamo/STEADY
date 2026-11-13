import sys, json, collections
d = json.load(open(sys.argv[1], encoding='utf-8'))['data']
cat = {c['categoryId']: c['name'] for c in d['categories']}
items = {i['itemId']: i for i in d['items']}
for i in d['items']:
    c = cat.get(i.get('categoryId'))
    if c in ('Bread Option',) and i['type']=='Simple': print('BREAD', i['itemName'], (i.get('extraInfo') or {}).get('calorieCount'), (i.get('extraInfo') or {}).get('portionSize'))
    if c in ("Suchali's Artisan Bakehouse",'Brewed Coffee','Food','Other Beverages','Retail','Packed Treats','Addons') and i['type'] in ('Simple','Variant') and 'calorieCount' not in (i.get('extraInfo') or {}):
        print('NONUTRI', c, '|', i['itemName'], i.get('variantValues'))
for o in d['optionSets']:
    print('OPTSET', o['displayName'], '|', o['name'], '|', [(x['optionName'], x['isDefault'], x['price']) for x in o['options']][:12])
