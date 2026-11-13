"""Group gs txtwrite XML (TextFormat=0) chars into words with coordinates.
Usage: python3 -I pdfwords.py in.xml out.json"""
import sys, re, json, html
span_re=re.compile(r'<span bbox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)" font="([^"]*)" size="([\d.]+)">')
char_re=re.compile(r'<char bbox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)" c="(.*?)"/>')
chars=[]; cur=None; page=0
for ln in open(sys.argv[1],encoding='utf-8',errors='replace'):
    if '<page' in ln: page+=1
    m=span_re.search(ln)
    if m: cur=(m.group(5),float(m.group(6))); continue
    m=char_re.search(ln)
    if m and cur:
        x0,y0,x1,y1=map(float,m.groups()[:4]); c=html.unescape(m.group(5))
        chars.append(dict(p=page,x0=x0,x1=x1,y=y0,c=c,f=cur[0],s=cur[1]))
chars.sort(key=lambda c:(c['p'],round(c['y']),c['x0']))
words=[]
for c in chars:
    if c['c'].strip()=='' :
        if words: words[-1]['gap']=True
        continue
    w=words[-1] if words else None
    if w and w['p']==c['p'] and abs(w['y']-c['y'])<=1 and -2.5<=c["x0"]-w["x1"]<=2.5 and not w.get('gap'):
        w['t']+=c['c']; w['x1']=max(w['x1'],c['x1'])
    elif w and w['p']==c['p'] and abs(w['y']-c['y'])<=1 and w.get('gap') and 0<=c['x0']-w['x1']<=4.5 and not re.match(r'^[<\d.]+$',w['t']):
        w['t']+=' '+c['c']; w['x1']=max(w['x1'],c['x1']); w['gap']=False
    else:
        words.append(dict(p=c['p'],x0=c['x0'],x1=c['x1'],y=c['y'],t=c['c'],s=c['s']))
for w in words: w.pop('gap',None)
json.dump(words,open(sys.argv[2],'w'),indent=0)
print(len(words))
