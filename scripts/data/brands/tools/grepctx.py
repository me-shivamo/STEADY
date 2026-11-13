import sys, re
path, pat = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 120
data = open(path, 'rb').read().decode('utf-8', 'replace')
seen = 0
for m in re.finditer(pat, data, re.I):
    s = max(0, m.start() - w); e = min(len(data), m.end() + w)
    print('---', m.start(), repr(data[s:e]))
    seen += 1
    if seen > 40: break
print('matches', seen)
