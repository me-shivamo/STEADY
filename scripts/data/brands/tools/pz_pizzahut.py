# Parse Pizza Hut India nutrition booklet (gs txtwrite XML words json + per-page PPM renders) -> CSV rows.
# usage: python3 -I pz_pizzahut.py words.json ppm_dir out.csv debug.txt
import sys, re, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pz_csv, pz_ppm
words_json, ppm_dir, out_csv, dbg_path = sys.argv[1:5]
pages = json.load(open(words_json))
NUM = re.compile(r'^(?:\d+(?:\.\d+)?|0\.\.0|ND|NA|-|–)$')
FOOD = ['kcal','kcal_rda','carb','protein','fibre','sugar','added_sugar','added_sugar_rda','fat','fat_rda','mufa','pufa','sat','sat_rda','trans','trans_rda','chol','sodium','sodium_rda']
FOOD_X = [228,260,287,319,349,378,407,437,464,494,525,553,583,611,641,671,700,724,756]
BEV = FOOD + ['caffeine']
BEV_X = [234,267,293,325,355,381,410,440,470,501,530,558,588,618,646,676,705,731,762,792]
HEADER_WORDS = {'Veg/','MUFA','Products','Non','Energy','Protein','(50','Net','(2000Kcal)','No','Added','Saturated','Total','Sodium','Trans','Dietary','Cholesterol','Allergen'}
SECTION_HINTS = ['Pan Pizza','TnC Pizza','Ultimate Cheese Pizzas','Overloaded Half N Half','Spicy Range','Crafted Flatzz','New Menu Gap','Melts','Flavour Fun','Triple Spice Range','Dips','Garlic Breads','Chicken Wings','Pastas','Sides','Dessert','Beverages','Crust Upgrade','Golden Hand Stretched','Products','Contains Caffeine']
dbg = open(dbg_path, 'w')
rows_out = []
SRC_URL = 'https://www.pizzahut.co.in/order/pdfs/in/nutritionals.6875af05163a32efc1bd637ee7bdfab4.pdf'
SRC_TITLE = 'Menu Card Nutrition & Allergen Information Booklet of Pizza Hut Products (PDF title: PH Nutrition_SEP_2026)'
SRC_VER = 'PDF created 2026-09-30; served Last-Modified 2026-10-26; footer (c) 2022 Pizza Hut India; FSSAI lic. 10017011004220'
def is_num(w): return bool(NUM.match(w[2]))
for p in pages:
    pno = p['page']
    if pno < 4 or pno > 16: continue
    img = pz_ppm.read_ppm(os.path.join(ppm_dir, 'ph_%02d.ppm' % pno))
    rows = p['rows']
    numrows, namerows, sections = [], [], []
    for r in rows:
        ws = [w for w in r['words'] if w[0] < 775]
        nums = [w for w in ws if w[0] >= 165 and is_num(w)]
        names = [w for w in ws if w[0] < 165]
        if len(nums) >= 12:
            numrows.append({'y': r['y'], 'nums': nums, 'name': names})
        elif ws and not nums:
            txt = ' '.join(w[2] for w in ws)
            if any(w[2] in HEADER_WORDS for w in ws):
                left = [w for w in ws if w[0] < 165 and w[2] not in ('Veg/', 'Non', 'Veg', 'Products')]
                if left:
                    sections.append({'y': r['y'], 'text': ' '.join(w[2] for w in left)})
                continue
            if re.match(r'^(©|Pizza Hut Nutrition|\d+$)', txt): continue
            namerows.append({'y': r['y'], 'text': txt, 'xmax': max(w[1] for w in ws)})
    # attach name-only rows within 9pt to nearest numeric row; others are section headers
    attach = {i: {'above': [], 'below': []} for i in range(len(numrows))}
    for nr in namerows:
        best = None
        for i, n in enumerate(numrows):
            d = nr['y'] - n['y']
            if abs(d) <= 9 and (best is None or abs(d) < abs(best[1])): best = (i, d)
        if best is None:
            if not nr['text'].startswith('*'):
                sections.append(nr)
        else:
            attach[best[0]]['above' if best[1] < 0 else 'below'].append(nr)
    for i, n in enumerate(numrows):
        is_bev = (pno == 15 and n['y'] >= 159)
        fields, xs = (BEV, BEV_X) if is_bev else (FOOD, FOOD_X)
        pre = sorted([w for w in n['nums'] if w[0] < 220], key=lambda w: w[0])
        rest = [w for w in n['nums'] if w[0] >= 220]
        vals = {}; problems = []
        if len(pre) >= 1: vals['netwt'] = pre[0][2]
        if len(pre) >= 2: vals['slices'] = pre[1][2]
        if len(pre) > 2: problems.append('extra pre tokens %r' % [w[2] for w in pre])
        for w in rest:
            j = min(range(len(xs)), key=lambda k: abs(xs[k] - w[0]))
            if abs(xs[j] - w[0]) > 12: problems.append('far token %s@%d' % (w[2], w[0]))
            if fields[j] in vals: problems.append('dup col %s: %s & %s' % (fields[j], vals[fields[j]], w[2]))
            vals[fields[j]] = w[2]
        missing = [f for f in fields if f not in vals and f != 'caffeine']
        if missing: problems.append('missing ' + ','.join(missing))
        name_parts = [a['text'] for a in sorted(attach[i]['above'], key=lambda a: a['y'])] + [' '.join(w[2] for w in n['name'])] + [b['text'] for b in sorted(attach[i]['below'], key=lambda a: a['y'])]
        name = re.sub(r'\s+', ' ', ' '.join(x for x in name_parts if x)).strip()
        sec = sorted([s for s in sections if s['y'] < n['y']], key=lambda s: s['y'])
        section = sec[-1]['text'] if sec else ''
        # veg / non-veg icon colour
        ys = [n['y']] + [a['y'] for a in attach[i]['above'] + attach[i]['below']]
        g = r_ = 0
        for yy in range(max(0, min(ys) - 12), min(img[1], max(ys) + 4)):
            for xx in range(4, 30):
                c = pz_ppm.classify(pz_ppm.px(img, xx, yy))
                if c == 'G': g += 1
                elif c == 'R': r_ += 1
        veg = 'veg' if g > r_ and g > 5 else ('non-veg' if r_ > g and r_ > 5 else '')
        rec = {'page': pno, 'y': n['y'], 'name': name, 'section': section, 'veg': veg, 'g': g, 'r': r_, 'vals': vals, 'problems': problems, 'bev': is_bev}
        dbg.write(json.dumps(rec, ensure_ascii=False) + '\n')
        rows_out.append(rec)
dbg.close()
json.dump(rows_out, open(out_csv + '.raw.json', 'w'), indent=0, ensure_ascii=False)
print('parsed rows', len(rows_out), 'with problems', sum(1 for r in rows_out if r['problems']))
