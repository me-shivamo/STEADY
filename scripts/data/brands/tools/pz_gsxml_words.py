# Parse ghostscript txtwrite -dTextFormat=0 output into words with coordinates.
# usage: python3 -I pz_gsxml_words.py in.txt out.json
import sys, re, json, html
src, out = sys.argv[1], sys.argv[2]
pages = []; cur = None
char_re = re.compile(r'<char bbox="(-?\d+) (-?\d+) (-?\d+) (-?\d+)" c="(.*?)"/>')
for line in open(src, encoding='utf-8', errors='replace'):
    if line.startswith('<page'):
        cur = []; pages.append(cur); continue
    m = char_re.search(line)
    if m and cur is not None:
        x0, y0, x1, y1 = map(int, m.groups()[:4])
        cur.append((x0, x1, y0, html.unescape(m.group(5))))
res = []
for pi, chars in enumerate(pages, 1):
    # group by y (baseline) with tolerance
    chars.sort(key=lambda c: (c[2], c[0]))
    rows = []
    for c in chars:
        if rows and abs(rows[-1]['y'] - c[2]) <= 1:
            rows[-1]['chars'].append(c)
        else:
            rows.append({'y': c[2], 'chars': [c]})
    prow = []
    for r in rows:
        cs = sorted(r['chars'], key=lambda c: c[0])
        words = []; w = None
        for c in cs:
            if c[3].strip() == '':
                if w: words.append(w); w = None
                continue
            if w and c[0] - w[1] <= 2:
                w = [w[0], max(w[1], c[1]), w[2] + c[3]]
            else:
                if w: words.append(w)
                w = [c[0], c[1], c[3]]
        if w: words.append(w)
        if words:
            prow.append({'y': r['y'], 'words': words})
    res.append({'page': pi, 'rows': prow})
json.dump(res, open(out, 'w'), indent=0)
print('pages', len(res), 'rows', sum(len(p['rows']) for p in res))
