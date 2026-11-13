# Build data/kfc_india.csv from parsed.json (parse_kfc.py output). Usage: build_kfc.py parsed.json out.csv
import sys, json, csv, re
COLS=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
URL='https://about.kfc.co.in/assets/files/nutrition-booklet.pdf'
TITLE='KFC India "Menu Card Nutrition & Allergen Information Booklet of KFC Products" (KFC Nutrition Information, V6)'
VER='V6 (PDF created 2026-03-30; server Last-Modified 2026-04-01)'
PC={'HC':'Hot & Crispy Chicken','HC Leg':'Hot & Crispy Leg Piece','Piripiri HC Leg':'Piri Piri Hot & Crispy Leg Piece',
    'Hot Wings':'Hot Wings','Boneless strips':'Boneless Strips','Piripiri Strip':'Piri Piri Boneless Strips','Piripiri Strips':'Piri Piri Boneless Strips',
    'Zinger Fillet':'Zinger Fillet','Bonless Wing':'Boneless Wings','Smoky':'Smoky Leg','Grilled leg':'Grilled Leg'}
SIZE_ITEMS=('Popcorn','Fries','Pepsi','Mirinda','7 Up','Dew')
BEV_SECTIONS=('Cola','Krushers','Pepsico Retail Products')
rows=json.load(open(sys.argv[1])); out=[]
for r in rows:
    name=' '.join(r['name'].split()); sec=r['section'].strip()
    item=name; variant=''; notes=[]
    m=re.match(r'^(\d+) Pc (.+)$',name)
    if m and m.group(2).strip() in PC:
        item=PC[m.group(2).strip()]; variant=f'{m.group(1)} pc'
    else:
        m2=re.match(r'^(.*) (Regular|Medium|Large)$',name)
        if m2 and m2.group(1).startswith(SIZE_ITEMS):
            item=m2.group(1); variant=m2.group(2)
    if item!=name: notes.append(f'source label: "{name}"')
    if name=='Dunked Burger': variant=f'as listed under {sec}'; notes.append('Dunked Burger appears twice in the booklet (Burgers p9 and Dunked Range p12) with different values')
    w=r['weight']; n=r['servings']
    if n=='1':
        sg=w; desc=f'Whole product = 1 serving (avg. portion weight {w} g as published)'
    else:
        sg=''; desc=f'Per serving; product has {n} servings (avg. portion weight of whole product {w} g)'
        notes.append(f'product_weight_g={w}; servings_per_product={n}; values are per serving, multiply by {n} for the whole product')
    sml=''
    if sec in BEV_SECTIONS or (sec=='Snacks' and name=='2 Krush Lime'):
        notes.append('beverage; source column is "Avg. Portion Weight in gm" (volume in ml not stated)')
    notes.append(f"sat_fat_g={r['sat']}; trans_fat_g={r['trans']}; mufa_g={r['mufa']}; pufa_g={r['pufa']}")
    notes.append(f"MSG={r.get('msg','')}"+(f"; caffeine_or_sweetener={r['caff_sweet']}" if r.get('caff_sweet') else '; caffeine/sweetener column shows an icon or is blank'))
    veg='non-veg' if r['_red']>r['_green'] else 'veg'
    out.append({'brand':'KFC','country':'IN','item':item,'variant_or_size':variant,'serving_desc':desc,'serving_g':sg,'serving_ml':sml,
        'kcal':r['kcal'],'protein_g':r['protein'],'carbs_g':r['carbs'],'fat_g':r['fat'],'fiber_g':'','sugar_g':r['sugar'],'sodium_mg':r['sodium'],
        'veg_nonveg':veg,'source_url':URL,'source_title':TITLE,'source_date_or_version':VER,
        'page_or_section':f"p{r['page']} / {sec}",'notes':' | '.join(notes)})
with open(sys.argv[2],'w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=COLS); w.writeheader(); w.writerows(out)
print(len(out),'rows')
