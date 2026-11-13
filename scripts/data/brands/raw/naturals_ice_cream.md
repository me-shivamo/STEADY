# Natural's Ice Cream (India): official nutrition data

## Sources used
All three PDFs are linked from the brand's own page https://naturalicecreams.in/nutritional-info/ (fetched 2026-11-13).

| Link label on site | URL | Date / version |
|---|---|---|
| "Naturals" (main parlour menu) | https://naturalicecreams.in/wp-content/uploads/Naturals-1.pdf | Undated; HTTP Last-Modified 2024-12-11 |
| "Naturals Now" | https://naturalicecreams.in/wp-content/uploads/2025/08/PDF-all-N-value-for-website_Juhu_July-to-Sept-2025.pdf | "Juhu, July–Sept 2025" (filename); Last-Modified 2025-08-04 |
| "Naturals Just Sundaes" | https://naturalicecreams.in/wp-content/uploads/2024/07/All-N-values-for-website_Just-Sundae_July-2024_Updated.pdf | "July 2024 Updated" (filename); Last-Modified 2024-12-11 |

## Item count: 150 rows in `naturals_ice_cream.csv`
- Main "Naturals" menu: 92 rows. These are 84 ice creams plus 6 "Proprietary food, Category 1.7 dairy-based desserts" (Meetha Paan, Gajar Halwa, Gulkand, Rose Walnut, Rose Shrikhand, Beetroot Banana) and 2 no-added-sugar medium-fat ice creams.
- Naturals Now: 13 ice creams, 12 milkshakes, 6 sundaes and 1 sorbet.
- Just Sundaes: 23 sundaes and 3 milkshakes (one of them is "Mohabat Ka Sharbat").
- `variant_or_size` holds the menu format and section, for example "Naturals Now menu - Milkshake".

## Basis and serving sizes
- Every table is **per 100 g**, as the footnotes state, so `serving_g` = 100 on every row.
- Published serving sizes are not applied to the numbers. They are recorded in `serving_desc` and `notes`:
  - Main menu: 1 scoop = 80 g.
  - Naturals Now: 1 scoop = 90 g; milkshake glass = 300 ml; sundae ≈ 100 g; sorbet ≈ 100 g.
  - Just Sundaes: sundae ≈ 150 g; milkshake ≈ 150 g.
- The same item can carry a different serving size by format. Malai is one example: the same per-100 g values, but an 80 g scoop on the main menu and a 90 g scoop at Naturals Now.
- Milkshakes are given per 100 g while the glass is given in ml. No density is published.
- Added sugar, saturated fat, trans fat, cholesterol, the allergen statement and the FSSAI declaration (for example "MEDIUM FAT ICECREAM" or "PREBIOTIC FOOD CONTAINING INULIN") are kept in `notes`. Fibre is not published.

## Extraction method
- The main PDF is a clean single table, read from text and cross-checked against a coordinate-based parse. The two parses disagreed only on "< 0.1" versus "0.1", and the printed "< 0.1" was kept.
- The Naturals Now and Just Sundaes PDFs have numbers that are vertically offset from their dish names. Each value was assigned to its row by y-coordinate and to its column by x-coordinate.
- Visual spot-checks against the rendered pages matched, including Mud Slide, Ratnagiri to Bengal, Fruit Custard and the Naturals Now ice-cream rows.

## Ambiguities and source data-quality issues
All numbers are kept exactly as printed. Rows with problems carry a `SUSPECT` note; there are 37 of them.
- **33 rows list total sugar greater than total carbohydrate.** Examples: Thandai (sugar 25 g, carbohydrate 14 g) and Malai Khurma (43 g, 21 g). The energy values agree with the carbohydrate column, so the sugar figure is probably the one that is wrong.
- **Energy does not match the macros (more than 20% apart)** for Anjeer Pista Chikki (374 kcal printed, about 239 from macros), Ratnagiri to Bengal Sundae and Lychee Sundae.
- **Mango Medium Fat No Added Sugar Ice Cream Milkshake** (Naturals Now) prints protein 18, carbohydrate 13, total sugar 0 and added sugar 5. That looks like a column shift in the source, and it contradicts "no added sugar".
- Some items appear in more than one PDF. For example, Malai, Tender Coconut and Mango NAS appear in both the main menu and Naturals Now with identical values. Tadgola, Sitaphal and Blueberry Cheesecake sundaes appear in both Naturals Now and Just Sundaes with **different** values. Each is kept as its own row, distinguished by format.
- `veg_nonveg` is left empty because no mark is printed in the PDFs.

## On the website but with no nutrition in any PDF
- Coffee Fudge Crunch, Cranberry, Dark Chocolate Sorbet, Jalebi, plain "Mango Ice Cream" and Tender Coconut Naga Chilli.
- Several names on the shop differ only slightly from the PDF and are present: Black Grapes, Blueberry Nuts, Cherry Pineapple, Honey Ginger, Kala Jamun and Orange Pistachio appear as "... Medium Fat Ice Cream". Dates and Walnut appears as "Dates & Walnut", and Gajar Halawa as "Gajar Halwa".
- No nutrition is published for cones, cups, family packs or toppings.
