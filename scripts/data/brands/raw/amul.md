# Amul (India) — ice creams & beverages

## Sources used
| URL | Title | Date / version |
|---|---|---|
| https://dudhsagardairy.coop/dairy/products/<slug>/ (66 pages; exact URL per row in CSV) | Dudhsagar Dairy (Mehsana District Co-operative Milk Producers' Union Ltd., a GCMMF/Amul member union) — product pages, "Nutritional Information" table | No version date on pages; fetched 2026-11-13 |

**Important provenance caveat:** these are Amul-branded products, but the pages are on the **member union's (manufacturer's) official site**, not amul.com. We used it because:
- amul.com's old static product pages (e.g. `amul.com/products/amul-cup-american-nuts.php`) now redirect to a client-rendered site, which loads product data through a token-gated API (`/api/v1/website-token` then `/api/v1/categoryDetails`). We did not call that API.
- shop.amul.com is also client-rendered, with no nutrition in the HTML.
- No official Amul nutrition PDF was found.

If you require amul.com itself, treat this file as "official cooperative source, pending verification" or drop it.

## Item count
- **66 rows** in `amul.csv`: ice cream cups/tubs 23, kulfi 9, cones (Tricone) 6, sticks/bars 5 (Prolife Chocobar, Coffee Bar, Epic Almond, Ice Lickz Mango/Orange), frozen yoghurt 3, sorbet 1, Amul Kool flavoured milk 4, buttermilk 2 (Masala, Probiotic), liquid milk 13 (Gold, Taaza, Shakti, T-Special, Moti, Moti Lite, Slim N Trim, Buffalo, Cow, Deshi A2, A2 Gir, Gold UHT, Taaza UHT).
- Excluded: Dudhsagar's own **Sagar**-brand items (Sagar Chhash, Taaza, Sfurti, Satva buttermilk, standardised milk), plus non-beverage dairy (ghee, butter, paneer, dahi, sweets, powders).

## Ambiguities / caveats
- **Basis varies by product and is kept as published.** Tubs/cups and liquids are "Per 100 g" or "Per 100 mL" (`serving_g`/`serving_ml` = 100). Single-serve items give a per-unit weight: Tricone "Per 77 g" (78 g for Butterscotch GOLD), kulfi per 30–50 g, bars per 42–55 g, 125 mL cups "Per 67 g" or "Per 87 g". Where one per-unit figure is shown for several pack sizes (e.g. Tricone Vanilla 120/100/70 mL), it probably applies to the largest pack. This is flagged in notes.
- **Amul IC Strawberry** has values identical to **Amul IC Vanilla** (215 kcal, 13.0 g fat and so on). This looks like a copy error on the source, so it is flagged SUSPECT.
- **Amul Kool Badam/Elaichi/Kesar/Rose** all list the same values (89 kcal/100 ml). Kesar's header says "Per 100 g" while the others say "Per 100 ml"; both are kept as printed. Total sugar is not published for Kool (added sugar 8 g is in notes), and fibre is published for no product.
- Two Dudhsagar URLs (`amul-ic-creme-rich-almond-fudge` and `-2`) are the same product, so we kept one.
- `veg_nonveg` is left empty because the pages state no mark. All rows are dairy products with no egg or meat listed in composition.

## Popular Amul ice creams and beverages with no nutrition found from an accessible official source
Amul Lassi (incl. flavoured), Amul Kool Koko, Kool Café, Kool Milk Shaake (all flavours), Masti Spiced Buttermilk (tetra/bottle), Amul High Protein range (lassi, buttermilk, milkshake, Amul Pro), Kool Thandai, HP Kool Chocolate, standard Chocobar, Cassata, Sundae cups, Fundoo, Tricone Butterscotch (regular), Kesar Pista Royale cones, Choco Crunch sticks, Gold/Taaza tetra-pack variants beyond the UHT ones above. These are on amul.com but cannot be read without its API.
