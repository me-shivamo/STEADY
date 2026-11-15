# Indian drink sizes: kulhad, café cups, count-only drinks, lassi, shakes, cold coffee and US cups

*Research for WP4 of the v1.2 follow-up build (2026-11-15). Founder decisions it implements: spec (k)2 and (l)3, plan Q12 and Q13. Proposed rows: `scripts/portions/data/drinks_delta_*.csv`. Golden tests: `__tests__/unit/portionDrinkDelta.test.ts`. Nothing here is live. Every row ships `proposed`, and the values in §10 need the founder's sign-off before any migration promotes them.*

## Summary

The biggest drink error today is not a wrong cup size. It's the **count-only drink**. The V2 parse labels a bare count of a food as `piece` ("1 chai", "1 coffee", "1 lassi", "1 cold coffee"). No drink category has a piece row, so every one of these falls to R8: the model's own gram guess at confidence 0.30, followed by a forced follow-up question. The fix is one piece row per drink category, mapped onto the cup or glass the founder already approved. For chai that gives exactly the founder's 128 g, because the chai row's founder cup carries both grams and ml.

The second error is the one the founder named in (l)3. The live `cappuccino` row carries USDA FNDDS's US cup sizes (small 360, medium 480, large 600 g). An Indian user's "1 cappuccino" is therefore a 16 fl oz US medium of 480 g. The official menus of six Indian chains, already in `scripts/data/brands/raw/`, put the regular hot café drink at a median of **250 ml**. Their small cup is about 180 ml and their large about 350 ml. Those are the same numbers as 054's untested legacy hint (180 / 240 / 350), so the research mostly confirms the existing café cup and corrects the count-only cappuccino.

Kulhad has no measured or official volume anywhere we could find. Retail chai kulhads are sold at 80–150 ml. A 2004 press report on the railway kulhar says a 150 ml serving held only about 100 ml once poured. Both fit the 120 ml Indian teacup, so "kulhad" should map to the existing `cup` unit. The unit CHECK has no `kulhad` value, and this needs no new grams. It is blocked only by where the vocabulary lives (§11).

Lassi is the weakest group. No chain publishes a lassi volume. Packs and NIN agree on **200 ml** for a home or packaged glass, which 054's Indian glass already serves. A shop glass is closer to 300 ml, but that rests on one delivery listing and is graded H. Shakes and cold coffee have good official data: Indian chains serve a median of **330 ml** of shake and **300 ml** of cold coffee.

For US users, FNDDS 2024 gives one consistent set for hot tea, brewed coffee, cappuccino and latte: a cup is 240 g (8 fl oz), and an unspecified serving is 360 g (12 fl oz). The small, medium and large sizes are 360, 480 and 600 g. FNDDS has no mug measure.

## How to read the tables

- **Value**: the number a row would carry. Drinks are stored in ml and weighed with the food's density (the founder's chai cup gives chai 1.067 g/ml, and USDA's coffee cup gives coffee 1.033).
- **How measured**: *official* means the seller publishes this volume as the serving (menu, nutrition booklet, tariff). *Listing* means a retail or marketplace product capacity. *Survey convention* means a fixed utensil chosen by survey designers. *Derived* means our arithmetic on cited values. *Press* means a news report.
- **Grade** (as in `Indian portion sizes and cooking yields.md`): **A** means several measured sources agree. **B** means one good measured or official source, or several consistent ones. **C** means weak, nominal, reconstructed, or an assumption about what the user meant. **H** means there is no real source, only a convention or a judgement. Category rows at grade B are served at confidence 0.70, C at 0.60 and H at 0.50. Below 0.60 the app asks a follow-up.

## 1. What the engine does with drinks today

Every number below is checked by `portionDrinkDelta.test.ts` against the real 054 seed. "Today" is any portion mode, and "delta" is the proposed rows served the way `eval_only` serves them. Here `fallback_g` 240 stands in for the model's own guess.

| Phrase (region) | Today | With the delta | Why |
|---|---|---|---|
| "1 chai" (IN) | 240 g, ai 0.30, asks | **128 g**, category 0.60 | count-only drink fell to R8 |
| "1 coffee" / "1 filter coffee" (IN) | 240 g, ai | **155 g** | as above |
| "1 orange juice" / "1 chaas" (IN) | 240 g, ai | **211 / 204 g** | as above |
| "1 cappuccino" (IN) | **480 g**, FNDDS medium | **254 g** | US 16 fl oz cup (l3) |
| "1 small / large cappuccino" (IN) | 360 / 600 g | 183 / 355 g | US 12 / 20 fl oz |
| "1 latte" (IN, no live key) | 240 g, ai | 258 g | count-only |
| "1 cup latte" (IN) | 247 g, volume 0.45, asks | 258 g, 0.60 | unresearched hint |
| "1 lassi" / "1 mango lassi" (IN) | 240 g, ai | 200 g | count-only |
| "1 glass lassi" at a shop (IN) | 200 g | 300 g, grade H, still asks | home glass used for a shop glass |
| "1 mango shake" / "mango shake" (IN) | 240 g ai / 200 g | 330 g | count-only / home glass |
| "1 cold coffee" / "cold coffee" (IN) | 240 g ai / 200 g | 300 g | as above |
| "1 coffee" / "1 large coffee" (US) | 240 g, ai | 372 / 620 g | count-only |
| "1 mug coffee" / "1 mug tea" (US) | 258 / 208 g, low | 372 / 374 g | generic 250 ml hint; the Indian 200 ml tea mug |
| "1 cappuccino" (US) | 480 g | 365 g | FNDDS's own default is 360 g (founder choice, §10) |

**Already right, so no row was added** (review #15): a cup, cutting or mug of chai, and chai with no amount (the founder rows, 128 / 75 / 200 / 128 g). Coffee with no amount (the serving-unit fallback, 155 g). A home glass of lassi, shake or juice (the 200 ml Indian glass). "Chhota glass", "bada glass" and a V1 "half cup". Every explicit chain size (tall / grande / venti stay exact through R1: 473 ml of cappuccino is 479.9 g). The US cup of coffee (USDA's 248 g cup).

**Known, and not fixable in data:** a US user's "1 cup tea" resolves to the Indian chai row (key `tea`), so it gets the founder's 128 g cup. R3 founder rows outrank every region row, so this belongs to WP6 (region precedence for neutral foods).

## 2. Kulhad (`drink-sizes#kulhad`)

| Source | Value | How measured | Grade |
|---|---|---|---|
| Retail chai kulhads (IndiaMART, GlobalLinker, Zwende, Mudkraft, Pure Source India listings) | 60, 80, 100, 120, 125, 150 ml; some 180–260 ml | listing (seller-stated capacity, brim or fill line not stated) | C |
| Lassi / milk kulhads (IndiaMART "Kullad 300 ml Lassi", 500 ml clay lassi glass) | 300–500 ml | listing | C |
| *The Telegraph*, 14 Jun 2004 (M. Rajendran), quoted in Wikipedia *Kulhar*: "Normally, we supply 150 ml of tea. When poured into the kulhar, it shrinks to only about 100 ml because of the high absorption rate" | ~100 ml held | press (vendor's statement) | C |
| Railway Board Commercial Circular 33 of 2003: standard tea 150 ml in 170 ml disposable cups (search snippet; the page returned HTTP 403 to us) | 150 ml serving | official tariff, not a kulhad | context only |
| Chaayos "Kulhad Chai" | no ml published (sizes are "mini" / "choti ketli") | — | — |

**Proposal:** map the words `kulhad`, `kulhar`, `kullad`, `kulladh`, `kullhad` and their plurals, plus "kulhad wali", to the unit **cup**, with no size. Chai then weighs as the founder's 128 g cup. Other teas get the 120 ml Indian teacup and coffee the 150 ml cup, while a "kulhad lassi" gets the 240 ml generic cup, which suits lassi kulhads. No measurement supports a separate kulhad size. A dedicated value would be a guess between 80 and 150 ml, and the teacup sits in the middle of that range. "Small kulhad" reads as cup S (90 ml for tea). Grade C.

## 3. Count-only drinks in India (`drink-sizes#count-only-in`)

The V2 prompt says: "A bare count of the food ('2 rotis', 'an apple', '3 eggs') is unit 'piece'." The V1 description reader does the same (`portionFromDescription`). Review #15 suspected these rows were redundant, because tea, coffee and cafe_coffee have `serving_unit = cup`. The tests show that fallback only covers a log with **no amount**. With unit `piece`, the engine reads piece rows only, finds none, and returns R8. So the gap is real for every drink category.

| Drink | Proposed piece M (IN) | Anchor value already approved | Other evidence | Grade |
|---|---|---|---|---|
| tea ("1 chai") | 120 ml → **128 g** on the chai row | founder k2 teacup 120 ml; founder chai cup 128 g / 120 ml | chain chai is larger: McDonald's India N&E 90 / 150 ml, Starbucks India Pico 180, Pizza Hut 194 g, CCD 200, BK India 205 ml (official, `scripts/data/brands/raw`) | C (mapping) |
| coffee ("1 coffee", "1 filter coffee") | 150 ml | founder k2 coffee cup (NIN brewed-coffee cup 150 ml) | filter-coffee davara tumblers 120–140 ml (Zishta spec 125–140 ml; Sidapur 120 ml; listings) | C |
| juice ("1 orange juice") | 200 ml | 054 Indian glass 200 ml (B) | Behrouz / Faasos masala lemonade 200 ml, Blue Tokai juices 250 ml, Pizza Hut lemonade 250 g (official) | C |
| buttermilk ("1 chaas") | 200 ml | 054 chaas glass 200 ml | Amul masala buttermilk pouch 280 ml (official pack) | C |

Chain chai (150–205 ml) is bigger than the home teacup. We did **not** add a restaurant chai row, because "chai outside" mixes a 60–90 ml cutting at a tapri with a 200 ml chain cup, and founder k2 fixes tea at 120 ml. That is a founder question (§10).

## 4. Indian café cups (`drink-sizes#cafe-in`)

These values come from the official menus already collected in `scripts/data/brands/raw/` (retrieved 2026-11-13; see each brand's `.md`). They cover hot milk-and-espresso drinks: cappuccino, latte, flat white and mocha. Soy, oat, almond, iced and "Pico" variants are left out.

| Chain (source) | Small | Regular / only size | Large |
|---|---|---|---|
| Café Coffee Day (QA nutrition chart CCD/QA/F&B/NV/01, 28-04-2022) | — | **250** (5 items); soy 230 | King **350** (6 items); soy 330 |
| McCafé, McDonald's India West & South (nutrition booklet) | 236.5 (202–266) | **307.5** (298–348) | 376 (355–405) |
| Burger King India (NI per serve, Feb 2026) | 170 (150–180) | **240** (235–285) | — |
| Starbucks India (Tata Starbucks nutrition guide) | Short 237 | Tall **354** | Grande 473 (Venti 591) |
| Blue Tokai (official digital café menu feed) | — | **230** (190–260, one size) | — |
| Theobroma (official menu) | — | **250** | — |

- **Regular (M): 250 ml.** The median of the six chains' regular or only size: 230, 240, 250, 250, 307.5, 354. Grade B (official servings, six chains, though not a survey of what people order).
- **Small (S): 180 ml.** Within each chain, small is 0.67–0.77 of regular (BK 170/240, McCafé 236.5/307.5, Starbucks 237/354). The mean ratio is 0.72, and 0.72 × 250 = 180 ml. Grade B.
- **Large (L): 350 ml.** Within each chain, large is 1.22–1.40 of regular, which gives 305–350 ml at a 250 ml regular. CCD's King is 350. Grade B.

These replace nothing in 054. The untagged `cafe_coffee` cup rows (180 / 240 / 350 ml, legacy hint, grade H) stay; the new rows are tagged IN and rank above them (R4). The proposal adds the same three sizes as **piece** rows, so that "1 cappuccino" is one regular Indian serving: 250 ml, or 253.6 g with the cappuccino row's FNDDS density.

**Explicit sizes.** Q13 says the (l)3 exception, "USDA café sizes stay … when the size is explicit", applies to café drinks only. Tall, grande and venti, and any stated ml or oz, stay exact through R1 whatever rows exist (tested). The proposed IN piece rows *do* change "small" and "large": an IN user's "1 large cappuccino" becomes 355 g instead of FNDDS's 600 g. We read "explicit size" as a size with a stated volume. The founder must confirm that reading (§10).

## 5. Cold coffee (`drink-sizes#cold-coffee`)

| Chain | Serving |
|---|---|
| Subway India Classic Cold Coffee | 230 g |
| Pizza Hut India Cold Coffee | 235 g (net weight) |
| McDonald's India North & East Cold Coffee | 270 / 300 ml |
| Blue Tokai cold coffees | 300 ml median (260–350) |
| CCD Signature Cold Coffee | 300 ml (CCD frappes and iced coffees 350) |
| McDonald's India West & South Classic Cold Coffee | 296.5 (10 oz) / 327.5 ml (14 oz) |
| Burger King India Classic Cold Coffee | 310 ml |
| Taco Bell India Hazelnut Cold Coffee | 330 ml |
| Starbucks India Cold Coffee | Tall 354 / Grande 473 / Venti 591 ml |

**Proposal: 300 ml.** That is the median of the nine chains' regular or only size, so 1 cold coffee = 300 ml, also used when no amount is given (`is_default`) and for a café glass. A home glass keeps the 200 ml Indian glass. Grade C. The chain sizes are official, but whether a counted cold coffee was bought or made at home is our assumption.

## 6. Shakes and smoothies (`drink-sizes#shake`)

| Chain | Serving |
|---|---|
| McDonald's India West & South shakes | 259–317 (10 oz) / 310–373 ml (14 oz) |
| Burger King India thick shakes | 295–300 ml (KitKat shake 378) |
| Taco Bell India thick shakes | 330 ml |
| CCD Vegan Shake | 350 ml |
| Starbucks India milkshakes | Tall 354 / Grande 473 / Venti 591 ml |
| McDonald's India West & South smoothies | 280–290 (10 oz) / 320–325 ml (14 oz) |
| Keventer Delights (packaged) | 180 ml bottle (BigBasket listing) |

**Proposal: 330 ml.** That is the chain median, whichever McCafé size is counted (300, 330, 350, 354 plus 259 or 310). It applies to "1 shake", to a shake with no amount and to a café glass. A home glass keeps 200 ml. Smoothies fall inside the same range, so `smoothie` joins the new `shake` category. Grade C, for the same reason as cold coffee. FNDDS shakes are aerated (28 g per fl oz, so about 0.95 g/ml), but the new categories inherit beverage's 1.0 g/ml for now, to stay neutral (§11).

## 7. Lassi (`drink-sizes#lassi`)

| Source | Value | How measured | Grade |
|---|---|---|---|
| NIN lassi glass (as cited in `Indian portion sizes and cooking yields.md`, #16) | 200 ml | survey convention | B |
| Aavin (Tamil Nadu co-op) lassi | 200 ml sachet | official pack | B |
| Amul lassi | 200 ml tetra; 250 ml and 1 L cartons | listing | C |
| Mother Dairy lassi | 180 / 200 ml | listing (BigBasket) | C |
| Haldiram's bottled Ambarsariya lassi / mango lassi | 200 / 180 ml | listing | C |
| Haldiram's restaurant, Delhi (Swiggy listing) | mango lassi 200 ml, sweet lassi 300 ml | restaurant-supplied, third-party platform | H |
| INDB salted lassi recipe | 100 g curd + ~322 ml water per "tall glass" ≈ 420 ml | derived | C |
| Clay lassi kulhads | 300–500 ml | listing | C |

**Proposal.** "1 lassi" = one 200 ml glass, the same as 054's Indian glass (grade C, a mapping). A shop or restaurant lassi = **300 ml** (grade **H**: one restaurant listing plus vessel listings), so the app still asks (tested). We propose no home lassi glass row, because the 200 ml glass already serves it. No chain in our brand data publishes a lassi volume.

## 8. US tea and coffee cups (`drink-sizes#tea-coffee-us`)

From USDA FNDDS 2024-10-31: the FDC API (DEMO_KEY, queried 2026-11-15) and the pending 055/056 files built from the same release.

| FNDDS food | 1 cup | Quantity not specified | Small / medium / large |
|---|---|---|---|
| Tea, hot, leaf, black (2710488); green (2710490) and oolong (2710492) the same | 240 g | 360 g | 360 / 480 / 600 g |
| Coffee, brewed (2710375) | 240 g ("1 cup (8 fl oz)") | 360 g | 360 / 480 / 600 g (pots 600 / 1800) |
| SR Beverages, tea, black, brewed (173227) | 237 g ("1 cup (8 fl oz)") | — | — |
| SR coffee (171881, the live `coffee` row) | 248 g | — | — |

No FNDDS tea or coffee food has a **mug** measure. Today a US mug is either 054's generic 250 ml hint (no research) or, for tea, the 200 ml tea mug (an Indian research row with no region tag).

**Proposal (all tagged US):**
- **Cup M: 240 ml** for tea and coffee (B). The grams don't change: the US cup was already the generic 240 ml. The confidence rises from 0.55, which asks a follow-up, to 0.60, which doesn't.
- **Mug M: 360 ml**, FNDDS's 12 fl oz "quantity not specified" serving (C, because a mug is not an FNDDS measure). A sized mug scales it by 054's own mug ratios, so a small US mug of tea is 270 ml (×0.75) and a large mug of coffee 504 ml (×1.4).
- **Piece S / M / L: 360 / 480 / 600 ml**, FNDDS small, medium and large. S is the unit default, because FNDDS's own unspecified serving is the small, so "1 coffee" = 360 ml (B).

A US "1 tea" on the black-tea row weighs 374 g, because the tea category's 1.04 g/ml density comes from milky chai. Plain tea is about 0.99 g/ml (SR's 237 g per 240 ml). The 4% gap is left for the WP6 neutral-food work.

## 9. US café sizes (`drink-sizes#cafe-us`)

FNDDS cappuccino (2710472, the live row), latte (2710386) and iced latte (2710431) all give 1 cup 240 g, small 360, medium 480, large 600 and quantity not specified 360 g. Starbucks's cup sizes are 12 / 16 / 20 fl oz (Tall / Grande / Venti), which are 354 / 473 / 591 ml in the Starbucks India guide. Those match FNDDS within 2%.

**Proposal:** US piece S / M / L = 360 / 480 / 600 ml, with S as the unit default (B). An unsized US cappuccino becomes FNDDS's own 360 g default (365 g on the live row) instead of the 480 g medium it gets today. The live row's 054 fold-in lacks FNDDS's "quantity not specified" line, which is why the engine falls back to the medium. This is a founder choice (§10). Dropping `is_unit_default` keeps today's 480.

## 10. Values the founder must approve

Every row is `proposed` (the founder's decision Q12). Promotion to `active` needs a reviewed migration with `approved_by`.

| # | Value | Rows | Grade | Decision needed |
|---|---|---|---|---|
| 1 | IN count-only tea = the 120 ml teacup (chai 128 g) | tea piece M IN | C | approve |
| 2 | IN count-only coffee = the 150 ml cup | coffee piece M IN | C | approve |
| 3 | IN count-only juice and chaas = the 200 ml glass | juice / buttermilk piece M IN | C | approve |
| 4 | IN café cup and count-only café drink S / M / L = **180 / 250 / 350 ml** (M is 240 in 054's hint) | cafe_coffee cup + piece S/M/L IN | B | approve; and confirm "small" / "large" are **not** the (l)3 "explicit sizes" (tall / grande / venti stay exact) |
| 5 | IN lassi: 1 lassi = 200 ml; shop lassi = **300 ml** at grade H (asks) | lassi piece M IN; glass + piece M IN restaurant | C / H | approve, or drop the shop rows |
| 6 | IN shake: 1 shake = no-amount shake = café glass = **330 ml** | shake piece M IN (default); glass M IN restaurant | C | approve |
| 7 | IN cold coffee: = **300 ml** | cold_coffee piece M IN (default); glass M IN restaurant | C | approve |
| 8 | US tea and coffee cup = 240 ml; mug = **360 ml**; 1 tea / 1 coffee = 360, medium 480, large 600 | tea / coffee cup, mug, piece S/M/L US | B / C | approve |
| 9 | US unsized café drink = FNDDS default **360 ml** (today 480) | cafe_coffee piece S/M/L US, S as unit default | B | choose 360 (FNDDS default) or 480 (today, FNDDS medium) |
| 10 | Three new categories (`lassi`, `shake`, `cold_coffee`) and six word re-points (lassi; shake, milkshake, smoothie; cold coffee, iced coffee) | categories + words delta | — | approve the narrower scope a calibration statement then gets (§11) |
| 11 | Vocabulary: kulhad and its spellings → cup; steel glass / steel tumbler → glass; half / aadha cup or glass → count 0.5 | unit words delta | C | approve |
| 12 | Not proposed: a restaurant chai size (chains 150–205 ml vs tapri cutting 60–90 ml) | — | — | decide whether "chai at a café" should differ from the 120 ml cup |

## 11. Design notes for the later migration

- **No 054 input changes.** `portion_units_seed.csv`, `category_words.csv`, `categories.csv`, `portionText.ts`, `lib.ts` and `emit054.ts` all feed 054's `inputs_sha256`. 054 is live, so editing any of them breaks `emit054 --check` and the byte-for-byte jest test (plan review #14). The delta is three new CSVs plus `scripts/portions/drinkDelta.ts`, which loads, validates and merges them. A test proves the delta files are not 054 inputs.
- **Ships dark.** With the delta loaded and proposed rows off, which is what real users get, the engine gives byte-identical grams, source, confidence, options and follow-up flags. The test sweep covers every 054 category word × 9 units × 2 regions × home/restaurant, plus the live drink rows (9,000+ cases). To make that hold, the three new categories are **neutral on insert**: no density, beverage's S/L ratios and vessel inheritance, no serving unit and no kcal clamp. The validator enforces this. Densities (shakes are aerated, about 0.95 g/ml) can follow in the promotion migration.
- **What the word re-points do change.** `PortionResult.category` becomes `lassi`, `shake` or `cold_coffee` for six words, and so does the scope of a calibration statement: "my lassi glass is 400 ml" would apply to lassi, not to every beverage including water. That is a fix, but it is not invisible. It touches real users only where calibrations are captured (table mode today, every mode under WP3). So either ship the re-points with the promotion migration, or ship them in the insert migration with the founder's approval (§10 #10). Proposed rows on the new categories are reachable under `eval_only` only once the re-points exist.
- **The vocabulary cannot be wired without touching an 054 input.** The unit-word table lives in `portionText.ts`. Wiring the kulhad words therefore needs either a separate module that `parseSchema.ts` and `portionCalibration.ts` consult before `normalizeUnitWord`, or a regeneration of 054's header that keeps its rows byte-identical. `unitWordWithDelta()` is that lookup, written for the tests only. V1's description reader (`portionFromDescription`) has its own copy of the table and needs the same treatment.
- **Migration shape** (for the package that writes it): insert-only, compare-and-swap. The categories insert first, then the rows (keyed by the same UUIDv5 natural key as 054, so a re-run is a no-op), then the word re-points `UPDATE … WHERE word = $1 AND category = 'beverage'`. The number is assigned at push time and the file is held in `supabase/pending/` until its gate passes (review #1). It runs before 054's down script in any rollback, because 054's down script drops `portion_units`. The validator already checks that promoting every row to active breaks none of 054's unique indexes (one active row per key, one `is_default` and one `is_unit_default` per scope).
- **Gate.** jest (`portionDrinkDelta.test.ts`), then a Gate A style replay of real drink phrases (counts only), then the in-process dataset-v3 run, `table+proposed` vs `table`, on the eval account. dataset-v4 was not used to choose anything here.

## 12. What the evidence cannot settle

- No measured kulhad, chai-glass or lassi-glass volume exists in any source we could read. Chaayos publishes no sizes or nutrition. The 2004 railway figure is a vendor's quote.
- Chain servings are what chains sell, not what people order or drink. A national café-order mix by size does not exist publicly.
- Costa India and Dunkin' India publish no reachable official data (see their `.md` files). Chaayos and MBA Chai Wala / Chai Sutta Bar publish no sizes.
- Whether "1 shake" or "1 cold coffee" means a bought or a home-made drink is an assumption (grade C). Calibration ("my glass is 300 ml") and follow-up chips are the remedy.

## Sources

- Official Indian chain menus collected 2026-11-13: `scripts/data/brands/raw/` (`cafe_coffee_day`, `mcdonalds_india_west_south`, `mcdonalds_india_north_east`, `burger_king_india`, `starbucks_india`, `blue_tokai`, `theobroma`, `taco_bell_india`, `pizza_hut`, `subway_india`, `behrouz_biryani`, `faasos`, `amul`; each `.md` records its URL and date).
- USDA FoodData Central, FNDDS 2024-10-31: [Tea, hot, leaf, black 2710488](https://fdc.nal.usda.gov/food-details/2710488/portions), [Coffee, brewed 2710375](https://fdc.nal.usda.gov/food-details/2710375/portions), [Coffee, Cappuccino 2710472](https://fdc.nal.usda.gov/food-details/2710472/portions), [Coffee, Latte 2710386](https://fdc.nal.usda.gov/food-details/2710386/portions); SR Legacy [black tea 173227](https://fdc.nal.usda.gov/food-details/173227/portions). Pending migrations `supabase/pending/055_usda_local_foods.sql` and `056_usda_local_portions.sql` (same release).
- [Wikipedia, *Kulhar*](https://en.wikipedia.org/wiki/Kulhar), citing M. Rajendran, "Pots of money for tea in pot", *The Telegraph* (Calcutta), 14 June 2004.
- [Railway Board Commercial Circular 33 of 2003](https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/comm_33-2k3.jsp) (seen via search snippet; HTTP 403 to our fetch); [IRCTC standard menu (etrain.info)](https://etrain.info/page/standardmenu).
- Kulhad listings: [IndiaMART clay tea cups](https://m.indiamart.com/impcat/clay-tea-cup.html), [GlobalLinker 180 ml](https://www.globallinker.com/products/kullhad-180ml-8271581), [Indian Business Portal 60 ml](https://www.indianbusinessportal.in/products/kullhad-60-ml), [Zwende kullhads](https://zwende.com/products/handpainted-clay-chai-kullhads), [Mudkraft](https://mudkraft.lovable.app/shop/kulhad-set); lassi kulhads [IndiaMART](https://m.indiamart.com/city/dholpur/tableware.html).
- Lassi: [Aavin lassi](https://aavin.tn.gov.in/sweets/-/asset_publisher/aUeiWRs5sODN/content/lassi), [Open Food Facts Amul lassi 200 ml](https://world.openfoodfacts.org/product/8901262200189/amul-lassi-200ml), [BigBasket Amul sugar-free lassi 180 ml](https://bigbasket.com/pd/40323753/amul-sugar-free-lassi-180-ml-tetra-pack), [Haldiram's Shakarpur on Swiggy](https://www.swiggy.com/city/delhi/haldirams-shakarpur-rest181630).
- Shakes: [BigBasket Keventer Delights 180 ml](https://www.bigbasket.com/pd/40248779/keventer-delights-chocolate-milk-shake-180-ml).
- Filter coffee: [Zishta brass davara tumbler](https://zishta.com/products/brass-coffee-davara-tumbler).
- `docs/research/reports/Indian portion sizes and cooking yields.md` (teacup, glass, NIN lassi glass, chaas).
