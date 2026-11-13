# usage: python3 -I mcdbk_ws_words.py <words.tsv> <ws_rows_table.json> <out.json>
# Column-position parser for W&S page 2, cross-checked against the ruled-table parse.
import sys, json, re
OFFS = [0.0, 850.0, 1691.9]
B = [('name', -1e9, 468), ('serve', 468, 515), ('kcal', 515, 560), ('protein', 560, 605), ('fat', 605, 660), ('satfat', 660, 740),
     ('trans', 740, 810), ('chol', 810, 870), ('carb', 870, 930), ('sugar', 930, 990), ('addsugar', 990, 1045), ('sodium', 1045, 1125)]
ws = []
for line in open(sys.argv[1], encoding='utf-8'):
    if line.startswith('#'): continue
    x0, top, x1, bot, size, font, text = line.rstrip('\n').split('\t')
    ws.append((float(top), float(x0), text))
tab = json.load(open(sys.argv[2]))
out = []
for bi, off in enumerate(OFFS):
    bw = sorted([w for w in ws if off + 290 <= w[1] < off + 1125 and w[0] > 95], key=lambda w: w[0])
    lines = []
    for w in bw:
        if lines and abs(w[0] - lines[-1][0]) <= 3.0: lines[-1][1].append(w)
        else: lines.append([w[0], [w]])
    section = None
    for top, L in lines:
        L.sort(key=lambda w: w[1])
        cells = {}
        for w in L:
            x = w[1] - off
            for k, a, b in B:
                if a <= x < b: cells.setdefault(k, []).append(w[2]); break
        name = ' '.join(cells.get('name', []))
        if name.endswith('MENU') and len(cells) == 1: section = name; continue
        if 'serve' not in cells: continue
        st = ''.join(cells['serve'])
        m = re.match(r'^(\d+(?:\.\d+)?)(g|ml)$', st)
        if not m: continue
        rec = {'block': bi + 1, 'top': round(top, 1), 'section': section, 'name': name, 'serve': m.group(1) + ' ' + m.group(2)}
        flags = []
        for k, a, b in B[2:]:
            v = cells.get(k, [])
            if len(v) > 1: flags.append(f'{k}:multi{v}')
            rec[k] = ' '.join(v)
        rec['flags'] = flags
        out.append(rec)
# cross-check with table parse by (block-order, serve, kcal)
def norm(s): return (s or '').replace('m l', 'ml').replace('l ', '').split(' ')[0]
tk = {}
for t in tab:
    tk.setdefault((t['serve'].replace('m l', 'ml').replace(' ', ''), norm(t['kcal'])), []).append(t)
for r in out:
    key = (r['serve'].replace(' ', ''), r['kcal'])
    t = tk.get(key)
    if not t:
        r['xcheck'] = 'no table match'; continue
    t = t[0]
    diffs = [k for k in ('protein', 'fat', 'satfat', 'trans', 'chol', 'carb', 'sugar', 'addsugar', 'sodium') if (t[k] or '').split(' ')[0] != r[k]]
    r['xcheck'] = 'ok' if not diffs else 'diff:' + ','.join(f"{k}(tab={t[k]!r} words={r[k]!r})" for k in diffs)
    if not r['name'] and t['name']: r['name_from_table'] = t['name']
    r['table_name'] = t['name']
json.dump(out, open(sys.argv[3], 'w'), indent=1, ensure_ascii=False)
print('rows', len(out))
for i, r in enumerate(out):
    if r['xcheck'] != 'ok' or r['flags'] or not r['name'] or r['name'] != r.get('table_name'):
        print(i, r['block'], r['top'], repr(r['name']), '| table:', repr(r.get('table_name')), '|', r['serve'], r['kcal'], r['protein'], r['fat'], r['satfat'], r['trans'], r['chol'], r['carb'], r['sugar'], r['addsugar'], r['sodium'], '|', r['xcheck'], r['flags'])
