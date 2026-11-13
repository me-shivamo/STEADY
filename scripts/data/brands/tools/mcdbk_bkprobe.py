import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
with pdfplumber.open(sys.argv[1]) as doc:
    for i, p in enumerate(doc.pages):
        xs = sorted(set(round(r['x0'], 0) for r in p.rects if (r['x1'] - r['x0']) < 1.5 and (r['bottom'] - r['top']) > 5))
        imgs = [(round(o['x0']), round(o['top'])) for o in p.images if 255 < o['x0'] < 285]
        print('page', i + 1, 'vlines', xs)
        print('  veg-col images', len(imgs), imgs[:5])
