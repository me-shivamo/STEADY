# Blue Tokai Coffee Roasters: official nutrition data

## Sources used
1. **Blue Tokai official digital cafe menu:** menu.bluetokaicoffee.com/?cafeCode=CA-094.
   - Each cafe page on Blue Tokai's store locator ("VIEW MENU" on stores.bluetokaicoffee.com) links to this menu.
   - The page shows per-item nutrition from a public menu feed. The page fetches that feed itself with a plain unauthenticated GET; we fetched the same thing:
     - https://rdx8azn9lh.execute-api.ap-south-1.amazonaws.com/default/rista-tab-menu-api?requestType=menu&branchCode=CA-094 (Bengaluru, Indiranagar Domlur)
     - &branchCode=CA-052 (Delhi, Khan Market)
     - &branchCode=CA-092 (Mumbai, Bandra West)
   - Fields: calorieCount, portionSize + unit, protein, carbohydrates, totalFat, saturated, transFat, cholesterol, fiber, sugar, sodium, allergyInformation and item tags (Vegetarian / Non-vegetarian / Egg / Vegan).
   - The feed has no version number. All data was retrieved on 2026-11-13.
2. **Blue Tokai store-locator page** (stores.bluetokaicoffee.com, Indiranagar Domlur cafe, "Newly Launched" section):
   - https://stores.bluetokaicoffee.com/blue-tokai-coffee-roasters-indiranagar-domlur-cafe-indiranagar-bengaluru-436797/Home
   - Shows portion size and kcal only, for 3 cookies.

## Row count
**158 rows:**
- 155 from the menu feed: Brewed Coffee 40, Food 43, Suchali's Artisan Bakehouse 45, Other Beverages 19, protein sandwiches under "Bread Option" 8.
- 3 from the store page.

We merged the three cafe menus. If two cafes gave the same kcal for an item, we kept one row and listed both cafe codes in `page_or_section`.

## Ambiguities
- **Sizes:** Blue Tokai sells **one size per drink**, for example Cappuccino 240 ml, Latte 240 ml, Iced Latte 320 ml and Americano 200 ml. There are no S/M/L sizes.
  - "Pour Over" and "Iced Pour Over" are split by roast type (6 variants each, same kcal).
  - Teas are "Tea for 1".
  - "Cascara & Hibiscus" comes with Soda or with Tonic Water.
- **Milk:** the published values are for the base item. The menu offers "Choice of Milk": Regular Milk (the default; free), Oat Milk (+Rs20), Lactose-Free Milk (+Rs20), and on some drinks Better Bet plant-based milk or AltCo cashew & oat milk.
  - **No per-milk nutrition is published.** The menu options for each drink are listed in `notes` (28 rows).
- **Different values at different cafes:** these items differ between the Khan Market cafe (CA-052) and the other two cafes, so each version is its own row, labelled "cafe CA-052 listing":
  - Peri Peri Fries: 348 vs 392 kcal.
  - Parsley Garlic Cheese Fries: 433 vs 496 kcal.
  - Spicy Mushroom Sourdough Sandwich: 335 g / 534 kcal vs 244 g / 277 kcal.
- **Two official sources disagree on one cookie:** Almond & Raspberry Cookie is 104 g / 450 kcal in the menu feed but "100g / 416.9 kcal" on the store page. Both rows are kept.
- **Missing portion sizes:** about 20 rows have no portion size (fries, protein sandwiches, a few rice and toast dishes). One example is Classic Salted Fries at 1068 kcal with no portion and no macros.
  - The protein sandwiches have the protein grams in their names, for example "Peri Peri Grilled Cottage Cheese Protein (40g) Sandwich", but the macro fields are only partly filled.
- **Odd values published as-is:**
  - Hot espresso drinks show sugar 0 even though they contain milk (for example Cappuccino: 10.79 g carbs, 0 g sugar).
  - Some sandwiches show sodium 0.
  - "Lychee Lemon Spritzer" uses "grams" as its portion unit.
- **Veg status** comes from the item tags: veg 120, egg 12, non-veg 20 (the 3 store-page rows have no veg status).

## Items on the menu without published nutrition
These are on the three cafe menus but have no nutrition in the feed (beans, equipment and merchandise excluded):
- Add-ons: Smoked Chicken, Paprika Chicken, Cheese Sauce, Add Free Range Soft-Boiled Egg, Extra Maple Syrup Dip, Scoop of Ice Cream, Condensed Milk, Extra Sourdough Slice, dips (Hummus, Labneh, Peri Peri, Salsa).
- Manual brews: French Press, Chemex, Aeropress.
- Cookies: Milk Crumb Chocolate Cookie and Chocolate Chip Sea Salt Cookie. These are covered only by the store-page rows, which give kcal only.
- Packed and retail items: Classic Bold / Classic Light / Cascara Cold Brew cans, Elderflower and Orange Mint Cold Brew, Iced Latte Classic Can, Classic and Mocha Cold Coffee Cans (pack of 4), cookie boxes (Multi-Seed Millet, Wheat Bran Coconut, Chocolate Chip, Oatmeal & Cranberry), chocolates (Classic Dark, Cacao & Berry, Classic Milk), nuts and trail mix, bottled water.
