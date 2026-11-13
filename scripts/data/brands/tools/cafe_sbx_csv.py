# usage: cafe_sbx_csv.py merged.json out.csv
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cafe_csvlib as csvlib
R = json.load(open(sys.argv[1]))
URL = "https://www.starbucks.in/assets/pdf/TATA%20Starbucks_NI_Guide_Food_and_Bev.pdf"
TITLE = "Tata Starbucks Nutrition Information Guide - Food and Beverage (official PDF linked on starbucks.in)"
VER = "PDF on starbucks.in, server Last-Modified 25 Jun 2026; disclaimer page states 'Created on 02-01-2023'; analysis by FoLSol (LabelBlind) using IFCT 2017"
COLS = ['serving','kcal','carbs','total_sugar','added_sugar','fibre','protein','total_fat','sat_fat','trans_fat','cholesterol','sodium']
SIZE = re.compile(r'^(Iced\s+)?(Short|Tall|Grande|Venti|Trenta)\s+(.*)$', re.I)
MILKNOTE = ("Default recipe milk appears to be toned milk: the guide's 'Toned Milk 236.25 ml' row (142 kcal) matches Grande Caffe Misto exactly. "
            "Alternative milks are published only as per-100 ml ingredient rows (Skimmed, Soy, Almond, Oat); no per-drink values for milk swaps")
if len(sys.argv) > 3 and sys.argv[3] == 'feb':
    URL = "https://preprodtsbstorage.blob.core.windows.net/cms/uploads/TATA_Starbucks_NI_Guide_Food_and_Beverage_5th_February_2026_FINAL_1d0a3a24c6.pdf"
    TITLE = "TATA Starbucks NI Guide Food and Beverage 5th February 2026 FINAL (Tata Starbucks CMS pre-production storage; publication on live site NOT verified)"
    VER = "Disclaimer page 'Created on 05-02-2026'; blob Last-Modified 13 Feb 2026"
out = []
skipped = []
for r in R:
    pub = re.sub(r'\s+', ' ', r['product']).strip()
    name = re.sub(r'\b(Short|Tall|Grande|Venti)(?=[A-Z])', r'\1 ', pub)
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    m = SIZE.match(name)
    if m:
        size = m.group(2).capitalize(); item = ((m.group(1) or '') + m.group(3)).strip()
    else:
        size = ''; item = name
    if len(r['nums']) not in (10, 12) or (len(r['nums']) == 11 and 'Java Mocha chip' not in r['product']):
        skipped.append((r['page'], r['product'], r['nums'])); continue
    vals = dict(zip(COLS, r['nums']))
    clean = {k: ('' if v in ('NA', '-') else v) for k, v in vals.items()}
    bev = r['section'].startswith('Beverage')
    notes = []
    if pub != item and pub != f"{size} {item}": notes.append(f"Published name: {pub}")
    extra = [f"added sugar {vals.get('added_sugar')} g", f"saturated fat {vals.get('sat_fat')} g", f"trans fat {vals.get('trans_fat')} g", f"cholesterol {vals.get('cholesterol','NA')} mg"]
    notes.append("Also published: " + ", ".join(e for e in extra))
    nas = [k for k, v in vals.items() if v == 'NA']
    if nas: notes.append("Published as NA (Not Applicable): " + ", ".join(nas))
    if len(r['nums']) != 12 and 'Java Mocha chip' in r['product']:
        notes.append("Row printed with cholesterol 'NA' and sodium '0%' (sodium cell left empty)")
        clean['cholesterol'] = ''; clean['sodium'] = ''
    if r['allergens'] and r['allergens'] != 'NA': notes.append("Allergens: " + r['allergens'])
    sub = r.get('subhead') or ''
    if bev and 'Milk' in (r['allergens'] or '') and sub not in ('Other Beverage ingredients', 'Reserve Beverage Ingredients'): notes.append(MILKNOTE)
    if sub in ('Other Beverage ingredients', 'Reserve Beverage Ingredients'): notes.append("Ingredient/add-on row, not a standalone drink")
    if r['section'] in ('Beverage LTO', 'Food LTO'): notes.append("Limited-time offering (LTO) section")
    if 'Moonshot' in r['section']: notes.append("Listed under 'Moonshot' tab")
    vm = {'Vegetarian': 'veg', 'Vegan': 'vegan', 'Non Vegetarian': 'non-veg', 'NonVegetarian': 'non-veg'}.get(r['veg'].strip(), r['veg'].strip())
    unit = 'ml' if bev else 'g'
    out.append(dict(brand="Starbucks India (Tata Starbucks)", country="IN", item=item, variant_or_size=size,
        serving_desc=f"{vals['serving']} {unit} serving" + (f" ({size})" if size else ''),
        serving_ml=vals['serving'] if bev else '', serving_g=vals['serving'] if not bev else '',
        kcal=clean['kcal'], protein_g=clean['protein'], carbs_g=clean['carbs'], fat_g=clean['total_fat'], fiber_g=clean['fibre'],
        sugar_g=clean['total_sugar'], sodium_mg=clean['sodium'], veg_nonveg=vm,
        source_url=URL, source_title=TITLE, source_date_or_version=VER,
        page_or_section=f"p.{r['page']}, {r['section']}" + (f" > {sub}" if sub else ''), notes=". ".join(notes)))
csvlib.write(sys.argv[2], out)
for k in skipped: print('SKIPPED (column misalignment, needs manual read):', k)
