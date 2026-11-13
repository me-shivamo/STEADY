import sys,re
d=open(sys.argv[1],encoding='utf-8',errors='replace').read()
pat=sys.argv[2]; w=int(sys.argv[3]) if len(sys.argv)>3 else 200; mx=int(sys.argv[4]) if len(sys.argv)>4 else 20
n=0
for m in re.finditer(pat,d):
    print('== @',m.start()); print(d[max(0,m.start()-w):m.end()+w]); n+=1
    if n>=mx: break
print('total', len(re.findall(pat,d)))
