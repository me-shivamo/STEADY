import sys, json, collections
d = json.load(open(sys.argv[1], encoding='utf-8'))['data']
items = d['items']
print(collections.Counter(i.get('type') for i in items))
print('keys union', sorted(set(k for i in items for k in i)))
print('extraInfo keys', sorted(set(k for i in items for k in (i.get('extraInfo') or {}))))
print('itemTags', json.dumps(d['itemTags'])[:1500])
for i in items:
    if 'cappuccino' in i['itemName'].lower():
        print(json.dumps(i)[:2500]); print()
print('optionSets n', len(d['optionSets']))
print(json.dumps(d['optionSets'][:2])[:3000])
