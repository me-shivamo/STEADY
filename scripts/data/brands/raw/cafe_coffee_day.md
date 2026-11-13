# Cafe Coffee Day (CCD): official nutrition data

## Sources used
The official page is https://www.cafecoffeeday.com/cafe-menu/nutritional-info ("Nutritional Info | Café Coffee Day"). It publishes the charts as two images:
1. **Beverage chart:** https://www.cafecoffeeday.com/sites/all/themes/ccd/assets/images/nutri-info/desk/BEVERAGE%20nutritional%20info.jpg
   - Title: "CAFÉ COFFEE DAY - QUALITY ASSURANCE: NUTRITIONAL INFORMATION & ALLERGEN CHART: BEVERAGE. 3.0 & OMG Menu"
   - Document code CCD/QA/F&B/NV/01, dated 28-04-2022, prepared by Dhruva GN and approved by Chandrashekar.
   - Footnote: "Nutritional information reference taken from FSSAI. Values mentioned are approx value."
2. **Food chart:** https://www.cafecoffeeday.com/sites/all/themes/ccd/assets/images/nutri-info/desk/FOOD%20nutritional%20info.jpg
   - Title: "CAFÉ COFFEE DAY - QUALITY: CCD Menu 3.0 - NUTRITIONAL VALUE & ALLERGEN CHART"
   - Reference QA/F&B/CCD Menu 3.0/Food Allergen & NV, dated 29-04-2022.

We transcribed both charts by reading the full-resolution images in crops. OCR cross-checks failed on the coloured grid, so every value was read by eye, and all values are clearly legible.

## Row count
**98 rows:**
- 64 beverages (serving in ml).
- 34 food items (serving in g, except 3 celebration cakes given per 100 g).

## Ambiguities
- **Energy (kcal) only:** CCD publishes no protein, carbohydrate, fat, fibre, sugar or sodium, so those cells are empty.
- **Two sizes:** Regular (usually 250 ml) and King (350 ml, or 330 ml for Soy Cappuccino). Many items have a single size only.
  - "Café Latte" (250 ml) has no size label printed. We left `variant_or_size` empty; the King row is 350 ml.
- **Milk:** the chart does not name the milk type. Soy Cappuccino (Regular 230 ml / King 330 ml) is the only non-dairy option listed. "Vegan Shake" is also listed (allergen: soy).
- **"Sugar Free" vs "No Sugar":** the iced coffees have both versions as separate rows.
  - "Sugar Free" is marked with an asterisk, meaning a sweetener: "Not Recommended For Phenylketonurics, For Children Suffering From Seizure Disorders, Pregnant & Lactating Mothers".
  - "No Sugar" rows are printed with "350.00" as the serving size.
- **Celebration cakes** (Crunch Cake, Red Velvet Cake, Dutch Truffle) are given **per 100 g** of a whole cake (695 g, 740 g, 730 g), not per slice.
- **Possible errors in the source (published as-is):**
  - Chocolate Croissant (2 pieces, 80 g) is 598.91 kcal, which is more than 7 kcal/g.
  - Item names contain typos such as "CRUCNH", "CROSSANT", "Peices", "Cardmon" and "CLASSI NEWYORK". Corrected names are in `item`, and the published name is in `notes`.
- **Veg / non-veg:** taken from the chart's FSSAI marks (green dot = veg, brown triangle = non-veg). The egg-containing cakes (Lemon Poppy Seed, New York cheesecake, Strawberry cheesecake) are marked non-veg.
- **Freshness:** the charts are from April 2022 (Menu 3.0). The current CCD menu shows categories that are missing from these charts (see below), so the charts are probably out of date for newer items.

## Items on the menu without published nutrition
The current website menu has these categories, which have no rows in the 2022 charts: Snack Central, Burger Binge, Sandwiches & Specials, Swanky Smoothies, Wellness Range, Infusion, Milkshakes, The Big Sip, Flasks and Combos. We could not list individual item names: the menu pages load their items with JavaScript, and the CCD online-ordering PWA (ccdonline.in, which redirects to ccd.reciproci.com) is app-only. So any item in those categories has **no official nutrition** from CCD.
