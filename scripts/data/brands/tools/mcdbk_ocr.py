# usage: python3 -I mcdbk_ocr.py <pdf> <outdir> <dpi>  -- renders each page and OCRs it with tesseract (local)
import sys, os, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
pdf, outdir, dpi = sys.argv[1], sys.argv[2], int(sys.argv[3])
with pdfplumber.open(pdf) as doc:
    for i, p in enumerate(doc.pages):
        png = os.path.join(outdir, f'p{i+1:02d}.png')
        p.to_image(resolution=dpi).original.convert('L').save(png)
        subprocess.run(['tesseract', png, os.path.join(outdir, f'p{i+1:02d}'), '--psm', '3'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('done', i + 1, flush=True)
