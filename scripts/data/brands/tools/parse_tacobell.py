# Parse Taco Bell India "Nutritional and Allergens information" PDF (2026 layout) into JSON rows.
# Usage: parse_tacobell.py file.pdf out.json
import sys, json, hashlib, pdfplumber
VEG={'a744ad2d':'veg','d2c29035':'non-veg'}  # from the PDF's own legend (bottom-left)
COLS=[(17.3,42.1,'sn'),(42.1,141.0,'name'),(221.5,256.2,'serve'),(256.2,303.8,'qty'),
      (303.8,320.3,'kcal'),(320.3,337.7,'protein'),(337.7,367.7,'carb'),(367.7,388.9,'total_sugar'),
      (388.9,410.2,'added_sugar'),(410.2,426.8,'fat'),(426.8,443.9,'sat_fat'),(443.9,465.8,'trans_fat'),
      (465.8,491.8,'cholesterol'),(491.8,515.0,'sodium')]
out=[]
with pdfplumber.open(sys.argv[1]) as pdf:
    p=pdf.pages[0]
    words=p.extract_words()
    sns=[w for w in words if w['x0']<42 and w['text'].isdigit() and 120<w['top']<1095]
    vegimgs=[(im['top'],hashlib.md5(im['stream'].get_data()).hexdigest()[:8]) for im in p.images if 140<im['x0']<180 and im['top']<1095]
    for s in sns:
        top=s['top']
        row={k:[] for _,_,k in COLS}
        for w in words:
            if abs(w['top']-top)<3.5:
                xc=(w['x0']+w['x1'])/2
                for a,b,k in COLS:
                    if a<=xc<b: row[k].append(w['text']); break
        row={k:' '.join(v) for k,v in row.items()}
        cands=[h for t,h in vegimgs if abs((t+4)-(top+2))<5]
        row['veg_img']=','.join(cands)
        row['veg']=','.join(VEG.get(h,'?'+h) for h in cands)
        row['top']=round(top,1)
        out.append(row)
json.dump(out,open(sys.argv[2],'w'),indent=1)
for r in out: print(r['sn'],'|',r['name'],'|',r['veg'],'|',r['serve'],'|',r['qty'],'|',r['kcal'],r['protein'],r['carb'],r['total_sugar'],r['added_sugar'],r['fat'],r['sat_fat'],r['trans_fat'],r['cholesterol'],r['sodium'])
