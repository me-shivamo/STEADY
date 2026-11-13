# Starbucks India (Tata Starbucks): official nutrition data

## Sources used
1. **Tata Starbucks Nutrition Information Guide: Food and Beverage** (official PDF on the brand's India website)
   - URL: https://www.starbucks.in/assets/pdf/TATA%20Starbucks_NI_Guide_Food_and_Bev.pdf
   - 130 pages. Server Last-Modified: 25 Jun 2026. The disclaimer page (p.130) says "Created on 02-01-2023".
   - Columns: serving size (ml for beverages, g for food), energy (kcal), carbohydrate, total sugar, added sugar, fibre, protein, total fat, saturated fat, trans fat, cholesterol, sodium. Each item also has a "% RDA contribution" row, which we skipped.
   - The analysis was done by FoLSol (LabelBlind), Mumbai, by calculation from IFCT 2017 food composition values. "NA" means Not Applicable.
   - **All 976 rows in starbucks_india.csv come from this document.**

## Row count
- **976 rows** covering 454 distinct item names. Each row is one item at one size.
- Rows by section (the PDF's tabs):

| Section | Rows |
|---|---|
| Beverage Core | 389 |
| Beverage LTO | 318 |
| Beverage Reserve | 131 |
| Beverage Moonshot | 23 |
| Food Core | 58 |
| Food Moonshot | 38 |
| Food Bake in | 9 |
| Food LTO | 7 |
| Food Reserve | 3 |

- Sizes: Short 237 ml, Tall 354 ml, Grande 473 ml, Venti 591 ml. Rows by size: Short 95, Tall 240, Grande 235, Venti 205. Another 201 rows have no size word (food, 1 L packs, single-serve items).
- The CSV columns hold kcal, protein, carbohydrate, total fat, fibre, total sugar and sodium. `notes` holds added sugar, saturated fat, trans fat and cholesterol, plus allergens and any "NA" fields.

## Ambiguities
- **Default milk:** the guide never names the recipe milk. We inferred it is **toned milk**: the guide's "Toned Milk 236.25 ml" row (142 kcal, 11.3 g carbs, 7.8 g protein, 7.3 g fat) matches "Grande Caffe Misto" exactly. Toned-milk rows are listed for 236.25 / 288.75 / 367.5 / 483 ml.
- **Other milks** appear only as ingredient rows per 100 ml: Skimmed (34 kcal), Soy (41), Almond (37) and Oat (51; the guide says "Not recommended for Children"). The guide gives **no per-drink values for milk swaps**. The only exceptions are named recipes such as "Cocoa Chai Almond Latte" and "Iced Cocoa Chai Oat Latte".
- **Possible errors in the source (copied exactly as published):**
  - Short and Tall Cappuccino are both 104 kcal.
  - The Short Latte equals the Short Cappuccino, and the Tall Latte (173) equals the Grande Cappuccino.
  - Short Caffe Misto is 137 kcal but Grande is 142.
  - Java Mocha chip ice cream prints cholesterol as "NA" and sodium as "0%" (we left those cells empty).
- **Ingredients and add-ons:** syrups (Vanilla, Hazelnut, Caramel at 7.35, 7.5 or 16.x ml), the ice creams used in drinks, Frappuccino Chips and the milks are kept as rows. They are marked "Ingredient/add-on row" in `notes`. Some syrups appear twice with different serving sizes, exactly as printed.
- **LTO (limited-time) and Reserve items** are included and labelled in `page_or_section` and `notes`. Many LTO items may no longer be sold.
- **Newer document, not used:** a newer official-looking guide exists: "TATA_Starbucks_NI_Guide_Food_and_Beverage_5th_February_2026_FINAL".
  - URL: https://preprodtsbstorage.blob.core.windows.net/cms/uploads/TATA_Starbucks_NI_Guide_Food_and_Beverage_5th_February_2026_FINAL_1d0a3a24c6.pdf
  - 156 pages, "Created on 05-02-2026". It sits on Tata Starbucks' **pre-production** CMS storage, and we could not confirm that the live site links to it.
  - It looks partly internal: section headings include "Lab test data", "Type Y", "Holiday BOM" and supplier or store names.
  - It disagrees with the starbucks.in guide on 194 of 529 matching item+size keys:

| Grande item | starbucks.in guide (kcal) | Feb-2026 doc (kcal) |
|---|---|---|
| Cappuccino | 173 | 132 |
| Caramel Frappuccino | 485 | 374 |
| Java Chip Frappuccino | 536 | 456 |
| Mocha | 398 | 374 |
| Cold Coffee | 473 | 360 |

  - It also adds explicit milk variants, such as "Flat White (toned milk)" and Almond-milk variants, plus "Less sweet" and "Unsweetened" variants.
  - We parsed it into a separate, **unverified** file and did not put it in data/: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/starbucks/starbucks_india_feb2026_unverified.csv (1169 rows). Six rows were skipped because of column misalignment.
  - Someone should decide whether to adopt it. If it is confirmed as published, it is the more current analysis.
- **Name clean-up:** item names were split from the size word, and words the PDF ran together were separated (for example "KatoriKebab" became "Katori Kebab"). When the name changed, the original is kept in `notes` as "Published name".

## Items on the menu without published nutrition
- Every row in the guide has nutrition. The guide does not cover customisations such as extra shots, whipped cream and toppings as standalone add-ons, or any milk swap applied to a specific drink.
- We could not compare the guide against the live starbucks.in ordering menu. That menu loads from a private app API, and fetching it directly was blocked as unauthorized access, so we did not attempt it. Items now sold that are missing from the 2023 guide therefore can't be listed here. The Feb-2026 document suggests about 600 newer names, such as Diwali 2024 beverages, Baileys drinks and protein-foam drinks.
