# usage: cafe_ctx.py PATTERN BEFORE AFTER MAXHITS file...
import sys, re
pat = re.compile(sys.argv[1]); b = int(sys.argv[2]); a = int(sys.argv[3]); mx = int(sys.argv[4])
for p in sys.argv[5:]:
    s = open(p, encoding='utf-8', errors='replace').read()
    n = 0
    for m in pat.finditer(s):
        print(f"== {p}@{m.start()}: ...{s[max(0,m.start()-b):m.end()+a]}...")
        n += 1
        if n >= mx: break
