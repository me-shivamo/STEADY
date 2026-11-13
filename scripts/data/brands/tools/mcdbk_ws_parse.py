# usage: python3 -I mcdbk_ws_parse.py <W&S nutrition pdf> <out.json> <crops.png>
# Parses page 2 ("McDonald's Nutritional Information Per Serve") of McDonald's India West & South PDF (Apr 2024).
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
from PIL import Image, ImageDraw
KEYS = ['name', 'serve', 'kcal', 'protein', 'fat', 'satfat', 'trans', 'chol', 'carb', 'sugar', 'addsugar', 'sodium']
out = []; crops = []
with pdfplumber.open(sys.argv[1]) as doc:
    p = doc.pages[1]
    img = p.to_image(resolution=216).original.convert('RGB'); sc = 3
    for ti, T in enumerate(p.find_tables()):
        rows = T.extract()
        section = None
        for ri, row in enumerate(rows):
            if ri == 0: continue
            cells = [(c or '').replace('\n', ' ').strip() for c in row]
            if cells[0] and all(not c for c in cells[1:]):
                section = cells[0]; continue
            if cells[0].lower().startswith('per serve percentage'): continue
            if not re.match(r'^\d', cells[1] or ''): continue
            rec = dict(zip(KEYS, cells)); rec['section'] = section; rec['table'] = ti + 1; rec['row'] = ri
            rb = T.rows[ri].bbox
            rec['bbox'] = [round(v, 1) for v in rb]
            if not rec['name']:
                c0 = T.rows[ri].cells[0] or (rb[0], rb[1], rb[0] + 200, rb[3])
                crops.append((len(out), img.crop((int(c0[0] * sc), int(rb[1] * sc) - 2, int(c0[2] * sc), int(rb[3] * sc) + 2))))
                rec['name_missing'] = True
            out.append(rec)
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
if crops:
    w = max(c.width for _, c in crops) + 60; h = sum(c.height + 6 for _, c in crops)
    sheet = Image.new('RGB', (w, h), 'white'); d = ImageDraw.Draw(sheet); y = 0
    for idx, c in crops:
        d.text((2, y + 4), f'#{idx}', fill='red'); sheet.paste(c, (60, y)); y += c.height + 6
    sheet.save(sys.argv[3])
for i, r in enumerate(out):
    print(i, r['table'], r['section'], '|', r['name'] or '<<MISSING>>', '|', r['serve'], r['kcal'], r['protein'], r['fat'], r['satfat'], r['trans'], r['chol'], r['carb'], r['sugar'], r['addsugar'], r['sodium'])
