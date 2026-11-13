# Sanity-check a brand CSV: Atwater energy vs kcal, missing fields, duplicates. Usage: check_csv.py file.csv
import csv,sys,collections
rows=list(csv.DictReader(open(sys.argv[1])))
def f(x):
    try: return float(x)
    except: return None
print('rows',len(rows))
dup=collections.Counter((r['item'],r['variant_or_size']) for r in rows)
print('duplicate keys',[k for k,v in dup.items() if v>1])
for r in rows:
    k,p,c,fa=f(r['kcal']),f(r['protein_g']),f(r['carbs_g']),f(r['fat_g'])
    if None in (k,p,c,fa): print('MISSING',r['item'],r['variant_or_size'],r['kcal'],r['protein_g'],r['carbs_g'],r['fat_g']); continue
    est=4*p+4*c+9*fa
    if k>=40 and abs(est-k)/k>0.15: print(f"ATWATER {r['item']} | {r['variant_or_size']} kcal={k} est={est:.0f} ({(est-k)/k:+.0%})")
