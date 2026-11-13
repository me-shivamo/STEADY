import csv
COLS = ["brand","country","item","variant_or_size","serving_desc","serving_g","serving_ml","kcal","protein_g","carbs_g","fat_g","fiber_g","sugar_g","sodium_mg","veg_nonveg","source_url","source_title","source_date_or_version","page_or_section","notes"]
def write(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="raise")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLS})
    print(path, len(rows), "rows")
