# Print unique context snippets around regex matches in a text file. Usage: grep_ctx.py file regex [width] [max]
import sys,re
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
w=int(sys.argv[3]) if len(sys.argv)>3 else 80; mx=int(sys.argv[4]) if len(sys.argv)>4 else 60
seen=set(); n=0
for m in re.finditer(sys.argv[2],s,re.I):
    snip=s[max(0,m.start()-w):m.end()+w].replace('\n',' ')
    k=snip[:60]
    if k in seen: continue
    seen.add(k); print('>>',snip); n+=1
    if n>=mx: break
