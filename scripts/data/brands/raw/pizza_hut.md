# Pizza Hut India — official nutrition data

CSV: `pizza_hut.csv` — **314 rows**, one row per item × size or crust. 178 are veg and 136 non-veg.

## Source (official, India)
- PDF: https://www.pizzahut.co.in/order/pdfs/in/nutritionals.6875af05163a32efc1bd637ee7bdfab4.pdf
  - Linked from https://www.pizzahut.co.in/nutrition/ on 2026-11-13.
  - Older hashed copies of the PDF exist on the same domain. They are superseded and were not used.
- Title: "Menu Card Nutrition & Allergen Information Booklet of Pizza Hut Products".
  - PDF metadata title: "PH Nutrition_SEP_2026".
  - Created 2026-09-30. The server reports Last-Modified 2026-10-26.
  - Footer: "© 2022 Pizza Hut India". FSSAI licence 10017011004220.
  - Booklet text: "All information given in compliance to FSSAI Labelling & Display Regulation". It also says values are analysed at FSSAI-approved, NABL-accredited labs.
- `page_or_section` gives the PDF page, the printed page number and the booklet section.

## Extraction method
- Text and coordinates were extracted with ghostscript's `txtwrite` (XML mode). Each number was assigned to a column by its x-position.
- veg_nonveg comes from the green or brown symbol colour on rendered pages. This matters because some names appear twice, once veg and once non-veg (Spicy Range and 3-IN-1).
- Validation against the booklet's own %RDA columns:
  - kcal/2000, sodium/2000 and fat/67 pass in 305 of 314 rows.
  - The 9 anomalies are errors in the source and are listed below.

## Columns
- `serving_g` = the booklet's "Net Weight (g)".
- `sugar_g` = Total Sugar. "ND" (not detected; limit of quantification 1 g/100 g) is left empty, with a note.
- `fiber_g` = Dietary Fibre. It is published for most items, unlike Domino's.
- `notes` also carry saturated fat, trans fat, added sugar, cholesterol and caffeine (beverages).

## Serving definition
- Pizza rows are for the **whole pizza as served**. The net weight and "No of Slices/Pizza" columns confirm this: Personal is 4 slices, Medium 6, Large 8, TnC 8. For example, Margherita Pan Personal is 248 g and 725.1 kcal.
- Chicken wings: the slices column holds the piece count (4, 6 or 10).
- Beverages: quantity is printed under "Net Weight (g)" (220 to 330). It is probably ml but is kept as published.

## Ambiguities and source issues (values kept as published, flagged in `notes`)
- Chicken Tikka Supreme Pan Large: total fat is printed as 10.0 g but saturated fat as 39.8 g. Total fat is likely a typo for about 100 g.
- Ultimate Tandoori Veggie TnC: kcal is about 34% above what the macros give.
- Triple Chicken Feast Ultimate Cheese Personal: sodium %RDA is printed as 2949.8, a duplicated value. The sodium mg value is fine.
- Spicy Tikka Hand Stretched with 100% Mozzarella: carbs and protein are both 38.3. Carbs look wrong.
- Choco Volcano, Baked Cheesy Momo (Non Veg) and the Spicy Baked Chicken Wings rows: macros and kcal disagree by more than 15%.
- **Crust Upgrade rows** (stuffed / Ultimate Cheese crust) are add-ons. The booklet says to add them on top of the per-serve Pan Pizza values.
- **Size not stated:** TnC pizzas, Golden Hand Stretched pizzas and the Overloaded Half N Half 10"/12" rows have no size label. We kept the section label and the inch size where the booklet gives it.
- Half N Half rows are named by their two halves, as printed, for example "Four Pepper | Olive Garden".
- **Caffeine:** "Masal Pepsi" and "Pepsi" (250) show 181.3 in the caffeine column. That is implausibly high, but it is printed that way.

## Items on the current site menu without a row here
- Items launched after the September 2026 booklet are not covered. Without an official value we did not add them.
- We did not cross-match the full live ordering menu, because it is a JavaScript app that needs a store.
- Limited-time and regional items are excluded by the booklet's own disclaimer.
