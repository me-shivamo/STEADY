# usage: cafe_render.py PDF PAGE OUT.png [scale]
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pypdfium2 as pdfium
pdf = pdfium.PdfDocument(sys.argv[1]); i = int(sys.argv[2]) - 1
sc = float(sys.argv[4]) if len(sys.argv) > 4 else 2
pdf[i].render(scale=sc).to_pil().save(sys.argv[3])
