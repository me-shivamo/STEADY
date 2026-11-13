# Parse manual Domino's transcription -> records; validate against the source's own %RDA rows and Atwater energy.
# usage: python3 -I pz_dom_parse.py transcribe.txt out.json
import sys, json, re
src, out = sys.argv[1], sys.argv[2]
REF = {'E%': ('E', 2000), 'AS%': ('AS', 50), 'F%': ('F', 67), 'SF%': ('SF', 22), 'TF%': ('TF', 2), 'NA%': ('NA', 2000), 'P%': ('P', 54), 'C%': ('C', 130)}
recs = []; img = None; blocks = []; cur = None
for line in open(src, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line.strip() or (line.startswith('# ') and img is None): continue
    if line.startswith('== '):
        img = line[3:].strip(); continue
    if line.startswith('#M '):
        items = [x.strip() for x in line[3:].split(' ; ')]
        cur = {'img': img, 'multi': True, 'items': [tuple((p.split('|') + [''])[:2]) for p in items], 'note': '', 'rows': {}}
        blocks.append(cur); continue
    if line.startswith('# '):
        parts = [p.strip() for p in line[2:].split('|')]
        cur = {'img': img, 'multi': False, 'items': [(parts[0], parts[1] if len(parts) > 1 else '')], 'note': ' | '.join(parts[2:]), 'rows': {}}
        blocks.append(cur); continue
    if line.startswith('cols '):
        cur['cols'] = [tuple((c.split(':') + ['', ''])[:3]) for c in line[5:].split()]; continue
    if line.startswith('colsM '):
        spec = line[6:].strip(); parts = spec.split(':')
        cur['cols'] = [(parts[0], parts[1], parts[2] if len(parts) > 2 else '')]; continue
    toks = line.split()
    cur['rows'][toks[0]] = toks[1:]
issues = []
for b in blocks:
    n = len(b['items']) if b['multi'] else len(b['cols'])
    for k, v in b['rows'].items():
        if len(v) != n: issues.append(f"{b['img']} {b['items'][0][0]}: row {k} has {len(v)} values, expected {n}")
    for j in range(n):
        if b['multi']:
            name, vn = b['items'][j]; crust, size, slices = b['cols'][0]; note = b['note']
        else:
            name, vn = b['items'][0]; crust, size, slices = b['cols'][j]; note = b['note']
        vals = {k: (v[j] if j < len(v) else None) for k, v in b['rows'].items()}
        if all(x in ('-', None) for x in vals.values()): continue
        recs.append({'img': b['img'], 'item': name, 'veg': vn, 'crust': crust, 'size': size, 'slices': slices, 'note': note, 'vals': vals})
def f(x):
    try: return float(x)
    except Exception: return None
for r in recs:
    v = r['vals']; tag = f"{r['img']} {r['item']} {r['crust']}/{r['size']}"
    for pk, (bk, ref) in REF.items():
        p, b = f(v.get(pk)), f(v.get(bk))
        if p is None or b is None: continue
        exp = b / ref * 100
        tol = max(1.05, exp * 0.03) if p >= 1 else 0.6
        if abs(exp - p) > tol: issues.append(f'{tag}: {pk}={p} but {bk}={b} -> {exp:.1f}%')
    E, P, C, F = (f(v.get(k)) for k in ('E', 'P', 'C', 'F'))
    if None not in (E, P, C, F) and E > 30:
        est = 4 * P + 4 * C + 9 * F
        if abs(est - E) / E > 0.08: issues.append(f'{tag}: atwater {est:.0f} vs E {E}')
    TS, AS, SF = f(v.get('TS')), f(v.get('AS')), f(v.get('SF'))
    if TS is not None and AS is not None and AS > TS + 0.05: issues.append(f'{tag}: added sugar {AS} > total {TS}')
    if SF is not None and F is not None and SF > F + 0.05: issues.append(f'{tag}: sat {SF} > fat {F}')
json.dump(recs, open(out, 'w'), indent=0, ensure_ascii=False)
print('records', len(recs), 'issues', len(issues))
for i in issues: print(' ', i)
