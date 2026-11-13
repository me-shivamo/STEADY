# Render a page region to PNG. Usage: render_crop.py file.pdf page x0 top x1 bottom out.png [res]
import sys, pdfplumber
f,pg,x0,t,x1,b,out=sys.argv[1],int(sys.argv[2]),*map(float,sys.argv[3:7]),sys.argv[7]
res=int(sys.argv[8]) if len(sys.argv)>8 else 200
with pdfplumber.open(f) as pdf:
    p=pdf.pages[pg-1].crop((x0,t,x1,b))
    p.to_image(resolution=res).save(out)
