# usage: python3 -I mcdbk_tables.py <pdf> <page> [page...]  -- prints pdfplumber ruled-table extraction
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
with pdfplumber.open(sys.argv[1]) as doc:
    for pg in sys.argv[2:]:
        p = doc.pages[int(pg) - 1]
        for t in p.extract_tables():
            print('== page', pg)
            for row in t: print(json.dumps(row, ensure_ascii=False))
