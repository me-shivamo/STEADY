# McDonald's India — North & East (Connaught Plaza Restaurants Pvt Ltd): official nutrition data

CSV: `mcdonalds_india_north_east.csv` (121 rows, one per item × size). 94 rows come from the Dec-2025 booklet and 27 from the Apr-2026 menu PDF.

## Sources used

### 1. Product Nutritional Information Booklet (primary source, 94 rows)

| | |
|---|---|
| URL | https://mcdindia.com/wp-content/uploads/2025/12/product-nutritional-information-bookletpdf.pdf |
| Linked from | Embedded (flipbook) on https://mcdindia.com/nutritional-information/. The page's schema says it was published 6 Jan 2026 and modified 8 Jan 2026. |
| Date / version | Uploaded Dec 2025; HTTP Last-Modified 24 Dec 2025. Two item sheets carry their own tags: Boba Sundae "V1, 08-Oct-22" and Coca-Cola Zero "V1, 10-Jul-24". |
| Structure | 72 pages, one product per page. Each page has a table of serve size, energy, protein, total fat, sat fat, trans fat, cholesterol, total carbohydrate, total sugars, added sugars and sodium, plus allergens. There are 1–4 size columns per page. |

The booklet has a text layer. It was parsed with a ruled-table extractor, and wrapped cells such as "1004.3 / 3" were re-joined as "1004.33". Values are kept exactly as printed.

### 2. MENU McDonald's India (N&E) (27 rows, items not in the booklet)

| | |
|---|---|
| URL | https://mcdindia.com/wp-content/uploads/2026/04/mcd-website.pdf |
| Linked from | The "View Menu" button on https://mcdindia.com/ |
| Date / version | HTTP Last-Modified 24 Apr 2026 |
| Structure | 69 pages, image-only (no text layer). Each product page has a nutrition panel with energy, protein, total fat, cholesterol, trans fat, sat fat, total carbs, total sugars, added sugars and sodium. **No serving weight is shown.** |

We OCR'd the pages locally with tesseract and then **transcribed each new item's panel by eye** from high-resolution crops. Every value in these 27 rows was read from the image, not taken from OCR.

Of the 69 pages, 37 match a booklet item exactly on kcal. That confirms those items are on the current menu, and their booklet rows carry a note saying so. The 27 pages that do not match were added as new rows:
- Hot Cake
- Egg & Sausage McMuffin
- Cappuccino (breakfast page, 136.39 kcal)
- **McSpicy Chicken Burger**
- **Chicken Maharaja Mac**
- **Spicy Chicken Wrap**
- McCafé: Iced Americano, Americano, Mocha, Espresso, Macchiato, Velvety Hot Chocolate, Cold Coffee Frappe, Caramel Frappe, Chocolate Shake, Strawberry Shake, Vanilla Oreo Shake, Iced Latte, Iced Coffee, Watermelon Cooler, Peach Iced Tea, Skillet Cookies, Garlic Marinara Toasty, Butter Croissant, Strawberry Cheesecake, Latte, Cappuccino (McCafé page, 206.50 kcal)

Fibre is not published in either source. Sat fat, trans fat, cholesterol, added sugar and allergens are in `notes`.

### Official but not used for numbers
https://mcdindia.com/wp-content/uploads/2022/11/product-nutritional-booklet_cprlwebsite_231122.pdf is still linked as "Download Nutritional Info" on the mcdindia.com homepage.
- It is 85 pages. The index sheet shows item versions dated Jun–Sep 2022, and the file was re-uploaded with Last-Modified 20 Aug 2025.
- It is superseded by the Dec-2025 booklet and the Apr-2026 menu, so we did not take numbers from it.
- Items that appear only in it: Schezwan Veg Burger and Dosa Masala Burger. Neither is in the Dec-2025 booklet or the Apr-2026 menu, so they are probably discontinued.

## Item count
121 rows: 101 veg and 20 non-veg.

**How veg/non-veg was decided**
- Booklet rows use the green and red symbols, detected from the rendered page colours.
- Menu rows use the symbol where we checked it by eye (8 pages). The rest are decided from the item name, and `notes` says so.

## Ambiguities
- **Saucy Wrap - Chicken** shows a **green (veg) symbol** in the booklet. We set it to non-veg from the name; it is a source error.
- **Unlabelled sizes in the booklet.** The `variant_or_size` cell says "unlabelled" and gives the weight or volume:
  - McFlavor Fries: 110 g and 155 g. The Apr-2026 menu shows the 110 g values for "Peri Peri Fries", standard regular.
  - Cold Coffee: 300 ml and 270 ml.
  - Masala Chai: 150 ml and 90 ml.
  - McFloat: two unlabelled columns plus "Sprite Float". The two unlabelled columns are identical to West & South Coke Float and Fanta Float.
- **Sundae Chocolate.** Columns are labelled "Regular" (91.79 g) and "Mini" (132.08 g), so the larger cup is called Mini. Kept as published.
- **Nuggets.** Sizes are 4, 6, 9 and 20 pcs. Carbs, sugars and cholesterol are not published for Nuggets or Fries (Regular 77 g / Medium 109 g / Large 154 g).
- **Coffee and milk.**
  - Booklet "Hot Coffee" is black (200 ml, 6.8 kcal). The add-ons are published separately: Milk Tub (Creamer for Coffee) 10 g = 14 kcal, and Sugar Sachet 5 g = 20 kcal.
  - McCafé drinks on the Apr-2026 menu carry the footnote "Nutritional values shown on the menu are based on a standard regular serving size. For information on other serving sizes, please refer to the nutritional booklet." The booklet, however, has no McCafé sizes. So **only one size per McCafé drink is published, with no ml and no milk type**, and no other milk options are listed.
  - There are two different Cappuccino panels: Breakfast p9 at 136.39 kcal and McCafé p48 at 206.50 kcal. Both are kept.
- **Duplicate booklet pages.** Boba Sundae appears on p34, p45 and p53; Sundae Mango on p37 and p51; Coca-Cola Zero on p46 ("Small") and p54 ("Regular"), both 300 ml. Values are identical, so each was kept once, with the duplicate pages noted.
- **Spellings normalised in `item`** (the original is kept in `notes`): "Cripsy Veggie Burger" and "Minute Made Pulpy Orange". "Mc Muffin" was normalised to "McMuffin".
- **Cold Coffee Frappe sodium** is printed as "290.509mg" and kept as published.
- **Coca-Cola, Fanta and Sprite** are published in Small 299 / Medium 394 / Large 544 ml. For these, carbs = sugars = added sugars.

## Menu items without published nutrition
- The 4 Happy Meal combos on the Apr-2026 menu (Chicken McGrill, Chicken McNugget, McAloo Tikki, McVeggie) have no nutrition panel. They are combos of components, some of which are published separately.
- **No serving weight or volume** is published for the 27 menu-only rows: McSpicy Chicken Burger, Chicken Maharaja Mac, Spicy Chicken Wrap, all McCafé drinks and bakery, Hot Cake and Egg & Sausage McMuffin.
- Medium and Large sizes of McCafé drinks are not published anywhere.
