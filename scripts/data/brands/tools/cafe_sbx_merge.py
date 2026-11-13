# usage: cafe_sbx_merge.py parsed.json out.json -> attach wrapped names/allergens, assign sub-headings
import sys, json
d = json.load(open(sys.argv[1]))
rows, orph = d['rows'], d['orphans']
used = set()
def nearest_row(o, maxd):
    cands = [r for r in rows if r['page'] == o['page'] and abs(r['top'] - o['top']) <= maxd]
    return min(cands, key=lambda r: abs(r['top'] - o['top'])) if cands else None
for i, o in enumerate(orph):
    if o['page'] == 130: used.add(i); continue
    if o['prod'] and not o['allg'] and not o['veg']:
        r = nearest_row(o, 9)
        if r is None: continue  # heading
    else:
        r = nearest_row(o, 14)
        if r is None: continue
    used.add(i)
    r.setdefault('extra', []).append(o)
for r in rows:
    ex = sorted(r.pop('extra', []), key=lambda o: o['top'])
    if not ex: continue
    a = [o for o in ex if o['top'] < r['top']]; b = [o for o in ex if o['top'] >= r['top']]
    for k in ('prod', 'allg', 'veg'):
        key = {'prod': 'product', 'allg': 'allergens', 'veg': 'veg'}[k]
        r[key] = ' '.join(x for x in [o[k] for o in a] + [r[key].strip()] + [o[k] for o in b] if x)
    r['wrapped'] = True
heads = sorted([(o['page'], o['top'], o['prod']) for i, o in enumerate(orph) if i not in used])
events = sorted([(r['page'], r['top'], 1, k) for k, r in enumerate(rows)] + [(p, t, 0, h) for p, t, h in heads])
cur, cursec = None, None
for p, t, kind, v in events:
    if kind == 0: cur = v; continue
    r = rows[v]
    if r['section'] != cursec:
        if cursec is not None and not (heads and any(h[0] == p and h[1] <= t for h in heads)): cur = None
        cursec = r['section']
    r['subhead'] = cur
json.dump(rows, open(sys.argv[2], 'w'), indent=0)
print('rows', len(rows), 'heads', len(heads))
for h in heads: print('HEAD', h)
