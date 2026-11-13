# KFC India: official nutrition data

CSV: `kfc_india.csv`, with 232 rows and 159 distinct item names. There is one row per product and piece count or size, covering every table row on pages 4 to 21 of the booklet.

## Source used

- **Document:** "Menu Card Nutrition & Allergen Information Booklet of KFC Products". The footer reads "KFC Nutrition Information, V6".
- **URL:** https://about.kfc.co.in/assets/files/nutrition-booklet.pdf. It is hosted on KFC India's own domain (about.kfc.co.in). The cover states "All information provided is in compliance with FSSAI labelling and display regulation". The disclaimer says the products were analysed at FSSAI-approved, NABL-accredited labs.
- **Version and date:** V6. The PDF was created on 2026-03-30 and the server's Last-Modified date is 2026-04-01.
- **How we found it:** A web search led to the PDF on KFC's own domain, and we took every number from that PDF. The about.kfc.co.in pages we fetched do not link to it. We could not check whether online.kfc.co.in links to it, because that site and kfc.co.in block or time out on automated fetches (HTTP/2 INTERNAL_ERROR or a timeout). The site's own per-item nutrition panels were therefore not used.
- **Not used:** https://about.kfc.co.in/assets/files/nutrition-booklet_1May.pdf. Despite its file name, its cover says "Last updated on 13th Sep'22 (Rev-1)", so V6 supersedes it.
- **Third-party copies were ignored.** These include a Scribd upload, a Kaggle dataset, FatSecret, and Swiggy listings.

## How to read the numbers

- The booklet's columns are: Avg. Portion Weight (g), No. of servings, Energy (kcal per serve), Carbohydrate, Protein, Total Fat, %RDA fat, Trans Fat, %RDA trans fat, MUFA, PUFA, Saturated fat, %RDA sat fat, Sodium (mg per serve), %RDA sodium, Sugar (g per serve), Allergens (icons), MSG, and Caffeine & Artificial Sweetener.
- **All values are per serving, not per product, when a product has more than one serving.** For example, the 3 pc Hot & Crispy weighs 330 g and has 2 servings. The booklet lists 480 kcal per serve, so the whole bucket is 960 kcal. For these rows:
  - `serving_g` is left empty, because the per-serving weight is not published.
  - `serving_desc` and `notes` carry `product_weight_g=…; servings_per_product=…`, so the whole-product value can be computed.
  - 74 rows are multi-serving.
- `serving_g` is filled only when servings = 1, in which case the product weight equals the serving weight.
- **Beverages:** the size column is labelled "gm". Pepsi Regular 330, Medium 450 and Large 550 are kept as `serving_g` exactly as printed. No ml value is published.
- **Extra nutrients:** sat fat, trans fat, MUFA, PUFA and MSG are in `notes`. Fibre is not published anywhere in the booklet.
- **Veg/non-veg:** the booklet marks this with a green-dot or maroon-triangle icon. We read it from the icon colour, and checked the result visually on rendered pages.
- **Item names:** for "N Pc …" rows we normalised the name (for example "1 Pc HC" became "Hot & Crispy Chicken" / "1 pc"). The original label is kept in `notes` as `source label: "…"`. Other names are as printed, including source typos such as "Bonless", "Chiken", "Buger", "Chatpta" and "Nashvillle".

## Ambiguities and source errors (numbers kept exactly as published)

37 rows have a published kcal that differs from 4·carb + 4·protein + 9·fat by more than 15%. Each one has a `QA:` note. The clearest cases are probable typos in the booklet:

| Item | What looks wrong |
|---|---|
| Classic Chicken Krisper + Reg Popcorn + Reg Pepsi | 67 kcal |
| Spicy Chicken Krisper + Reg Popcorn + Reg Pepsi | 588 g carbs and 62 g MUFA |
| Wednesday 15 Pcs for 399 Meal New | 440 g fat (657% RDA) |
| 10 pc HC- Wednesday Offer | Avg. portion weight 110 g for 10 pieces, with servings = 3. `serving_g` is empty and `notes` carries `product_weight_g=110` as printed. |
| Tandoori Zinger Burger | 902 kcal against about 618 from its macros |
| Veg Longer | 0 g fat at 259 kcal |
| Nashville Sauce Bottle -225 g | listed weight 189 g, and 127 kcal with 66 g carbs |
| Masala Mirinda | 484 kcal, 114 g carbs in 220 g |

Some series are also internally inconsistent:

- **Boneless Strips, Piri Piri Strips (4 pc and up) and Boneless Wings:** kcal and macros disagree by 16–46%.
- **Korean, Thai and Tandoori Chicken Roll:** about 225–255 kcal, against roughly 390–420 from their macros.
- **Boneless Strips trans fat:** rises to 11 g per serve, with "%RDA trans" up to 541. That looks wrong in the source too.

Two items appear twice:

- **Dunked Burger** is listed under Burgers (p9, 462 kcal) and under Dunked Range (p12, 559 kcal). We kept both and told them apart in `variant_or_size`.
- **Classic Chicken Roll** (p21) and **Chicken Roll Single** (p10) have identical numbers.

Other gaps in the source:

- The **caffeine/sweetener column** shows an icon rather than text for cola drinks and many meals, so we recorded no text for those rows.
- **Allergens** are printed only as icons and were not extracted. The booklet's legend lists gluten, caffeine, milk, soya, no-calorie sweetener and egg.

## Items without published nutrition

- **Not cross-checked against the live menu.** online.kfc.co.in and the app could not be fetched from this environment. We do not know which current menu items are missing from V6.
- **No standalone rows:**
  - **Pepsi Black:** it appears only inside meals.
  - **Stand-alone "Eggless Mayo" dip:** the booklet has "Creamy Veg Mayo". Whether that is the same product is not stated.
  - **Coffee or tea:** none listed.
- **No fibre** values for any item.
