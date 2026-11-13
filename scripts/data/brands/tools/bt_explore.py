import sys, json, collections
d = json.load(open(sys.argv[1], encoding='utf-8'))
data = d['data']
print('top keys', list(d.keys()), 'data keys', list(data.keys()))
cats = data['categories']
for c in cats:
    print('CAT', c['name'], '| subs:', [s['name'] for s in c.get('subCategories', [])])
items = data.get('items') or []
print('n items', len(items))
if items:
    print(json.dumps(items[0], indent=1)[:3000])
