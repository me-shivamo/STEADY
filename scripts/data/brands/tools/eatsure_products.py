"""Collect products + nutrition from several EatSure-platform pages (untrusted HTML; JSON parsed, never executed).
Usage: python -I eatsure_products.py OUT.json PAGE1.html=URL1 [PAGE2.html=URL2 ...]
Writes a list of product records: one per unique (product_name, nutrition tuple), with every source URL it was seen on."""
import sys, json, re

out = sys.argv[1]
records = {}
nutr_names = {}


def load(page):
    s = open(page, encoding="utf-8").read()
    i = s.find("window.REDUX_DATA")
    if i < 0:
        return None
    j = s.find("=", i) + 1
    end_marker = s.find("window.routeMetaData", j)
    body = s[j:end_marker] if end_marker > 0 else s[j:]
    body = re.sub(r'(?<=[:\[,])undefined(?=[,\]}])', 'null', body)
    obj, _ = json.JSONDecoder().raw_decode(body.lstrip(), 0)
    return obj


for arg in sys.argv[2:]:
    page, url = arg.split("=", 1)
    obj = load(page)
    if obj is None:
        print("skip (no data):", page)
        continue
    cols = obj["collections"]["collections"]
    disclaimer = None
    try:
        disclaimer = obj["collections"]["brandDetails"].get("disclaimer")
    except Exception:
        pass
    n = 0
    for c in cols:
        cname = c.get("collection_name") or c.get("name") or ""
        for p in c.get("products") or []:
            d = p.get("details") or {}
            ni = d.get("nutritional_information") or []
            for x in ni:
                nutr_names[(x.get("name"), x.get("unit"))] = nutr_names.get((x.get("name"), x.get("unit")), 0) + 1
            key = (p["product_name"].strip(), json.dumps(ni, sort_keys=True))
            r = records.get(key)
            if r is None:
                r = records[key] = {
                    "product_id": p["product_id"],
                    "product_name": p["product_name"].strip(),
                    "brand_name": p.get("brand_name"),
                    "is_veg": p.get("is_veg"),
                    "is_variation": p.get("is_variation"),
                    "is_customizable": p.get("is_customizable"),
                    "price": p.get("price"),
                    "small_description": p.get("small_description"),
                    "nutrition": ni,
                    "nutrition_msg": d.get("nutritional_information_message"),
                    "collections": [],
                    "sources": [],
                    "product_ids": [],
                }
            if cname not in r["collections"]:
                r["collections"].append(cname)
            if url not in r["sources"]:
                r["sources"].append(url)
            if p["product_id"] not in r["product_ids"]:
                r["product_ids"].append(p["product_id"])
            n += 1
    print(page.rsplit("/", 1)[-1], "products:", n, "| disclaimer:", (disclaimer or "")[:160].replace("\n", " "))

json.dump(list(records.values()), open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("unique records:", len(records), "with nutrition:", sum(1 for r in records.values() if r["nutrition"]))
print("nutrient name/unit counts:", nutr_names)
