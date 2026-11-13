# usage: python3 -I mcdbk_build_bk.py <bk_rows.json> <out.csv>
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
from mcdbk_common import split_variant, atwater_note, write, fnum
src = json.load(open(sys.argv[1]))
src.sort(key=lambda r: (r['page'], r['top']))
SECTIONS = {'VEG BURGERS', 'Tacos & Wraps', 'Veg Sides', 'Non Veg Sides', 'NON VEG BURGERS', 'DESSERTS', 'FOUNTAIN DRINKS', 'SHAKES',
            'HOT BEVERAGES', 'COLD BEVERAGES', 'CAFÉ FOOD'}
LIQ = {'FOUNTAIN DRINKS', 'SHAKES', 'HOT BEVERAGES', 'COLD BEVERAGES'}
SPECIFIC = {
    'Veg. Whopper Double Patty': 'Published kcal (1431.7) looks inconsistent with the published macros; kept as published.',
    'Chicken Whopper Double Patty': 'Published kcal (1574.0) looks inconsistent with the published macros; kept as published.',
    'Thums UP Medium': 'Published carbohydrate 8 g is lower than published sugar 47 g (likely a typo for ~48); kept as published.',
    'Mochaccino Small': 'Published saturated fat 26.4 g exceeds total fat 5.8 g, and sugar 6.6 g vs 39.2 g for Regular; source inconsistency, kept as published.',
    'Masala Chai': 'Published saturated fat 11.2 g exceeds total fat 2.7 g; source inconsistency, kept as published.',
    'Choco lava cake': 'Published saturated fat 27.4 g exceeds total fat 4.9 g; source inconsistency, kept as published.',
    'Caffe Latte Regular': 'Regular (240 ml) is published lower in kcal (105) than Small (170 ml, 110); kept as published.',
    'Vanilla Softie (Medium Fat)': 'Carb/sugar/protein/sodium identical to BK Sundae- Mango in the source; kept as published.',
    'Crunchy Chicken Wrap': 'Published carbohydrate 12.3 g is unusually low for a wrap; kept as published.',
}
DRINK_NOTE = {'FOUNTAIN DRINKS': 'Fountain drinks are served with ice (per PDF footnote). No Large size published.',
              'HOT BEVERAGES': 'Milk type not stated in the PDF (no alternative-milk options listed).',
              'COLD BEVERAGES': 'Milk type not stated in the PDF.'}
URL = 'https://d1rgpf387mknul.cloudfront.net/1771400941pdfNI18Feb26pdf'
TITLE = 'Burger King India Nutritional Information Per Serve - February 2026'
VER = 'February 2026 ("current as of 12 February 2026"; file uploaded 18 Feb 2026)'
section = None; out = []
for r in src:
    if r['kind'] != 'row':
        if r['text'] in SECTIONS: section = r['text']
        continue
    name = r['product']
    item, var = split_variant(name)
    if name in ('Regular Fries', 'Medium Fries', 'King Fries'): item, var = 'Fries', name.split()[0]
    liquid = section in LIQ
    veg = 'veg' if r['green_px'] > 50 and r['red_px'] == 0 else ('non-veg' if r['red_px'] > 50 and r['green_px'] == 0 else '')
    notes = [f"sat_fat_g={r['satfat']}", f"trans_fat_g={r['trans']}"]
    if name != item + (' ' + var if var else '') and var: notes.append(f'published name: "{name}"')
    notes.append('Portion column is "Avg Portion size (gm/ml)"; unit inferred from section (' + ('ml' if liquid else 'g') + ').')
    if section in DRINK_NOTE: notes.append(DRINK_NOTE[section])
    if name in SPECIFIC: notes.append(SPECIFIC[name])
    a = atwater_note(r['kcal'], r['protein'], r['carb'], r['fat'])
    if a and name not in SPECIFIC: notes.append(a)
    if 'Coco cola' in name: notes.append('"Coco cola" spelling as published (Coca-Cola).')
    out.append({'brand': 'Burger King India', 'country': 'IN', 'item': item, 'variant_or_size': var,
                'serving_desc': f"avg portion {r['portion']} {'ml' if liquid else 'g'} (1 serve as sold)",
                'serving_g': '' if liquid else r['portion'], 'serving_ml': r['portion'] if liquid else '',
                'kcal': r['kcal'], 'protein_g': r['protein'], 'carbs_g': r['carb'], 'fat_g': r['fat'], 'fiber_g': '',
                'sugar_g': r['sugar'], 'sodium_mg': r['sodium'], 'veg_nonveg': veg, 'source_url': URL, 'source_title': TITLE,
                'source_date_or_version': VER, 'page_or_section': f"p{r['page']} - {section} #{r['sno']}", 'notes': '; '.join(notes)})
write(sys.argv[2], out)
print('rows', len(out)); import collections; print(collections.Counter(o['veg_nonveg'] for o in out))
for o in out:
    if 'CHECK' in o['notes'] or not o['veg_nonveg']: print(o['item'], o['variant_or_size'], o['kcal'], '|', o['notes'][-160:])
