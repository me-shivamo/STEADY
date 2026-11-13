"""Rebuild table rows from positioned words (pdfwords.py output) of Natural's nutrition PDFs.
Usage: python3 -I nat_table.py words.json out.json
Anchors = Sr.No numbers in leftmost column; every other word goes to nearest anchor by y within its section."""
import sys, json, re
ws=json.load(open(sys.argv[1]))
body=sorted(set(w['s'] for w in ws), key=lambda s: -sum(1 for w in ws if w['s']==s))[0]
out=[]
for page in sorted(set(w['p'] for w in ws)):
    pw=[w for w in ws if w['p']==page]
    titles=sorted([w for w in pw if w['s']>body*1.5 and re.match(r'^[A-Za-z ]+$',w['t'])], key=lambda w:w['y'])
    bounds=[(t['t'].strip(), t['y'], (titles[i+1]['y'] if i+1<len(titles) else 1e9)) for i,t in enumerate(titles)]
    for title,y0,y1 in bounds:
        sw=[w for w in pw if y0<w['y']<y1 and w['s']<=body*1.5]
        # Sr.No column: x of the 'Sr.' header word
        sr=[w for w in sw if w['t'].startswith('Sr')]
        if not sr: continue
        srx=sr[0]['x0']; srx1=sr[0]['x0']+12
        anchors=sorted([w for w in sw if re.match(r'^\d{1,3}$',w['t']) and srx-3<=w['x0']<=srx1], key=lambda w:w['y'])
        if not anchors: continue
        hdr=[w for w in sw if w['y']<anchors[0]['y']-3]
        # 'Energy' header gives data start, 'Allerg' header gives data end
        ex=min(w['x0'] for w in hdr if 'Energy' in w['t'])-4
        al=[w for w in hdr if w['t'].startswith('Allerg')]
        ax=min(w['x0'] for w in al)-30 if al else 1e9
        data=[w for w in sw if w['y']>=anchors[0]['y']-8 and w not in anchors]
        # foot notes start at first bullet line
        foot=[w for w in sw if re.match(r'^[••*]',w['t'])]
        fy=min([w['y'] for w in foot],default=1e9)
        data=[w for w in data if w['y']<fy-1]
        nums=[w for w in data if ex<=w['x0']<ax and re.match(r'^[<>]?\s*\d+(\.\d+)?$',w['t'])]
        cents=sorted(set(round((w['x0']+w['x1'])/2) for w in nums))
        clusters=[]
        for c in cents:
            if clusters and c-clusters[-1][-1]<=6: clusters[-1].append(c)
            else: clusters.append([c])
        cc=[sum(c)/len(c) for c in clusters]
        # header text per cluster
        htxt=[]
        for c in cc:
            hw=sorted([w for w in hdr if w['x0']-3<=c<=w['x1']+3], key=lambda w:(w['y'],w['x0']))
            htxt.append(' '.join(w['t'] for w in hw))
        rows={id(a):dict(sr=a['t'],y=a['y'],name=[],vals=[[] for _ in cc],allergen=[],decl=[]) for a in anchors}
        def near(w):
            a=min(anchors,key=lambda a:abs(a['y']-w['y']))
            return rows[id(a)], abs(a['y']-w['y'])
        for w in data:
            r,d=near(w)
            if d>9: continue
            xc=(w['x0']+w['x1'])/2
            if w in nums:
                k=min(range(len(cc)),key=lambda i:abs(cc[i]-xc)); r['vals'][k].append((w['y'],w['t']))
            elif w['x1']<ex+4: r['name'].append((round(w['y']),w['x0'],w['t']))
            elif w['x0']>=ax:
                (r['decl'] if al and w['x0']>max(x['x1'] for x in al)+60 else r['allergen']).append((round(w['y']),w['x0'],w['t']))
            else: r.setdefault('other',[]).append(w['t'])
        for a in anchors:
            r=rows[id(a)]
            r['name']=' '.join(t for _,_,t in sorted(r['name']))
            r['allergen']=' '.join(t for _,_,t in sorted(r['allergen']))
            r['decl']=' '.join(t for _,_,t in sorted(r['decl']))
            r['vals']=[' / '.join(t for _,t in sorted(v)) for v in r['vals']]
            out.append(dict(page=page,section=title,headers=htxt,**r))
        foot_txt=' '.join(w['t'] for w in sorted(foot+[w for w in sw if w['y']>=fy-1],key=lambda w:(w['y'],w['x0'])))
        out.append(dict(page=page,section=title,footnote=foot_txt))
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
print(len(out))
