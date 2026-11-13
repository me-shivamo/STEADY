# usage: python3 -I mcdbk_menu_panels.py <pdf> <out.png> <page> [page...]
# For each menu page: crops the item-title band, the nutrition panel and the footnote, stacked for visual transcription.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
from PIL import Image, ImageDraw
pdf, out = sys.argv[1], sys.argv[2]
blocks = []
with pdfplumber.open(pdf) as doc:
    for pg in [int(x) for x in sys.argv[3:]]:
        p = doc.pages[pg - 1]; W, H = p.width, p.height
        parts = [(p.crop((0.03 * W, 0.165 * H, 0.75 * W, 0.245 * H)), 28), (p.crop((0.08 * W, 0.85 * H, 0.92 * W, 0.95 * H)), 50),
                 (p.crop((0.0 * W, 0.955 * H, 1.0 * W, 0.99 * H)), 40)]
        ims = [c.to_image(resolution=d).original.convert('RGB') for c, d in parts]
        w = max(i.width for i in ims); h = sum(i.height for i in ims) + 30
        b = Image.new('RGB', (w, h), 'white'); d = ImageDraw.Draw(b); d.rectangle([0, 0, 70, 16], fill='yellow'); d.text((3, 2), f'page {pg}', fill='black')
        y = 18
        for i in ims: b.paste(i, (0, y)); y += i.height + 4
        blocks.append(b)
W = max(b.width for b in blocks); H = sum(b.height for b in blocks)
s = Image.new('RGB', (W, H), 'white'); y = 0
for b in blocks: s.paste(b, (0, y)); y += b.height
s.save(out); print(s.size)
