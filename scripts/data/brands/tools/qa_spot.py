#!/usr/bin/env python3
"""Random transcription audit: does each sampled row's kcal/protein/carbs/fat appear together
on one text line of the cited PDF page? Only for text-layer PDFs.

usage: python3 -I qa_spot.py <combined_csv> <work_dir> <slug>=<pdf_path> [...]
The PDF is only read by ghostscript's txtwrite device (-dSAFER); nothing in it is executed.
"""
import csv
import os
import random
import re
import subprocess
import sys

PAGE_RES = [r'^p\.?\s*(\d+)\b', r'pdf page (\d+)', r'^p(\d+)\b']
N_PER_BRAND = 12


def page_of(s):
    s = s.strip().lower()
    for rx in PAGE_RES:
        m = re.search(rx, s)
        if m:
            return int(m.group(1))
    return None


def page_text(pdf, page, work):
    out = os.path.join(work, 'spot_%s_p%d.txt' % (re.sub(r'\W', '_', os.path.basename(pdf)), page))
    if not os.path.exists(out):
        subprocess.run(['gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=txtwrite',
                        '-dFirstPage=%d' % page, '-dLastPage=%d' % page, '-sOutputFile=' + out, pdf],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    try:
        return open(out, encoding='utf-8', errors='replace').read()
    except OSError:
        return ''


def main():
    combined, work = sys.argv[1], sys.argv[2]
    mode = 'line'
    args = sys.argv[3:]
    if args and args[0] == '--page':
        mode, args = 'page', args[1:]
    pdfs = dict(a.split('=', 1) for a in args)
    rows = list(csv.DictReader(open(combined, newline='', encoding='utf-8')))
    rnd = random.Random(20261113)
    total = ok = 0
    misses = []
    for slug, pdf in pdfs.items():
        cand = [r for r in rows if r['brand_slug'] == slug and page_of(r['page_or_section'])]
        sample = rnd.sample(cand, min(N_PER_BRAND, len(cand)))
        hit = 0
        for r in sample:
            pg = page_of(r['page_or_section'])
            txt = page_text(pdf, pg, work)
            want = [r[c].strip() for c in ('kcal', 'protein_g', 'carbs_g', 'fat_g') if r[c].strip()]
            found = False
            for line in txt.splitlines():
                toks = set(re.findall(r'\d+(?:\.\d+)?', line))
                if all(w in toks for w in want):
                    found = True
                    break
            if not found:  # per-item panel layouts print one value per line: accept page-level presence
                ptoks = set(re.findall(r'\d+(?:\.\d+)?', txt))
                found = all(w in ptoks for w in want) and mode == 'page'
            total += 1
            if found:
                ok += 1
                hit += 1
            else:
                misses.append((slug, r['source_row'], r['item'], pg, want))
        print('%-28s sampled %2d  values found on cited page line: %2d' % (slug, len(sample), hit))
    print('TOTAL', total, 'found', ok)
    for m in misses:
        print('  miss', m)


if __name__ == '__main__':
    main()
