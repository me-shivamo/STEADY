# Shared helpers for the McDonald's India / Burger King India CSV builders (imported via explicit sys.path).
import csv, re
COLS = ['brand', 'country', 'item', 'variant_or_size', 'serving_desc', 'serving_g', 'serving_ml', 'kcal', 'protein_g', 'carbs_g',
        'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'veg_nonveg', 'source_url', 'source_title', 'source_date_or_version',
        'page_or_section', 'notes']
SIZE_WORDS = r'(Small|Regular|Medium|Large|King|Mini)'
def split_variant(name):
    n = name.strip()
    m = re.match(r'^(.*?)\s*\((S|R|L)\)$', n)
    if m: return m.group(1).strip(), {'S': 'Small (S)', 'R': 'Regular (R)', 'L': 'Large (L)'}[m.group(2)]
    m = re.match(r'^(.*?)\s+(\d+\s*o[zZ])$', n)
    if m: return m.group(1).strip(), m.group(2)
    m = re.match(r'^(.*?)\s*\((\d+\s*(?:pc|pcs|Pcs|piece))\)$', n)
    if m: return m.group(1).strip(), m.group(2)
    m = re.match(r'^(.*?)\s+(\d+\s*(?:pc|pcs|Pcs|piece))$', n)
    if m: return m.group(1).strip(), m.group(2)
    m = re.match(r'^(\d+)\s+piece\s+(.*)$', n)
    if m: return m.group(2).strip(), m.group(1) + ' piece'
    m = re.match(r'^(.*?)\s+' + SIZE_WORDS + r'\s+(with .*)$', n)
    if m: return (m.group(1) + ' ' + m.group(3)).strip(), m.group(2)
    m = re.match(r'^' + SIZE_WORDS + r'\s+(.*)$', n)
    if m: return m.group(2).strip(), m.group(1)
    m = re.match(r'^(.*?)\s+' + SIZE_WORDS + r'$', n, re.I)
    if m and len(m.group(1)) > 2: return m.group(1).strip(), m.group(2)
    return n, ''
def fnum(s):
    try: return float(s)
    except Exception: return None
def atwater_note(kcal, p, c, f):
    k, p, c, f = fnum(kcal), fnum(p), fnum(c), fnum(f)
    if None in (k, p, c, f): return ''
    est = 4 * p + 4 * c + 9 * f
    if max(k, est) >= 40 and abs(k - est) > max(40, 0.25 * max(k, est)):
        return f'CHECK: published kcal {kcal} disagrees with 4P+4C+9F={est:.0f} kcal (source inconsistency, kept as published)'
    return ''
def write(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction='raise')
        w.writeheader()
        for r in rows: w.writerow({k: r.get(k, '') for k in COLS})
