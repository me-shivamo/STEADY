# Append a QA note to rows whose published kcal disagrees with 4/4/9 Atwater estimate by >15%. Usage: qa_notes.py file.csv
import csv,sys
f=sys.argv[1]; rows=list(csv.DictReader(open(f))); cols=list(rows[0].keys()); n=0
def fl(x):
    try: return float(x)
    except: return None
for r in rows:
    k,p,c,fa=fl(r['kcal']),fl(r['protein_g']),fl(r['carbs_g']),fl(r['fat_g'])
    if None in (k,p,c,fa) or k<40: continue
    est=4*p+4*c+9*fa
    if abs(est-k)/k>0.15:
        r['notes']=(r['notes']+' | ' if r['notes'] else '')+f"QA: published kcal {r['kcal']} disagrees with 4/4/9 estimate from published macros ({est:.0f} kcal, {(est-k)/k:+.0%}); numbers kept as published"
        n+=1
with open(f,'w',newline='') as o:
    w=csv.DictWriter(o,fieldnames=cols); w.writeheader(); w.writerows(rows)
print(f,'QA-flagged rows:',n)
