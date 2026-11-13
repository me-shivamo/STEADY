"""Parse Theobroma nutrition guide text (gs txtwrite output) into item records.
Usage: python3 -I theobroma_parse.py guide.txt out.json
Two-column layout; split tokens by start column."""
import sys, re, json
SPLIT = 315
NUTR = {
 'Energy (kcal)':'kcal','Total Carbohydrates (g)':'carbs_g','Total Sugars (g)':'sugar_g',
 'Added Sugar (g)':'added_sugar_g','Protein (g)':'protein_g','Total Fat (g)':'fat_g',
 'Saturated Fat (g)':'satfat_g','Trans Fat (g)':'transfat_g','Cholesterol (mg)':'chol_mg',
 'Sodium (mg)':'sodium_mg','Dietary Fiber (g)':'fiber_g','Dietary Fibre (g)':'fiber_g',
}
def tokens(line):
    out=[]
    for m in re.finditer(r'\S+(?: \S+)*', line):
        out.append((m.start(), m.group(0)))
    return out
lines=open(sys.argv[1],encoding='utf-8',errors='replace').read().split('\n')
cols=[[],[]]
page=1
for i,ln in enumerate(lines):
    if '\f' in ln: page+=ln.count('\f')
    ln=ln.replace('\f','')
    toks=tokens(ln)
    for side in (0,1):
        ts=[t for s,t in toks if (s>=SPLIT)==bool(side)]
        cols[side].append((i+1,ts))
items=[]
for side in (0,1):
    st='idle'; title=[]; cur=None; pending_section=None
    for lineno,ts in cols[side]:
        if not ts: continue
        joined=' '.join(ts)
        if st in ('idle','title'):
            if ts[0]=='Per Serve':
                cur={'title':' '.join(title),'side':side,'line':lineno,'n':{},'raw':[]}
                st='serving'; title=[]; continue
            if joined.startswith('Based on') or joined.startswith('however') or joined.startswith('Allergens'):
                continue
            title.append(joined); st='title'; continue
        if st=='serving':
            cur['serving']=ts[0]; cur['serving_hdr']=ts; st='nutr'; continue
        if st=='nutr':
            if ts[0] in NUTR:
                cur['n'][NUTR[ts[0]]]=ts[1:]
                continue
            if joined.startswith('Based on') or joined.startswith('however'):
                continue
            if joined.startswith('Allergens'):
                cur['allergens']=joined.split(':',1)[1].strip() if ':' in joined else joined
                items.append(cur); cur=None; st='idle'; continue
            cur['raw'].append(joined)
            continue
    if cur: items.append(cur)
items.sort(key=lambda x:(x['line'],x['side']))
json.dump(items,open(sys.argv[2],'w'),indent=1)
print(len(items))
