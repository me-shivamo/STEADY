# usage: python3 -I mcdbk_cropstack.py <pdf> <page> <dpi> <out.png> x0,y0,x1,y1 [...]  -- stacks crops vertically
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
from PIL import Image
pdf, pg, dpi, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
ims = []
with pdfplumber.open(pdf) as doc:
    p = doc.pages[pg - 1]
    for b in sys.argv[5:]:
        x0, y0, x1, y1 = [float(v) for v in b.split(',')]
        ims.append(p.crop((x0, y0, x1, y1)).to_image(resolution=dpi).original.convert('RGB'))
W = max(i.width for i in ims); H = sum(i.height + 8 for i in ims)
s = Image.new('RGB', (W, H), 'white'); y = 0
for i in ims: s.paste(i, (0, y)); y += i.height + 8
s.save(out); print(s.size)
