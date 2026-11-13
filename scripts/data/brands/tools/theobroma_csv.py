"""Build theobroma.csv from parsed items + detected marks.
Usage: python3 -I theobroma_csv.py items.json marks.jsonl guide.txt out.csv issues.txt"""
import sys, json, csv, re
items=json.load(open(sys.argv[1]))
marks=[json.loads(l) for l in open(sys.argv[2])]
raw=open(sys.argv[3],encoding='utf-8',errors='replace').read().split('\n')
SECTIONS=['Croissants & Danishes','Dry Cake','Bread','Brownie','Cake','Dessert','Pastry','Savoury','Cookies','Gifting','Beverages']
hdr_lines=[]
for i,l in enumerate(raw):
    t=[(m.start(),m.group(0)) for m in re.finditer(r'\S+(?: \S+)*',l)]
    if len(t)==1 and t[0][0]>=330 and t[0][1] in SECTIONS: hdr_lines.append((i+1,t[0][1]))
# merge marks into cards
cards=[]
by=sorted(marks,key=lambda m:(m['page'],m['col'],m['y']))
for m in by:
    if cards and cards[-1]['page']==m['page'] and cards[-1]['col']==m['col'] and m['y']-cards[-1]['ylast']<=13:
        c=cards[-1]; c['title']+=' '+m['title']; c['ylast']=m['y']; c['green']=max(c['green'],m['green']); c['brown']=max(c['brown'],m['brown'])
    else:
        cards.append(dict(m,ylast=m['y']))
norm=lambda s:re.sub(r'\s+','',s).lower()
card_by={}
for c in cards: card_by.setdefault(norm(c['title']),[]).append(c)
URL='https://theobroma.in/assets/wla_new/theobroma/downloads/nutrition-guide.pdf'
TITLE='Theobroma Nutrition and Allergen Guide (linked from https://theobroma.in/nutritional-information)'
VER='June 2026 (cover date); fetched 2026-11-13'
cols=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
rows=[]; issues=[]
for it in sorted(items,key=lambda x:(x['line'],x['side'])):
    t=it['title']
    t=re.sub(r'^NUTRITION AND ALLERGEN GUIDE JUNE 2026\s+','',t)
    for s in SECTIONS:
        if t.startswith(s+' ') and it['side']==1:
            t=t[len(s)+1:]; break
    sec=''
    for ln,s in hdr_lines:
        if ln<it['line']: sec=s
    m=re.match(r'^(.*?)\s*\[(.*?)\]\s*$',t)
    name,var=(m.group(1),m.group(2)) if m else (t,'')
    cs=card_by.get(norm(t),[])
    if len(cs)!=1: issues.append(f'card match {t!r}: {len(cs)}')
    card=cs[0] if cs else None
    page=card['page'] if card else ''
    veg=''
    mark_note=''
    if card:
        if card['green']>=100 and card['brown']<30: veg='veg'
        elif card['brown']>=100 and card['green']<30: veg='non-veg'
        elif card['green']>=30 or card['brown']>=30: mark_note='veg/non-veg mark only partially rendered in PDF; not recorded'
    if card and veg: mark_note='veg/non-veg from FSSAI mark printed on card'
    if not veg:
        if re.search(r'\bChicken\b|Non-Veg',name): veg='non-veg'; mark_note=(mark_note+'; ' if mark_note else '')+'veg/non-veg inferred from published item name (no mark printed)'
        elif name.startswith('Veg '): veg='veg'; mark_note=(mark_note+'; ' if mark_note else '')+'veg/non-veg inferred from published item name (no mark printed)'
    n=it['n']
    serve=it['serving']  # e.g. '80 g'
    sm=re.match(r'^([\d.]+)\s*g$',serve)
    sg=sm.group(1) if sm else ''
    if not sm: issues.append(f'serving unparsed {t!r}: {serve}')
    sml=''
    mm=re.match(r'^(\d+)\s*ml$',var)
    if mm: sml=mm.group(1)
    def ps(k): return n[k][0]
    def p100(k): return n[k][1]
    # consistency check kcal per serve vs per 100
    try:
        exp=float(p100('kcal'))*float(sg)/100; got=float(ps('kcal'))
        if abs(exp-got)>max(1.0,0.02*got): issues.append(f'kcal serve/100g mismatch {t!r}: serve {got} vs 100g {p100("kcal")} x {sg}g = {exp:.1f}')
    except Exception as e: issues.append(f'check fail {t!r} {e}')
    notes=[f'per serve as listed; per 100 g: {p100("kcal")} kcal',
           f'added sugar {ps("added_sugar_g")} g', f'sat fat {ps("satfat_g")} g', f'trans fat {ps("transfat_g")} g', f'cholesterol {ps("chol_mg")} mg',
           f'allergens: {it.get("allergens","")}']
    if 'Egg' in it.get('allergens',''): notes.append('egg listed in allergens')
    if mark_note: notes.append(mark_note)
    def fl(x):
        try: return float(str(x).replace('<','').strip())
        except: return None
    C,P,F,E,S=fl(ps('carbs_g')),fl(ps('protein_g')),fl(ps('fat_g')),fl(ps('kcal')),fl(ps('sugar_g'))
    flags=[]
    if None not in (C,P,F,E) and E>0 and abs(4*C+4*P+9*F-E)/E>0.2: flags.append(f'kcal {E} vs 4C+4P+9F={4*C+4*P+9*F:.0f} (>20% apart)')
    if None not in (C,S) and S>C+0.5: flags.append(f'total sugar {S} > carbohydrate {C}')
    if name=='Cappuccino': flags.append('647.5 kcal / 33.4 g fat / 74.2 g sugar for a 250 ml cappuccino is implausible (259 kcal/100 g); likely an error in the source guide - verify before use')
    if flags: notes.append('SUSPECT (numbers kept as published): '+'; '.join(flags))
    if var and not re.match(r'^1 Piece$|^Single$|^Slice$',var):
        sdesc=f'1 serve = {serve} (product listed as {var})'
    else:
        sdesc=f'1 serve = {serve}' + (f' ({var})' if var else '')
    rows.append(dict(brand='Theobroma',country='IN',item=name,variant_or_size=var,serving_desc=sdesc,serving_g=sg,serving_ml=sml,
        kcal=ps('kcal'),protein_g=ps('protein_g'),carbs_g=ps('carbs_g'),fat_g=ps('fat_g'),fiber_g='',sugar_g=ps('sugar_g'),sodium_mg=ps('sodium_mg'),
        veg_nonveg=veg,source_url=URL,source_title=TITLE,source_date_or_version=VER,page_or_section=f'PDF page {page}; section {sec}',notes='; '.join(notes)))
with open(sys.argv[4],'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(rows)
open(sys.argv[5],'w').write('\n'.join(issues)+'\n')
print(len(rows),'rows;',len(issues),'issues')
