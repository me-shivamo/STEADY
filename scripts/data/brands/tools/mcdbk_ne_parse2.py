# usage: python3 -I mcdbk_ne_parse2.py <N&E booklet pdf> <out.json>
# Table-based parser for McDonald's India (North & East) Product Nutritional Information Booklet.
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
SERVE = re.compile(r'^(\d+(?:\.\d+)?)\s*(g|gm|ml|kg)?$', re.I)
def joinwrap(s):
    if s is None: return ''
    parts = [x.strip() for x in s.split('\n')]
    out = parts[0] if parts else ''
    for x in parts[1:]:
        if not x: continue
        if out and out[-1].islower() and x[0].islower(): out += x
        elif out and (out[-1].isdigit() or out[-1] == '.') and (x[0].isdigit() or x[0] == '.'): out += x
        else: out += ' ' + x
    return out.strip()
def num(s):
    s = (s or '').replace('\n', '').replace(' ', '').replace(',', '')
    return s
def label_key(s):
    t = joinwrap(s).lower()
    if not t: return None
    t2 = t.replace(' ', '')
    if t2.startswith('totalcarb'): return 'carb'
    if t2.startswith('totalfat'): return 'fat'
    if t2.startswith('totalsugar'): return 'sugar'
    if t2.startswith('addedsugar'): return 'addsugar'
    if t.startswith('serve') or t.startswith('size') or t.startswith('serving'): return 'serve'
    if t.startswith('energy'): return 'kcal'
    if t.startswith('protein'): return 'protein'
    if t.startswith('sat'): return 'satfat'
    if t.startswith('trans'): return 'trans'
    if t.startswith('total fat') or t == 'fat' or t.startswith('fat'): return 'fat'
    if t.startswith('cholest'): return 'chol'
    if t.startswith('total carb') or t.startswith('carb'): return 'carb'
    if 'fib' in t: return 'fiber'
    if t.startswith('added'): return 'addsugar'
    if 'sugar' in t: return 'sugar'
    if t.startswith('sodium'): return 'sodium'
    return 'UNK:' + t
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
        tables = p.find_tables()
        if not tables:
            res.append({'page': pi + 1, 'error': 'no table', 'text': (p.extract_text() or '')[:200]}); continue
        T = max(tables, key=lambda t: len(t.rows))
        rows = T.extract()
        lab_ci = None; serve_ri = None
        for ri, row in enumerate(rows[:4]):
            if ri == 0: continue
            for ci, c in enumerate(row[:2]):
                if label_key(c) == 'serve' and serve_ri is None: lab_ci, serve_ri = ci, ri
        if serve_ri is None:
            res.append({'page': pi + 1, 'error': 'no serve row', 'rows': rows}); continue
        vcols = []
        for ci in range(lab_ci + 1, len(rows[serve_ri])):
            m = SERVE.match(num(rows[serve_ri][ci]).replace('g', ' g').replace('ml', ' ml').replace(' g', 'g') if False else re.sub(r'\s+', '', (rows[serve_ri][ci] or '')))
            if m: vcols.append((ci, m.group(1), m.group(2) or ''))
        heads = [joinwrap(rows[0][ci]) if serve_ri > 0 else '' for ci, _, _ in vcols]
        vals = {}
        unknown = []
        for ri in range(serve_ri + 1, len(rows)):
            k = label_key(rows[ri][lab_ci])
            if k is None: continue
            if k.startswith('UNK'):
                if 'allergen' in (rows[ri][0] or '').lower(): continue
                unknown.append(k); continue
            vals[k] = [num(rows[ri][ci]) for ci, _, _ in vcols]
        names = [joinwrap(r[0]) for r in rows[serve_ri:] if r and r[0] and lab_ci > 0 and 'allergen' not in r[0].lower()]
        allergen = next((joinwrap(r[1]) for r in rows if r and r[0] and 'allergen' in r[0].lower()), '')
        # veg mark lives in column 0 of the body rows
        cells_c0 = [c for c in T.cells if abs(c[0] - T.bbox[0]) < 2 and c[1] > T.rows[serve_ri].bbox[1] - 1]
        y1 = max(c[3] for c in cells_c0) if cells_c0 else T.bbox[3]
        x1 = min(c[2] for c in cells_c0) if cells_c0 else T.bbox[0] + 90
        scale = 3
        img = p.to_image(resolution=72 * scale).original.convert('RGB')
        g, r = classify(img, scale, (T.bbox[0], T.rows[serve_ri].bbox[1], x1, y1))
        res.append({'page': pi + 1, 'names': names, 'heads': heads, 'serve': [(s, u) for _, s, u in vcols], 'vals': vals,
                    'allergen': allergen, 'unknown_labels': unknown, 'green_px': g, 'red_px': r,
                    'name_box': [T.bbox[0], T.rows[serve_ri].bbox[1], x1, y1]})
json.dump(res, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
for r in res:
    if 'error' in r: print(r['page'], 'ERROR', r['error'], str(r.get('text', r.get('rows')))[:200]); continue
    print(f"p{r['page']:>2} | {' / '.join(r['names'])} | G{r['green_px']} R{r['red_px']} | heads={r['heads']} | unk={r['unknown_labels']}")
    for i, (s, u) in enumerate(r['serve']):
        print('      ', s, u, ' '.join(f"{k}={v[i]}" for k, v in r['vals'].items()))
