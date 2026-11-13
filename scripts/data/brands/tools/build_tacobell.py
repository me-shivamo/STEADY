# Build data/taco_bell_india.csv from parsed_new.json (parse_tacobell.py output). Usage: build_tacobell.py parsed.json out.csv
import sys, json, csv, re
COLS=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
URL='https://www.tacobell.co.in/pub/media/pdf/nutritional-info-new.pdf'
TITLE='Taco Bell India "Nutritional and Allergens information" (linked as "Nutrition" in tacobell.co.in site navigation; embedded file title "NI  Allergens sheet_01.04.26 (with Electrifying menu and corn cup).xlsx")'
VER='Sheet dated 01.04.26 (per embedded title); PDF created 2026-04-02; server Last-Modified 2026-04-06'
rows=json.load(open(sys.argv[1]))
out=[]
def num(v):
    v=v.strip()
    return v if re.fullmatch(r'\d+(\.\d+)?',v) else ''
for r in rows:
    name=' '.join(r['name'].split())
    serve=r['serve'].replace('`','').strip()
    qty=' '.join(r['qty'].split())
    item=name; variant=''; notes=[]; sg=''; sml=''; desc=''
    m=re.match(r'^(\d+)\s*pc\s*/\s*(\d+(?:\.\d+)?)\s*g$',qty)
    mg=re.match(r'^(\d+(?:\.\d+)?)\s*g$',qty); mml=re.match(r'^(\d+(?:\.\d+)?)\s*ml+$',qty)
    packn=re.match(r'^(\d+)$',serve)
    if name=='Seasoned Fries small': item,variant='Seasoned Fries','small'
    if name=='Churros and Chocolate Regular': item,variant='Churros and Chocolate','Regular'
    if name.startswith('Choco Mud pie-Dining') or name.startswith('Choco Mud Pie-Delivery'):
        item='Choco Mud Pie'; variant='Dining' if 'Dining' in name else 'Delivery (2 pc)'
    if '(e)' in name:
        notes.append('Row marked "(e)" in source; the sheet title mentions the "Electrifying menu" but the PDF does not define "(e)"')
    if packn and int(packn.group(1))>1:
        n=int(packn.group(1))
        variant=(variant+' ' if variant else '')+f'pack of {n} serves'
        desc=f'Values per serve; pack has {n} serves; pack gross quantity {qty}'
        notes.append(f'Per-serve weight not published (pack gross quantity {qty} / {n} serves)')
    else:
        if m: variant=variant or f'{m.group(1)} pc'; sg=m.group(2); desc=f'1 serve ({m.group(1)} pc, gross quantity {m.group(2)} g)'
        elif mg: sg=mg.group(1); desc=f'1 serve ({serve}; gross quantity {qty})'
        elif mml: sml=mml.group(1); desc=f'1 serve ({serve}; {mml.group(1)} ml)'
        else: desc=f'1 serve ({serve}; {qty})'
    if r['qty'].strip()=='330 ml' or mml: pass
    blq=[k for k in ('total_sugar','added_sugar','trans_fat','cholesterol') if r[k].strip()=='BLQ']
    if blq: notes.append('BLQ (below limit of quantification) in source for: '+', '.join(blq))
    notes.append(f"added_sugar_g={r['added_sugar']}; sat_fat_g={r['sat_fat']}; trans_fat_g={r['trans_fat']}; cholesterol_mg={r['cholesterol']}")
    if name in('Smokin Grilled NVT','Smokin Grilled NCT'): notes.append('Abbreviation NVT/NCT is not expanded in the source')
    vn=r['veg'].split(',')[0]
    veg={'veg':'veg','non-veg':'non-veg'}.get(vn,'veg' if vn=='?8898e4bf' else '')
    out.append({'brand':'Taco Bell','country':'IN','item':item,'variant_or_size':variant,'serving_desc':desc,'serving_g':sg,'serving_ml':sml,
        'kcal':num(r['kcal']),'protein_g':num(r['protein']),'carbs_g':num(r['carb']),'fat_g':num(r['fat']),'fiber_g':'','sugar_g':num(r['total_sugar']),
        'sodium_mg':num(r['sodium']),'veg_nonveg':veg,'source_url':URL,'source_title':TITLE,'source_date_or_version':VER,
        'page_or_section':f"p1 / S.N. {r['sn']}",'notes':' | '.join(notes)})
with open(sys.argv[2],'w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=COLS); w.writeheader(); w.writerows(out)
print(len(out),'rows')
