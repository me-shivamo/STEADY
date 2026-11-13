# For unconfirmed values on template pages, crop the exact table cell, upscale, OCR it alone (digits only) and compare.
# usage: python3 -I pz_dom_cellcheck.py recs.json mni_dir work_dir  (prints results; uses ffmpeg + tesseract via subprocess, no shell)
import sys, json, os, re, subprocess
recs = json.load(open(sys.argv[1])); mni, wd = sys.argv[2], sys.argv[3]
os.makedirs(wd, exist_ok=True)
COLX = {('NHT','Regular'):190, ('NHT','Medium'):265, ('NHT','Large'):340, ('PAN','Regular'):413, ('PAN','Medium'):477,
        ('THIN','Regular'):546, ('THIN','Medium'):609, ('CB','Regular'):677, ('CB','Medium'):740}
ROWS = ['E','E%','P','C','TS','AS','AS%','F','F%','SF','SF%','TF','TF%','CH','NA','NA%']
TEMPLATE = {f'MNI-{i:02d}' for i in range(4, 26)} | {'MNI-32', 'MNI-33'}
targets = [l.strip() for l in open(sys.argv[4])] if len(sys.argv) > 4 else None
# which table (top/bottom) each record is in: order of appearance per image
seen = {}
out = []
for r in recs:
    img = r['img']
    if img not in TEMPLATE: continue
    key = (img, r['item'])
    if key not in seen: seen[key] = len([k for k in seen if k[0] == img])
    tbl = seen[key]
    for k in ('E','P','C','TS','F','SF','CH','NA'):
        v = r['vals'].get(k)
        tag = f"{img}|{r['item']}|{r['crust']}/{r['size']}|{k}"
        if targets is not None and tag not in targets: continue
        if v in (None, '-') or (r['crust'], r['size']) not in COLX: continue
        if img == 'MNI-32' and tbl == 0: continue
        if img == 'MNI-32': tbl = 1
        x = COLX[(r['crust'], r['size'])]; y = 316 + 448 * tbl + ROWS.index(k) * 14.96
        png = os.path.join(wd, re.sub(r'[^A-Za-z0-9]+', '_', tag) + '.png')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(mni, img + '.jpg'), '-vf',
                        f'crop=74:16:{int(x-37)}:{int(y-8)},scale=iw*6:ih*6:flags=lanczos,format=gray', png], check=True)
        res = subprocess.run(['tesseract', png, 'stdout', '--psm', '7', '-c', 'tessedit_char_whitelist=0123456789.'], capture_output=True, text=True).stdout.strip()
        out.append((tag, v, res, 'OK' if res == v else 'DIFF'))
for o in out: print(' | '.join(o))
