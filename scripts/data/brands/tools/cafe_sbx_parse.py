# usage: cafe_sbx_parse.py PDF OUT.json -> rows parsed from Tata Starbucks NI guide
import sys, os, re, json, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pdfplumber
TABX_FEB = [(116,'Beverage Core'),(259,'Beverage LTO'),(396,'Beverage Reserve'),(537,'Food Core'),(674,'Food Bake in')]
TABX = [(31,'Beverage Core'),(126,'Beverage Moonshot'),(222,'Beverage LTO'),(318,'Beverage Reserve'),(410,'Food Core'),(505,'Food Moonshot'),(597,'Food LTO'),(691,'Food Reserve'),(785,'Food Bake in')]
GREEN = (0.2, 0.529, 0.384)
NUM = re.compile(r'^(NA|-|\d+(\.\d+)?)$')
NUMCOLS = ['serving','kcal','carbs','total_sugar','added_sugar','fibre','protein','total_fat','sat_fat','trans_fat','cholesterol','sodium']
if len(sys.argv) > 3 and sys.argv[3] == 'feb': TABX = TABX_FEB
WHITE = ((1.0,), (1,), (1.0, 1.0, 1.0))
rows, orphans = [], []
with pdfplumber.open(sys.argv[1]) as p:
    for n, pg in enumerate(p.pages, 1):
        active = None
        for c in pg.chars:
            col = tuple(round(v, 3) for v in (c.get('non_stroking_color') or ()))
            if c['top'] < 40 and c['text'].strip() and col not in WHITE and col != (0.969, 0.953, 0.937) and c['x0'] >= TABX[0][0] - 5:
                active = min([t for t in TABX if c['x0'] >= t[0] - 5], key=lambda t: c['x0'] - t[0])[1]; break
        fp = pg.filter(lambda o: o.get('object_type') != 'char' or (abs(o['matrix'][1]) < 1e-6 and tuple(o.get('non_stroking_color') or ()) not in ((1.0,), (1,), (1.0, 1.0, 1.0))))
        ws = [w for w in fp.extract_words(extra_attrs=['upright']) if w['top'] > 118]
        lines = collections.defaultdict(list)
        for w in ws: lines[round(w['top'] / 4)].append(w)
        for k in sorted(lines):
            L = sorted(lines[k], key=lambda w: w['x0'])
            if L and L[0]['text'] == '%': continue
            prod = ' '.join(w['text'] for w in L if w['x0'] < 200)
            allg = ' '.join(w['text'] for w in L if 200 <= w['x0'] < 330)
            veg = ' '.join(w['text'] for w in L if 330 <= w['x0'] < 462)
            nums = [w for w in L if w['x0'] >= 462 and NUM.match(w['text'])]
            if len(nums) >= 10:
                rows.append(dict(page=n, section=active, product=prod, allergens=allg, veg=veg, nums=[w['text'] for w in nums], xs=[round(w['x0']) for w in nums], top=round(L[0]['top'])))
            elif prod or allg or veg:
                orphans.append(dict(page=n, top=round(L[0]['top']), prod=prod, allg=allg, veg=veg, n=len(nums)))
json.dump(dict(rows=rows, orphans=orphans), open(sys.argv[2], 'w'), indent=0)
print(len(rows), 'rows', len(orphans), 'orphans')
print(collections.Counter(len(r['nums']) for r in rows))
print(collections.Counter(r['section'] for r in rows))
