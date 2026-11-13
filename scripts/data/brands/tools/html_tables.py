# Extract all <table> rows from an HTML file as TSV; prints table index + section headers.
import sys
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.tables=[]; s.stack=[]; s.cell=None; s.row=None; s.skip=0
    def handle_starttag(s,t,a):
        if t in('script','style'): s.skip+=1
        if t=='table': s.stack.append([]); 
        elif t=='tr' and s.stack: s.row=[]
        elif t in('td','th') and s.row is not None:
            s.cell=[]; s.span=dict(a).get('colspan')
    def handle_endtag(s,t):
        if t in('script','style'): s.skip-=1
        if t in('td','th') and s.cell is not None and s.row is not None:
            txt=' '.join(''.join(s.cell).split())
            s.row.append(txt+('' if not s.span else f'[cs={s.span}]')); s.cell=None
        elif t=='tr' and s.row is not None and s.stack:
            s.stack[-1].append(s.row); s.row=None
        elif t=='table' and s.stack:
            s.tables.append(s.stack.pop())
    def handle_data(s,d):
        if s.skip: return
        if s.cell is not None: s.cell.append(d)
p=P(); p.feed(open(sys.argv[1],encoding='utf-8',errors='replace').read())
for i,t in enumerate(p.tables):
    print(f'### TABLE {i} rows={len(t)}')
    for r in t: print('\t'.join(r))
