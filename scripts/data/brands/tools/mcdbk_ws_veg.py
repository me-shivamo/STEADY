# usage: python3 -I mcdbk_ws_veg.py <W&S pdf> <out.json>
# Reads the veg (green) / non-veg (red) marks on page 1 of the W&S PDF and ties each to its row's serve size + kcal.
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
G = (0.88, 0.09, 0.98, 0.0); R = (0.09, 0.98, 1.0, 0.0)
with pdfplumber.open(sys.argv[1]) as doc:
    p = doc.pages[0]
    marks = []
    for c in p.curves:
        col = tuple(round(v, 2) for v in (c.get('non_stroking_color') or ())) if isinstance(c.get('non_stroking_color'), (tuple, list)) else None
        if col in (G, R) and (c['x1'] - c['x0']) < 30:
            marks.append(((c['top'] + c['bottom']) / 2, (c['x0'] + c['x1']) / 2, 'veg' if col == G else 'non-veg'))
    ws = p.extract_words(x_tolerance=1.5, y_tolerance=2)
    lines = []
    for w in sorted(ws, key=lambda w: w['top']):
        if lines and abs(w['top'] - lines[-1][0]) <= 3: lines[-1][1].append(w)
        else: lines.append([w['top'], [w]])
    rows = []
    for top, L in lines:
        L.sort(key=lambda w: w['x0'])
        toks = [w['text'] for w in L]
        for i in range(len(toks) - 2):
            if re.match(r'^\d+(\.\d+)?$', toks[i]) and toks[i + 1] in ('g', 'ml') and re.match(r'^\d', toks[i + 2]):
                xs = L[i]['x0']
                name = ' '.join(w['text'] for w in L if w['x0'] < xs and xs - w['x0'] < 330)
                rows.append({'top': top, 'x': xs, 'serve': toks[i] + ' ' + toks[i + 1], 'kcal': toks[i + 2], 'name': name})
    for r in rows:
        cands = [m for m in marks if abs(m[0] - (r['top'] + 5)) < 9 and 0 < m[1] - r['x'] < 220]
        r['veg'] = sorted(set(m[2] for m in cands))
json.dump(rows, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print('marks', len(marks), 'rows', len(rows))
for r in rows:
    if r['veg'] != ['veg']: print(r['serve'], r['kcal'], r['name'], r['veg'])
