# Theobroma (India) — official nutrition data

## Source used
| URL | Title | Date / version |
|---|---|---|
| https://theobroma.in/assets/wla_new/theobroma/downloads/nutrition-guide.pdf | "Nutrition and Allergen Guide" (Theobroma), linked from https://theobroma.in/nutritional-information | Cover says **JUNE 2026**; fetched 2026-11-13 (29 rendered pages) |

Official, brand-hosted PDF. No other official nutrition source found (product pages on theobroma.in carry no nutrition panel).

## Item count
- **114 rows** in `theobroma.csv` (one per card in the guide). Sections: Croissants & Danishes 3, Bread 4, Brownie 10, Cake 24, Dessert 14, Dry Cake 8, Pastry 16, Savoury 13, Cookies 19 (incl. crackers/biscotti), Gifting 1 (Almond Rocks), Beverages 1 (Cappuccino).
- Values are the guide's **"Per Serve"** column (serve weight in `serving_g`). Per-100 g kcal, added sugar, sat fat, trans fat, cholesterol and the allergen line are kept in `notes`. Fibre is not published → `fiber_g` empty everywhere.
- Spot-checked against the rendered PDF (Savoury page; numbers match exactly).

## Ambiguities / caveats
- **Serve ≠ whole product for cakes, breads and packs.** E.g. "Dutch Truffle Cake [1kg]" lists a 50 g serve; "Butter Cookies [10 Pieces]" lists a 20 g serve; "Hazelnut Cookies [10 Pieces]" serve = 117 g (whole pack). `variant_or_size` holds the product size as printed; `serving_desc` states the serve.
- **Cards with no size/piece label**, kept as printed and distinct from the labelled card: "Tiramisu Jar" (110 g serve) vs "Tiramisu Jar [1 Piece]" (140 g); "Chocolate Mousse Jar" vs "[1 Piece]" (both 70 g, different values); "Red Velvet Cupcake" (100 g) vs "[1 Piece]" (40 g); "Eggless Butterscotch & Milk Chocolate Cake" (no size) vs "[1/2kg]"; "Double Choco Chip Cookies" (30 g, no pack) vs "[8 Pieces]" (25 g).
- **A card titled only "Cake"** (Dessert section, PDF page 13, 40 g serve, 195.5 kcal, non-veg mark) — the title looks truncated in the source; we kept it as "Cake".
- **Cappuccino [250ml]: 647.5 kcal, 33.4 g fat, 74.2 g sugar per 250 g serve** (259 kcal/100 g). It is internally consistent with its macros but implausible for a cappuccino; flagged SUSPECT in notes. The guide does not say which milk is used and lists no other milk option or size; it is the only beverage in the guide.
- **veg_nonveg**: taken from the FSSAI veg (green) / non-veg (brown) mark printed beside the card title, detected by pixel colour. Only some cards carry a mark (41 of 114 detected); where none is printed we left it empty, except items whose official name says Chicken / Non-Veg / Veg (5 more rows filled from the name, noted in `notes`). 68 rows have no veg/non-veg value. Cross-check: no "veg"-marked item lists Egg in its allergens. Egg presence is noted from the allergen line.
- `sodium_mg`/sugar contain "<2.0", "<0.1" etc. exactly as printed (e.g. Farmhouse Boat Pizza sugar "<2.0").

## On the menu/site but with no published nutrition
- **Beverages (largest gap):** Classic Cold Coffee 300 ml, Cold Coffee Classic/Hazelnut 200 ml, Vietnamese Cold Coffee, Latte, Flat White, Hazelnut Latte, Spanish Latte, Dark Chocolate Mocha, Hot Chocolate, Classic Lemonade, Lemon/Peach Iced Tea, Mango-Pineapple and Valencia Orange juices.
- Brownies: Biscoff, Chocolate Orange, Hazelnut Nutella, Mocha Coffee, Triple Choco Chip, No Added Sugar Rich Chocolate.
- Muffins: Blueberry Crumble, Chocolate Chip.
- Desserts: Blueberry Cheesecake Jar, Lotus Biscoff Cheesecake Tub 200 g, Lotus Biscoff Bento Cheesecake 320 g, Coffee / Vanilla Tres Leches 220 g, Burnt Basque Cheesecake slice.
- Cakes/pastries: Red Velvet Cake 480 g, Kunafa, Opera, Tiramisu (560/660 g), Almond Honey Vanilla, Black Forest Mousse, Chocoholic Mousse cake/pastry, Dark Choco Mousse 560 g, No Added Sugar Red Berry Bento, Eggless Red Velvet Pastry, Eggless Dark Chocolate Opium Pastry.
- Savoury: Chicken Ham Cheese Stuffed Roll, Creamy Mushroom Corn Stuffed Roll, Paneer Junglee (protein) sandwiches, Chicken Tikka Protein Sandwich, Spicy Paneer Butter Puff.
- Cookies/breads: Chilli Cheese Cookies, Spicy Peanut Cookies, Eggless Almond Biscotti, Eggless Chocolate Chip / Double Choco Chip Cookies, 100% Whole Wheat Bread 250 g, Multigrain Bread 250 g.
