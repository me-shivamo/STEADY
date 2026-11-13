# List words, rects and images with positions/colors for one page. Usage: pdf_objs.py file.pdf pageno [ymin ymax]
import sys, pdfplumber
path=sys.argv[1]; pg=int(sys.argv[2])
ymin=float(sys.argv[3]) if len(sys.argv)>3 else 0; ymax=float(sys.argv[4]) if len(sys.argv)>4 else 1e9
with pdfplumber.open(path) as pdf:
    p=pdf.pages[pg-1]
    for w in p.extract_words(extra_attrs=['non_stroking_color','size']):
        if ymin<=w['top']<=ymax: print('W',round(w['x0'],1),round(w['top'],1),w['text'],w.get('non_stroking_color'),round(w['size'],1))
    for r in p.rects:
        if ymin<=r['top']<=ymax and r['width']<60: print('R',round(r['x0'],1),round(r['top'],1),round(r['width'],1),round(r['height'],1),r.get('non_stroking_color'),r.get('fill'))
    for im in p.images:
        if ymin<=im['top']<=ymax: print('I',round(im['x0'],1),round(im['top'],1),round(im['width'],1),round(im['height'],1))
    print('counts words',len(p.extract_words()),'rects',len(p.rects),'images',len(p.images),'curves',len(p.curves),'lines',len(p.lines))
