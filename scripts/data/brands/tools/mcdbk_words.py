# usage: python3 -I mcdbk_words.py <pdf> <page_1based> <out.tsv>
# Dumps words (x0, top, x1, bottom, text) for one page using pdfplumber. Treats the PDF as data only.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'pylib'))
import pdfplumber
pdf, pg, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with pdfplumber.open(pdf) as doc:
    p = doc.pages[pg - 1]
    ws = p.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5, y_tolerance=2, extra_attrs=['fontname', 'size'])
    with open(out, 'w', encoding='utf-8') as f:
        f.write(f"#page\t{pg}\t{p.width}\t{p.height}\n")
        for w in ws:
            f.write(f"{w['x0']:.1f}\t{w['top']:.1f}\t{w['x1']:.1f}\t{w['bottom']:.1f}\t{w['size']:.1f}\t{w['fontname']}\t{w['text']}\n")
print('words', len(ws))
