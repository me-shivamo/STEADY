# Summarize images on a page by x-column and their mean color. Usage: pdf_imgs.py file.pdf page xmin xmax
import sys, pdfplumber
path=sys.argv[1]; pg=int(sys.argv[2]); xmin=float(sys.argv[3]); xmax=float(sys.argv[4])
with pdfplumber.open(path) as pdf:
    p=pdf.pages[pg-1]
    print('images',len(p.images),'curves',len(p.curves),'chars',len(p.chars))
    for im in p.images:
        if xmin<=im['x0']<=xmax:
            print(round(im['x0'],1),round(im['top'],1),round(im['width'],1),round(im['height'],1),im.get('name'),im.get('srcsize'),im.get('colorspace'))
    for c in p.curves:
        if xmin<=c['x0']<=xmax:
            print('C',round(c['x0'],1),round(c['top'],1),c.get('non_stroking_color'),c.get('stroking_color'))
