"""Build data/haldirams.csv from the hand-transcribed label table (work/haldirams_labels.tsv).
Usage: python -I build_haldirams_csv.py LABELS.tsv OUT.csv"""
import sys, csv

src, out = sys.argv[1:3]
COLS = ["brand", "country", "item", "variant_or_size", "serving_desc", "serving_g", "serving_ml", "kcal", "protein_g",
        "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "veg_nonveg", "source_url", "source_title",
        "source_date_or_version", "page_or_section", "notes"]
CDN = "https://cdn.shopify.com/s/files/1/0691/0948/1549/files/"
rows = []
for r in csv.DictReader(open(src, encoding="utf-8"), delimiter="\t"):
    r = {k: (v or "").strip() for k, v in r.items()}
    per_serving = r["notes"].startswith("PERSERVING:")
    note = r["notes"].replace("PERSERVING: ", "")
    if per_serving:
        serving_desc = f"per serving of {r['serving_g']} g as printed on label ({r['servings_per_pack']} serving(s) per pack)"
        serving_g = r["serving_g"]
    else:
        ss = f"label serving size {r['serving_g']} g, {r['servings_per_pack']} servings per pack" if r["serving_g"] else "no serving size printed"
        serving_desc = f"per 100 g ({ss})"
        serving_g = "100"
    extra = []
    if r["added_sugar_g"]:
        extra.append(f"added sugars {r['added_sugar_g']} g")
    if r["satfat_g"]:
        extra.append(f"saturated fat {r['satfat_g']} g")
    if r["trans_g"]:
        extra.append(f"trans fat {r['trans_g']} g")
    if r["chol_mg"]:
        extra.append(f"cholesterol {r['chol_mg']} mg")
    is_text = r["img"].startswith("TEXT:")
    if is_text:
        section = "product description text ('Nutritional Values Per 100G')"
        title = "Haldiram's official online store (haldirams.com) - product page description"
    else:
        section = f"back-of-pack label image in product gallery: {CDN}{r['img']}"
        title = "Haldiram's official online store (haldirams.com) - back-of-pack nutrition label image (FSSAI format)"
    notes = []
    if extra:
        notes.append("label also gives " + ", ".join(extra) + (" (same basis as row)"))
    notes.append(f"pack: {r['pack']}")
    if r["mfr_fssai"]:
        notes.append(r["mfr_fssai"])
    if note:
        notes.append(note)
    notes.append("packaged/retail sweet sold online and in Haldiram's stores; not a restaurant-plated portion")
    rows.append({
        "brand": "Haldiram's", "country": "India", "item": r["item"], "variant_or_size": r["pack"],
        "serving_desc": serving_desc, "serving_g": serving_g, "serving_ml": "",
        "kcal": r["kcal"], "protein_g": r["protein_g"], "carbs_g": r["carbs_g"], "fat_g": r["fat_g"],
        "fiber_g": r["fiber_g"], "sugar_g": r["total_sugar_g"], "sodium_mg": r["sodium_mg"], "veg_nonveg": "veg",
        "source_url": r["product_page"], "source_title": title,
        "source_date_or_version": "retrieved 2026-11-13" + ("" if is_text else f"; label file {r['img']}"),
        "page_or_section": section, "notes": "; ".join(notes),
    })
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
print(out, len(rows))
