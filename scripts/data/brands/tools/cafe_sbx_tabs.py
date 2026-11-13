# usage: cafe_sbx_tabs.py PDF -> per page: active tab (by tab text colour) + serving-size unit
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pdfplumber
TABX = [(31,'Beverage Core'),(126,'Beverage Moonshot'),(222,'Beverage LTO'),(318,'Beverage Reserve'),(410,'Food Core'),(505,'Food Moonshot'),(597,'Food LTO'),(691,'Food Reserve'),(785,'Food Bake in')]
with pdfplumber.open(sys.argv[1]) as p:
    for n, pg in enumerate(p.pages, 1):
        cols = {}
        for c in pg.chars:
            if c['top'] < 40 and c['text'].strip():
                tab = min(TABX, key=lambda t: abs(t[0] - c['x0']) if c['x0'] >= t[0] - 5 else 9999)
                cols.setdefault(tab[1], set()).add(str(c.get('non_stroking_color')))
        # header unit: look for chars 'l','m' near serving col x 470-500 within header band
        band = ''.join(c['text'] for c in sorted([c for c in pg.chars if 60 < c['top'] < 130 and 470 <= c['x0'] <= 500], key=lambda c: -c['top']))
        print(n, {k: sorted(v) for k, v in cols.items()}, '| servhdr:', band[-12:])
