# Brand nutrition data: QA report (2026-11-13)

**`REPORT.md` was not written.** The harness blocks subagents from writing report `.md` files, so the full report is this message. Save it as `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/REPORT.md` if you want it on disk. Every other output was written. No published number was changed.

## Bottom line
- **3,741 rows from 20 brands** have official India numbers. **7 brands have none** we could use.
- **2,199 rows (59%) are clean**, with no flag at all.
- **3,402 rows (91%) have no error or conflict flag.** The other 339 are:
  - 167 error-tier rows, whose numbers are internally impossible or suspect;
  - 172 conflict-tier rows, where the same item is published twice with different numbers.
- **The transcription is faithful.** A random sample of 108 rows from 9 text-layer PDFs matched the cited page (108/108). All 7 error-tier examples I traced back are printed that way in the brand's own document.
- **Official documents contain real errors.** The DEVLOG's own example is one: Starbucks India's linked guide prints **104 kcal for both the Short and the Tall Cappuccino**. The newer, unlinked Feb-2026 guide gives Short 66 and Tall 99.
- **The main import problem is weights, not numbers.** STEADY's verified `food_items` rows are per 100 g, and those rows can't be converted without inventing a weight:
  - 793 rows (21%) publish no serving weight or volume at all.
  - Another 1,161 rows (31%) give millilitres only.

## Files written
- **Combined file:** /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/data/_combined.csv
  - 3,741 rows: the original 20 columns plus `brand_slug`, `source_row`, `basis`, `qa_severity`, `qa_flag`.
  - A byte-for-byte check against the originals found 0 mismatches.
  - `qa_flag` holds `code: detail` pairs separated by `; `. It is empty when the row is clean.
- **Per-brand copies** with the same 25 columns (27 files, including the 7 header-only ones): /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/qa/<slug>.csv
  - The collectors' data/<slug>.csv files are untouched.
- **Supporting files:**
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/qa/summary.json (counts and every flagged example)
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/qa/bare_name_collisions.csv
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/work/qa/keys.json
- **Scripts** (run with `python3 -I`, paths passed as arguments):
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/qa_validate.py
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/qa_keys.py
  - /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands/bin/qa_spot.py

## What the flags mean

**Error tier: numbers are internally impossible or suspect. Hold the row until a human checks it.**

| Code | Rows | Rule |
|---|---:|---|
| `atwater_mismatch` | 78 | \|kcal − (4P+4C+9F)\| > 15% of kcal and > 15 kcal |
| `sugar_gt_carbs` | 44 | sugar is more than carbs (tolerance 2% + 0.5 g) |
| `size_not_monotonic` | 37 | a bigger serve in the same table has equal or fewer kcal (rows under 20 kcal are ignored) |
| `macro_mass_gt_serving` | 12 | P+C+F weighs more than the serving |
| `satfat_gt_fat` | 8 | saturated fat (from notes) is more than total fat |
| `kcal_density_gt_900` | 2 | more than 900 kcal per 100 g |
| `added_sugar_gt_sugar` | 1 | added sugar is more than total sugar |

These checks ran and found nothing: negative values, missing kcal, kJ printed as kcal (kcal ≈ 4.18 × the estimate), sodium above pure salt, and per-100 g kcal that disagrees with per-serve kcal.

**Conflict tier: the same item has two published values, so someone has to choose.**

| Code | Rows | Rule |
|---|---:|---|
| `duplicate_conflict` | 154 | same brand, item, size, veg flag and serving text, but different numbers |
| `listed_twice_conflict` | 18 | the same item appears again under a source or cafe label with different numbers |
| `name_collision` | 2 | same name and size, numbers that don't scale with weight |

**Caveat tier: usable, but read the note first.**

| Code | Rows | Meaning |
|---|---:|---|
| `no_serving_size` | 793 | No serving weight or volume is published. For 74 KFC rows it can be worked out from product weight and servings in `notes`. |
| `per100_no_portion` | 209 | Values are per 100 g and no portion size is published. |
| `sodium_implausibly_low` | 181 | Under 5 mg sodium with 3 g or more protein. 168 of these are Starbucks, e.g. Grande Caramel Macchiato at 1.8 mg, which the PDF really prints (RDA 0%). Calories and macros are not affected. |
| `macros_incomplete` | 139 | kcal only. |
| `collector_noted` | 122 | The collector already wrote CHECK, QA or SUSPECT in the notes. |
| `fails_steady_rules_v1` | 90 | The row fails STEADY's `validate.ts` rules v1 once converted to per 100 g. |
| `size_label_ambiguous` | 35 | Same name and size label at different weights. |
| `nonnumeric_value` | 7 | Theobroma prints sugar as `<2.0`. |
| `duplicate_exact` | 3 | Exact duplicate row. |

## Per-brand results
"Clean" means no flag at all. "No error/conflict" also counts rows whose only flags are caveats.

| Brand (file) | Rows | Items | Clean | No error/conflict | Err | Conf | Main flags |
|---|---:|---:|---:|---:|---:|---:|---|
| McDonald's W&S (`mcdonalds_india_west_south`) | 192 | 134 | 186 (97%) | 186 (97%) | 6 | 0 | sugar_gt_carbs 4, atwater 2 |
| McDonald's N&E (`mcdonalds_india_north_east`) | 121 | 93 | 76 (63%) | 116 (96%) | 3 | 2 | no_serving_size 27, macros_incomplete 14 |
| Burger King (`burger_king_india`) | 111 | 87 | 98 (88%) | 99 (89%) | 12 | 0 | atwater 10, satfat_gt_fat 4 |
| KFC (`kfc_india`) | 232 | 159 | 138 (59%) | 189 (81%) | 41 | 2 | no_serving_size 74, atwater 34 |
| Subway (`subway_india`) | 186 | 180 | 173 (93%) | 180 (97%) | 6 | 0 | atwater 6, rules_v1 7 |
| Taco Bell (`taco_bell_india`) | 105 | 103 | 99 (94%) | 105 (100%) | 0 | 0 | no_serving_size 6 |
| Domino's (`dominos`) | 477 | 103 | 6 (1%) | 408 (86%) | 1 | 68 | no_serving_size 471, duplicate_conflict 68 |
| Pizza Hut (`pizza_hut`) | 314 | 188 | 277 (88%) | 302 (96%) | 12 | 0 | size_label_ambiguous 19, atwater 8 |
| La Pino'z (`lapinoz_pizza`) | 199 | 197 | 0 | 199 (100%) | 0 | 0 | per100_no_portion 199 |
| Starbucks (`starbucks_india`) | 976 | 449 | 715 (73%) | 893 (91%) | 45 | 38 | sodium_low 168, duplicate_conflict 36, size_not_monotonic 35 |
| Cafe Coffee Day (`cafe_coffee_day`) | 98 | 81 | 0 | 98 (100%) | 0 | 0 | kcal only |
| Blue Tokai (`blue_tokai`) | 158 | 143 | 116 (73%) | 150 (95%) | 2 | 6 | no_serving_size 23 |
| Barista (`barista`) | 2 | 2 | 0 | 2 | 0 | 0 | kcal and protein only |
| Theobroma (`theobroma`) | 114 | 103 | 106 (93%) | 114 (100%) | 0 | 0 | `<2.0` sugar 7 |
| Natural's (`naturals_ice_cream`) | 150 | 142 | 107 (71%) | 108 (72%) | 36 | 6 | sugar_gt_carbs 31, atwater 6 |
| Amul (`amul`) | 66 | 66 | 64 (97%) | 65 (98%) | 1 | 0 | atwater 1 |
| Haldiram's (`haldirams`) | 29 | 29 | 27 (93%) | 29 (100%) | 0 | 0 | per100_no_portion 2 |
| Behrouz (`behrouz_biryani`) | 110 | 85 | 7 (6%) | 59 (54%) | 1 | 50 | duplicate_conflict 50 (city variants) |
| Faasos (`faasos`) | 93 | 93 | 4 (4%) | 92 (99%) | 1 | 0 | no_serving_size 89 |
| Wow! Momo (`wow_momo`) | 8 | 8 | 0 | 8 | 0 | 0 | kcal per 100 g only |
| **Total** | **3,741** | | **2,199 (59%)** | **3,402 (91%)** | **167** | **172** | |

A low clean share does not always mean bad data. Domino's is at 1% only because it publishes serves as slices, never grams.

## Top flags, with examples
1. **Atwater mismatch (78).**
   - KFC "Classic Chicken Krisper + Reg Popcorn + Reg Pepsi" is printed as 67 kcal. Its Spicy twin lists 588 g carbs.
   - BK Veg Whopper Double Patty: 1431.7 kcal, but its macros give 883. BK Paneer Royale Wrap: 406 vs 613.
   - Domino's Caprese Large: 338.7 vs 551.
   - McDonald's W&S Ketchup: 11.2 kcal with 23.45 g fat in an 8 g sachet.
   - Starbucks Iced Shaken Strawberry Green Tea Lemonade: Grande 190 and Venti 266, but both have macros worth 113.
2. **Same item, two published values.**
   - Domino's 68 rows (e.g. Double Cheese Margherita and Peppy Paneer charted twice).
   - Behrouz 50 rows that differ by city (Lazeez Bhuna Murgh is 948 kcal in Gurgaon/Delhi but 733 in Bengaluru).
   - Starbucks 36 rows (Mocha Cookie Crumble appears in two sections).
   - KFC Dunked Burger: 462 vs 559.
   - Natural's: 5 sundaes on two menus.
   - Blue Tokai: 3 items differ at one cafe.
3. **Sugar more than carbs (44).** Natural's has 31 (Mango: 24 g sugar vs 21 g carbs). BK Thums Up Medium: 47 g vs 8 g. KFC 7up Krush Lime: 35 g vs 4 g.
4. **Bigger serve, no more kcal (37).**
   - Starbucks Cappuccino: Short 104 = Tall 104.
   - Starbucks English Breakfast Tea Latte: Short = Tall = 142.
   - Starbucks Nitro Cold Brew with Salted Foam: 269 at three sizes.
   - Pizza Hut Mirinda: 250 ml is 137.5 kcal but 330 ml is 89.1.
5. **Macros heavier than the serving.**
   - Blue Tokai Cinnamon Roll: 158.7 g carbs in a 150 g roll.
   - Starbucks Hazelnut Triangle: 101 g of macros in a 65 g serve.
   - McDonald's N&E Maple Syrup: 72 g carbs and 288 kcal in a 28 g serve.
   - KFC "10 pc HC Wednesday Offer": weight printed as 110 g.
6. **Wrong size labels.**
   - Pizza Hut prints "Double Chicken Delight (Personal)" on the Medium page, at 6 slices and 550 g.
   - Pizza Hut wings need a piece count to tell rows apart.
7. **Saturated fat more than total fat (8).** Pizza Hut Chicken Tikka Supreme Large: 39.8 g vs 10.0 g. BK Choco Lava Cake: 27.4 vs 4.9.

## Checks against the sources
- **Random transcription audit** (`bin/qa_spot.py`, seed 20261113): 12 rows each from McDonald's W&S, McDonald's N&E booklet, BK, KFC, Subway, Taco Bell, Pizza Hut, Starbucks and Theobroma. **All 108 rows matched the cited page.** Two McDonald's N&E rows only looked like misses because the PDF wraps "129.48" across two lines.
- **Error rows traced to the source and confirmed as printed:**
  - Blue Tokai Cinnamon Roll (feed: `carbohydrates 158.7, portionSize 150`)
  - Starbucks Hazelnut Triangle (p.121)
  - McDonald's N&E Maple Syrup (p.70)
  - KFC 10 pc Wednesday Offer (p.20, weight 110)
  - Starbucks Caramel Macchiato sodium 1.8 (p.3)
  - Pizza Hut Double Chicken Delight "(Personal)" (p.11)
  - Starbucks Short and Tall Cappuccino both 104

  So the flags point at errors in the brands' documents, not collection errors.
- **Not auto-audited:**
  - Image-only sources: Domino's, CCD, the McDonald's N&E menu PDF (27 rows), Barista, Haldiram's labels.
  - Live-page sources: Behrouz, Faasos, La Pino'z, Wow! Momo, Amul, Blue Tokai.

  The collectors cross-checked these themselves (OCR, %RDA, 4/4/9 checks).

## Sources and dates
| Brand | Source and version | Basis |
|---|---|---|
| McDonald's W&S | mcdonaldsindia.com/pdf/2024/nutrition-information.pdf, Apr 2024 (still the only linked file) | per serve, g/ml |
| McDonald's N&E | mcdindia.com booklet (Dec 2025) plus menu PDF (Apr 2026) | per serve; 27 menu-only rows have no weight |
| Burger King | BK CloudFront PDF "current as of 12 Feb 2026", found by search (footer link not confirmed) | per serve, "gm/ml" |
| KFC | about.kfc.co.in nutrition-booklet.pdf, V6 (2026-03-30) | per serving |
| Subway | Aug 2026 chart (subway.in footer) | per serve; Footlong = 2 × 6-inch, not stored |
| Taco Bell | tacobell.co.in nutritional-info-new.pdf, sheet dated 01.04.26 | per serve |
| Domino's | pizzaonline.dominos.co.in nutritional-info, chart images MNI-01..47 (2026-10-28) | per serve = slices, no grams; MNI-34..40 not transcribed |
| Pizza Hut | pizzahut.co.in nutritionals PDF, "PH Nutrition_SEP_2026" | whole pizza or portion, with net weight |
| La Pino'z | lapinozpizza.in item text, 2026-11-13 | per 100 g only |
| Starbucks | starbucks.in TATA Starbucks NI Guide (file Jun 2026, content dated 02-01-2023) | per serve, ml |
| CCD | cafecoffeeday.com charts, April 2022 | kcal only |
| Blue Tokai | official digital-menu feed (3 cafes) plus store page | per serve |
| Barista | homepage banner, 2026-08 | kcal and protein only |
| Theobroma | nutrition-guide.pdf, June 2026 | per serve, often a slice |
| Natural's | 3 PDFs on naturalicecreams.in (2024–2025) | per 100 g |
| Amul | dudhsagardairy.coop (an Amul member union, not amul.com) | per 100 g/ml or per unit |
| Haldiram's | haldirams.com back-of-pack labels | per 100 g |
| Behrouz / Faasos | Rebel Foods store-page menu data, 4 cities | per serve, no grams |
| Wow! Momo | woweats.co.in item text | kcal per 100 g |

## Brands with no official India data (header-only CSVs)
- **Baskin Robbins:** the official dotpe store has the data, but reading it was blocked by policy and no browser was connected.
- **Dunkin':** the site returns 502, and Jubilant leaves the franchise on 31 Dec 2026. Dropping it is recommended.
- **Third Wave:** no nutrition on the website; the numbers are probably only in the app.
- **Costa:** the site was unreachable from here.
- **Chaayos:** no nutrition fields on any official site.
- **Bikanervala:** no nutrition fields, and the site rate-limited every request (HTTP 429).
- **Biryani By Kilo:** pack sizes only.

These partial brands need a decision before use:
- Amul's numbers come from the member union's site, not amul.com.
- CCD is kcal-only and from 2022.
- La Pino'z and Wow! Momo are per 100 g with no portion size.
- Barista has 2 rows.
- Domino's has 7 regional chart images not yet transcribed.

## Recommendation: how these become verified rows in STEADY

### 1. Store them per serve in their own brand table, not straight into `food_items`
STEADY's verified base (migration 050, `validate.ts` v1) is per 100 g, legacy per-serving rows are `unverified`, and only usda, indb and ifct rows are verified. Brand data is per serve as sold, and 1,954 of the 3,741 rows have no gram basis.

- **Add a migration-written `brand_items` table**, on the same trust model as `food_aliases`. Each row keeps:
  - the per-serve numbers exactly as printed;
  - `serving_desc`, plus `serving_g`/`serving_ml` only when published;
  - `region`;
  - `status` (verified or quarantined);
  - `source_url`, `source_title`, `source_version` and page.

  Logging "1 McAloo Tikki" then returns exactly 339.52 kcal.
- **The 1,787 gram-based rows can also get a per-100 g `food_items` twin**, with the serve added as a `portion_units` row ("1 serve = 146 g").
  - Never derive grams for the 793 rows with no weight.
  - Don't treat ml as grams unless the founder approves a density rule for drinks.
- **Give the resolver a brand tier.** Proposed order: user memory, then brand match, then verified key, then alias, then search, then AI. Alternatively, add `brand` to the `source` CHECK constraint.

### 2. Keys and aliases: scoped to the brand by default
- **Canonical key:** `normalizeName("<brand> <item> <size>")`. Examples:
  - `mcdonalds mcaloo tikki burger`
  - `starbucks cappuccino tall`
  - `kfc hot crispy chicken 2 pc`
- **Brand aliases:** short forms (mcd, bk, sbux, ccd, ph) in both word orders, e.g. "tall cappuccino starbucks".
- **Bare aliases without a brand word**, only from a reviewed list of brand-exclusive names: `mcaloo tikki`, `mcspicy`, `mcflurry`, `whopper`, `zinger`, `frappuccino`, `peppy paneer`.
- **Collision check (already run): 70 brand item names already exist as a STEADY live key or alias, or as an INDB dish.** None of these may be keyed bare, so "masala chai" stays the home-made INDB dish. Examples:
  - aliases: `masala chai`;
  - keys: `cappuccino`, `americano`, `filter coffee`, `fries`, `margherita pizza`, `paneer tikka`, `kadhai paneer`, `tandoori chicken`, `mexican rice`, `egg`, `lettuce`, `tomato`;
  - INDB dishes: `rasgulla`, `besan ladoo`, `cold coffee`, `tomato ketchup`.
- **`mcchicken burger` is already a live key.** Decide whether it gets repointed to the official row.
- **Size words are part of the key.** When no size is given, use a documented per-brand default, which is a founder decision.
- **McDonald's region:** 42 brand-scoped key duplicates are mostly W&S vs N&E. Of the 26 item+size pairs both regions publish, 17 have different kcal (McFlurry Oreo Regular 234 vs 116; McEgg 298 vs 263). Pick the region from the user's profile, or set one default.
- **Veg/non-veg twins:** Pizza Hut's spicy range sells the same names as veg and chicken, so the key needs "veg" or "chicken".
- **Behrouz** city-variant rows stay quarantined until a city is chosen.

### 3. Gate and review before shipping
1. Import only rows whose `qa_severity` is clean or caveat (3,402). The 339 error and conflict rows go in as quarantined, with `qa_flag` as the reason, the same pattern migration 050 uses.
2. Run the same plausibility gate on every brand row and on every live web-lookup result:
   - Atwater (15% and 15 kcal);
   - sugar no more than carbs;
   - kcal rising with size;
   - rules v1 where grams exist.

   The Starbucks cappuccino shows that an official number found online can still be wrong.
3. Get a per-brand human sign-off: read about 10 random rows against the source and record it in the migration header. Error rows change only when a newer official document is published, never by editing the number.
4. Store `source_version` and recheck sources monthly by diffing against stored rows. Starbucks needs a decision now: the linked guide and the Feb-2026 guide disagree on 194 of 529 item-size pairs.
5. Normalise on import without touching numbers:
   - `country` has both "IN" (3,501) and "India" (240);
   - 287 `veg_nonveg` cells are blank (Natural's 150, Theobroma 68, Amul 66, Blue Tokai 3);
   - Theobroma's `<2.0` sugar values.
6. Keep only numbers plus attribution. Never ship or commit the downloaded PDFs or images.

### 4. Decisions for the founder
- **Starbucks:** which guide to use — the linked 2023-content one or the Feb-2026 one.
- **McDonald's:** the default region.
- **Amul:** keep the member-union numbers or drop them.
- **Behrouz:** which city's values to use.
- **Domino's:** which value to keep for each double-listed pizza, and whether to transcribe MNI-34..40.
- **Drinks:** whether ml-only drinks may assume 1 g/ml.
- **Sizes:** the default size for each brand.

## Not done
I made no changes under /home/shivam/STEADY and no database calls, and committed nothing. The DEVLOG.md and LEARNING.md entries that CLAUDE.md requires for this research are still owed by whoever has repo access.