# Behrouz Biryani (India, Rebel Foods) — official nutrition data

## Sources used
| URL | Title | Date / version |
|---|---|---|
| https://www.behrouzbiryani.com/behrouz-biryani/gurgaon/sushant-lok-rk | Behrouz Biryani official site — store menu (Gurgaon, Sushant Lok) | live menu, retrieved 2026-11-13 |
| https://www.behrouzbiryani.com/behrouz-biryani/bengaluru/bangalore-hal | same — Bengaluru (HAL) store menu | retrieved 2026-11-13 |
| https://www.behrouzbiryani.com/behrouz-biryani/hyderabad/suncity-fc | same — Hyderabad (Suncity) store menu | retrieved 2026-11-13 |
| https://www.behrouzbiryani.com/behrouz-biryani/new-delhi/mukherjee-nagar-fc | same — New Delhi (Mukherjee Nagar) store menu | retrieved 2026-11-13 |

The brand's own ordering site (Rebel Foods' EatSure platform) shows a **"Nutritional Value"** panel per item: Energy (kcal), Protein, Fat, Carbs, Sugar. The values were read from the menu JSON embedded in each store page (the same data the panel renders; the UI rounds with `Math.round`, and every value here is already an integer). The site footer disclaimer says: *"All nutritional information is indicative, values are per serve as shared by the restaurant and may vary depending on the ingredients and portion size."* The panel subtitle says *"Value based on default selection, may vary with customisation."*

## Item count
- **110 rows** in `behrouz_biryani.csv` (one row per distinct item name + value set, merged across the 4 store menus).
- Main sections: Biryani (Serves 1) at Flat 299 — 46 rows (Classic and Hyderabadi recipes, each with a Gurgaon/Delhi value set and a Bengaluru value set); Miniyat Biryanis — 17; Sides, Desserts & Beverages — 18; Royal curries/breads/thalis — 12; Kathi rolls — 5; Haleem combos — 4; Biryani & Kebab thalis/combos — 6; Kebab starters — 2.
- Published fields are only kcal, protein, fat, carbs and sugar. **Fibre and sodium are not published** (those cells are empty).
- veg/non-veg comes from the site's `is_veg` flag.

## Ambiguities and caveats
- **The same item name has different values in different cities (50 rows flagged in `notes`).** Example: "Lazeez Bhuna Murgh Biryani (Dum Chicken Biryani - Serves 1) - Classic Biryani" is **948 kcal / 94 g carbs / 40 g sugar** on the Gurgaon and New Delhi menus (product 200085790), but **733 kcal / 51 g carbs / 5 g sugar** on the Bengaluru menu (product 200086174). Both listings say "Served with 1 Gulab Jamun & Mint Raita". The ~40 g sugar in the North-India figure fits one gulab jamun (the site lists "Gulab Jamun - Pack of 1" at 186 kcal / 33 g sugar). The Bengaluru figure looks like the biryani alone, and it is close to the "Miniyat" values. We kept both rows. `source_url` and `notes` say which store each row came from.
- **"Serves 1" values include the accompaniments named in the listing** (gulab jamun and raita) wherever the item description says so. The serving weight in grams is **not published** for biryanis, so `serving_g` is empty.
- **Customisable or variation items have no list-level nutrition.** These are the "Classic / Hyderabadi / Lucknowi ... Biryani" cards where you pick a size or quantity, plus most curries and kebabs. The panel for them only appears in the item-detail view, which loads from the site's `/v1/api/` (blocked by robots.txt), so we did not collect it. Use the "Serves 1" and "Miniyat" rows for these dishes.
- Drink rows (Coca-Cola 475 ml, Thums Up 330 ml) are the brand's listing of third-party drinks and carry the values Behrouz shows.

## On the menu but with no published nutrition (list level)
- **Size-selectable biryanis:** Classic / Hyderabadi / Lucknowi versions of Lazeez Bhuna Murgh, Dum Gosht, Murgh Tikka, Murgh Afghani Tikka, Daastan-e-Ghee Murgh, Raaz-e-Kalimirch Murgh and Paneer, Zaikedaar Paneer, Paneer Subz, Subz-e-Biryani, Tokhm-e-Biryani, Do Gosht ki Dum, Taj-e-Khumb, Tandoori Soya Chaap, Junoon-e-Andhra. Also the Nawabi Handi biryanis (Serves 2): Murgh, Gosht, Paneer, Subz, Khumb, Makhni Murgh.
- **Curries and kebabs:** Shabnami Murgh Lababdar, Paneer Lababdar, Aftaabi Murgh/Paneer/Mushroom Tikka Masala, Ghee Roast Murgh Curry, Paneer Haryali, Mughlai Gravy, Sultani Gosht Kheema, Gosht Haleem and Murgh Haleem (alone, not the Thums Up combo), Murgh Seekh, Murgh Kefta, Murgh Koobideh, Angara Murgh Tikka, Falafel-e-Khaas, Dahi Labneh, Hara Bhara, Beetroot & Peanut kebab, Aloo Chaap Tikki, Rumali Roti.
- **Thali variations:** the "... Thali with Kebabs" variation cards (except Andhra Chicken), and the Royal Murgh/Paneer Lababdar, Tikka Masala and Dal Makhani Thalis without the "with Rice" suffix.
- **Combos:** "... with Thums Up", "... With Free Kebabs and Beverage", "1+1 Biryanis at 275", Royal Gravy + Breads, Royal Murgh/Paneer Daawat, Royal Jashn, Shaandaar Curries combos, Royal Murgh Curry Combo. Also Chocolate Cheesecake Slice.

Full list with product ids: work file `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/behrouz_missing.json`.
