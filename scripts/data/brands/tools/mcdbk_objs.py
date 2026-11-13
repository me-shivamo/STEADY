# usage: python3 -I mcdbk_objs.py <pdf> <page> [xmin xmax]
# Lists filled vector objects / images with colours in an x-range, to find veg/non-veg marks.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
pdf, pg = sys.argv[1], int(sys.argv[2])
xmin = float(sys.argv[3]) if len(sys.argv) > 3 else -1; xmax = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
with pdfplumber.open(pdf) as doc:
    p = doc.pages[pg - 1]
    print('size', p.width, p.height, 'rects', len(p.rects), 'curves', len(p.curves), 'images', len(p.images), 'lines', len(p.lines))
    for kind in ('curves', 'rects', 'images'):
        for o in getattr(p, kind):
            if xmin <= o['x0'] < xmax and (o['x1'] - o['x0']) < 40:
                print(kind, round(o['x0'], 1), round(o['top'], 1), round(o['x1'] - o['x0'], 1), round(o['bottom'] - o['top'], 1), o.get('non_stroking_color'), o.get('stroking_color'), o.get('fill'), o.get('name', ''))
