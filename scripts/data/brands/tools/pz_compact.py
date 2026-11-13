# Print compact view of a gs txtwrite dump: collapse whitespace, drop allergen filler lines.
import sys, re
path = sys.argv[1]
drop = re.compile(r'^\s*(Contains Cereals containing|Gluten \(Wheat\), Soya and|Milk & Milk Products\.?|Contains Cereals containing Gluten.*)\s*$')
for i, line in enumerate(open(path, encoding='utf-8', errors='replace'), 1):
    if drop.match(line) or not line.strip():
        continue
    s = re.sub(r'\s{2,}', ' | ', line.strip())
    print(f'{i}: {s}')
