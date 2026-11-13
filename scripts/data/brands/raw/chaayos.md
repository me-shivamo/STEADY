# Chaayos (India) — official nutrition data

## Result: no official India nutrition source found (0 rows)

`chaayos.csv` contains only the header row.

## What was checked (2026-11-13)
| URL | What it is | Nutrition? |
|---|---|---|
| https://chaayos.com/ (Shopify) | Retail store for packaged tea, chai premix and snacks; café store pages under `/pages/<store>` | No café item nutrition. Store pages show the menu-board images `LCD_Menu_landing_pagr_beverage.jpg` and `..._food_copy_2.jpg`, which list items and add-ons with no kcal. |
| https://cafes.chaayos.com/ | Café ordering web app (React bundle `home.*.js`) | The bundle has no calorie, kcal, nutrition or protein fields at all, so the web ordering UI doesn't show nutrition. |
| Web search for an official nutrition PDF or booklet | — | Nothing official. Only third-party calorie databases (FatSecret) and blogs, which aren't allowed as sources. |
| Swiggy and Zomato listings | Third-party platforms | Some listings carry restaurant-supplied kcal text (for example a Green Tea "~11 kcal per serve"). These are third-party pages, so we didn't use them as a source. |

The Chaayos mobile app (iOS/Android) wasn't inspected, since it needs an app session. FSSAI menu-labelling rules mean in-café menu boards at a chain this size should show kcal. We found no online copy of those boards with kcal.

## Menu structure (for the record — no nutrition published)
- **"Meri Wali Chai" builder:** chai type (desi chai, black tea, green tea); milk (regular, doodh kum, paani kum, full doodh); patti (regular, kadak); free add-ons (elaichi, adrak, kali mirch, tulsi, ajwain, cinnamon, laung, saunf, moti elaichi, mint, masala, hari mirch, lemon, haldi); sugar (regular, no sugar). Milk level and sugar change calories a lot, and no official figures exist for any of these combinations.
- **Indian chai:** Desi Chai, Black Tea, Green Tea, Baarish Lemongrass Chai, Cutting Chai, Sulemani Nimbu Chai, Kulhad Chai, Gur Wali Chai, Vegan Chai. Sizes (mini/regular ketli, etc.) aren't published with any nutrition.
- **Unchai:** Haldi Doodh, Black Coffee, Desi Filter Coffee, God's Chai, Honey Ginger Lemon, Drinking Chocolate, Kashmiri Kahwa.
- **Chai & Chill:** Modinagar Shikanji, Mint Lemonade, Aam Panna Iced Tea, Lemon Iced Tea, Peach Iced Tea, Imly Banta, Badam Thandai.
- **Shakes:** Strawberry, Chocolate, Desi Cold Coffee, Kulfi Shake, Cake Shake. **Thandi Chai:** Saunf, Elaichi, Masala, Cinnamon.
- **Food (store FAQ):** bhel puri, pakore, chaat, kulcha, pav bhaji, bun maska, bun bhujia, sandwiches, upma, samosa, cakes.

Packaged retail products on chaayos.com (instant chai premix etc.) are out of scope here (they're not café items) and weren't collected.
