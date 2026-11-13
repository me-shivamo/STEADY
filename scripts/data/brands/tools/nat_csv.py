"""Build naturals_ice_cream.csv from nat_table outputs (+ plain text of main PDF for cross-check/allergens).
Usage: python3 -I nat_csv.py WORKDIR out.csv"""
import sys, json, csv, re, os
wd=sys.argv[1]
cols=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
BASE='https://naturalicecreams.in/wp-content/uploads/'
SRC={
 'Naturals-1':dict(url=BASE+'Naturals-1.pdf',title="Natural's Ice Cream - Nutritional Information (\"Naturals\" PDF linked from https://naturalicecreams.in/nutritional-info/)",ver='undated; HTTP Last-Modified 2024-12-11; fetched 2026-11-13',fmt='Naturals'),
 'PDF-all-N-value-for-website_Juhu_July-to-Sept-2025':dict(url=BASE+'2025/08/PDF-all-N-value-for-website_Juhu_July-to-Sept-2025.pdf',title="Natural's Ice Cream - \"Naturals Now\" nutrition values (Juhu, July-Sept 2025), linked from https://naturalicecreams.in/nutritional-info/",ver='July-Sept 2025 (filename); HTTP Last-Modified 2025-08-04; fetched 2026-11-13',fmt='Naturals Now'),
 'All-N-values-for-website_Just-Sundae_July-2024_Updated':dict(url=BASE+'2024/07/All-N-values-for-website_Just-Sundae_July-2024_Updated.pdf',title="Natural's Ice Cream - \"Naturals Just Sundaes\" nutrition values (July 2024, updated), linked from https://naturalicecreams.in/nutritional-info/",ver='July 2024 Updated (filename); HTTP Last-Modified 2024-12-11; fetched 2026-11-13',fmt='Just Sundaes'),
}
def keymap(h):
    h=h.lower()
    if 'energy' in h: return 'kcal'
    if 'protein' in h: return 'protein'
    if 'carbo' in h: return 'carbs'
    if 'added' in h: return 'added'
    if 'saturated' in h: return 'sat'
    if 'trans' in h: return 'trans'
    if 'cholest' in h: return 'chol'
    if 'sodium' in h: return 'sodium'
    if 'total sugar' in h or 'sugars' in h: return 'sugar'
    if 'fat' in h: return 'fat'
    return None
def f(v):
    try: return float(v.replace('<','').strip())
    except: return None
# plain-text cross-check for main PDF
plain={}
pt=open(os.path.join(wd,'..','nat_Naturals-1.txt'),encoding='utf-8',errors='replace').read().split('\n')
for ln in pt:
    toks=[t.strip() for t in re.split(r'\s{2,}',ln.strip()) if t.strip()]
    if len(toks)>=13 and re.match(r'^\d+$',toks[0]):
        plain[toks[0]]=toks
rows=[]; issues=[]
for stem,meta in SRC.items():
    rs=json.load(open(os.path.join(wd,stem+'.rows.json')))
    foot={}
    for r in rs:
        if 'footnote' in r:
            m=re.search(r'Serving size (?:of one (\w+) )?is (approximate )?(\d+\s*(?:g|ml))',r['footnote'])
            foot[r['section']]=(m.group(0) if m else '')
    for r in rs:
        if 'footnote' in r: continue
        sec=r['section']
        secname={'ake':'Milkshake','undae':'Sundae','Information':'Ice cream'}.get(sec,sec.title())
        km=[keymap(h) for h in r['headers']]
        if None in km or len(set(km))!=10: issues.append(f'{stem} {sec}: header map {r["headers"]}')
        v=dict(zip(km,r['vals']))
        name=re.sub(r'\s+',' ',r['name']).strip()
        decl=''
        if stem=='Naturals-1':
            p=plain.get(r['sr'])
            if p:
                pv=p[2:12]
                order=['kcal','carbs','sugar','added','protein','fat','sat','trans','chol','sodium']
                pmap=dict(zip(order,pv))
                for k in order:
                    if pmap[k].replace(' ','')!=v.get(k,'').replace(' ',''): issues.append(f'MISMATCH {stem} #{r["sr"]} {name} {k}: words={v.get(k)} plain={pmap[k]} (plain kept)')
                    v[k]=pmap[k]
                allergen=p[12]; decl=p[13] if len(p)>13 else ''
                if p[1].replace(' ','')!=name.replace(' ',''): issues.append(f'NAME {r["sr"]}: {name!r} vs {p[1]!r}')
                name=p[1]
            else:
                allergen=''
                issues.append(f'no plain row for #{r["sr"]} {name}')
            # proprietary food rows: plain text has declaration split over lines
            if r['sr'] in ('85','86','87','88','89','90'): decl='PROPRIETARY FOOD - CATEGORY 1.7 DAIRY BASED DESSERTS'
        else:
            allergen=re.sub(r'\s+',' ',' '.join(x for x in [r.get('allergen',''),' '.join(r.get('other',[]))] if x)).strip()
            decl=re.sub(r'\s+',' ',r.get('decl','')).strip()
        serving=foot.get(sec,'')
        sml=''
        notes=[f'{meta["fmt"]} / {secname}', 'values per 100 g as published']
        if serving: notes.append(f'source footnote: {serving}')
        if v.get('added'): notes.append(f'added sugar {v["added"]} g')
        if v.get('sat'): notes.append(f'sat fat {v["sat"]} g')
        if v.get('trans'): notes.append(f'trans fat {v["trans"]} g')
        if v.get('chol'): notes.append(f'cholesterol {v["chol"]} mg')
        if allergen: notes.append(f'allergen: {allergen}')
        if decl: notes.append(f'declaration: {decl}')
        C,P,F,S,E=f(v.get('carbs','')),f(v.get('protein','')),f(v.get('fat','')),f(v.get('sugar','')),f(v.get('kcal',''))
        flags=[]
        if None not in (C,S) and S>C+0.5: flags.append(f'total sugar ({S}) > carbohydrate ({C})')
        if None not in (C,P,F,E) and E>0:
            est=4*C+4*P+9*F
            if abs(est-E)/E>0.2: flags.append(f'kcal {E} vs 4C+4P+9F={est:.0f} (>20% apart)')
        if None not in (F,f(v.get('sat',''))) and f(v.get('sat',''))>F+0.5: flags.append('sat fat > total fat')
        if 'NO ADDED SUGAR' in name and f(v.get('added','0') or '0'): flags.append(f'"no added sugar" item lists added sugar {v.get("added")}')
        if P is not None and P>12 and secname in ('Milkshake','Ice cream','Ice Cream','Sundae'): flags.append(f'protein {P} g/100 g implausible for this item; columns may be shifted in source (E,P,C,TS,AS read as {v.get("kcal")},{v.get("protein")},{v.get("carbs")},{v.get("sugar")},{v.get("added")})')
        if flags: notes.append('SUSPECT (source inconsistency, numbers kept as published): '+'; '.join(flags))
        rows.append(dict(brand="Natural's Ice Cream",country='IN',item=name.title() if name.isupper() else name,variant_or_size=f'{meta["fmt"]} menu - {secname}',
            serving_desc='per 100 g (as published)'+(f'; {serving}' if serving else ''),serving_g='100',serving_ml=sml,
            kcal=v.get('kcal',''),protein_g=v.get('protein',''),carbs_g=v.get('carbs',''),fat_g=v.get('fat',''),fiber_g='',sugar_g=v.get('sugar',''),sodium_mg=v.get('sodium',''),
            veg_nonveg='',source_url=meta['url'],source_title=meta['title'],source_date_or_version=meta['ver'],
            page_or_section=f'page {r["page"]}; table "{secname}"; Sr. No. {r["sr"]}',notes='; '.join(notes)))
with open(sys.argv[2],'w',newline='',encoding='utf-8') as fh:
    w=csv.DictWriter(fh,fieldnames=cols); w.writeheader(); w.writerows(rows)
print(len(rows),'rows'); print('\n'.join(issues))
