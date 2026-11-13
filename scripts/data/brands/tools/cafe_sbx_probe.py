# usage: cafe_sbx_probe.py PDF PAGE  -> dumps tabs rects/colours, header columns, word lines
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pdfplumber
with pdfplumber.open(sys.argv[1]) as p:
    pg = p.pages[int(sys.argv[2]) - 1]
    for r in pg.rects:
        if r['top'] < 60 and r['width'] > 40:
            print('RECT', round(r['x0']), round(r['top']), round(r['width']), round(r['height']), r.get('non_stroking_color'))
    nu = [c for c in pg.chars if not c.get('upright', True)]
    cols = collections.defaultdict(list)
    for c in nu: cols[round(c['x0'] / 4)].append(c)
    for k in sorted(cols):
        cs = sorted(cols[k], key=lambda c: -c['top'])
        print('HDR', round(cs[0]['x0']), ''.join(c['text'] for c in cs))
    ws = pg.extract_words(extra_attrs=['upright', 'size'])
    ws = [w for w in ws if w['upright']]
    lines = collections.defaultdict(list)
    for w in ws: lines[round(w['top'] / 3)].append(w)
    for k in sorted(lines)[:40]:
        print('LINE', k * 3, ' | '.join(f"{w['text']}@{round(w['x0'])}" for w in sorted(lines[k], key=lambda w: w['x0'])))
