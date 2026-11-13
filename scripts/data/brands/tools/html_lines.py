import sys,re,html
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
body=re.sub(r'<script.*?</script>','',s,flags=re.S|re.I)
body=re.sub(r'<style.*?</style>','',body,flags=re.S|re.I)
txt=re.sub(r'<[^>]+>','\n',body)
txt=html.unescape(txt)
lines=[l.strip() for l in txt.split('\n') if l.strip()]
a=int(sys.argv[2]) if len(sys.argv)>2 else 0
b=int(sys.argv[3]) if len(sys.argv)>3 else len(lines)
for i in range(a,min(b,len(lines))):
    print(i,lines[i][:200])
