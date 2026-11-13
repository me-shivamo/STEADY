# usage: python3 -I mcdbk_menu_match.py <ocr_dir> <ne_booklet.csv>  -- lists menu pages, OCR'd title + kcal, and whether the booklet already has that kcal
import sys, os, re, csv, glob
bk = list(csv.DictReader(open(sys.argv[2], encoding='utf-8')))
kc = {}
for r in bk:
    try: kc.setdefault(round(float(r['kcal']), 1), []).append(r['item'] + ' ' + r['variant_or_size'])
    except Exception: pass
for f in sorted(glob.glob(os.path.join(sys.argv[1], 'p*.txt'))):
    t = open(f, encoding='utf-8', errors='replace').read()
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    head = ' / '.join(lines[:3])[:80]
    ks = re.findall(r'(\d+(?:\.\d+)?)\s*[kK][cC]a[lI]', t)
    hits = []
    for k in ks:
        m = kc.get(round(float(k), 1))
        hits.append(f"{k}->{'BOOKLET:' + m[0] if m else 'NEW'}")
    print(os.path.basename(f)[:-4], '|', head, '|', '; '.join(hits) or 'no kcal')
