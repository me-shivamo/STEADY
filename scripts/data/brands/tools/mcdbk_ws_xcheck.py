# usage: python3 -I mcdbk_ws_xcheck.py <words.tsv> <ws_rows.json>
# Finds data lines in the word dump (serve size + kcal) that the table extractor did not return.
import sys, json, re
rows = json.load(open(sys.argv[2]))
have = set()
for r in rows:
    for t in (r['kcal'] or '').split(): have.add(t)
ws = []
for line in open(sys.argv[1], encoding='utf-8'):
    if line.startswith('#'): continue
    x0, top, x1, bot, size, font, text = line.rstrip('\n').split('\t')
    ws.append((float(top), float(x0), text))
ws.sort()
lines = []
for w in ws:
    if lines and abs(w[0] - lines[-1][0]) <= 2.5: lines[-1][1].append(w)
    else: lines.append([w[0], [w]])
blocks = [(290, 1140), (1140, 1990), (1990, 2830)]
for bx0, bx1 in blocks:
    for top, L in lines:
        L = sorted([w for w in L if bx0 <= w[1] < bx1], key=lambda w: w[1])
        toks = [w[2] for w in L]
        for i in range(len(toks) - 2):
            if re.match(r'^\d+(\.\d+)?$', toks[i]) and toks[i + 1] in ('g', 'ml', 'm') and re.match(r'^\d', toks[i + 2]):
                k = toks[i + 2] if toks[i + 1] != 'm' else toks[i + 3]
                k = toks[i + 2]
                if k not in have and not (toks[i+1]=='m'):
                    print('NOT IN TABLE:', round(top, 1), ' '.join(toks))
                break
