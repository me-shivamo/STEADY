"""Build amul.csv from parsed Dudhsagar Dairy pages. Usage: python3 -I amul_csv.py dd.json out.csv"""
import sys, json, csv, re
recs=json.load(open(sys.argv[1]))
cols=['brand','country','item','variant_or_size','serving_desc','serving_g','serving_ml','kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','veg_nonveg','source_url','source_title','source_date_or_version','page_or_section','notes']
def cat(slug):
    if 'tricone' in slug: return 'Ice cream - cone'
    if '-ic-' in slug: return 'Ice cream - cup/tub'
    if 'kool' in slug: return 'Flavoured milk (Amul Kool)'
    if 'buttermilk' in slug: return 'Buttermilk'
    if any(k in slug for k in ['milk','gold','shakti','taaza','moti','t-special','slim-n-trim']): return 'Liquid milk'
    if 'kulfi' in slug: return 'Ice cream - kulfi'
    if 'tricone' in slug: return 'Ice cream - cone'
    if any(k in slug for k in ['bar','epic','lickz']): return 'Ice cream - stick/bar'
    if 'frozen-yoghurt' in slug: return 'Frozen yoghurt'
    if 'sorbet' in slug: return 'Sorbet'
    return 'Ice cream - cup/tub'
def num(v, unit):
    m=re.match(r'^\s*([<>]?\s*[\d.]+)\s*'+unit+r'\s*$',v,re.I)
    return m.group(1).replace(' ','') if m else None
rows=[]; issues=[]; seen=set()
for r in recs:
    slug=r['file'][:-5]
    if slug.startswith('sagar-'): continue   # Dudhsagar's own Sagar brand, not Amul
    if not r['tables']: issues.append(f'{slug}: no table'); continue
    t=r['tables'][0]
    basis=t[0][1] if len(t[0])>1 else ''
    d={}
    for row in t[1:]:
        if len(row)<2: continue
        k=row[0].strip().lower(); d.setdefault(k,row[1].strip())
    def g(*names, unit='g'):
        for n in names:
            if n in d:
                v=num(d[n],unit)
                if v is None: issues.append(f'{slug}: cannot parse {n}={d[n]!r}')
                return v or ''
        return ''
    kcal=g('energy',unit='kcal'); fat=g('total fat'); carbs=g('carbohydrate','total carbohydrate')
    sugar=g('total sugar','total sugars'); prot=g('protein'); sod=g('sodium',unit='mg')
    added=g('added sugar','added sugars'); sat=g('saturated fat'); trans=g('trans fat'); chol=g('cholesterol',unit='mg')
    bm=re.match(r'^Per\s+([\d.]+)\s*(g|ml|mL)$',basis.strip(),re.I)
    sg=sml=''
    if bm:
        if bm.group(2).lower()=='g': sg=bm.group(1)
        else: sml=bm.group(1)
    else: issues.append(f'{slug}: basis {basis!r}')
    name=r['name'] or slug
    key=(name,basis,kcal,fat,prot)
    if key in seen: issues.append(f'{slug}: duplicate of another page, skipped'); continue
    seen.add(key)
    per100 = bm and bm.group(1)=='100'
    if per100:
        sdesc=f'{basis} (as published; pack sizes: {r["packing"]})'
    else:
        sdesc=f'{basis} = 1 unit as published (pack: {r["packing"]})'
    notes=[f'category: {cat(slug)}']
    if added: notes.append(f'added sugar {added} g')
    if sat: notes.append(f'sat fat {sat} g')
    if trans: notes.append(f'trans fat {trans} g')
    if chol: notes.append(f'cholesterol {chol} mg')
    if not sugar: notes.append('total sugar not published')
    if 'calcium' in d: notes.append(f'calcium {d["calcium"]}')
    if not per100 and ',' in r['packing']: notes.append(f'single-unit basis {basis} published once for multiple pack sizes ({r["packing"]}); likely the largest pack')
    if 'kool' in slug: notes.append('all Amul Kool flavours on this site publish identical values (89 kcal/100 ml)')
    notes.append('values marked *Approx. on source')
    if slug=='amul-ic-strawberry': notes.append('SUSPECT: every value identical to Amul IC Vanilla page on the same site; possible copy error at source')
    rows.append(dict(brand='Amul',country='IN',item=name,variant_or_size=r['packing'],serving_desc=sdesc,serving_g=sg,serving_ml=sml,
        kcal=kcal,protein_g=prot,carbs_g=carbs,fat_g=fat,fiber_g='',sugar_g=sugar,sodium_mg=sod,veg_nonveg='',
        source_url=f'https://dudhsagardairy.coop/dairy/products/{slug}/',
        source_title=f'Dudhsagar Dairy (Mehsana District Co-op Milk Producers Union, Amul/GCMMF member union) product page: {name}',
        source_date_or_version='page fetched 2026-11-13; no version date on page',
        page_or_section=f'Nutritional Information table ({basis})',notes='; '.join(notes)))
rows.sort(key=lambda x:(x['notes'].split(';')[0],x['item']))
with open(sys.argv[2],'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(rows)
print(len(rows),'rows'); print('\n'.join(issues))
