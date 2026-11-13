# Dump text (layout) and tables from a PDF. Usage: pdf_text.py file.pdf [mode=text|tables|words] [pages e.g. 1-3]
import sys, pdfplumber
path=sys.argv[1]; mode=sys.argv[2] if len(sys.argv)>2 else 'text'
rng=sys.argv[3] if len(sys.argv)>3 else None
with pdfplumber.open(path) as pdf:
    print('#pages',len(pdf.pages), 'meta', pdf.metadata)
    pages=range(len(pdf.pages))
    if rng:
        a,_,b=rng.partition('-'); pages=range(int(a)-1,int(b or a))
    for i in pages:
        p=pdf.pages[i]
        print(f'=== PAGE {i+1} size={p.width}x{p.height}')
        if mode=='text':
            print(p.extract_text(layout=True))
        elif mode=='tables':
            for ti,t in enumerate(p.extract_tables()):
                print(f'--- table {ti}')
                for r in t: print(' | '.join('' if c is None else ' '.join(str(c).split()) for c in r))
        elif mode=='words':
            for w in p.extract_words(): print(round(w['x0'],1),round(w['top'],1),w['text'])
