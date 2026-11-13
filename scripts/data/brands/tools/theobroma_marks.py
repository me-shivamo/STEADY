"""Detect FSSAI veg (green) / non-veg (brown) marks next to each card title in the
Theobroma nutrition guide. Inputs: per-page gs XML text (TextFormat=0) and per-page PPM at 72dpi.
Usage: python3 -I theobroma_marks.py <workdir> <npages>  -> prints JSON lines"""
import sys, re, json, os
wd, n = sys.argv[1], int(sys.argv[2])
def read_ppm(path):
    data=open(path,'rb').read()
    # P6 header with optional comment lines
    pos=0; fields=[]
    while len(fields)<4:
        nl=data.index(b'\n',pos); line=data[pos:nl]; pos=nl+1
        if line.startswith(b'#'): continue
        fields+=line.split()
    assert fields[0]==b'P6'
    return int(fields[1]),int(fields[2]),data[pos:]
span_re=re.compile(r'<span bbox="(\d+) (\d+) (\d+) (\d+)" font="([^"]*)" size="([\d.]+)">')
char_re=re.compile(r'<char bbox="(\d+) (\d+) (\d+) (\d+)" c="(.*?)"/>')
out=[]
for p in range(1,n+1):
    xml=open(os.path.join(wd,f'x{p:02d}.xml'),encoding='utf-8',errors='replace').read()
    chars=[]
    cur=None
    for ln in xml.split('\n'):
        m=span_re.search(ln)
        if m: cur=(m.group(5),float(m.group(6))); continue
        m=char_re.search(ln)
        if m and cur:
            x0,y0,x1,y1=map(int,m.groups()[:4]); c=m.group(5)
            c=c.replace('&amp;','&').replace('&quot;','"').replace('&lt;','<').replace('&gt;','>').replace('&apos;',"'")
            chars.append((y0,x0,c,cur[0],cur[1]))
    # title chars: bold, size >= 10
    rows={}
    for y,x,c,f,s in chars:
        if 'Bold' in f and s>=10 and s<12:
            col=0 if x<298 else 1
            rows.setdefault((y,col),[]).append((x,c))
    w,h,px=read_ppm(os.path.join(wd,f'r{p:02d}.ppm'))
    def pix(x,y):
        i=(y*w+x)*3; return px[i],px[i+1],px[i+2]
    for (y,col),cs in sorted(rows.items()):
        cs.sort(); text=''.join(c for _,c in cs).strip()
        if not text: continue
        xr = 298 if col==0 else 575
        g=b=0
        for yy in range(max(0,y-14),min(h,y+8)):
            for xx in range(xr-45,min(w,xr)):
                r_,g_,b_=pix(xx,yy)
                if g_>r_+50 and g_>b_+20: g+=1
                elif r_>g_+50 and r_>b_+40: b+=1
        out.append({'page':p,'y':y,'col':col,'title':text,'green':g,'brown':b})
for o in out: print(json.dumps(o))
