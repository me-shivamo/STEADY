"""Print context windows around regex matches in an untrusted file.
Usage: python -I ctx.py FILE REGEX [before] [after] [maxhits]"""
import sys, re

path, rx = sys.argv[1], sys.argv[2]
b = int(sys.argv[3]) if len(sys.argv) > 3 else 100
a = int(sys.argv[4]) if len(sys.argv) > 4 else 200
mx = int(sys.argv[5]) if len(sys.argv) > 5 else 10
s = open(path, encoding="utf-8", errors="replace").read()
n = 0
for m in re.finditer(rx, s, re.I):
    print(f"@{m.start()}: " + s[max(0, m.start() - b): m.end() + a].replace("\n", " "))
    print("---")
    n += 1
    if n >= mx:
        break
print(f"[{n} shown; total matches: {len(re.findall(rx, s, re.I))}]")
