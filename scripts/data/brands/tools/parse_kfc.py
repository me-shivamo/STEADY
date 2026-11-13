# Parse KFC India "Menu Card Nutrition & Allergen Information Booklet" (V6 layout) into JSON rows.
# Columns are located from each page's own header labels; tokens are assigned to the nearest header centre,
# and to the nearest "values row" (a visual row that has a kcal value) so wrapped product names are joined.
# Usage: parse_kfc.py file.pdf out.json firstpage lastpage
import sys, json, re, pdfplumber
f,out=sys.argv[1],sys.argv[2]; a,b=int(sys.argv[3]),int(sys.argv[4])
NUMRE=re.compile(r'^\d+(\.\d+)?$')
def tokens(p):
    rows=[]
    for c in sorted(p.chars,key=lambda c:c['top']):
        for r in rows:
            if abs(r['top']-c['top'])<1.5: r['cs'].append(c); break
        else: rows.append({'top':c['top'],'cs':[c]})
    toks=[]
    for r in rows:
        cs=sorted(r['cs'],key=lambda c:c['x0']); cur=None
        for c in cs:
            if cur and c['x0']-cur['x1']<=c['size']*0.3:
                cur['t']+=c['text']; cur['x1']=c['x1']
            else:
                if cur: toks.append(cur)
                cur={'t':c['text'],'x0':c['x0'],'x1':c['x1'],'top':r['top'],'size':c['size']}
        if cur: toks.append(cur)
    for t in toks: t['t']=' '.join(t['t'].split()); t['xc']=(t['x0']+t['x1'])/2
    return [t for t in toks if t['t']]
res=[]
with pdfplumber.open(f) as pdf:
    for pi in range(a-1,b):
        p=pdf.pages[pi]; T=tokens(p)
        # header
        hdr=[t for t in T if t['top']<110 and t['size']<12]
        def find(txt,cond=lambda t:True):
            return [t for t in hdr if t['t']==txt and cond(t)]
        cols={}
        def put(k,t): cols[k]=t['xc']
        try:
            put('weight',find('Weight in gm')[0]); put('servings',find('servings')[0]); put('kcal',find('Kcal / Per Serve')[0])
            gs=sorted(find('gm/serve'),key=lambda t:t['x0'])
            for k,t in zip(['carbs','protein','fat','trans','mufa','pufa','sat','sugar'],gs): put(k,t)
            put('sodium',find('mg/serve')[0]); put('pct_sat',find('sat fat')[0]); put('pct_sodium',find('sodium')[0])
            put('pct_fat',find('fat')[0]); put('pct_trans',find('trans fat')[0])
            put('allergens',find('Allergens Contains')[0]); put('msg',find('MSG')[0]); put('caff_sweet',find('Sweetner')[0])
            vegt=find('VEG')[0]; vegc=vegt['xc']
        except IndexError as e:
            print('HEADER FAIL page',pi+1,[ (t['t'],round(t['x0'])) for t in hdr]); continue
        assert len(gs)==8, (pi+1,len(gs))
        hb=find('Kcal / Per Serve')[0]['top']+6.5
        ai_top=min([t['top'] for t in T if t['t'].startswith('Allergen Information')]+[500])
        body=[t for t in T if hb<t['top']<ai_top-2 ]
        anchors=sorted(set(round(t['top'],1) for t in body if NUMRE.match(t['t']) and abs(t['xc']-cols['kcal'])<12))
        # section titles: rows without numbers, centred tokens x0>380
        sections=[(t['top'],t['t']) for t in body if t['x0']>380 and not NUMRE.match(t['t']) and t['t'] not in('Yes','No') and abs(t['xc']-cols['kcal'])>30 and not any(abs(t['top']-an)<9 for an in anchors)]
        img=p.to_image(resolution=144).original.convert('RGB'); sc=2
        for ai,an in enumerate(anchors):
            prev=anchors[ai-1] if ai else -1e9; nxt=anchors[ai+1] if ai+1<len(anchors) else 1e9
            mine=[t for t in body if abs(t['top']-an)<=min(abs(t['top']-prev),abs(t['top']-nxt)) and abs(t['top']-an)<12]
            row={'page':pi+1,'top':an}
            name=[]
            for t in sorted(mine,key=lambda t:(round(t['top']),t['x0'])):
                if t['xc']<vegc-12: name.append(t['t']); continue
                k=min(cols,key=lambda k:abs(cols[k]-t['xc']))
                if abs(cols[k]-t['xc'])>25: row.setdefault('_unassigned',[]).append(t['t']); continue
                row[k]=(row[k]+' '+t['t']) if k in row else t['t']
            row['name']=' '.join(name)
            sec=[s for s in sections if s[0]<an]
            row['section']=sec[-1][1] if sec else ''
            # veg icon colour
            x0=int((vegc-14)*sc); x1=int((cols['weight']-cols['weight']*0+0)*sc)
            x1=int(((vegc+cols['weight'])/2+6)*sc)
            box=(x0,int((an-5)*sc),x1,int((an+9)*sc))
            g=r=0
            for (R,G,B) in img.crop(box).getdata():
                if max(R,G,B)-min(R,G,B)<50: continue
                if G>R: g+=1
                elif R>G: r+=1
            row['_green']=g; row['_red']=r
            res.append(row)
json.dump(res,open(out,'w'),indent=1)
K=['weight','servings','kcal','carbs','protein','fat','pct_fat','trans','pct_trans','mufa','pufa','sat','pct_sat','sodium','pct_sodium','sugar','allergens','msg','caff_sweet']
for r in res:
    print(r['page'],'|',r['section'][:22],'|',r['name'][:70],'| g/r',r['_green'],r['_red'],'|',' '.join(r.get(k,'.') for k in K),'|',r.get('_unassigned',''))
