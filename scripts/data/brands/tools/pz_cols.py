# Print start column of each token group (split on 2+ spaces) for given line numbers of a text file.
import sys, re
path = sys.argv[1]; lines = [int(x) for x in sys.argv[2].split(',')]
L = open(path, encoding='utf-8', errors='replace').read().split('\n')
for n in lines:
    s = L[n-1]
    print(n, [(m.start(), m.group()) for m in re.finditer(r'\S+(?: \S+)*', s)])
