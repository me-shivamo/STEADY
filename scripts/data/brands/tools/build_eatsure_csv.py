"""Build the brand CSV from eatsure_products.py output.
Usage: python -I build_eatsure_csv.py PRODUCTS.json BRAND SOURCE_TITLE OUT.csv NOTRITION_LESS_OUT.json"""
import sys, json, csv, re

src, brand, source_title, out_csv, missing_out = sys.argv[1:6]
R = json.load(open(src, encoding="utf-8"))
COLS = ["brand", "country", "item", "variant_or_size", "serving_desc", "serving_g", "serving_ml", "kcal", "protein_g",
        "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "veg_nonveg", "source_url", "source_title",
        "source_date_or_version", "page_or_section", "notes"]


def city(u):
    m = re.search(r"/(?:behrouz-biryani|faasos)/([^/]+)/([^/]+)$", u)
    return f"{m.group(1)}/{m.group(2)}" if m else u


def norm(name):
    return re.sub(r"[\s.,]+$", "", re.sub(r"\s+", " ", name)).strip()


def size_of(name):
    pats = [r"Serves\s*-?\s*\d(?:\s*-\s*\d)?", r"Pack of \d+", r"\d+(?:\.\d+)?\s*(?:ml|mL|ML)", r"\d+\s*(?:gm|g)\b(?!\s*Protein)",
            r"Regular", r"Jumbo", r"Miniyat", r"6 pieces", r"Pack Of \d+", r"\(\d+\s*Pcs?\)", r"Pack Of \d+", r"\d+ pieces"]
    hits = []
    for p in pats:
        for m in re.finditer(p, name):
            hits.append(m.group(0))
    return "; ".join(dict.fromkeys(hits))


def grams_ml(name):
    g = ml = ""
    m = re.search(r"\((\d+(?:\.\d+)?)\s*(?:gm|g)\)", name)
    if m:
        g = m.group(1)
    m = re.search(r"\((\d+(?:\.\d+)?)\s*(?:ml|mL|ML)\)", name)
    if m:
        ml = m.group(1)
    return g, ml


def contents(desc):
    if not desc:
        return ""
    # Behrouz puts serving contents in parentheses, e.g. "(Boneless, Served with 1 Gulab Jamun & Mint Raita)"
    parts = re.findall(r"\(([^()]*(?:Serve|serve|Served|with|pcs|pieces|Pack)[^()]*)\)", desc)
    return "; ".join(p.strip() for p in parts)[:200]


rows, missing = [], []
seen = {}
for r in R:
    nm = norm(r["product_name"])
    if not r["nutrition"]:
        missing.append({"item": nm, "product_ids": r["product_ids"], "is_variation": r["is_variation"],
                        "veg": "veg" if r["is_veg"] else "non-veg", "price": r["price"],
                        "cities": [city(u) for u in r["sources"]]})
        continue
    nut = {}
    for x in r["nutrition"]:
        key = (x.get("name") or "Energy").lower()
        nut[key] = x.get("value")
    sig = (nm.lower(), json.dumps(r["nutrition"], sort_keys=True))
    if sig in seen:  # same normalised name + same numbers (e.g. 'Wrap' vs 'Wrap.') -> merge
        prev = seen[sig]
        prev["notes"] += f"; also listed as product_id(s) {r['product_ids']}"
        continue
    g, ml = grams_ml(nm)
    cities = ", ".join(city(u) for u in r["sources"])
    cont = contents(r.get("small_description"))
    notes = [f"product_id(s) {','.join(map(str, r['product_ids']))}",
             f"listed price INR {r['price']}",
             f"seen in store menus: {cities}",
             "site panel 'Nutritional Value' (per serve; 'Value based on default selection, may vary with customisation'); site disclaimer: values are per serve as shared by the restaurant and indicative",
             "fiber/sodium not published"]
    if cont:
        notes.insert(0, f"serving contents per listing: {cont}")
    pc = re.search(r"(\d+)g Protein", nm)
    if pc and str(nut.get("protein", "")) != pc.group(1):
        notes.insert(0, f"NOTE: item name claims {pc.group(1)}g protein but the published Nutritional Value panel says {nut.get('protein')} g")
    row = {
        "brand": brand, "country": "India", "item": nm, "variant_or_size": size_of(nm) or "single listing (default selection)",
        "serving_desc": "1 serve as sold (per-serve values)" + (f" - {cont}" if cont else ""),
        "serving_g": g, "serving_ml": ml,
        "kcal": nut.get("energy", ""), "protein_g": nut.get("protein", ""), "carbs_g": nut.get("carbs", ""),
        "fat_g": nut.get("fat", ""), "fiber_g": "", "sugar_g": nut.get("sugar", ""), "sodium_mg": "",
        "veg_nonveg": "veg" if r["is_veg"] else "non-veg",
        "source_url": r["sources"][0], "source_title": source_title,
        "source_date_or_version": "retrieved 2026-11-13 (live menu JSON embedded in store page)",
        "page_or_section": " | ".join(c for c in r["collections"] if c) or "store menu",
        "notes": "; ".join(notes),
    }
    seen[sig] = row
    rows.append(row)

# flag same-name rows with different numbers (regional SKU differences)
byname = {}
for row in rows:
    byname.setdefault(row["item"].lower(), []).append(row)
for k, v in byname.items():
    if len(v) > 1:
        for row in v:
            row["notes"] = "SAME ITEM NAME HAS DIFFERENT PUBLISHED VALUES IN DIFFERENT CITIES (regional SKU/recipe); " + row["notes"]

rows.sort(key=lambda x: (x["page_or_section"], x["item"]))
with open(out_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
json.dump(missing, open(missing_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(out_csv, "rows:", len(rows), "| without nutrition:", len(missing))
