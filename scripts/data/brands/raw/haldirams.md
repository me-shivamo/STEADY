# Haldiram's (India) — official nutrition data (sweets)

## Sources used
| URL | Title | Date / version |
|---|---|---|
| https://haldirams.com/collection/sweets (and the product pages listed per row) | Haldiram's official online store (Haldiram Snacks Food Pvt Ltd, "Delhi Haldiram") | retrieved 2026-11-13 |
| https://cdn.shopify.com/s/files/1/0691/0948/1549/files/<label>.png (file name in each row) | Back-of-pack (BOP) nutrition-label images in each product's gallery on haldirams.com, FSSAI format | image files as served 2026-11-13 |
| https://haldirams.com/product/premium-sweets/besan-ladoo-250-gms | Product description text "Nutritional Values Per 100G" | retrieved 2026-11-13 |

The product pages themselves carry almost no nutrition text; only one product (Besan Ladoo 250 g) has it in the description. The numbers come from the **label images** in each product gallery. We downloaded them only to read them, transcribed them by hand, and are not redistributing them. Each row's `page_or_section` gives the exact image URL.

## Item count
- **29 rows** in `haldirams.csv`, all veg packaged sweets: Gulab Jamun (tin), Rasgulla (tin), Rasmalai Tikki, Cham Cham, Rajbhog, Gulabjamun cup, Rasgulla cup, Soan Papdi (Desi Ghee), Soan Papdi Elaichi, Kaju Katli (2 labels), Mini Kaju Katli, Kaju Roll, Kaju Sangam Burfee, Royal Orange Burfee, Chana Dry Fruit Burfee, Boondi Ladoo, Moti Choor Ladoo, Dry Fruit Besan Ladoo, Besan Ladoo 250 g (text), Ghee Mysore Pak, Mathura Peda, Kesar Peda, Special Malai Peda, Rajasthani Peda (from the Assorted Peda label), Dodha Burfee, Agra Taj Petha, Mango Halwa, Peanut Chikki.
- **Basis:** 27 rows are **per 100 g** (`serving_g` = 100), with the label's serving size and servings per pack in `serving_desc`. Two labels publish only **per-serving** values, and those rows use the serving weight: Gulabjamun My Treat Cup (56 g = 2 pieces) and Peanut Chikki (30 g = 1 piece).
- `sugar_g` = total sugars. Added sugar, saturated fat, trans fat and cholesterol are in `notes`.

## Ambiguities and caveats
- **These are packaged retail sweets, not restaurant plates.** Haldiram's restaurant dishes (chole bhature, raj kachori, thalis, dosa, etc.) have **no official online nutrition**. In-store menus at FSSAI-covered chains should show kcal, but nothing is online.
- **Tinned syrup sweets share one label.** Rasgulla, Rasmalai Tikki, Cham Cham and Rajbhog all print the same numbers (220 kcal, 3.84 g protein, 49 g carbs, 0.96 g fat per 100 g). They are copied as published. For the tins the label says nothing on whether "per 100 g" covers syrup + drained solids or solids only. Net weight 1 kg vs drained weight 420–430 g, and serving 28 g × 16 pieces ≈ the drained weight, which suggests it means drained pieces, but the label doesn't state it.
- **Kaju Katli has two labels.** The regular box (`kaju_katli_3.png`) says 446 kcal / 40.7 g sugar / 34.09 mg sodium per 100 g. The 400 g "Premium Gifting Edition" image (`KK_tin_400BOP.png`) says 562 kcal, **0.25 g sugar and 615 mg sodium** per 100 g. Those last two look wrong for a cashew-and-sugar sweet; that image looks like a mock-up. We kept it as published and flagged it SUSPECT in `notes`.
- **Kaju Roll = Mini Kaju Katli:** both labels print identical per-100 g values (446 kcal ...). Likewise **Chana Dry Fruit Burfee = Dry Fruit Besan Ladoo** (564 kcal ...), except trans fat.
- **Some labels contradict themselves on serving count** and are copied as published: Soan Papdi 250 g says 24 × 21 g, Boondi Ladoo 500 g says 6 × 32 g, Agra Taj Petha 200 g says 7 × 50 g.
- **Besan Ladoo 250 g (text source)** gives "Total Fat : 24.32" and "Cholesterol : 8.69" with no units. We stored fat as 24.32 g and noted that the unit isn't stated. The pack's own back-label image on the site is too low-resolution to read.
- **Different legal entities make the products:** Haldiram Snacks Food Pvt Ltd (Delhi), Harrshiv Healthy Foods & More Pvt Ltd (Nagpur, contract maker) and Haldiram Foods International (Nagpur, for the "My Treat" cups). The manufacturer and FSSAI licence printed on each label are in `notes`.

## On the site/menu but not transcribed
- **Label image available but not transcribed** (lower priority): Anjeer Dry Fruit Burfee, Assorted Chikki, Assorted Dry Fruit Bites, Kiwi Delights, Baklava Pistachio, Fatafat Bhel, "all_in_one" and two unnamed `bop_*.png` files. The URLs follow the pattern above (for example `.../files/mango_halwa_bop.png`).
- **No label found on the product page:** Badam Halwa, Strawberry Halwa, Mango Burfee, Khajur/Anjeer burfee boxes, Soan Cake range, Baklava/fruit "delights" gifting packs, Kaju Chocolate Roll.
- **Haldiram's restaurant menu (all items):** no official published nutrition found.
- **Savories and ready-to-eat** (Aloo Bhujia, Bhujia Sev, Dal Makhani RTE, etc.) were out of scope for this pass. Some of those product pages have the same BOP label images and could be collected the same way.
- **Piece weights published on labels:** Kesar Peda and Rajasthani Peda 24 g/piece and Mathura Peda 23.42 g/piece (Assorted Peda label); Gulab Jamun and Rasgulla tins 28 g serving (16 pieces); Rajbhog 43 g (10 pieces); Peanut Chikki 30 g/piece; Gulabjamun cup 56 g = 2 pieces.
