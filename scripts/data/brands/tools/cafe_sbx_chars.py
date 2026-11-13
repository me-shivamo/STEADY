# usage: cafe_sbx_chars.py PDF PAGE TOP0 TOP1 X0 X1
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pdfplumber
pdf, n, t0, t1, x0, x1 = sys.argv[1], int(sys.argv[2]), *map(float, sys.argv[3:7])
with pdfplumber.open(pdf) as p:
    pg = p.pages[n - 1]
    for c in sorted(pg.chars, key=lambda c: (round(c['top']), c['x0'])):
        if t0 <= c['top'] <= t1 and x0 <= c['x0'] <= x1:
            print(repr(c['text']), round(c['x0'], 1), round(c['top'], 1), round(c['size'], 2), c['fontname'], c['upright'], [round(v, 2) for v in c['matrix']], c.get('non_stroking_color'))
