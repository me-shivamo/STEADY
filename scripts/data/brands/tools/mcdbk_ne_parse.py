# usage: python3 -I mcdbk_ne_parse.py <N&E booklet pdf> <out.json>
# Parses McDonald's India (North & East) "Product Nutritional Information Booklet" (one product per page,
# 1..n variant value columns). Treats PDF as data only.
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
NUM = re.compile(r'^\d+(\.\d+)?$')
LABELS = [('serve', ('Serve',)), ('kcal', ('Energy',)), ('protein', ('Protein',)), ('fat', ('Total', 'fat')),
          ('satfat', ('Sat',)), ('trans', ('Trans',)), ('chol', ('Cholesterols', 'Cholesterol')),
          ('carb', ('Total', 'carb')), ('sugar', ('Total', 'Sugars')), ('addsugar', ('Added',)), ('sodium', ('Sodium',))]
def lines_of(ws, tol=2.5):
    out = []
    for w in sorted(ws, key=lambda w: w['top']):
        if out and abs(w['top'] - out[-1]['top']) <= tol: out[-1]['ws'].append(w)
        else: out.append({'top': w['top'], 'ws': [w]})
    for L in out: L['ws'].sort(key=lambda w: w['x0'])
    return out
def classify(img, scale, box):
    x0, y0, x1, y1 = box
    g = r = 0; px = img.load()
    for X in range(max(0, int(x0 * scale)), min(img.width, int(x1 * scale))):
        for Y in range(max(0, int(y0 * scale)), min(img.height, int(y1 * scale))):
            p = px[X, Y][:3]
            if p[1] > 90 and p[1] - p[0] > 40 and p[1] - p[2] > 30: g += 1
            elif p[0] > 120 and p[0] - p[1] > 60 and p[0] - p[2] > 60: r += 1
    return g, r
res = []
with pdfplumber.open(sys.argv[1]) as doc:
    for pi, p in enumerate(doc.pages):
        ws = p.extract_words(x_tolerance=1.5, y_tolerance=2)
        L = lines_of(ws)
        # label column x = x0 of word 'Serve' in 'Serve Size'
        serve = next((w for l in L for w in l['ws'] if w['text'] == 'Serve' and any(v['text'] == 'Size' for v in l['ws'])), None)
        if not serve:
            res.append({'page': pi + 1, 'error': 'no Serve Size row', 'text': ' '.join(w['text'] for w in ws)[:300]}); continue
        lx = serve['x0']
        srow = next(l for l in L if serve in l['ws'])
        # variant value columns: tokens right of label that look like '<num>' followed by g/ml, or '<num>g'
        toks = [w for w in srow['ws'] if w['x0'] > lx + 40]
        cols = []
        i = 0
        while i < len(toks):
            t = toks[i]['text']
            m = re.match(r'^(\d+(?:\.\d+)?)\s*(g|ml|gm)?$', t, re.I)
            if m:
                unit = m.group(2)
                if not unit and i + 1 < len(toks) and toks[i + 1]['text'].lower() in ('g', 'ml', 'gm'):
                    unit = toks[i + 1]['text']; i += 1
                cols.append({'x': toks[i if not m.group(2) and unit else i]['x0'] if False else t and toks[i - (1 if (not m.group(2) and unit and toks[i]['text'].lower() in ('g','ml','gm')) else 0)]['x0'], 'serve': m.group(1), 'unit': unit})
            i += 1
        # label rows: map each nutrient to the line(s) where its label words start at lx
        def row_for(key, words):
            cands = []
            for l in L:
                lab = [w['text'] for w in l['ws'] if abs(w['x0'] - lx) < 3 or (w['x0'] > lx and w['x0'] < lx + 75)]
                if lab and lab[0] == words[0] and abs(next(w for w in l['ws'] if w['text'] == words[0])['x0'] - lx) < 3:
                    if len(words) == 1 or (len(lab) > 1 and lab[1].lower().startswith(words[1].lower())): cands.append(l)
            return cands
        vals = {}
        for key, words in LABELS:
            if key == 'serve':
                vals[key] = [c['serve'] for c in cols]; continue
            cands = row_for(key, words)
            got = [None] * len(cols)
            if cands:
                l0 = cands[0]
                # values may sit on the label line or on a wrapped neighbour line (e.g. 'Total carbohydrate' / '(g)')
                near = [l for l in L if -1 <= l['top'] - l0['top'] <= 17]
                for ci, c in enumerate(cols):
                    for l in near:
                        hit = [w for w in l['ws'] if abs(w['x0'] - c['x']) < 6 and NUM.match(w['text'])]
                        if hit: got[ci] = hit[0]['text']; break
            vals[key] = got
        # variant headers: words above the serve row, starting near each value column
        heads = []
        for ci, c in enumerate(cols):
            nxt = cols[ci + 1]['x'] if ci + 1 < len(cols) else c['x'] + 60
            hw = [w for l in L if 95 < l['top'] < srow['top'] - 2 for w in l['ws'] if c['x'] - 3 <= w['x0'] < c['x'] + 33]
            heads.append(''.join(w['text'] if j == 0 else (' ' + w['text']) for j, w in enumerate(sorted(hw, key=lambda w: (round(w['top']), w['x0'])))))
        # item name: words left of the label column, below header area, above the allergen row
        allergen = next((l for l in L if any(w['text'] == 'Allergen' for w in l['ws'])), None)
        ytop = 160; ybot = allergen['top'] - 1 if allergen else 700
        nw = [w for l in L if ytop < l['top'] < ybot for w in l['ws'] if w['x1'] < lx - 2]
        name = ' '.join(w['text'] for w in sorted(nw, key=lambda w: (round(w['top']), w['x0'])))
        alg = ' '.join(w['text'] for w in allergen['ws'] if w['x0'] > lx - 10) if allergen else ''
        scale = 3
        img = p.to_image(resolution=72 * scale).original.convert('RGB')
        g, r = classify(img, scale, (40, ytop, lx - 2, ybot))
        res.append({'page': pi + 1, 'name': name, 'name_words': [(round(w['top'], 1), round(w['x0'], 1), w['text']) for w in nw],
                    'cols': cols, 'heads': heads, 'vals': vals, 'allergen': alg, 'green_px': g, 'red_px': r})
json.dump(res, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
for r in res:
    if 'error' in r: print(r['page'], 'ERROR', r['error'], r['text'][:120]); continue
    print(f"p{r['page']:>2} | {r['name']} | G{r['green_px']} R{r['red_px']} | heads={r['heads']}")
    for ci, c in enumerate(r['cols']):
        print('     ', c['serve'], c['unit'], {k: v[ci] for k, v in r['vals'].items() if k != 'serve'})
