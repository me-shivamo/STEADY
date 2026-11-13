# usage: cafe_sbx_text.py PDF FIRST LAST  -> prints extracted text per page
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import pdfplumber
pdf, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
with pdfplumber.open(pdf) as p:
    print('pages', len(p.pages))
    for i in range(a-1, min(b, len(p.pages))):
        pg = p.pages[i]
        print(f'===== PAGE {i+1} size={pg.width}x{pg.height}')
        print(pg.extract_text() or '')
