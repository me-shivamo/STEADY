# Cross-check manually transcribed Domino's values against OCR token bags (4 OCR variants per image).
# usage: python3 -I pz_dom_ocrcheck.py recs.json ocr_dir
import sys, json, os, re, csv, collections
recs = json.load(open(sys.argv[1])); od = sys.argv[2]
bags = {}
def bag(img):
    if img in bags: return bags[img]
    s = collections.Counter(); found = False
    for suf in ('_g', '_t120', '_t150', '_t180'):
        p = os.path.join(od, img + suf + '.tsv')
        if not os.path.exists(p): continue
        found = True
        for row in csv.reader(open(p, encoding='utf-8', errors='replace'), delimiter='\t', quoting=csv.QUOTE_NONE):
            if len(row) < 12 or row[0] == 'level': continue
            t = re.sub(r'[^0-9]', '', row[11])
            if t: s[t] += 1
    bags[img] = s if found else None
    return bags[img]
def dig(x): return re.sub(r'[^0-9]', '', x)
tot = chk = miss = 0; nob = set(); misses = collections.defaultdict(list)
for r in recs:
    b = bag(r['img'])
    if b is None: nob.add(r['img']); continue
    for k in ('E', 'P', 'C', 'TS', 'F', 'SF', 'CH', 'NA'):
        v = r['vals'].get(k)
        if v in (None, '-'): continue
        d = dig(v)
        if len(d) < 3: continue
        tot += 1
        if any(d in t for t in b): chk += 1
        else:
            miss += 1; misses[r['img']].append(f"{r['item'][:28]} {r['crust']}/{r['size']} {k}={v}")
print('checked', tot, 'ocr-confirmed', chk, 'unconfirmed', miss, 'no-ocr-yet', sorted(nob))
for img in sorted(misses):
    print(img, len(misses[img]), '|', '; '.join(misses[img])[:900])
