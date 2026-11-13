# Show rows of a page from words json: y and words with x0
import sys, json
d = json.load(open(sys.argv[1])); page = int(sys.argv[2])
for r in d[page-1]['rows']:
    print(r['y'], ' '.join(f"{w[2]}@{w[0]}" for w in r['words'])[:400])
