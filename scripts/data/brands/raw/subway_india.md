# Subway India: official nutrition data

CSV: `subway_india.csv`, with 186 rows and 180 distinct item names. That is every data row in the chart, across 17 sections.

## Source used

- **Document:** "Subway Product Nutritional & Allergen Information", subtitled "Updated in August 2026". It is 3 pages and was exported from Excel.
- **URL:** https://qnet.blob.core.windows.net/central/Nutritional%20Allergen%20Chart%20-%20August%202026%20-%201786080088269.pdf
- **Why we treat it as official:** subway.com/en-IN now redirects (301) to https://subway.in/. The footer of subway.in links "Nutrition Information" (under "Subway Cares") to exactly this PDF. We confirmed the link in the site's own JS bundle, `subway.in/static/js/main.d9096c0f.js`. The same bundle links the privacy policy and T&Cs on the same blob storage.
- **Version and date:** "Updated in August 2026". The PDF was created on 2026-08-05 and the blob's Last-Modified date is 2026-08-07.
- **Not used:** no third-party sources, such as FatSecret, were used for numbers.

## How to read the numbers

- The chart's columns are: Veg/Non-veg (icon), Serving Qty (g), Calories (kcal), Total Fat, Saturated Fat, Trans Fat, Carbohydrates, Sugars, Added Sugar, Protein (g), Cholesterol (mg), Sodium (mg), and 8 allergen columns. In the allergen columns, ● means present and # means may be present. The chart labels its values "Value per serving (g)".
- **Whole numbers only.** The chart prints whole numbers, and we kept them unchanged. `sugar_g` is total sugars. Sat fat, trans fat, added sugar, cholesterol and allergens are in `notes`. Fibre is not published.
- **Each section defines a fixed build.** We copied each definition into `serving_desc`:
  - **Subs (6 inch):** 6-inch multigrain bread, standard vegetables, recommended sauce, and a 6-inch protein portion.
  - **Cheese Pull:** the same build plus mozzarella.
  - **Wraps:** multigrain wrap, standard vegetables, recommended sauce, and a **12-inch** protein portion.
  - **Salads:** a 6-inch protein portion.
  - **Rice Bowls:** basmati rice, mixed beans, vegetables, recommended sauce and protein.
  - **Hot & Cheesy and Sub Cravers:** fixed 6-inch and 4-inch builds.
  - **Breakfast Subs:** 6-inch, 4-inch, and 4-inch on 7 Grain Multigrain bread.
- **Footlong** is not published. The chart says "Double values for approximate Subway Footlong® Sub nutrition values". We did **not** generate Footlong rows; the rule is noted on each 6-inch sub row.
- **Components are listed separately**, so custom builds can be added up. These cover carriers (breads, wraps, Mexican rice), 12 sauces, 2 cheeses, 19 proteins, 8 vegetables and salt & pepper. The chart does not say which sub size the protein portions correspond to.
- **Veg/non-veg:** read from the icon colour (green or red). It matches item names in every case; "Egg" counts as non-veg.
- **Item names:** we added the format to the published label, for example "Aloo Patty" became "Aloo Patty Sub", "… Wrap", "… Salad" or "… Rice Bowl". "Salads" and "New Salads" are separate sections with different values; the New Salads rows carry "(New Salads)".

## Coffee and beverages

The chart lists Americano (200 g), Cappuccino (230 g; 84 kcal; milk present), Classic Cold Coffee (230 g; 230 kcal; milk present) and Mango Smoothie (200 g).

- **Only one size each.** Volume is given in g, not ml.
- **Milk type is not stated.** It is presumably dairy, since the milk allergen is marked. No alternative milk options are listed.
- **Not covered:** soft drinks and other beverages sold in stores are not in the chart.

## Ambiguities and source errors (numbers kept as published)

- **Peri Peri Chicken protein** (60 g) is listed at 121 kcal with 23 g carbs and 12 g protein. Its macros give about 194 kcal. Every Peri Peri Chicken build (sub, cheese-pull sub, wrap, salad, new salad, rice bowl) is therefore 15–60% off on a 4/4/9 check, and those 6 rows have `QA:` notes.
- **Superscript footnotes are ambiguous:**
  - 1, 2 and 3 mark Breakfast Subs, Sub Cravers and New Salads. The footnote reads "All products may not be available in all locations".
  - 4 marks Rice Bowls and the "with 7 Grain Multigrain" rows. The footer has two footnote-4 texts: "may not be available" and "Contains sesame seeds and may contain mustard and celery".
  - 5 marks "7 Grain Multigrain" bread but has no footnote text.
  - We quoted these in `notes` without interpreting them.
- **Polyols:** wraps and the spinach/multigrain wrap carriers "contain polyols".
- **Hot & Cheesy name mismatch:** the PDF item is "Cheesy Paneer Melt", but the site's image assets are named "Cheesy Paneer Tikka". This is probably the same product, but it is unconfirmed.

## Items without published nutrition

- Footlong sizes (derive by doubling 6-inch, per the chart).
- Extra cheese or double protein, other than the component rows.
- Soft drinks and other drinks.
- Any items that exist only on delivery apps.
- We could not cross-check the full live menu, because the subway.in menu loads from an API (api.mysubway.in) that we did not query.
