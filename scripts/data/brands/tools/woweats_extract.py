"""Extract products (name, description, price, veg flag, kcal text) from a woweats.co.in page (Next.js flight data).
Untrusted HTML is parsed only (json.loads of string literals); nothing is executed.
Usage: python -I woweats_extract.py PAGE.html [PAGE2.html ...] > out.jsonl"""
import sys, re, json


def flight(s):
    return "".join(json.loads(m.group(1)) for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', s))


def objects_with(fl, key):
    """Yield balanced JSON objects that contain `key` (scan backwards for the opening brace)."""
    dec = json.JSONDecoder()
    for m in re.finditer(re.escape(key), fl):
        # walk back to find an object start that decodes and spans past the match
        depth_pos = m.start()
        for back in range(0, 4000):
            i = depth_pos - back
            if i < 0:
                break
            if fl[i] != "{":
                continue
            try:
                obj, end = dec.raw_decode(fl, i)
            except Exception:
                continue
            if end > m.end() and isinstance(obj, dict):
                yield obj
                break


seen = set()
for page in sys.argv[1:]:
    s = open(page, encoding="utf-8").read()
    fl = flight(s)
    for obj in objects_with(fl, '"productPrice"'):
        name = obj.get("name") or obj.get("productName") or obj.get("title")
        desc = obj.get("description") or obj.get("productDescription") or ""
        key = (name, desc)
        if key in seen:
            continue
        seen.add(key)
        kc = re.findall(r"(\d+(?:\.\d+)?)\s*gms?\s*(?:/|of[^0-9]{0,40}at)\s*(\d+(?:\.\d+)?)\s*kcal", desc, re.I)
        meta = obj.get("metadataMap") or {}
        ft = (meta.get("food_type") or {}).get("values")
        out = {"page": page.rsplit("/", 1)[-1], "id": obj.get("id") or obj.get("productId"), "name": name,
               "price": (obj.get("productPrice") or {}).get("price"), "food_type": ft,
               "filter_keys": (meta.get("filter_keys") or {}).get("values"), "description": desc, "kcal_matches": kc,
               "keys": sorted(obj.keys())[:40]}
        print(json.dumps(out, ensure_ascii=False))
