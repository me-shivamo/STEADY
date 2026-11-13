# Build Pizza Hut India CSV from parsed raw rows (pz_pizzahut.py output).
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pz_csv
raw, out_csv, anomalies_path = sys.argv[1:4]
rs = json.load(open(raw))
SRC_URL = 'https://www.pizzahut.co.in/order/pdfs/in/nutritionals.6875af05163a32efc1bd637ee7bdfab4.pdf'
SRC_TITLE = 'Pizza Hut India - Menu Card Nutrition & Allergen Information Booklet of Pizza Hut Products (PDF title "PH Nutrition_SEP_2026"; linked from pizzahut.co.in/nutrition)'
SRC_VER = 'PDF created 2026-09-30 (server Last-Modified 2026-10-26); footer (c) 2022 Pizza Hut India'
def f(x):
    try: return float(x)
    except Exception: return None
SIZE_RE = re.compile(r'\s*\((Personal|Medium|Large)[)}]\s*$|\s*\((Personal|Medium|Large)\)', re.I)
anom = []; rows = []
for r in rs:
    v = r['vals']; name = re.sub(r'\bM asala\b', 'Masala', r['name']).strip()
    sec = r['section']; size = ''
    m = re.search(r'\((Personal|Medium|Large)[)}]', name)
    if m:
        size = m.group(1).capitalize(); name = (name[:m.start()] + name[m.end():]).strip()
    m = re.search(r'\s+(Large|Medium|Personal) Pan Pizza$', name)
    if m:
        size = m.group(1); name = name[:m.start()] + ' Pan Pizza'
    m = re.search(r'\((\d+)pc\.\)', name)
    pcs = m.group(1) if m else ''
    if not size:
        m = re.search(r'\((Medium|Large) (\d+ inch)', sec)
        if m: size = m.group(1) + ' ' + m.group(2)
        elif '3-IN-1 Personal' in sec: size = 'Personal'
        elif '3-IN-1 Medium' in sec: size = 'Medium'
    netwt = v.get('netwt', ''); slices = v.get('slices', '')
    pizza_like = any(k in sec for k in ['Pizza', 'Flatzz', 'Melts'])
    if sec == 'Crust Upgrade':
        sdesc = 'crust upgrade add-on (add to the per-serve pan pizza values)'
    elif sec.startswith('Chicken Wings'):
        sdesc = f'{slices} pieces' if slices not in ('', 'NA') else '1 portion'
    elif sec == 'Beverages':
        sdesc = f'1 serve ({netwt} in the Net Weight (g) column)'
    elif pizza_like:
        sdesc = 'whole pizza as served' + (f' ({slices} slices)' if slices not in ('', 'NA') else '')
    else:
        sdesc = '1 portion as served' + (f' (count column = {slices})' if slices not in ('', 'NA') else '')
    variant = ' | '.join(x for x in [size, (pcs + ' pc') if pcs else '', sec] if x)
    if sec == 'Beverages': variant = f'{netwt} (net qty) | Beverages'
    def num(k):
        x = v.get(k, '')
        return x if f(x) is not None else ''
    notes = []
    if v.get('sugar') == 'ND': notes.append('total sugar published as ND (not detected; LOQ 1 g/100 g)')
    elif v.get('sugar') in ('NA', '-'): notes.append(f'total sugar published as "{v.get("sugar")}"')
    for k, lab in [('fibre', 'fibre'), ('protein', 'protein'), ('carb', 'carbs'), ('fat', 'fat'), ('sodium', 'sodium')]:
        if v.get(k) in ('ND', 'NA', '-'): notes.append(f'{lab} published as "{v.get(k)}"')
    extra = []
    for k, lab in [('sat', 'sat_fat_g'), ('trans', 'trans_fat_g'), ('added_sugar', 'added_sugar_g'), ('chol', 'cholesterol_mg'), ('caffeine', 'caffeine_mg')]:
        if k in v: extra.append(f'{lab}={v[k]}')
    notes.append('also published: ' + ', '.join(extra))
    if sec == 'Beverages': notes.append('beverage quantity is printed under the booklet\'s "Net Weight (g)" column (looks like ml); kept in serving_g as published')
    if sec == 'Crust Upgrade': notes.append('booklet: "For stuffed Crust Maxx & Ultimate Cheese Pizza, the nutritional values mentioned below to be added on top of Per Serve Pan Pizza nutritional values"')
    # consistency checks against the booklet's own %RDA columns
    kc, kr = f(v.get('kcal')), f(v.get('kcal_rda'))
    issues = []
    if kc is not None and kr is not None and abs(kc / 20 - kr) > 0.6: issues.append(f'energy %RDA {kr} vs kcal {kc}')
    so, sr = f(v.get('sodium')), f(v.get('sodium_rda'))
    if so is not None and sr is not None and abs(so / 20 - sr) > 0.6: issues.append(f'sodium %RDA {sr} vs sodium {so}')
    fa, fr = f(v.get('fat')), f(v.get('fat_rda'))
    if fa is not None and fr is not None and abs(fa / 0.67 - fr) > 1.0: issues.append(f'fat %RDA {fr} vs fat {fa}')
    sa = f(v.get('sat'))
    if fa is not None and sa is not None and sa > fa + 0.05: issues.append(f'saturated fat {sa} > total fat {fa}')
    pr, ca = f(v.get('protein')), f(v.get('carb'))
    if None not in (kc, pr, ca, fa) and kc > 50:
        est = 4 * pr + 4 * ca + 9 * fa
        if abs(est - kc) / kc > 0.15: issues.append(f'4P+4C+9F={est:.0f} vs kcal {kc}')
    if issues:
        notes.append('source-internal inconsistency (values kept as published): ' + '; '.join(issues))
        anom.append({'page': r['page'], 'item': name, 'variant': variant, 'issues': issues})
    if r['page'] == 9 and sec == 'Spicy Range Pizzas' or '3-IN-1' in sec:
        notes.append('the same printed name appears twice in this section (veg and non-veg versions); distinguished only by the veg/non-veg symbol')
    rows.append({'brand': 'Pizza Hut', 'country': 'IN', 'item': name, 'variant_or_size': variant, 'serving_desc': sdesc,
                 'serving_g': netwt if f(netwt) is not None else '', 'serving_ml': '', 'kcal': num('kcal'), 'protein_g': num('protein'),
                 'carbs_g': num('carb'), 'fat_g': num('fat'), 'fiber_g': num('fibre'), 'sugar_g': num('sugar'), 'sodium_mg': num('sodium'),
                 'veg_nonveg': r['veg'], 'source_url': SRC_URL, 'source_title': SRC_TITLE, 'source_date_or_version': SRC_VER,
                 'page_or_section': f'PDF page {r["page"]} (printed p.{r["page"]-3}) - {sec}', 'notes': '; '.join(notes)})
pz_csv.write(out_csv, rows)
json.dump(anom, open(anomalies_path, 'w'), indent=1)
print('rows', len(rows), 'anomalies', len(anom))
for a in anom: print(' ', a)
