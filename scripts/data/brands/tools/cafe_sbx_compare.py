# usage: cafe_sbx_compare.py merged_live.json merged_feb.json
import sys, json, re, collections
def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower())
A = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2]))
ka = collections.defaultdict(list); kb = collections.defaultdict(list)
for r in A: ka[(norm(r['product']), r['nums'][0])].append(r['nums'][1])
for r in B: kb[(norm(r['product']), r['nums'][0])].append(r['nums'][1])
common = set(ka) & set(kb)
diff = [(k, ka[k], kb[k]) for k in common if sorted(ka[k]) != sorted(kb[k])]
print('live keys', len(ka), 'feb keys', len(kb), 'common', len(common), 'kcal differ', len(diff))
for d in sorted(diff)[:40]: print('DIFF', d)
onlyb = sorted(set(kb) - set(ka)); onlya = sorted(set(ka) - set(kb))
print('only in feb2026', len(onlyb)); print([k[0] for k in onlyb][:200])
print('only in live', len(onlya)); print([k[0] for k in onlya][:120])
