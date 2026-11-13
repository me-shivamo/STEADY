# Parse Subway India "Product Nutritional & Allergen Information" PDF (Aug 2026 layout) into JSON.
# Usage: parse_subway.py file.pdf out.json
import sys, json, pdfplumber
B=[231.1,243.9,257.6,275.3,289.0,301.9,320.5,334.1,347.0,365.6,378.4,392.1,409.9,415.7,428.5,447.1,459.9,473.6,492.2,505.1,518.8,537.4]
NUM=['serving_g','kcal','fat_g','sat_fat_g','trans_fat_g','carbs_g','sugars_g','added_sugar_g','protein_g','cholesterol_mg','sodium_mg']
ALG=['gluten','crustacean','milk','egg','fish','nut','soy','sulphite']
def col_of(x):
    if x<B[0]: return 'name'
    if x<B[1]: return 'veg'
    for i in range(1,12):
        if x<B[i+1]: return NUM[i-1]
    if x<B[13]: return 'sep'
    for i in range(13,21):
        if x<B[i+1]: return ALG[i-13]
    return 'tail'
rows=[]
with pdfplumber.open(sys.argv[1]) as pdf:
    for pi,p in enumerate(pdf.pages):
        img=p.to_image(resolution=144).original.convert('RGB'); sc=144/72
        lines={}
        for c in p.chars:
            if c['text'].strip()=='' : continue
            key=round(c['top']/1.2)
            lines.setdefault(key,[]).append(c)
        # merge adjacent keys
        keys=sorted(lines)
        groups=[]
        for k in keys:
            if groups and k-groups[-1][0]<=1: groups[-1][1].extend(lines[k]); groups[-1][0]=k
            else: groups.append([k,list(lines[k])])
        for _,chars in groups:
            chars.sort(key=lambda c:c['x0'])
            cells={}; sup=[]
            for c in chars:
                col=col_of((c['x0']+c['x1'])/2)
                if col=='name' and c['size']<2.0 and c['text'].isdigit(): sup.append(c['text']); continue
                cells.setdefault(col,[]).append(c)
            def txt(cs):
                out=''; prev=None
                for c in cs:
                    if prev is not None and c['x0']-prev['x1']>c['size']*0.2: out+=' '
                    out+=c['text']; prev=c
                return out.strip()
            r={k:txt(v) for k,v in cells.items()}
            r['_sup']=''.join(sup); r['_page']=pi+1
            top=min(c['top'] for c in chars); bot=max(c['bottom'] for c in chars)
            r['_top']=round(top,1)
            r['_size']=round(max(c['size'] for c in chars if (c['x0']<B[0]) ) if any(c['x0']<B[0] for c in chars) else 0,1)
            # veg icon colour in veg column for this row band
            box=(int(B[0]*sc)+1,int((top-1.5)*sc),int(B[1]*sc)-1,int((bot+1.5)*sc))
            g=rd=0
            for (R,G,Bl) in img.crop(box).getdata():
                if max(R,G,Bl)-min(R,G,Bl)<40: continue
                if G>R and G>Bl: g+=1
                elif R>G and R>Bl: rd+=1
            r['_green']=g; r['_red']=rd
            rows.append(r)
json.dump(rows,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
for r in rows:
    print(r['_page'],r['_top'],r['_size'],'|'+r.get('_sup','')+'|',r.get('name','')[:70],'| veg g/r',r['_green'],r['_red'],'|',' '.join(r.get(k,'.') for k in NUM),'|',' '.join(r.get(k,'.') for k in ALG))
