import sys, json, collections
d = json.load(open(sys.argv[1], encoding='utf-8'))['data']
cat = {c['categoryId']: c['name'] for c in d['categories']}
sub = {s['subCategoryId']: s['name'] for c in d['categories'] for s in c.get('subCategories', [])}
cnt = collections.Counter()
for i in d['items']:
    has = 'calorieCount' in (i.get('extraInfo') or {})
    cnt[(cat.get(i.get('categoryId'), '?'), i['type'], has)] += 1
for k, v in sorted(cnt.items()): print(k, v)
print()
# Variant & group examples
for i in d['items']:
    if i['type'] in ('Group',):
        print('GROUP', i['itemName'], {k: i.get(k) for k in ('variantAttributes','calorieCount','portionSize')}, cat.get(i.get('categoryId')))
for i in d['items']:
    if i['type'] == 'Variant':
        print('VAR', i['itemName'], i.get('groupItemId'), i.get('variantValues'), (i.get('extraInfo') or {}).get('calorieCount'), cat.get(i.get('categoryId')))
