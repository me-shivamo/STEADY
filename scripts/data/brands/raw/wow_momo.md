# Wow! Momo (India) — official nutrition data

## Sources used
| URL | Title | Date / version |
|---|---|---|
| https://woweats.co.in/ | "Wow Eats": Wow! Momo's own ordering site (linked from wowmomo.com) — item descriptions | homepage menu data, retrieved 2026-11-13 |
| https://wowmomodashboard.com/links/wow-momo-nutrition/ (also wow-chicken-nutrition, wow-china-nutrition) | The "Nutrition" links in wowmomo.com's menu | live page says **"Coming soon."** on 2026-11-13 |

## Item count
- **8 rows** in `wow_momo.csv`: Chicken Darjeeling Steam (261.22 kcal), Veg Darjeeling Steam (187.98), Chatpata Paneer Steam (310.10), Corn & Cheese Steam (206.13), Chicken Cheese Steam (214.54), Chicken Darjeeling Fried (256.84), Chicken Cheese Fried (279.01), and Gluten Free Chicken Darjeeling Chilli (273.22 kcal, protein 11.13 g).
- All values are **kcal per 100 g**, copied from item-description text such as "100 gms / 261.22 Kcal". Only energy is published (plus protein for the gluten-free item).

## Ambiguities and caveats
- **The plate weight is not published.** A plate is "5 pcs (Serves 1)", but the site never gives its weight in grams, so per-plate kcal **cannot be derived from official data**. Any per-plate number would need a portion assumption, which this dataset leaves out.
- The statements don't say whether the dipping sauce is included; we assume it isn't.
- Wow Eats is a single-page app with `noindex`. We only read the menu data embedded in the homepage. Store-specific menus may list more items with kcal text.
- **The official "Nutrition" pages** on wowmomodashboard.com currently say "Coming soon." The Internet Archive shows a Sept 2025 version of the Wow! Momo nutrition page (with veg/non-veg images), but archive.org kept rate-limiting us (HTTP 429) and the WebFetch tool can't reach it, so we didn't retrieve it. Worth a retry: `https://web.archive.org/web/20250919104406/https://wowmomodashboard.com/links/wow-momo-nutrition/`.
- Item name "Corn & Cheese Steam Momo." had a trailing period, which we removed.

## On the menu but with no published nutrition
Chicken/Veg Pahari Fresh Steam Momo, Chicken Himalayan Steam Momo, all the chilli, pan-fried and Kurkure momos (Chicken Darjeeling Chilli, Chicken Cheese Chilli, Crunchy Kurkure Paneer/Chicken), the 20-piece party boxes, the Korean Spicy Momo + Sprite combos, Moburg (momo burger), Wow! China dishes (Hakka/Chilli Garlic noodles, fried rice, Manchurian, Chilli Paneer/Chicken, Kung Pao, thalis), Wow! Chicken Korean items (burgers, wings, fries), sides (OG Crispy Fries, Peri Peri fries, spring rolls, meatballs), desserts (Choco Lava Cake, Nutty Choco Lava, Kesar Gulab Jamun, Chocolate Momo), Wow Thunderzz drinks, dips and sauces.
