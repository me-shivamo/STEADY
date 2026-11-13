"""Extract window.REDUX_DATA JSON from an EatSure-platform page (Behrouz/Faasos) using json.raw_decode (no eval).
Usage: python -I eatsure_extract.py PAGE.html OUT.json
Writes the decoded JSON to OUT.json and prints a short summary of products found."""
import sys, json

page, out = sys.argv[1], sys.argv[2]
s = open(page, encoding="utf-8").read()
key = "window.REDUX_DATA"
i = s.find(key)
if i < 0:
    sys.exit("no REDUX_DATA")
j = s.find("=", i) + 1
while s[j] in " \t\n":
    j += 1
end_marker = s.find("window.routeMetaData", j)
body = s[j:end_marker] if end_marker > 0 else s[j:]
import re
# replace JS `undefined` tokens that appear as values (after : [ ,) outside strings
body = re.sub(r'(?<=[:\[,])undefined(?=[,\]}])', 'null', body)
dec = json.JSONDecoder()
obj, end = dec.raw_decode(body, 0)
json.dump(obj, open(out, "w", encoding="utf-8"), ensure_ascii=False)


# walk and count product-like dicts that carry nutritional_information
found = []


def walk(o, path):
    if isinstance(o, dict):
        d = o.get("details") if isinstance(o.get("details"), dict) else None
        if d is not None and "nutritional_information" in d and ("product_name" in o or "name" in o):
            found.append((path, o))
        for k, v in o.items():
            walk(v, path + "/" + str(k))
    elif isinstance(o, list):
        for n, v in enumerate(o):
            walk(v, path + f"[{n}]")


walk(obj, "")
print("top keys:", list(obj.keys())[:40])
print("products with details:", len(found))
paths = {}
for p, o in found:
    base = p.rsplit("[", 1)[0]
    paths[base] = paths.get(base, 0) + 1
for k, v in sorted(paths.items(), key=lambda x: -x[1])[:15]:
    print(v, k)
