# usage: python3 -I mcdbk_rows.py <words.tsv> [xmin] [xmax] [ytol]
# Groups words into visual rows; prints "top | x:text ..." for inspection.
import sys
f = sys.argv[1]; xmin = float(sys.argv[2]) if len(sys.argv) > 2 else -1; xmax = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
ytol = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
ws = []
for line in open(f, encoding='utf-8'):
    if line.startswith('#'): continue
    x0, top, x1, bot, size, font, text = line.rstrip('\n').split('\t')
    x0, top, x1 = float(x0), float(top), float(x1)
    if xmin <= x0 < xmax: ws.append((top, x0, x1, text))
ws.sort()
rows = []
for w in ws:
    if rows and abs(w[0] - rows[-1][0]) <= ytol: rows[-1][1].append(w)
    else: rows.append([w[0], [w]])
for top, r in rows:
    r.sort(key=lambda w: w[1])
    print(f"{top:7.1f} | " + "  ".join(f"{w[1]:.0f}:{w[3]}" for w in r))
