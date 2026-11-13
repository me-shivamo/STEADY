# Group chars into visual rows (by top) and tokens (by x-gap) regardless of 'upright'. Usage: pdf_rows.py file.pdf pages(e.g. 4-6) [gap]
import sys, pdfplumber
f=sys.argv[1]; a,_,b=sys.argv[2].partition('-'); gapk=float(sys.argv[3]) if len(sys.argv)>3 else 0.6
with pdfplumber.open(f) as pdf:
    for pi in range(int(a)-1,int(b or a)):
        p=pdf.pages[pi]; print(f'=== PAGE {pi+1}')
        chars=[c for c in p.chars]
        chars.sort(key=lambda c:(round(c['top'],0),c['x0']))
        rows=[]
        for c in sorted(chars,key=lambda c:c['top']):
            for r in rows:
                if abs(r['top']-c['top'])<1.5: r['cs'].append(c); break
            else: rows.append({'top':c['top'],'cs':[c]})
        for r in sorted(rows,key=lambda r:r['top']):
            cs=sorted(r['cs'],key=lambda c:c['x0']); toks=[]; cur=None
            for c in cs:
                if cur and c['x0']-cur['x1']<=c['size']*gapk*0.5:
                    cur['t']+=c['text']; cur['x1']=c['x1']
                else:
                    if cur: toks.append(cur)
                    cur={'t':c['text'],'x0':c['x0'],'x1':c['x1']}
            if cur: toks.append(cur)
            toks=[t for t in toks if t['t'].strip()]
            print(f"{r['top']:6.1f} "+'  '.join(f"[{t['x0']:.0f}]{t['t'].strip()}" for t in toks))
