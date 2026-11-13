# Biryani By Kilo (India) — official nutrition data

## Result: no official per-item nutrition published (0 rows)

`biryani_by_kilo.csv` contains only the header row.

## What was checked (2026-11-13)
| URL | What it is | Nutrition? |
|---|---|---|
| https://www.biryanibykilo.com/ (Next.js; menu in `__NEXT_DATA__`) | Brand ordering site with the full menu | Item objects have name, price, short/long description, "serve_for", sized items and tags, but **no nutrition fields**. Descriptions give pack size and servings only (for example "1/2 Kg \| Serves 1-2"). |
| https://biryanibykilo.com/blog-is-chicken-biryani-healthy-guide | Brand blog post "Is Chicken Biryani Healthy? Guide to Calories & Protein" | Gives generic ranges for "chicken biryani" ("Calories: 450–550 kcal, Protein: 25–30 grams, Carbohydrates: 50–60 grams, Fats: 15–20 grams") with **no serving size and no link to a BBK product**. Not usable as item-level data, so not in the CSV. |
| https://biryanibykilo.com/calories-in-veg-biryani-which-is-dum-cooked | Linked blog URL | Returns "Page Not Found". |

## Menu (for the record — no nutrition published; order counts from the site in brackets)
- **Hyderabadi Biryani:** Chicken Hyderabadi Dum Biryani 1/2 kg [31584] and 1 kg [8160], Veg Hyderabadi 1/2 kg [6363] and 1 kg [3422], Paneer Hyderabadi Dum 1/2 kg [4907] and 1 kg [691], Kathal Hyderabadi Dum 1/2 kg [3428], Chicken Boneless Dum 1/2 kg [2780], Mutton Hyderabadi Dum 1/2 kg (4 pcs) [2155] and 1 kg [1358], Egg Hyderabadi Dum 1/2 kg [2167], Soya Chaap Dum 1/2 kg, Paneer 65 Biryani 1/2 kg, Malamaal Murg Dum 1/2 kg, Chicken 65 Biryani 1/2 kg, Peshawari Chole Biryani 1/2 kg.
- **Lucknowi / Kolkata:** Chicken Lucknowi 1/2 kg, Kolkata Chicken 1/2 kg.
- **Combos:** Paneer, Veg, Chicken and Mutton Biryani Combo.
- **Curries:** Butter Paneer, Butter Chicken (boneless), Dal Makhani 400 g.
- **Kebabs:** Tandoori Chicken 4 pcs and 8 pcs, Chicken Seekh Kebab 250 g, Chicken 65 250 g, Chicken Ghee Roast, Mutton/Veg Galouti 6 pcs, Hara Bhara Kebab 6 pcs, Paneer 65, Tandoori Soya Chap Tikka, Soya Malai Chap Tikka, Crispy Corn Stick, Veg and Non-Veg platters.
- **Rolls:** Chicken Tikka, Chicken Seekh, Paneer Tikka. **Rice:** Rice, Jeera Rice.
- **Breads and extras:** Rumali Roti, Malabar Paratha, Butter Tawa Roti, Tawa Roti, Ulte Tawa Ka Paratha, Raita 200 ml, Burani Raita, Salan 200 ml, Masala Curry.
- **Beverages:** Imli Adraki Lemonade, Bombay Banta Masala and Mint Spritzer, Thums Up (can and pet bottle), Coolberg non-alcoholic beers.
- **Desserts:** Gulab Jamun with Rabri (1 and 2 pc), Matka Phirni 250 g and 500 g.

BBK sells by weight (1/2 kg, 1 kg). A future official kcal-per-100 g figure would map directly onto these sizes, but none is published today.
