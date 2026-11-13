# La Pino'z Pizza (India) — official nutrition data

CSV: `lapinoz_pizza.csv` — **199 rows**, one per menu listing that has nutrition. 101 are veg and 98 non-veg. **All values are per 100 g.**

## Source (official)
- La Pino'z official website, https://lapinozpizza.in. Menu category pages are at `https://lapinozpizza.in/products/<category>`, retrieved 2026-11-13.
- On those pages, the item description itself carries the nutrition. For example:
  "[Fat-10.9 per 100 g, Protein-12.7 per 100 g, Carbohydrate-34.9 per 100 g, Sugar-0 per 100 g, Calories-288.9 k.cal]Nutritional information per 100g".
  The same text appears on each product-detail page.
- There is no nutrition PDF or booklet on the site. No other official La Pino'z nutrition document was found.
- Published nutrients: fat, protein, carbohydrate, sugar and calories, all per 100 g.
  - **Not published:** fibre, sodium, saturated fat, serving weight.
- Categories parsed:
  - veg-pizza, non-veg-pizza
  - classic-pizzas-for-classic-maniacs, super-cheesy-double-burst, personal-pizza-slice, 4-in-1-giant-pizza
  - sides, desserts-and-beverages
  - menu-89, sprite-x-spicy, super-saver-combos, super-saver-deals
- `page_or_section` gives the category plus the item slug and id.
- veg_nonveg comes from the site's own veg / non-veg marker on each item card.

## Ambiguities
- **Per 100 g only.** Sizes (Regular, Medium, Large; for example "Regular Pizza @ 169 / Medium @ 299 / Large @ 399") carry no gram weights, so kcal per pizza or slice cannot be derived from official data.
  - `serving_g` = 100 and `variant_or_size` = "all sizes (per 100 g)".
  - The listed price in `notes` is the smallest or default size.
- **Duplicate listings:** the same pizza often appears under several names and categories, each with its own row. For example: "Farm Villa", "Farm Villa Pizza", the "… Personal Giant Slice (22.5 Cm)" versions, and the "… Double Burst" versions. Values are usually identical across them.
- **Typos in the source:** 24 rows have irregular units, and the raw bracket text is kept in `notes`. Examples:
  - "Fat-20.3 per 10 g"
  - "Protein-13.9 per g"
  - "Calories-333.6 k/cal" and "k.call"
  - "Calories-266.7 4k.cal", read as 266.7
  - "[Fat-4.6, Protein-8, …]" with no units, where only the trailing label says per 100g

  Numbers are kept exactly as printed.
- Some per-100 g values look implausible, for example Garden Special: fat 18.8 g with carbs 16.4 g at 277.6 kcal. They are kept as published.

## On the menu but without published nutrition (626 listings)
- **Many core pizzas:**
  - Cheese Margherita and Cheesy Margherita
  - Double Cheese Margherita, Cheese Lovers, Country Side, Garden Delight
  - Tandoori Paneer and Tandoori Special, Paneer Special, Paneer 65
  - Makhni Do Pyaza, Sweet Corn Delight, Indian Style, Authentic Veg, Ala Mexican
  - Korean, Nashville and Jamaican Jerk (veg and chicken)
  - Pepperoni, Butter Chicken, Chicken 65, Korma Chicken, Cheesy Macaroni
  - Classic 4-packs and 4-in-1 feasts
- **Most sides:**
  - Cheesy dip and the other dips, Lasagna
  - Tacos, Quesadillas, Wings, Korean rice bowls
  - Stuffed garlic breads other than those listed
- **All desserts and beverages:** Choco Lava, Brownie, shakes, cold coffee, mojitos, iced teas, Coke/Sprite/Fanta/Thums Up/Limca, water.
- **All combos and deals.** These are bundles and are not expected to carry nutrition.

The full list of names is in `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/lapinoz_debug.json` (`no_nutrition`).
