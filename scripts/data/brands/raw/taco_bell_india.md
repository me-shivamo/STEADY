# Taco Bell India: official nutrition data

CSV: `taco_bell_india.csv`, with 105 rows and 103 distinct item names. That is every row, S.N. 1–105, of the current sheet.

## Source used

- **Document:** "Nutritional and Allergens information". It is a single page, and the header reads "Value per serve".
- **URL:** https://www.tacobell.co.in/pub/media/pdf/nutritional-info-new.pdf. This is the target of the "Nutrition" link in the live site navigation on tacobell.co.in (desktop and mobile menus).
- **Version and date:** the embedded file title is "NI  Allergens sheet_01.04.26 (with Electrifying menu and corn cup).xlsx". The PDF was created on 2026-04-02 and the server's Last-Modified date is 2026-04-06.

Superseded official sources were **not used**:

- **https://www.tacobell.co.in/pub/media/pdf/nutritional-info.pdf**, titled "NI sheet-14 aug. 24_revised…". It was created in Oct 2024 and its link on the homepage is now commented out.
- **The HTML table at https://www.tacobell.co.in/nutritional-info.** Its nav link is commented out. It does not state a serving basis, and its values look like per-100 g figures: for example, Cinnamon Twist is 480.9 kcal there against 137.76 kcal per 29 g in the current sheet. It also lists many older items, such as Cheesy Double Decker Taco, Cheesy Gordita, Chalupa, Mexican Fries, Fiesta Taco and Chocodilla.

## How to read the numbers

- The sheet's columns are: S.N., Product name, Veg/Nonveg (icon), Allergens (icons), Serve Size, Gross Quantity, Energy (kcal), Protein, Carbohydrate, Total Sugar, Added Sugar, Fat, Sat Fat, Trans Fat (g), Cholesterol (mg) and Sodium (mg).
- **Numbers are as printed.** Most have 2 decimals; newer rows have 1 decimal or whole numbers. `sugar_g` is total sugar. Added sugar, sat fat, trans fat and cholesterol are in `notes`. Fibre is not published.
- **"BLQ" (below limit of quantification)** appears for sugars, trans fat and cholesterol on some newer rows. Where it affects `sugar_g`, the cell is left empty and `notes` says BLQ.
- **Squad packs** (S.N. 64–67 and 94–95) have Serve Size = 4. Values are **per serve**, one quarter of the pack. The gross quantity is the whole pack (for example, Cheesy Fries Squad Pack is 439 g). `serving_g` is left empty and the pack weight is in `serving_desc`.
- **Choco Mud Pie Delivery** is serve "1 (2pc)", 151 g. That one serve is the whole 2-piece pack.
- **Drinks:** 330 ml, stored in `serving_ml`.
- **Veg/non-veg:** taken from the green-dot or red-triangle icons, matched to the PDF's own legend and checked visually.

## Ambiguities

- **Rows 79–95 are marked "(e)".** The sheet title mentions the "Electrifying menu", but the PDF never defines "(e)". Several (e) rows duplicate non-(e) products with different values. For example, "OG Double Stacker Taco-Veg" is 326 g / 769 kcal, while the (e) version is 301 g / 596.62 kcal. We kept both. Which version a given store serves is unknown.
- **"Smokin Grilled NVT" / "NCT":** these abbreviations are not expanded in the source. The icons mark NVT as veg and NCT as non-veg.
- **Spelling:** the source has spelling variants ("Sqaud Rice Bowl-Non Veg", "Naked VegTaco"), which we kept.
- **Energy checks:** every row agrees with a 4/4/9 macro estimate within 15%, so no rows are QA-flagged.

## Items found on official pages without nutrition in the current sheet

- **Menu categories without nutrition:** the homepage menu lists a "Gordita" category, but no Gordita item is in the 2026 sheet. Combo categories ("Big Bell Box Combos", "Meal Mania", "Big Saving Combos", "Crave & Save") have no combo-level rows; only the components are listed.
- **Items only in the superseded 2024 sheet:**
  - Peach Ginger Zing
  - Chicken Seekh Kebab Taco
  - Crispy Taco Seasoned Potato
  - Supreme Rice Bowl (Veg/Non-Veg)
  - Soft Taco grilled Mexican Chicken
  - Molten Choco Pie (4 and 6 pieces)
- **No fibre** values for any item.
