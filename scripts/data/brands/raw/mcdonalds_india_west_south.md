# McDonald's India — West & South (Westlife Foodworld): official nutrition data

CSV: `mcdonalds_india_west_south.csv` (192 rows, one per item × size).

## Source used

| | |
|---|---|
| URL | https://www.mcdonaldsindia.com/pdf/2024/nutrition-information.pdf |
| Linked from | https://www.mcdonaldsindia.com/nutrition.html ("Nutrition information" button). The same page also links `pdf/2024/allergen-information.pdf`, which was not used. |
| Title | "McDonald's Nutritional Information Per Serve" |
| Date / version | Folder `pdf/2024/`. HTTP Last-Modified is 10 Apr 2024. No newer version was linked when checked on 13 Nov 2026. |
| Structure | 2 pages. Page 1 has serving size, kcal (rounded), the Veg/Non-Veg symbol and allergens. Page 2 has full per-serve values: serve size, energy, protein, total fat, sat fat, trans fat, cholesterol, total carbohydrate, total sugars, added sugars and sodium. Each item also has a %RDA row, which we did not capture. |

Numbers come from page 2, exactly as printed, with 2 decimals.

`veg_nonveg` comes from the green and red symbols on page 1, joined by serve size and kcal. 29 items are non-veg. They include Vanilla Chocochips Muffin and all the egg McMuffins.

For 12 rows we could not match a page-1 symbol, because their serve size or kcal differs between the two pages:
- L1 Coffee with milk
- McSpicy Deluxe Paneer Burger
- Americano L
- Mocha Frappe 14 oz
- Mixed Berry Cooler 14 oz
- Moroccon Mint Green Tea R
- Strawberry Green Tea S
- Chocolate Oreo Frappe 10 oz
- Hazelnut Cold Coffee 10 oz
- Hazelnut Hot Chocolate S
- McFlurry Oreo Small and Regular

We marked these as veg because no meat, egg or fish appears in the name. `notes` says so on each row.

Fibre is not published, so `fiber_g` is empty. Sat fat, trans fat, cholesterol and added sugar are in `notes`.

## Item count
192 rows across the menu sections:
- Regular: 41
- Breakfast: 8
- McCafé: 67
- Desserts: 30
- Gourmet: 10
- Beverages: 18
- Condiments: 13
- Double Patty: 5

## How the PDF was read, and ambiguities
- **Names drawn as outlines.** 16 item names on page 2 are vector outlines with no text layer. We read them from the rendered page and flagged each row in `notes`:
  - Pizza Puff
  - L1 Coffee
  - L1 Coffee with milk
  - Double Chocochips Muffin
  - Vanilla Chocochips Muffin
  - Veg McMuffin
  - Double Cheese McMuffin
  - Spicy Egg McMuffin
  - Sausage Mc Muffin
  - Sausage Mc Muffin with egg
  - Egg McMuffin
  - Iced Coffee 10 oz and 14 oz
  - Classic Cold Coffee 10 oz and 14 oz
  - Hazelnut Cold Coffee 10 oz
- **Two parsers cross-checked.** One read the ruled table; the other read text positions. Where they disagreed (Cheese Slice, Sweet Corn, Piri Piri Cheese Slice, Double Chocochips Muffin and three fries rows), we checked the rendered image and used the value shown.
- **McCafé milk.** The milk type for Cappuccino, Latte, Flat White, Mocha, Hot Chocolate, Babycino, frappés and shakes is not stated. No alternative-milk values are published.
  - Hot drinks come in S/R/L (Hazelnut drinks in S/R). Iced drinks come in 10 oz and 14 oz.
  - "L1 Coffee" is published as black (200 ml) and "with milk" (205 ml).
  - KitKat Frappe has one unlabelled size (314 ml).
- **Page 1 vs page 2 disagreements.** Page 2 was used in every case:
  - L1 Coffee with milk: 33 kcal on page 1, 35.80 on page 2.
  - Chocolate Oreo Frappe 10 oz: 314 ml vs 334 ml.
  - Mocha Frappe 14 oz: 334.5 ml vs 343.5 ml.
  - Hazelnut Cold Coffee 10 oz: 305 ml vs 304 ml.
  - Hazelnut Hot Chocolate S: 230 ml vs 231 ml.
- **Probable source errors.** Kept as published and flagged in `notes`:
  - Tomato Ketchup Sachets: total fat 23.45 g for an 8 g sachet. Its %RDA cell shows 0.00, so this is a typo.
  - Veg Nuggets 2 pc: protein 13.03 g, while 4 pc shows 6.06 g.
  - McSpicy Premium Chicken: cholesterol 302.61 mg.
  - The "Fanta Oragne" spelling. The item is normalised to "Fanta Orange", with the original kept in notes.
- **Sizes.** The Fries split is Regular/Medium/Large. McNuggets come in 4/6/9 pc. Soft serves, sundaes and McFlurries come in Regular/Medium, plus Small/Regular for McFlurry Oreo. Coke, Fanta and Sprite come in Small 299 / Medium 394 / Large 544 ml.

## Staleness and items without published nutrition
- The document is from April 2024, so items launched later are not covered. One example is the "Protein Plus" slice add-on, reported in July 2025. The W&S live menu is only on the McDelivery app, which we could not crawl. We therefore cannot list every current item that lacks nutrition.
- Combo and meal bundles are not published. Only individual items are listed.
