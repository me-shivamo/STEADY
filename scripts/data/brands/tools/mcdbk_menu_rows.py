# usage: python3 -I mcdbk_menu_rows.py <out.json> <transcribed.json> [...]
# Turns values transcribed (by eye) from the N&E April-2026 menu PDF's nutrition panels into CSV rows.
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
from mcdbk_common import atwater_note
NONVEG = {'Egg & Sausage McMuffin®', 'McSpicy® Chicken Burger', 'Chicken Maharaja Mac®', 'Spicy Chicken Wrap®'}
MARK_SEEN = {'4': 'veg', '17': 'non-veg', '28': 'veg', '33': 'veg', '43': 'veg', '44': 'veg', '45': 'veg', '46': 'veg'}
URL = 'https://mcdindia.com/wp-content/uploads/2026/04/mcd-website.pdf'
TITLE = "MENU McDonald's India (N&E) - Connaught Plaza Restaurants Pvt Ltd (linked as 'View Menu' on mcdindia.com); image-only PDF, one product per page with a nutrition panel"
VER = 'uploaded Apr 2026 (file Last-Modified 24 Apr 2026)'
rows = []
for f in sys.argv[2:]:
    for pg, sec, name, kcal, prot, fat, chol, trans, sat, carb, sug, add, sod in json.load(open(f)):
        mccafe = sec == 'McCafé'
        notes = [f'sat_fat_g={sat}', f'trans_fat_g={trans}', f'cholesterol_mg={chol}', f'added_sugar_g={add}',
                 'Not in the Dec-2025 nutrition booklet; values transcribed from the nutrition panel image of the Apr-2026 menu PDF (no text layer).',
                 'Serving weight/volume not stated.']
        if mccafe and name not in ('Skillet Cookies', 'Garlic Marinara Toasty', 'Butter Croissant', 'Strawberry Cheesecake'):
            notes.append('Panel footnote: "Nutritional values shown on the menu are based on a standard regular serving size. For information on other serving sizes, please refer to the nutritional booklet." Milk type not stated; no alternative-milk values.')
        if name == 'Cappuccino': notes.append('Two different Cappuccino panels exist: p9 (Breakfast section, 136.39 kcal) and p48 (McCafé section, 206.50 kcal); both kept as published.')
        if name == 'Cold Coffee Frappe': notes.append('Sodium printed as "290.509mg" (kept as published).')
        veg = MARK_SEEN.get(pg) or ('non-veg' if name in NONVEG else 'veg')
        if pg not in MARK_SEEN: notes.append('veg/non-veg from item name (mark not individually checked)')
        a = atwater_note(kcal, prot, carb, fat)
        if a: notes.append(a)
        rows.append({'brand': "McDonald's India (North & East)", 'country': 'IN', 'item': name.replace('®', '').strip(), 'variant_or_size': 'standard regular serving' if mccafe else '',
                     'serving_desc': 'standard regular serving (weight/volume not published)' if mccafe else '1 item as sold (weight not published)',
                     'serving_g': '', 'serving_ml': '', 'kcal': kcal, 'protein_g': prot, 'carbs_g': carb, 'fat_g': fat, 'fiber_g': '', 'sugar_g': sug,
                     'sodium_mg': sod, 'veg_nonveg': veg, 'source_url': URL, 'source_title': TITLE, 'source_date_or_version': VER,
                     'page_or_section': f'menu p{pg} - {sec}', 'notes': '; '.join(notes)})
json.dump(rows, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
print(len(rows))
