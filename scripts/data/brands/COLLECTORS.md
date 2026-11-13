Collected **330 rows** of official India nutrition data for 3 of the 5 brands. Baskin Robbins India and Dunkin' India have **0 rows**: I found no official source I could read. Amul's 66 rows come from an Amul member union's site rather than amul.com, so they need your decision before use.

All outputs are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/. Each brand has `<slug>.csv` with the 20 requested columns and `<slug>.md` with sources, count, ambiguities and gaps. Numbers are exactly as printed; values like "<2.0" are kept. Nothing in /home/shivam/STEADY or any database was touched, and no DEVLOG entry was written because the task forbade repo edits.

| Brand | Rows | Source | Basis |
|---|---|---|---|
| Theobroma | 114 | Official guide PDF, June 2026 | Per serve |
| Amul | 66 | Dudhsagar Dairy (Amul member union) product pages | Per 100 g/ml or per unit |
| Natural's Ice Cream | 150 | 3 official PDFs | Per 100 g |
| Baskin Robbins India | 0 | none readable | — |
| Dunkin' India | 0 | none readable | — |

**Theobroma** (`theobroma.csv`)
- **Source:** "Nutrition and Allergen Guide", June 2026, at https://theobroma.in/assets/wla_new/theobroma/downloads/nutrition-guide.pdf, linked from theobroma.in/nutritional-information.
- **Coverage:** croissants, breads, brownies, cakes, desserts, dry cakes, pastries, savouries and cookies. Values are the guide's "Per Serve" column; per-100 g kcal, added sugar, saturated fat, trans fat, cholesterol and allergens are in `notes`. Fibre is not published.
- **Veg/non-veg:** 41 rows from the FSSAI mark printed on the card and 5 from the item name; 68 are blank because no mark is printed.
- **Ambiguities:**
  - Serve is often a slice or portion, not the whole product (e.g. a 50 g serve of a 1 kg cake).
  - Some cards have no size label (Tiramisu Jar, Chocolate Mousse Jar, Red Velvet Cupcake).
  - One card is titled just "Cake" in the source.
- **Suspect value:** the Cappuccino 250 ml shows 647.5 kcal, which looks like a source error. It is flagged.
- **Gaps:** nearly all beverages (cold coffees, lattes, flat white, hot chocolate, iced teas, juices), muffins, cheesecake jars and tubs, tres leches, and several newer brownies, cakes and sandwiches.

**Amul** (`amul.csv`)
- **Source:** dudhsagardairy.coop/dairy/products/<slug>/, the Mehsana union that manufactures Amul products; URL per row.
- **Why not amul.com:** its product pages now render client-side from a token-gated API, which I did not call. shop.amul.com is also client-rendered with no nutrition in the page. The `.md` states this provenance clearly; keep or drop the file as you see fit.
- **Coverage:** 23 cups and tubs, 9 kulfis, 6 Tricones, 5 bars, 3 frozen yoghurts, 1 sorbet, 4 Amul Kool, 2 buttermilks and 13 liquid milks. The milks go slightly beyond "ice creams/beverages" in the narrow sense.
- **Ambiguities:**
  - The basis varies by product: per 100 g/ml for tubs and liquids, per unit for cones, kulfis and bars (e.g. Tricone per 77 g).
  - IC Strawberry is identical to IC Vanilla, flagged as a likely source error.
  - All four Kool flavours list the same values.
- **Gaps:** Lassi, Kool Koko, Kool Café, Kool Milk Shake, Masti buttermilk (tetra), the High Protein range, Chocobar, Cassata and sundaes.

**Natural's Ice Cream** (`naturals_ice_cream.csv`)
- **Sources:** three PDFs linked from naturalicecreams.in/nutritional-info/:
  - Main menu, 92 rows: `Naturals-1.pdf`.
  - Naturals Now, 32 rows: the Juhu July–Sept 2025 PDF.
  - Just Sundaes, 26 rows: the July 2024 Updated PDF.
- **Basis:** all per 100 g. The published serving sizes are in notes: 80 g scoop (main), 90 g scoop (Now), 300 ml milkshake glass, about 150 g sundae (Just Sundaes).
- **Checks:** the two messy PDFs were rebuilt from text coordinates and spot-checked against the rendered pages.
- **Suspect rows (37, all flagged):**
  - 33 rows print total sugar higher than total carbohydrate.
  - 3 rows have kcal that doesn't match the macros.
  - Mango No Added Sugar milkshake appears column-shifted (18 g protein).
- **Gaps:** Coffee Fudge Crunch, Cranberry, Dark Chocolate Sorbet, Jalebi, plain Mango, and Tender Coconut Naga Chilli.

**Baskin Robbins India** (`baskin_robbins_india.csv`, header only)
- baskinrobbinsindia.com has no nutrition page or PDF, and its products feed returned "rate limited" (HTTP 429), so I stopped there.
- Its "Order Now" store, baskinrobbins.dotpe.in, is the likely official source: its code requests the menu with nutrition included. I couldn't read it:
  - Calling the store's data service directly was blocked by the permission policy, and I didn't try to get around that.
  - The Chrome extension wasn't connected, so I couldn't open it as a normal page.
- To get this data, either open that store in a connected browser or approve access to it.

**Dunkin' India** (`dunkin_india.csv`, header only)
- dunkinindia.com returns 502 Bad Gateway on every path I tried.
- Jubilant FoodWorks' brand page has no nutrition content, and the US PDF isn't an India source.
- Jubilant is exiting the franchise on 31 Dec 2026, per its 30 Mar 2026 filing. I recommend dropping this brand.

The downloaded PDFs and pages are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/dl/<brand>/ and are not for redistribution. Parsers are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/ (theobroma_*.py, amul_*.py, nat_*.py, pdfwords.py, ppmcrop.py, bctx.py). Other agents share the brands/ folder; I only wrote these five brands' files.

---

## Official India nutrition data: KFC, Subway, Taco Bell

All three brands have an official 2026 India nutrition document, and every row of each was captured: **KFC 232 rows, Subway 186, Taco Bell 105**. Numbers are exactly as printed and no third-party numbers were used.

All three CSVs passed a column-shift, duplicate-row and completeness check. Rows where published calories don't match the 4/4/9 estimate from the published macros by more than 15% carry a `QA:` note in `notes`. The values were also spot-checked against rendered page images.

Nothing was written outside `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/`. The repo and databases were not touched. That includes no `DEVLOG.md` or `LEARNING.md` entries: the task said not to edit the repo, so the CLAUDE.md logging rules were not followed for this step.

### KFC India: 232 rows (159 distinct items)
- **Source:** "Menu Card Nutrition & Allergen Information Booklet of KFC Products", V6 (PDF created 2026-03-30, server Last-Modified 2026-04-01), https://about.kfc.co.in/assets/files/nutrition-booklet.pdf. It is on KFC India's own domain and states FSSAI compliance.
- **Coverage:** pages 4–21. That is chicken by piece count (1–15 pc), burgers, rolls, rice bowls, fries and drinks in Regular/Medium/Large, dips, desserts, value lunches, buckets, box meals and limited-time bundles.
- **Values are per serving, not per product.** A product can have N servings: 3 pc Hot & Crispy weighs 330 g, has 2 servings, and lists 480 kcal per serving.
  - For the 74 multi-serving rows, `serving_g` is empty and `notes` gives `product_weight_g` and `servings_per_product`.
- **37 rows don't add up as printed** and carry a `QA:` note. They are kept as printed:
  - Classic Chicken Krisper + Reg Popcorn + Reg Pepsi = 67 kcal.
  - The Spicy version of that meal lists 588 g carbs.
  - Wednesday 15 Pcs Meal lists 440 g fat.
  - Tandoori Zinger is 902 kcal against about 618 from its macros.
  - Boneless strips and wings series are off by 16–46%.
- **Gaps:**
  - online.kfc.co.in and kfc.co.in block or time out on automated fetches, so we could not confirm the site links this PDF or compare it with the live menu.
  - The other booklet on the same domain (`nutrition-booklet_1May.pdf`) is a Sep 2022 Rev-1 and is superseded.
  - No fibre. Allergens are icons only and were not extracted.
  - No standalone Pepsi Black or coffee rows.

### Subway India: 186 rows (180 distinct items)
- **Source:** "Subway Product Nutritional & Allergen Information – Updated in August 2026" (blob Last-Modified 2026-08-07), https://qnet.blob.core.windows.net/central/Nutritional%20Allergen%20Chart%20-%20August%202026%20-%201786080088269.pdf. subway.com/en-IN redirects to subway.in, whose footer "Nutrition Information" link points to this file (confirmed in the site's JS bundle).
- **Coverage:** every row in the chart:
  - 6-inch subs (with and without Cheese Pull), Hot & Cheesy, breakfast subs at 6-inch and 4-inch, and Sub Cravers.
  - Wraps, salads and "New Salads", and rice bowls.
  - Sides, cookies, breads, sauces, cheeses, proteins, vegetables and 4 beverages.
- **Footlong is not published.** The chart says to double the 6-inch values; we did not create those rows.
- **Coffee:** Americano 200 g, Cappuccino 230 g (84 kcal) and Classic Cold Coffee 230 g. Each comes in one size only, listed in g rather than ml, and no other milk options are listed. The milk type isn't named, but the chart marks the milk allergen.
- **Data issue:** the Peri Peri Chicken protein portion (121 kcal with 23 g carbs) is inconsistent, so 6 rows carry a `QA:` note.
- **Gaps:** the footnote superscripts are ambiguous and are quoted in `notes`. No fibre, no soft drinks, and we couldn't compare against the live menu (it loads from an API we didn't query).

### Taco Bell India: 105 rows (103 distinct items)
- **Source:** "Nutritional and Allergens information", sheet dated 01.04.26 "(with Electrifying menu and corn cup)" (PDF created 2026-04-02, Last-Modified 2026-04-06), https://www.tacobell.co.in/pub/media/pdf/nutritional-info-new.pdf. This is the live "Nutrition" link in the tacobell.co.in navigation.
- **Coverage:** all 105 rows, per serve with gross weight. Drinks are 330 ml. Seasoned Fries come in two sizes and Choco Mud Pie has dining and delivery versions.
- **Squad packs list values per serve** (4 serves per pack); `serving_g` is empty and the pack weight is in `serving_desc`.
- **"BLQ" cells** (below the lab's detection limit) are left empty, with a note.
- **Rows 79–95 are marked "(e)" but the sheet never defines it.** Some of them duplicate non-(e) products with different values, and both were kept. No rows fail the calorie check.
- **Not used:**
  - The older 2024 PDF, whose homepage link is commented out.
  - The `/nutritional-info` HTML table: its link is commented out, it states no serving basis, and its values look like per-100 g figures.
- **Gaps:**
  - A "Gordita" menu category has no current nutrition rows.
  - Combo categories have no combo-level rows.
  - Several items from the 2024 sheet are gone (for example Chicken Seekh Kebab Taco, Supreme Rice Bowl, Molten Choco Pie).
  - No fibre.

### On the user's online-search question
This worked well with ordinary web search. Search found the KFC booklet directly. Reading the official site's own page code found the Subway PDF, and the Taco Bell homepage links its PDF. All three are FSSAI-format tables on the brands' own domains. The catch is that these PDFs can contain errors of their own (KFC especially), so a plausibility check like the 4/4/9 one should run before any number reaches users.

Files are in `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/`:
- data/kfc_india.csv
- data/kfc_india.md
- data/subway_india.csv
- data/subway_india.md
- data/taco_bell_india.csv
- data/taco_bell_india.md

The scripts that rebuild them are in `bin/` (`parse_kfc.py`, `parse_subway.py`, `parse_tacobell.py`, the three `build_*.py` files, `qa_notes.py`).

---

## Coffee chains: official India nutrition data

**Result:** 1,234 rows across 4 of the 6 chains. Third Wave Coffee and Costa Coffee India have no official source we could use, so their CSVs contain the header only.

All output is in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/. Each brand has a `<slug>.csv` with the required 20 columns and a `<slug>.md` listing sources, ambiguities and items without published nutrition. All CSVs pass a validity check, and every non-empty one has kcal on every row.

| Brand | Rows | Source | What's published |
|---|---|---|---|
| Starbucks India (`starbucks_india`) | 976 | Official PDF on starbucks.in | Full macros, all sizes |
| Cafe Coffee Day (`cafe_coffee_day`) | 98 | Two chart images on cafecoffeeday.com | kcal only |
| Blue Tokai (`blue_tokai`) | 158 | Official digital cafe menu | Full macros, one size per drink |
| Barista (`barista`) | 2 | Homepage banner on barista.co.in | kcal and protein only |
| Third Wave Coffee (`third_wave_coffee`) | 0 | None found | – |
| Costa Coffee India (`costa_coffee_india`) | 0 | Site unreachable from here | – |

### Starbucks India (976 rows)
- **Source:** "Tata Starbucks NI Guide – Food and Beverage", https://www.starbucks.in/assets/pdf/TATA%20Starbucks_NI_Guide_Food_and_Bev.pdf. It has 130 pages; the server date is 25 Jun 2026, but the document itself says "Created on 02-01-2023".
- **Columns:** kcal, carbs, total and added sugar, fibre, protein, fat, saturated and trans fat, cholesterol, sodium. Values were checked against rendered pages.
- **Sizes:** Short 237, Tall 354, Grande 473 and Venti 591 ml; 454 distinct items. Core, limited-time, Reserve and food sections are all included and labelled.
- **Default milk is not stated in the guide.** It is most likely toned milk: the guide's "Toned Milk 236.25 ml" row exactly matches the Grande Caffe Misto. Skimmed, soy, almond and oat milk are given only per 100 ml, with no per-drink values for a milk swap.
- **The source looks wrong in places**, e.g. Short and Tall Cappuccino are both 104 kcal. Values are copied exactly as printed.
- **Decision for you:** a newer official-looking guide dated 05-02-2026 sits on Tata Starbucks' pre-production storage: https://preprodtsbstorage.blob.core.windows.net/cms/uploads/TATA_Starbucks_NI_Guide_Food_and_Beverage_5th_February_2026_FINAL_1d0a3a24c6.pdf
  - It disagrees on 194 of 529 matching item-size pairs (Grande Cappuccino 173 vs 132 kcal, Grande Caramel Frappuccino 485 vs 374).
  - It adds milk variants and about 600 newer items.
  - It has internal-looking headings ("Lab test data", "Type Y"), and I couldn't confirm the live site links to it, so I left it out of the main CSV.
  - It is parsed separately (1,169 rows; 6 rows skipped because columns didn't line up): /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/starbucks/starbucks_india_feb2026_unverified.csv

### Cafe Coffee Day (98 rows)
- **Source:** two images on https://www.cafecoffeeday.com/cafe-menu/nutritional-info:
  - beverages (64 rows), dated 28-04-2022
  - food (34 rows), dated 29-04-2022
- **Values:** kcal only, with Regular and King sizes. I read the values by eye from the full-resolution images, because text recognition failed on the coloured grid.
- **Milk type is not stated.** Soy Cappuccino is the only non-dairy option. "Sugar Free" (sweetener) and "No Sugar" are separate rows.
- **Gaps:** the charts date from 2022, and current menu categories (burgers, smoothies, milkshakes, Wellness, Big Sip, combos) have no published nutrition.

### Blue Tokai (158 rows)
- **Source:** the official digital cafe menu, menu.bluetokaicoffee.com, which every store page links to. I fetched the same public menu data the page loads, for three cafes: Indiranagar Bengaluru (CA-094), Khan Market Delhi (CA-052) and Bandra Mumbai (CA-092).
- **Values:** full macros. Three cookie rows (kcal only) come from the stores.bluetokaicoffee.com page.
- **One size per drink.** Milk options are regular (default), oat, lactose-free and plant-based. They are listed in the notes, but no per-milk values are published.
- **Where sources disagree:** both versions are kept as separate rows.
  - Two fries and one sandwich differ at the Khan Market cafe.
  - The Almond & Raspberry Cookie is 450 kcal in the menu but 416.9 kcal on the store page.
- **Gaps:** about 34 items have no nutrition, including add-ons, manual brews, packaged goods and 2 cookies. They are listed in the .md file.

### Barista (2 rows)
- **Source:** the homepage banner on barista.co.in.
- **Rows:** Iced-Caramel Wheychino (203 kcal, 24 g protein) and Mocha Pro-Muscle Shake (280 kcal, 24 g protein).
- **Gaps:** no other nutrition exists on the site or in any official PDF.

### Third Wave Coffee (0 rows)
- There is no nutrition on thirdwavecoffee.in (homepage, cafes page, app FAQs and 40+ cafe pages checked) or on its store pages.
- Swiggy and magicpin show kcal values, but those are third-party, so I didn't use them.
- The official numbers are probably in the Third Wave app.

### Costa Coffee India (0 rows)
- costacoffee.in exists, but from this environment it either errored or timed out (curl and WebFetch); it looks like bot protection or geo-blocking.
- The Chrome extension was not connected, so I couldn't try a browser.
- I found no India nutrition PDF and did not use UK or US data.

### Other notes
- The automatic permission check blocked a direct call to Starbucks India's private ordering backend as unauthorized access, so I didn't retry it. The official PDF covered Starbucks instead.
- Downloaded files are under `dl/<brand>/` in the scratchpad and were parsed only with my own scripts. They should not be redistributed; only the numbers and attribution are kept.
- **Shared folders:** `bin/` and `data/` are shared with other parallel workflows. Another agent overwrote one of my helper scripts (`bin/ctx.py`), so I renamed mine with a `cafe_` prefix. Only my six brands' files in `data/` belong to me.
- I made no changes to /home/shivam/STEADY or any database. I also didn't write the DEVLOG or LEARNING entries that the project's rules ask for, because this workflow forbade editing the repo; the orchestrator should add them.

---

All three brands have official India nutrition data online. I collected 990 rows in total: Domino's 477, Pizza Hut 314, La Pino'z 199. Domino's is not complete: 7 chart pages of regional pizzas are still to transcribe, and only La Pino'z publishes per-100 g figures.

Numbers are as printed, with no rounding changes. Cells the source leaves blank are left empty, and source typos and anomalies are flagged in `notes`.

**Domino's India — 477 rows, 104 item names**
- **Source:** the "Nutritional Info" page on Domino's own ordering site, linked from its footer: https://pizzaonline.dominos.co.in/jfl-discovery-ui/en/dt/nutritional-info
  - It shows 47 chart images (`.../images/global/nutrition/MNI-01..47.jpg`), all Last-Modified 2026-10-28. Each row's exact image URL is in `page_or_section`.
  - The charts exist only as images, so I transcribed them by hand.
- **Checks on the transcription:**
  - On these charts, kcal equals 4×protein + 4×carbs + 9×fat almost exactly. 451 of 477 rows match within 1.5 kcal; the rest are explained by integer rounding in Large columns, beverages and dips, plus 2 errors in the source.
  - The chart's own %RDA rows were used as a second check.
  - An OCR pass on 4 image variants confirmed 3,025 of 3,069 multi-digit values. I cropped and re-read the uncertain cells, which found and fixed 2 of my errors.
- **Coverage:** pizzas across New Hand Tossed (Regular/Medium/Large), Fresh Pan, Thin Crust and Cheese Burst, plus Multigrain, NONG (No Onion No Garlic), Paratha, Gourmet and South ranges. Also sides, pastas, desserts, beverages and dips.
- **Gaps:**
  - No fibre published. No gram weights published.
  - Pizza values are **per serve**: Regular = 4 slices (the whole pizza), Medium = 3 slices (half), Large = 2 slices (a quarter).
  - **Not transcribed:** images MNI-34 to MNI-40, about 14 regional pizzas (Malabar Chicken/Paneer, Overloaded Chicken 65, Coorg Chicken/Paneer, Kosha Veg, Champaran Veg and their pairs). They were skipped to prioritise the core menu.
  - No Pizza Mania chart in the set.
- **Ambiguities to know about:**
  - Several pizzas are listed twice with different values (e.g. Double Cheese Margherita, Cheese & Tomato, Cheese & Corn, Peppy Paneer). Both are kept and flagged.
  - The sodium %RDA row on the multigrain pages is shifted one column; the mg values were kept.
  - A few odd printed values: Farmhouse and Chicken Pepperoni Medium are higher than Regular, Peppy Paneer Medium sodium is about 3,920 mg, and Caprese Large and Smoked Chicken Medium don't match their own macros.
  - Fountain drinks are 350 ml; caffeine is noted for Pepsi and Mountain Dew but no mg value is given.

**Pizza Hut India — 314 rows**
- **Source:** the official PDF "Menu Card Nutrition & Allergen Information Booklet of Pizza Hut Products", linked from pizzahut.co.in/nutrition: https://www.pizzahut.co.in/order/pdfs/in/nutritionals.6875af05163a32efc1bd637ee7bdfab4.pdf
  - Internal title "PH Nutrition_SEP_2026", created 2026-09-30, Last-Modified 2026-10-26. It states FSSAI compliance. Older copies on the same site are superseded and were not used.
- **Method:** extracted text with coordinates using ghostscript. Veg/non-veg comes from the symbol colours, which matters because some names appear twice. 305 of 314 rows agree with the booklet's own %RDA columns; the 9 that don't are errors in the PDF itself (e.g. Chicken Tikka Supreme Large prints total fat 10.0 g with saturated fat 39.8 g).
- **Coverage:** Pan Personal/Medium/Large, TnC, Ultimate Cheese, Half N Half, Spicy Range, Flatzz, Melts, garlic breads, wings, pastas, sides, desserts, beverages and dips. Fibre and net weight are published. Pizza rows are for the whole pizza as served.
- **Gaps:**
  - Total sugar printed as "ND" (not detected) is left empty, with a note.
  - Crust Upgrade rows are add-ons to the pan pizza values.
  - Items launched after September 2026 are not covered.

**La Pino'z Pizza — 199 rows**
- **Source:** the official site, lapinozpizza.in. Each item description carries "[Fat-… per 100 g, Protein-…, Carbohydrate-…, Sugar-…, Calories-… k.cal] Nutritional information per 100g". I parsed 12 category pages; veg/non-veg comes from the site's own markers.
- There is no official PDF or booklet. No fibre, sodium or serving weights are published, so values are per 100 g only and can't be turned into per-pizza figures. 24 rows have typos in the source's units; the raw text is kept in `notes`.
- **Gaps:** 626 listings have no nutrition, including many core pizzas (Cheese/Cheesy Margherita, Country Side, Garden Delight, Tandoori Paneer, Pepperoni, Butter Chicken, Chicken 65), most sides, all desserts and drinks, and combos.

The DEVLOG/LEARNING entries required by CLAUDE.md were not written, because this step was told not to edit the repo. Whoever has repo access should add them.

Files are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data:
- dominos.csv
- dominos.md
- pizza_hut.csv
- pizza_hut.md
- lapinoz_pizza.csv
- lapinoz_pizza.md

Supporting files:
- Transcription: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/dominos/transcribe.txt
- La Pino'z items without nutrition: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/lapinoz_debug.json
- Parser scripts: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/pz_*.py

Downloads (`dl/dominos/`, `dl/pizzahut/`, `dl/lapinoz/`) are untrusted copies; don't redistribute them. A third-party copy of a 2022 Domino's chart is kept in `dl/dominos_thirdparty_locator/`; it was used only to confirm an India chart exists, and none of its numbers were used.

---

I collected official India nutrition data for all three: 424 rows in total, every one from the brand's own PDF. Nothing was written under /home/shivam/STEADY and no database was touched.

| Brand | Rows | Main source | Date |
|---|---|---|---|
| McDonald's India West & South (Westlife) | 192 | mcdonaldsindia.com nutrition PDF | April 2024 |
| McDonald's India North & East (Connaught Plaza) | 121 | mcdindia.com booklet + menu PDF | Dec 2025 / Apr 2026 |
| Burger King India | 111 | BK India's own CDN | Feb 2026 |

**Output files** (in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/)
- /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/mcdonalds_india_west_south.csv and its .md
- /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/mcdonalds_india_north_east.csv and its .md
- /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/burger_king_india.csv and its .md

**How the files are built**
- All three CSVs have the requested 20 columns and pass a check: right column count, numeric values only in number columns, no duplicates, kcal present on every row.
- Numbers are exactly as printed. Fibre is not published by any of the three, so `fiber_g` is always empty.
- Sat fat, trans fat, cholesterol, added sugar and allergens have no column, so they go in `notes` as `key=value`.
- Veg/non-veg comes from each PDF's green or red symbol, read from the page colours. A handful of rows are inferred from the item name instead, and their notes say so.
- Clear source errors are kept as printed and flagged in `notes`. Rows where kcal and macros disagree are marked `CHECK:`.

## McDonald's India West & South — 192 rows
- **Source:** https://www.mcdonaldsindia.com/pdf/2024/nutrition-information.pdf, linked as "Nutrition information" from mcdonaldsindia.com/nutrition.html. File date 10 Apr 2024; it is still the only version linked.
- **Coverage:** Regular 41, Breakfast 8, McCafé 67, Desserts 30, Gourmet 10, Beverages 18, Condiments 13, Double Patty 5.
- **Sizes:** fries Regular/Medium/Large, McNuggets 4/6/9 pc, Coke/Fanta/Sprite Small/Medium/Large (299/394/544 ml), hot McCafé drinks Small/Regular/Large, cold drinks 10 oz and 14 oz.
- **16 item names were read by eye.** They are drawn as shapes rather than text in the PDF; these include the McMuffins, the muffins, the iced and cold coffees, Pizza Puff and L1 Coffee.
- **Two extraction methods were cross-checked.** Where they disagreed, I checked the rendered page and used what it shows.
- **12 rows** have veg/non-veg from the item name, because page 1 and page 2 disagree on their serve size or kcal.
- **Gaps:**
  - The document is from April 2024, so newer items (such as the July 2025 Protein Plus slice) are missing.
  - McCafé milk type is not stated, and no alternative-milk values are published.
  - No combo meals.
  - Typos kept as printed: Ketchup fat 23.45 g on an 8 g sachet; Veg Nuggets 2 pc protein 13.03 g.

## McDonald's India North & East — 121 rows
- **Primary source (94 rows):** the Product Nutritional Information Booklet, https://mcdindia.com/wp-content/uploads/2025/12/product-nutritional-information-bookletpdf.pdf, embedded on mcdindia.com/nutritional-information/ (file date 24 Dec 2025). Three repeated pages were kept once.
- **Second source (27 rows):** the "View Menu" PDF, https://mcdindia.com/wp-content/uploads/2026/04/mcd-website.pdf (file date 24 Apr 2026).
  - It is image-only, so I copied the nutrition panel of each item missing from the booklet by eye.
  - The 27 rows: McSpicy Chicken Burger, Chicken Maharaja Mac, Spicy Chicken Wrap, Hot Cake, Egg & Sausage McMuffin, two different Cappuccinos, and 20 McCafé drinks and bakery items.
  - 37 menu pages match booklet items exactly on kcal, which confirms those items are still on the menu.
- **Not used:** an older Nov-2022 booklet still linked on the homepage.
- **Gaps:**
  - The 27 menu-only rows have no serving weight or volume.
  - McCafé drinks: one "standard regular" size only, with no ml and no milk type stated. The only add-on published is a 10 g milk creamer (14 kcal).
  - Some booklet sizes are unlabelled. These are McFlavor Fries 110/155 g (the menu calls the 110 g serve "Peri Peri Fries"), Cold Coffee 300/270 ml, Masala Chai 150/90 ml, and McFloat (whose unlabelled columns match West & South Coke Float and Fanta Float).
  - Nuggets and Fries have no carbs or sugars.
  - Saucy Wrap - Chicken carries a green veg symbol in the PDF; I set it to non-veg and noted the error.
  - The 4 Happy Meals have no nutrition panel.

## Burger King India — 111 rows
- **Source:** https://d1rgpf387mknul.cloudfront.net/1771400941pdfNI18Feb26pdf, titled "Burger King India Nutritional Information Per Serve - February 2026", footer "current as of 12 February 2026". It sits on BK India's own CDN, the same one their site uses for compliance PDFs.
- **One caveat:** I found it through a web search, not by following the site's footer link. The site gets that link from an internal API, and the permission system blocked my call to it. So I could not confirm it is the exact file the footer serves today, though it is the newest official one.
- **Coverage:** veg burgers 13, tacos and wraps 5, veg sides 15, non-veg sides 17, non-veg burgers 15, desserts 9, fountain drinks 12, shakes 4, hot beverages 12, cold beverages 7, café food 2.
- **Gaps:**
  - The portion column is "gm/ml" with no unit per row. I put drinks in `serving_ml` and the rest in `serving_g`.
  - Fountain drinks are served with ice and come only in Regular 300 / Medium 450 ml.
  - Coffee milk type is not stated, sizes are Small/Regular only, and no combos are listed.
  - Plain single-patty Veg and Chicken Whopper are not in the PDF.
  - Probable errors kept as printed and flagged:
    - Veg Whopper Double Patty 1431.7 kcal and Chicken Whopper Double Patty 1574 kcal, which their macros don't support.
    - Thums Up Medium: carbs 8 g but sugar 47 g.
    - Saturated fat higher than total fat on Mochaccino Small, Masala Chai and Choco lava cake.

## Other notes
- The PDFs and HTML are in scratchpad/brands/dl/{mcd_ws,mcd_ne,bk}/ and should not be committed.
- My scripts are in scratchpad/brands/bin/mcdbk_*.py and were run with `python3 -I`. Intermediate files are in scratchpad/brands/work/mcdbk/.
- Other workflows are writing to the same bin/ and dl/ folders, so I prefixed my scripts with `mcdbk_` to avoid clashes.
- No DEVLOG or LEARNING entry was written, because this task said not to edit /home/shivam/STEADY. The parent workflow should add one if it's wanted.

---

BRAND NUTRITION COLLECTION: Chaayos, Haldiram's, Wow! Momo, Bikanervala, Behrouz/Faasos (Rebel Foods), Biryani By Kilo

Official per-item data found for 4 of the 7 brands (240 rows in total). Chaayos, Bikanervala and Biryani By Kilo have no usable official online nutrition. Every brand has a CSV (exact column schema) and a .md file in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/. Brands with no data get a header-only CSV. All checks pass: column count, header, and calories vs protein/carbs/fat (all within 20% except two buttermilk rows). Numbers are exactly as published. Nothing in /home/shivam/STEADY was edited, no database was touched, nothing was committed.

| Brand | Rows | Files |
|---|---|---|
| Behrouz Biryani | 110 | behrouz_biryani.csv / .md |
| Faasos | 93 | faasos.csv / .md |
| Haldiram's | 29 | haldirams.csv / .md |
| Wow! Momo | 8 | wow_momo.csv / .md |
| Chaayos | 0 | chaayos.csv (header only) / .md |
| Bikanervala | 0 | bikanervala.csv (header only) / .md |
| Biryani By Kilo | 0 | biryani_by_kilo.csv (header only) / .md |

1. Behrouz Biryani — 110 rows
- Source: the brand's own ordering site, behrouzbiryani.com (Rebel Foods). Each item has a "Nutritional Value" panel: kcal, protein, fat, carbs, sugar, per serve.
- We read it from the menu data built into 4 store pages: /behrouz-biryani/gurgaon/sushant-lok-rk, /bengaluru/bangalore-hal, /hyderabad/suncity-fc and /new-delhi/mukherjee-nagar-fc. Retrieved 2026-11-13.
- Site disclaimer: values are "per serve as shared by the restaurant", indicative, and "based on default selection".
- Coverage: all "Serves 1" biryanis (Classic and Hyderabadi; 46 rows), 17 Miniyat biryanis, thalis, curry thalis, kathi rolls, haleem combos, sides, desserts and drinks.
- The same item name has different values in different cities (50 rows, flagged in notes). Example: Lazeez Bhuna Murgh Serves 1 is 948 kcal / 40 g sugar in Gurgaon and Delhi, but 733 kcal / 5 g sugar in Bengaluru. Both say they include 1 gulab jamun and raita; the sugar gap suggests the Bengaluru figure is the biryani alone.
- Gaps:
  - Fibre and sodium are never published.
  - Gram weights are not published.
  - About 85 items where you choose a size or option (the Classic/Hyderabadi/Lucknowi biryanis, Nawabi Handi, most curries and kebabs) show values only in the item-detail view. That view loads from /v1/api/, which robots.txt disallows, so we did not collect them.

2. Faasos — 93 rows
- Source: eatsure.com/faasos, Rebel Foods' own ordering site (faasos.com's "Order Now" button links there). Same panel and the same 4 cities.
- Coverage: wholewheat wraps, crispy-baked wraps, Protein Pro wraps, pizza wraps, shawarmas, combo meals, sides, desserts and drinks. No item differed between cities.
- Item names claim more protein than the panel shows; flagged in notes. Example: "Masala Chicken Tikka Protein Pro Wrap (39g Protein)" has a panel value of 28 g.
- Biggest gap: the classic regular wraps (Masala Chicken/Paneer Tikka, Chicken Bhuna, Cheese Melt, the burger wraps), rice bowls (Regular and Jumbo), fries and wedges. They are option items, so their panel sits behind the same blocked item-detail view.

3. Haldiram's — 29 rows (packaged sweets only)
- Source: back-of-pack label images (FSSAI format) in the product galleries on haldirams.com. Each row records the exact cdn.shopify.com image URL.
- We read the labels by eye and transcribed them; no image or PDF is kept for distribution.
- 27 rows are per 100 g; 2 rows are per serving (Gulabjamun cup 56 g; Peanut Chikki 30 g).
- Items: gulab jamun, rasgulla, rasmalai, cham cham, rajbhog, both "My Treat" cups, soan papdi ×2, kaju katli ×2, mini kaju katli, kaju roll, kaju sangam, boondi, moti choor, besan ladoos, mysore pak, 4 pedas, dodha, orange and chana burfees, petha, mango halwa, peanut chikki.
- Flags:
  - The Rasgulla, Rasmalai, Cham Cham and Rajbhog labels print identical numbers.
  - The Kaju Katli 400 g label shows 0.25 g sugar and 615 mg sodium, which looks wrong; marked SUSPECT. The regular kaju katli label (446 kcal) is the better row.
  - Several labels list a serving count that doesn't add up to the pack weight; copied as published.
- Restaurant dishes (chole bhature etc.): no official nutrition online.

4. Wow! Momo — 8 rows
- Source: item descriptions on woweats.co.in, the brand's own ordering site, linked from wowmomo.com.
- Values are kcal per 100 g (for example Chicken Darjeeling Steam Momo 261.22, Veg Darjeeling Steam Momo 187.98). The gluten-free momo also gives protein.
- Plate weight (5 pieces) is not published, so per-plate kcal can't be worked out from official data.
- wowmomo.com's own "Nutrition" links (wowmomodashboard.com) currently say "Coming soon". An archived Sept 2025 version exists, but archive.org blocked us (HTTP 429, flagged as bot traffic) and WebFetch can't reach archive.org. Worth one manual retry.

5. Chaayos — 0 rows
- chaayos.com (retail Shopify store) and the café ordering app cafes.chaayos.com have no nutrition fields at all; the app's code has none.
- The menu-board images list chai and food items with no kcal.
- Swiggy listings show some kcal, but they are third-party, so not used.
- The .md records the "Meri Wali Chai" options (4 milk levels, sugar choice, add-ons) and the full drinks list. The mobile app was not checked.

6. Bikanervala — 0 rows
- order.bikanervala.com (the official restaurant and sweets ordering site) has no nutrition fields.
- The bikanervala.com and catalogue stores returned HTTP 429 (rate limited) for the whole session, including 12 slow retries over about 15 minutes.
- bikano.bikanervala.com fails its secure-connection handshake.
- A search snippet credits that site with Bikano Rasogolla values (200.3 kcal per 100 g). We could not check it at the source, so it is not used.
- The .md lists the URLs to retry.

7. Biryani By Kilo — 0 rows
- The site's menu data has no nutrition fields; it only gives pack sizes such as "1/2 Kg | Serves 1-2".
- The brand's blog gives only a generic range for chicken biryani (450–550 kcal, no serving size). Not used.
- The full menu is listed in the .md.

Supporting files
- Parsers and tools (all run with python -I; downloads were never executed): /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/
- Downloaded pages and label images: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/dl/{behrouz,faasos,haldirams,wowmomo,chaayos,bikanervala,bbk}/
- Hand-transcribed Haldiram's labels: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/haldirams_labels.tsv
- Behrouz and Faasos items without nutrition, with product ids: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/behrouz_missing.json and /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/faasos_missing.json

Bearing on the user's question about searching online when a food is logged
- Official per-item numbers do exist online for these brands, but only in specific places: Rebel Foods' menu data, Haldiram's label images, and Wow Eats item text.
- Generic web search mostly turned up third-party calorie sites (FatSecret, Nutribit, blogs) whose numbers disagree with each other.
- So collecting official data ahead of time (what this task did) is more reliable than a live search at the moment a meal is logged.

Not done because this task was not allowed to edit /home/shivam/STEADY: the DEVLOG.md and LEARNING.md entries that the project rules require for this research are still owed by the caller.