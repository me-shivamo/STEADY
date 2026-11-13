"""Parse Dudhsagar Dairy (Amul member union) product pages -> JSON.
Usage: python3 -I amul_dd_parse.py OUT.json FILE...  (files are saved HTML pages)"""
import sys, re, json, html as H
def clean(x): return re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',x))).strip()
out=[]
for f in sys.argv[2:]:
    s=open(f,encoding='utf-8',errors='replace').read()
    rec={'file':f.split('/')[-1]}
    # product details card: label/value pairs
    m=re.search(r'Product Name</[^>]+>\s*<[^>]+>(.*?)</',s,re.S)
    rec['name']=clean(m.group(1)) if m else ''
    for lab in ['Packing','Composition','Description']:
        m=re.search(r'>\s*'+lab+r'\s*</(?:td|th|dt|div|span|strong|b)>\s*<(?:td|dd|div|span)[^>]*>(.*?)</(?:td|dd|div|span)>',s,re.S)
        rec[lab.lower()]=clean(m.group(1)) if m else ''
    tables=[]
    idxs=[m.start() for m in re.finditer('Nutritional Information',s)]
    i=-1; t=None
    for k in idxs:
        seg=s[k:k+6000]
        t=re.search(r'<table[^>]*>(.*?)</table>',seg,re.S)
        if t: i=k; break
    if idxs:
        if i<0: i=idxs[-1]; seg=s[i:i+6000]
        if t:
            rows=[]
            for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',t.group(1),re.S):
                cells=[clean(c) for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>',tr,re.S)]
                rows.append(cells)
            tables.append(rows)
        else:
            rec['nutr_text']=clean(seg[:3000])
    rec['tables']=tables
    out.append(rec)
json.dump(out,open(sys.argv[1],'w'),indent=1,ensure_ascii=False)
print(len(out))
