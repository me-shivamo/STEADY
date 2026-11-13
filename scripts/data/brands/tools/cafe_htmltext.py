# usage: cafe_htmltext.py file [needle] [window]
import sys,re,html
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
s=re.sub(r'(?is)<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>','',s)
t=html.unescape(re.sub(r'<[^>]+>',' ',s)); t=re.sub(r'\s+',' ',t)
if len(sys.argv)>2:
    w=int(sys.argv[3]) if len(sys.argv)>3 else 300
    for m in re.finditer(sys.argv[2],t,re.I):
        print('...',t[max(0,m.start()-w):m.end()+w],'...')
else: print(t)
