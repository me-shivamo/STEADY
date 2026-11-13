# Burger King India — official nutrition data

CSV: `burger_king_india.csv` (111 rows, one per item × size).

## Source used

| | |
|---|---|
| URL | https://d1rgpf387mknul.cloudfront.net/1771400941pdfNI18Feb26pdf |
| Title | Burger King India Nutritional Information Per Serve - February 2026 |
| Date / version | Footer says "This information is current as of 12 February 2026". The HTTP Last-Modified is 18 Feb 2026, and the numeric file id 1771400941 is the same timestamp. |
| Publisher | Burger King India (Restaurant Brands Asia). The file is on BK India's own CloudFront CDN (`d1rgpf387mknul.cloudfront.net`), which also hosts the compliance PDFs named in the burgerking.in JS bundle. |
| Pages | 6 pages, one table: S.No, Product, Veg/Non Veg symbol, Avg Portion size (gm/ml), Energy (kcal), Carbohydrate, Sugar, Fat, Saturated Fat, Trans Fatty Acids, Protein, Sodium. Each item also has a per-serve %RDA row, which we did not capture. |

How we found it: burgerking.in is a single-page app. Its footer link "Nutrition Information" gets its PDF URL at runtime from `/api/v1/nutrition/getnutrition`. That call was blocked in this environment, so we did not make it. We found the CDN URL through a web search index (search only, no third-party numbers used). We then downloaded it from BK's CDN and checked the title, date and brand header inside the PDF.

**Caveat:** we could not confirm through the site's API that this exact file is the one the footer links to today. It is the newest BK India nutrition PDF we found. Older official versions on the same CDN or BK S3 buckets exist: a Sept 2022 allergen chart and a Sept 2020 sheet. A June chart on `bk-apac-prd.s3.amazonaws.com` now returns 403. None of these older files were used.

Not published: fibre (column left empty). Saturated fat and trans fat are published, and are stored in `notes` as `sat_fat_g=` and `trans_fat_g=` because the CSV has no columns for them.

## Item count
111 rows across these sections:
- Veg Burgers: 13
- Tacos & Wraps: 5
- Veg Sides incl. fries, dips, sachets: 15
- Non Veg Sides (nuggets, wings, boneless bites): 17
- Non Veg Burgers: 15
- Desserts: 9
- Fountain Drinks: 12
- Shakes: 4
- Hot Beverages: 12
- Cold Beverages: 7
- Café Food (muffins): 2

Veg/non-veg comes from the PDF's own symbols: green circle means veg, red triangle means non-veg. We read them from the rendered page colours. The result is 74 veg and 37 non-veg, and every symbol agrees with the item name.

## Ambiguities and how they were handled
- **Portion unit.** The column is "Avg Portion size (gm/ml)" with no unit on each row. We put Fountain Drinks, Shakes, Hot and Cold Beverages in `serving_ml`, and everything else (including softies and sundaes) in `serving_g`. The unit is noted on every row.
- **Fountain drinks.** These are "served with Ice" (PDF footnote), so the 300/450 ml portions include ice. Only Regular (300) and Medium (450) are published. No Large.
- **Coffee milk.** Hot and cold coffees (Espresso, Americano, Cappuccino, Caffe Latte, Mochaccino, Hot Chocolate, Masala Chai, Classic cold coffee, Mocha Frappe, Iced Latte) do not say which milk is used. No alternative-milk values are published. Sizes are Small/Regular only.
- **Hot Beverages numbering.** S.No jumps from 10 to 13. Rows 11 and 12 are absent from the PDF, not dropped by us.
- **Combos and meals.** None are published. Only individual items are listed.
- **Spellings kept as published** (the original name is in `notes`): "Coco cola", "Smokey Cunchy Chicken Whopper", "Thick Shake - Chocholate", "Classic cold coffe".
- **Probable source errors.** All are kept exactly as published and flagged in `notes`:
  - Veg. Whopper Double Patty: 1431.7 kcal. The macros imply about 880.
  - Chicken Whopper Double Patty: 1574.0 kcal. The macros imply about 660.
  - Thums UP Medium: carbohydrate 8 g but sugar 47 g.
  - Saturated fat higher than total fat on three items: Mochaccino Small (26.4 vs 5.8), Masala Chai (11.2 vs 2.7) and Choco lava cake (27.4 vs 4.9).
  - Caffe Latte Regular (240 ml) is published lower in kcal than Small (170 ml).
  - Vanilla Softie and BK Sundae-Mango share identical carb, sugar, protein and sodium values.
  - kcal vs macro mismatches flagged automatically (`CHECK:` in notes): Paneer Royale Wrap, Saucy Fries, Boneless Chicken Wings 4/7 pc and Spicy Korean Chicken Wings.

## Menu items without published nutrition
We could not render the live burgerking.in menu (client-side app) to diff it against the PDF. Items we know are sold but did not find in the Feb 2026 PDF:
- The plain single-patty "Veg Whopper" and "Chicken Whopper". The PDF lists only the Crunchy, Deluxe, Double Patty and Mutton Whopper variants.
- All combo meals and King Savers bundles.
- Add-ons other than Cheese Slice, the dips and the sachets listed.
