# usage: python3 -I mcdbk_sheet.py <pdf> <out.png> <dpi> <crop x0,y0,x1,y1 | full> <page> [page...]
# Renders pages (or a crop box in PDF points) and tiles them into one PNG contact sheet for visual review.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
from PIL import Image, ImageDraw
pdf, out, dpi, crop = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
pages = [int(x) for x in sys.argv[5:]]
tiles = []
with pdfplumber.open(pdf) as doc:
    for pg in pages:
        p = doc.pages[pg - 1]
        if crop != 'full':
            x0, y0, x1, y1 = [float(v) for v in crop.split(',')]
            p = p.crop((x0, y0, min(x1, p.width), min(y1, p.height)))
        im = p.to_image(resolution=dpi).original.convert('RGB')
        d = ImageDraw.Draw(im); d.rectangle([0, 0, 60, 14], fill='yellow'); d.text((2, 1), f'p{pg}', fill='black')
        tiles.append(im)
cols = int(os.environ.get('COLS', '2'))
w = max(t.width for t in tiles); h = max(t.height for t in tiles)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), 'white')
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
print(sheet.size)
