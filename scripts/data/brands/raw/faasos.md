# Faasos (India, Rebel Foods) — official nutrition data

## Sources used
| URL | Title | Date / version |
|---|---|---|
| https://www.eatsure.com/faasos/gurgaon/sushant-lok-rk | Faasos store menu on EatSure (Rebel Foods' own ordering site; faasos.com "Order Now" links here) | live menu, retrieved 2026-11-13 |
| https://www.eatsure.com/faasos/bengaluru/bangalore-hal | same — Bengaluru (HAL) | retrieved 2026-11-13 |
| https://www.eatsure.com/faasos/hyderabad/suncity-fc | same — Hyderabad (Suncity) | retrieved 2026-11-13 |
| https://www.eatsure.com/faasos/new-delhi/mukherjee-nagar-fc | same — New Delhi (Mukherjee Nagar) | retrieved 2026-11-13 |

faasos.com is now a brand page, and its "Order Now" button goes to https://www.eatsure.com/faasos. EatSure is owned and run by Rebel Foods (Faasos's parent), so we count it as the brand's own site, not a third-party aggregator. The data is the per-item **"Nutritional Value"** panel (Energy kcal, Protein, Fat, Carbs, Sugar). We read it from the menu JSON embedded in the store page. The disclaimer is the same as Behrouz's: values are per serve, as shared by the restaurant, and indicative ("Value based on default selection, may vary with customisation").

## Item count
- **93 rows** in `faasos.csv`, merged across 4 store menus. No item showed different values between cities. Duplicate listings with identical numbers (for example "Baked Chicken Tikka Pizza Wrap" and "...Wrap.") are merged, and the extra product ids are listed in `notes`.
- Rows by section: Sides & Beverages 17, Wholewheat Wraps 13, High Protein Wraps 11, Crispy Bake 9, Desserts 8, Midnight Munchies 7, Wrap Meals 6, Shawarma 6, Baked Pizza Wraps 4, Burger Wraps 3, Paratha Burgers 2, Signature 2, others 5.
- **Fibre and sodium are not published.**

## Ambiguities and caveats
- **Protein claims in item names don't match the panel.** "Masala Chicken Tikka Protein Pro Wrap (39g Protein)" shows 28 g, "Chicken Bhuna ... (35g Protein)" shows 32 g, "Masala Paneer Tikka ... (22g Protein)" shows 18 g, and "Tandoori Soya Chaap ... (28g Protein)" shows 17 g. The CSV keeps the panel value and flags each mismatch in `notes`.
- **Wrap meals and combos** (for example "2 Chicken Bhuna Wrap with Fries & Coke Meal" at 1614 kcal) are totals for the whole combo as listed.
- **"Coke Zero 330 ml Can"** is published as 0 kcal and 0 g of everything.
- **Our biggest gap is the classic Faasos wraps.** Masala Chicken Tikka Wrap, Masala Paneer Tikka Wrap, Chicken Bhuna Wrap, Cheese Melt wraps, the burger wraps, the rice bowls (Regular/Jumbo), Crispy Fries, Potato Wedges, Chicken Popcorn and Pizza Puff are all "variation" items (size or bread choice), and their panel only appears in the item-detail view (`/v1/api/`, blocked by robots.txt). The nearest published versions are the **Wholewheat** and **Crispy Baked** versions of the same wraps, for example "Masala Chicken Tikka Wholewheat Wrap" 563 kcal and "Crispy Baked Masala Chicken Tikka Wrap" 557 kcal. Those are different SKUs, so don't substitute them silently.

## On the menu but with no published nutrition (list level)
- **Variation items (130 listings):** the classic wraps and rolls (Masala Chicken/Paneer Tikka, Chicken Bhuna, Malai Chicken Kebab, Pindi Chole, Chatpata Double Egg, Classic/Chipotle Egg, Smoked Butter Chicken, Zaikedar Mutton Bhuna, Mutton Kefta, Lebanese Falafel/Meatball, Masala Mushroom, Indie Chatpata Aloo, Cheese Melt family, Chilli/Hot Garlic/Chipotle/Jalapeno/Teriyaki/Tandoori/Korean/American BBQ/Chimichurri burger and crispy wraps). Also the Paratha Burgers (single), Shawarmas (Classic/Special Smoky, Peppy, Spicy, Paneer Tikka, Sizzled Falafel), the rice bowls (Chicken/Paneer/Pindi Chole Signature, Smoked Butter Chicken, Dal Makhani, Rajma Masala, Mutton Bhuna, Egg, Royal Chicken; Regular and Jumbo), Chicken Keema Rice Feast, Crispy Fries, Potato Wedges, Chicken Popcorn and Pizza Puff.
- **Build-your-own meals (50 listings):** Veg/Non-Veg Classic, Signature, Burger, Pizza-Wrap and Shawarma meals, "Wrap + Side/Dessert/Beverage" bundles, and "2 Classic Rolls at 160/165".

Full list with product ids: `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/faasos_missing.json`.
