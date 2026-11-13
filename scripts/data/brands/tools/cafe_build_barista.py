import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cafe_csvlib as csvlib
URL = "https://www.barista.co.in/sites/default/files/2026-08/Kafi%20Protien%20Hai.webp"
T = "Barista Coffee Company official website (barista.co.in) homepage banner 'Kaafi PROTEIN Hai...' (Barista x Yoga Bar protein range)"
V = "image uploaded 2026-08 (path /sites/default/files/2026-08/); retrieved 2026-11-13"
rows = [
 dict(item="Iced-Caramel Wheychino", kcal="203", protein_g="24"),
 dict(item="Mocha Pro-Muscle Shake", kcal="280", protein_g="24"),
]
for r in rows:
    r.update(brand="Barista Coffee Company", country="IN", variant_or_size="", serving_desc="1 serving as served (size not stated)", veg_nonveg="veg",
             source_url=URL, source_title=T, source_date_or_version=V, page_or_section="Homepage hero banner",
             notes="Banner shows only kcal and '24g PROTEIN'; banner also states '100% Vegetarian Dairy Protein'. Serving size, carbs, fat not published. Veg status from the banner's '100% Vegetarian Dairy Protein' claim.")
csvlib.write(sys.argv[1], rows)
