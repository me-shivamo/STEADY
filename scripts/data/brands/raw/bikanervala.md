# Bikanervala (India) — official nutrition data

## Result: no official nutrition collected (0 rows)

`bikanervala.csv` contains only the header row.

## What was checked (2026-11-13)
| URL | What it is | Result |
|---|---|---|
| https://order.bikanervala.com/products/sweets, /products/chaat-snacks-quick-bites, /products/combo-eco-meals, /product-detail/soan-papdi-desi-ghee | **Official restaurant + sweets ordering platform** (chaat, thalis/eco-meals, Chinese, South Indian, sweets, bakery) | Pages load (200), but item data has **no kcal, calorie or nutrition fields**. |
| https://bikanervala.com/ (Shopify retail store: sweets, namkeen, gifting) | Retail e-commerce | Homepage carries no nutrition text. Product pages and the `products.json` feed returned **HTTP 429 (rate-limited)** for the whole session, even after slow retries with 75-second gaps, so we couldn't read product descriptions. |
| https://catalogue.bikanervala.com/ | Cakes/sweets catalogue (Shopify) | Homepage has no nutrition. Product feed also returned 429. |
| https://bikano.bikanervala.com/products/bikano-rasogolla | "Bikano" packaged-goods store (Bikanervala's FMCG brand) | **TLS handshake fails** (host currently broken), so we couldn't verify it. A search-engine snippet credits this page with a per-100 g table for Bikano Rasogolla (Energy 200.3 kcal, Protein 1.8 g, Fat 0.7 g, Carbs 46.7 g, Sodium 40 mg, Cholesterol 7 mg). That is **not verified from the source, so it's not in the CSV**. |

## Gaps / next steps
- **Restaurant menu** (order.bikanervala.com: chole bhature, raj kachori, pav bhaji, dosa, thalis, Chinese, sweets by weight): no official nutrition published online.
- **Packaged sweets and namkeen** (bikanervala.com / Bikano): FSSAI labels exist on the packs, and the Shopify product pages probably carry label images like Haldiram's do. Retry when the rate limit clears: `https://bikanervala.com/products/rasogolla`, `/products/soan-papdi`, `/products/soan-cake`, and collection pages `/collections/sweets`, `/laddu`, `/burfi`, `/kaju-sweets`. Also retry `bikano.bikanervala.com` once its TLS works.
