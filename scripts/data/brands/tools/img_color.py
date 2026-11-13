# Render page and report mean RGB of regions around images with given hashes. Usage: img_color.py file.pdf page
import sys, hashlib, pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    p=pdf.pages[int(sys.argv[2])-1]
    im=p.to_image(resolution=150).original.convert('RGB')
    sc=150/72; seen={}
    for o in p.images:
        h=hashlib.md5(o['stream'].get_data()).hexdigest()[:8]
        if h in seen: continue
        box=(int(o['x0']*sc),int(o['top']*sc),int(o['x1']*sc),int(o['bottom']*sc))
        px=list(im.crop(box).getdata())
        nonwhite=[q for q in px if sum(q)<700]
        if nonwhite:
            avg=tuple(sum(c[i] for c in nonwhite)//len(nonwhite) for i in range(3))
        else: avg=None
        seen[h]=(avg,len(nonwhite),len(px))
    for h,v in seen.items(): print(h,v)
