# Minimal binary PPM (P6) reader + region color summary.
import sys
def read_ppm(path):
    data = open(path, 'rb').read()
    # parse header tokens
    toks = []; i = 0
    while len(toks) < 4:
        while data[i:i+1].isspace(): i += 1
        if data[i:i+1] == b'#':
            while data[i:i+1] not in (b'\n', b''): i += 1
            continue
        j = i
        while not data[j:j+1].isspace(): j += 1
        toks.append(data[i:j]); i = j
    i += 1
    assert toks[0] == b'P6'
    w, h, mx = int(toks[1]), int(toks[2]), int(toks[3])
    return w, h, data[i:]
def px(img, x, y):
    w, h, d = img
    o = (y * w + x) * 3
    return d[o], d[o+1], d[o+2]
def classify(rgb):
    r, g, b = rgb
    if r > 200 and g > 200 and b > 200: return None  # white-ish
    if max(r, g, b) - min(r, g, b) < 25: return None  # grey/black text
    if g > r + 30 and g > b: return 'G'
    if r > g + 30: return 'R'
    return None
if __name__ == '__main__':
    img = read_ppm(sys.argv[1])
    x0, x1, y0, y1 = map(int, sys.argv[2:6])
    from collections import Counter
    c = Counter()
    for y in range(y0, y1):
        for x in range(x0, x1):
            c[px(img, x, y)] += 1
    print(img[0], img[1], c.most_common(8))
