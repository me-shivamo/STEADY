import sys, os, csv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cafe_csvlib as csvlib
raw, out = sys.argv[1], sys.argv[2]
rows = list(csv.DictReader(open(raw, encoding='utf-8')))
URL = "https://stores.bluetokaicoffee.com/blue-tokai-coffee-roasters-indiranagar-domlur-cafe-indiranagar-bengaluru-436797/Home"
extra = [("Milk Crumb Chocolate Cookie", "100", "459.4", "Not in the digital-menu nutrition feed (item present there without nutrition)."),
         ("Almond & Raspberry Cookie", "100", "416.9", "CONFLICT: the digital-menu feed lists this cookie as 104 g / 450 kcal (other row). Two official surfaces disagree."),
         ("Chocolate Chip Sea Salt Cookie", "100", "445.5", "Not in the digital-menu nutrition feed (item present there without nutrition).")]
for name, g, kcal, note in extra:
    rows.append(dict(brand="Blue Tokai Coffee Roasters", country="IN", item=name, variant_or_size="store-page listing", serving_desc="Portion Size: 100g", serving_g=g, kcal=kcal,
        veg_nonveg="", source_url=URL, source_title="Blue Tokai official store locator page (stores.bluetokaicoffee.com), Indiranagar Domlur cafe - 'Newly Launched' section",
        source_date_or_version="retrieved 2026-11-13", page_or_section="Newly Launched", notes="Only portion size and kcal shown. " + note))
csvlib.write(out, rows)
