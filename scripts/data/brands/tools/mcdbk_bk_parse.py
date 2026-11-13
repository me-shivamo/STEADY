# usage: python3 -I mcdbk_bk_parse.py <BK NI pdf> <out.json>
# Parses the Burger King India "Nutritional Information Per Serve" table. PDF is treated as data only.
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
BOUNDS = [51, 77, 253, 290, 339, 377, 437, 479, 522, 566, 616, 651, 704]
COLS = ['sno', 'product', 'veg', 'portion', 'kcal', 'carb', 'sugar', 'fat', 'satfat', 'trans', 'protein', 'sodium']
NUM = re.compile(r'^-?\d+(\.\d+)?$')
def col_of(xc):
    for i in range(len(BOUNDS) - 1):
        if BOUNDS[i] <= xc < BOUNDS[i + 1]: return COLS[i]
    return None
def classify(img, scale, x0, x1, y0, y1):
    g = r = 0
    px = img.load()
    for X in range(int(x0 * scale), int(x1 * scale)):
        for Y in range(max(0, int(y0 * scale)), min(img.height, int(y1 * scale))):
            p = px[X, Y][:3]
            if p[1] > 100 and p[0] < 110 and p[2] < 110 and p[1] - p[0] > 40: g += 1
            elif p[0] > 140 and p[1] < 90 and p[2] < 90: r += 1
    return g, r
out = []
with pdfplumber.open(sys.argv[1]) as doc:
    for pi, p in enumerate(doc.pages):
        scale = 3
        img = p.to_image(resolution=72 * scale).original.convert('RGB')
        ws = p.extract_words(x_tolerance=1.5, y_tolerance=2)
        ws.sort(key=lambda w: (round(w['top']), w['x0']))
        lines = []
        for w in sorted(ws, key=lambda w: w['top']):
            if lines and abs(w['top'] - lines[-1]['top']) <= 2.5: lines[-1]['ws'].append(w)
            else: lines.append({'top': w['top'], 'bottom': w['bottom'], 'ws': [w]})
        for L in lines:
            cells = {}
            for w in sorted(L['ws'], key=lambda w: w['x0']):
                c = col_of((w['x0'] + w['x1']) / 2)
                if c: cells.setdefault(c, []).append(w['text'])
            L['cells'] = {k: ' '.join(v) for k, v in cells.items()}
            L['bottom'] = max(w['bottom'] for w in L['ws'])
        data = [L for L in lines if 'kcal' in L['cells'] and ('carb' in L['cells'] or 'protein' in L['cells'])
                and not L['cells'].get('product', '').lower().startswith(('per serve', 'recommended'))
                and NUM.match(L['cells']['kcal'].replace(' ', ''))]
        others = [L for L in lines if L not in data and 'product' in L['cells']
                  and not L['cells']['product'].lower().startswith(('per serve', 'recommended', 'product', 'burger king india'))
                  and 'kcal' not in L['cells']]
        for L in others:
            L['assigned'] = None
        for L in others:
            best = min(data, key=lambda D: abs(D['top'] - L['top']), default=None)
            if best is not None and abs(best['top'] - L['top']) <= 9 and 'product' not in best['cells']:
                L['assigned'] = best
                best.setdefault('namelines', []).append(L)
        for L in others:
            if L['assigned'] is None:
                out.append({'page': pi + 1, 'kind': 'section_or_orphan', 'text': L['cells'].get('product'), 'top': round(L['top'], 1), 'cells': L['cells']})
        for D in data:
            c = dict(D['cells'])
            nl = D.get('namelines', [])
            name = c.get('product') or ' '.join(x['cells']['product'] for x in sorted(nl, key=lambda x: x['top']))
            portion = c.get('portion') or next((x['cells'].get('portion') for x in nl if x['cells'].get('portion')), None)
            sno = c.get('sno') or next((x['cells'].get('sno') for x in nl if x['cells'].get('sno')), None)
            ys = [D['top'], D['bottom']] + [x['top'] for x in nl] + [x['bottom'] for x in nl]
            g, r = classify(img, scale, 256, 288, min(ys) - 3, max(ys) + 3)
            out.append({'page': pi + 1, 'kind': 'row', 'top': round(D['top'], 1), 'sno': sno, 'product': name, 'portion': portion,
                        **{k: c.get(k) for k in COLS[4:]}, 'green_px': g, 'red_px': r})
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
for o in out:
    if o['kind'] == 'row':
        print(o['page'], o['sno'], '|', o['product'], '|', o['portion'], o['kcal'], o['carb'], o['sugar'], o['fat'], o['satfat'], o['trans'], o['protein'], o['sodium'], '| G', o['green_px'], 'R', o['red_px'])
    else:
        print(o['page'], '##', o['text'], o['top'], o['cells'])
