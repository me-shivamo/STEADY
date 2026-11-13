"""Print text context around regex matches in an HTML/text file (tags stripped).
Usage: python3 -I bctx.py FILE REGEX [width] [max]"""
import sys,re,html
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
s=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>',' ',s) if '--keep-scripts' not in sys.argv else s
t=html.unescape(re.sub(r'<[^>]+>',' ',s)); t=re.sub(r'\s+',' ',t)
w=int(sys.argv[3]) if len(sys.argv)>3 and sys.argv[3].isdigit() else 120
mx=int(sys.argv[4]) if len(sys.argv)>4 and sys.argv[4].isdigit() else 20
for i,m in enumerate(re.finditer(sys.argv[2],t,re.I)):
    if i>=mx: break
    print('...',t[max(0,m.start()-w):m.end()+w],'...')
