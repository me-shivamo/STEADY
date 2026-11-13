"""Crop a binary PPM (P6) and write PNG. Usage: python3 -I ppmcrop.py in.ppm out.png x0 y0 x1 y1"""
import sys, zlib, struct
data=open(sys.argv[1],'rb').read()
pos=0; f=[]
while len(f)<4:
    nl=data.index(b'\n',pos); line=data[pos:nl]; pos=nl+1
    if line.startswith(b'#'): continue
    f+=line.split()
w,h=int(f[1]),int(f[2]); px=data[pos:]
x0,y0,x1,y1=map(int,sys.argv[3:7]); x1=min(x1,w); y1=min(y1,h)
raw=b''.join(b'\x00'+px[(y*w+x0)*3:(y*w+x1)*3] for y in range(y0,y1))
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',x1-x0,y1-y0,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b'')
open(sys.argv[2],'wb').write(png); print(w,h,'->',x1-x0,y1-y0)
