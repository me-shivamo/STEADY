# Build data/subway_india.csv from parsed.json (output of parse_subway.py). Usage: build_subway.py parsed.json out.csv
import sys, json, csv, re
COLS=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
URL='https://qnet.blob.core.windows.net/central/Nutritional%20Allergen%20Chart%20-%20August%202026%20-%201786080088269.pdf'
TITLE='Subway Product Nutritional & Allergen Information (linked as "Nutrition Information" in the footer of subway.in)'
VER='Updated in August 2026 (PDF created 2026-08-05; blob Last-Modified 2026-08-07)'
ALG=['gluten','crustacean','milk','egg','fish','nut','soy','sulphite']
rows=json.load(open(sys.argv[1]))
# section definitions: prefix of section header -> (key, item suffix, variant, serving_desc)
SECT=[('Hot & Cheesy','hot_cheesy','', '6-inch','Fixed build: 6-inch bread, vegetables, sauce and protein (as published)'),
      ('Breakfast Subs','breakfast','', None,'Fixed build: bread, vegetables, sauce and protein (as published)'),
      ('Sub Cravers','sub_cravers','', '4-inch','Fixed build: 4-inch bread, vegetables, sauce and protein (as published)'),
      ('Subs (6 inch) Cheese Pull','cheese_pull',' Sub Cheese Pull','6-inch','6-inch multigrain bread, standard vegetables, recommended sauce, mozzarella cheese and 6-inch protein portion'),
      ('Subs (6 inch)','subs6',' Sub','6-inch','6-inch multigrain bread, standard vegetables, recommended sauce and 6-inch protein portion'),
      ('*Wraps','wraps',' Wrap','Wrap','Multigrain wrap, standard vegetables, recommended sauce and 12-inch protein portion'),
      ('Salads','salads',' Salad','Salad','Salad portion vegetables, recommended sauce and 6-inch portion of protein'),
      ('New Salads','new_salads',' Salad (New Salads)','New Salad','Salad portion vegetables, recommended sauce and protein'),
      ('Rice Bowls','rice_bowls',' Rice Bowl','Rice Bowl','Basmati rice, mixed beans, vegetables, recommended sauce and protein'),
      ('Sides','sides','', '','1 serving as published'),
      ('Carriers','carriers','', '','1 carrier (bread/wrap/rice) portion as published; bread length not stated for this section'),
      ('Sauces','sauces','', '','1 portion of sauce as published'),
      ('Cheese','cheese','', '','1 portion as published'),
      ('Proteins','proteins','', '','1 protein portion as published; sub size basis not stated for this section'),
      ('Vegetables','vegetables','', '','1 portion as published'),
      ('Sprinkles','sprinkles','', '','1 portion as published'),
      ('Beverages','beverages','', '','1 serving as published'),
]
FOOT={'1':'Source superscript 1: "All products may not be available in all locations"','2':'Source superscript 2: "All products may not be available in all locations"','3':'Source superscript 3: "All products may not be available in all locations"','4':'Source superscript 4: footnotes read "All products may not be available in all locations" and "Contains sesame seeds and may contain mustard and celery"','5':'Source superscript 5: no footnote 5 text appears in the PDF'}
out=[]; cur=None; cur_sup=''
for r in rows:
    name=r.get('name','').strip()
    if not name or name.startswith('Contribution') or name.startswith('Recommended') or name.startswith('Disclaimer') or name.startswith('in product'): continue
    if not re.fullmatch(r'\d+(\.\d+)?', r.get('kcal','')):
        hit=None
        for pre,key,suf,var,desc in SECT:
            if name.startswith(pre): hit=(pre,key,suf,var,desc); break
        if hit: cur=hit; cur_sup=r.get('_sup','')
        continue
    if cur is None: continue
    pre,key,suf,var,desc=cur
    notes=[]
    sup=r.get('_sup','')
    if cur_sup: notes.append(FOOT.get(cur_sup,'footnote '+cur_sup)+' (section)')
    if sup: notes.append(FOOT.get(sup,'footnote '+sup))
    variant=var
    item=name
    m=re.match(r'^(.*?) \((\d-inch)\)( with 7 Grain Multigrain)?$',name)
    if key=='breakfast' and m:
        item=m.group(1); variant=m.group(2)+(' on 7 Grain Multigrain bread' if m.group(3) else '')
    elif key in('hot_cheesy','sub_cravers'):
        item=name
    else:
        item=name+suf
    if key=='cheese_pull' and name.endswith(' Cheese Pull'): item=name[:-len(' Cheese Pull')]+' Sub (Cheese Pull)'
    if '(Contains polyols' in name: item=name.split(' (Contains polyols')[0]
    if key=='carriers' and name=='7 Grain Multigrain': item='7 Grain Multigrain Bread'
    veg='non-veg' if r['_red']>r['_green'] else ('veg' if r['_green']>0 else '')
    present=[a for a in ALG if r.get(a)=='●']; may=[a for a in ALG if r.get(a)=='#']
    extra=f"sat_fat_g={r.get('sat_fat_g','')}; trans_fat_g={r.get('trans_fat_g','')}; added_sugar_g={r.get('added_sugar_g','')}; cholesterol_mg={r.get('cholesterol_mg','')}"
    notes.append(extra)
    notes.append('allergens present: '+(', '.join(present) or 'none marked')+(('; may contain: '+', '.join(may)) if may else ''))
    if key in('subs6','cheese_pull') : notes.append('Footlong not published separately; source says double the 6-inch values for approximate Footlong')
    if key=='wraps' or 'polyols' in name.lower(): notes.append('Contains polyols (source note)')
    if key=='beverages': notes.append('Serving qty column header is in g; beverage volume in ml not published; milk type not stated')
    out.append({'brand':'Subway','country':'IN','item':item,'variant_or_size':variant,'serving_desc':desc,
        'serving_g':r.get('serving_g',''),'serving_ml':'','kcal':r.get('kcal',''),'protein_g':r.get('protein_g',''),
        'carbs_g':r.get('carbs_g',''),'fat_g':r.get('fat_g',''),'fiber_g':'','sugar_g':r.get('sugars_g',''),'sodium_mg':r.get('sodium_mg',''),
        'veg_nonveg':veg,'source_url':URL,'source_title':TITLE,'source_date_or_version':VER,
        'page_or_section':f"p{r['_page']} / {pre.lstrip('*')}",'notes':' | '.join(notes)})
with open(sys.argv[2],'w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=COLS); w.writeheader(); w.writerows(out)
print(len(out),'rows')
from collections import Counter
print(Counter(o['page_or_section'].split(' / ')[1] for o in out))
print(Counter(o['veg_nonveg'] for o in out))
