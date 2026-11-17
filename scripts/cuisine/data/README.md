# Cuisine data (WP6): DRAFT, awaiting founder sign-off (plan Q15)

Nothing here is served to anyone. `supabase/functions/_shared/cuisine.ts` reads the compiled vocabulary, but no resolver, portion-engine or eval code imports `cuisine.ts` yet. WP6's resolver part will do that behind `RESOLVER_REGION` (default `off`). There is no migration and no flag in this package.

Every row carries `status = draft`. When the founder approves a list, its rows become `approved`. The 062 generator (WP6, later) should refuse to emit `food_region_keys` rows that are still `draft`.

Sources: plan `.claude/plans/v1.2-followup-build-plan.md` WP6, with the adversarial review's corrections #16 (build the Indian-key list by vocabulary) and #26 (neutral foods need a founder-reviewed region-keys list). Founder direction (m)2 is in `.claude/plans/v1.2-phase5-7-spec.md`.

## Files

| File | Kind | What it is |
|---|---|---|
| `indian_vocab.csv` | reviewed (DRAFT) | Indian dish, ingredient and Hindi words. `role = marker` marks Hindi grammar words (ka, ki, ke, aur, wala, wali, waala, saath): they can tip a phrase towards Indian but are never its head. |
| `western_vocab.csv` | reviewed (DRAFT) | Western dish words (pizza, burger, fries, pasta, bagel...). |
| `neutral_list.csv` | reviewed (DRAFT) | Cuisine-neutral foods: for these the user's region decides the row and the sizes (milk, rice, egg, banana, curd, tea, coffee...). Multiword entries also shadow a cuisine word: "thai curry" is not Indian, "sandwich bread" is bread. `portion_category` is the matching 054 category, where one exists. |
| `region_keys.csv` | reviewed (DRAFT) | For each neutral phrase: the row it means for IN users and for US users (review #26). See below. |
| `usda_key_cuisine.csv` | **generated** | Every key in `scripts/usda/data/verified_fdc_snapshot.csv` (live verified rows that carry an fdc_id, 2026-11-13, after 053), classified by the vocabulary. |
| `usda_indian_keys.csv` | **generated** | Its Indian subset: the Indian keys held by rows that carry USDA data. This is the input to WP7 and to the 062 backfill. |

`basis` (vocabulary files):
- `founder`: named in a founder decision.
- `plan`: in WP6's backfill list or review #16.
- `indb`: appears inside an INDB dish name (`scripts/data/indb.json`).
- `live_key`: appears inside a live key or alias (`live_keys_snapshot.csv`).
- `ifct`: an IFCT food name (allowed, unused so far; the test does not check it yet).
- `common`: reviewer judgement only. These rows need the founder's eye first.

The jest test checks every `indb` and `live_key` claim.

Regenerate after any CSV change:

```
npx tsx scripts/cuisine/emit.ts           # writes cuisineVocab.ts + the two generated CSVs
npx tsx scripts/cuisine/emit.ts --check   # exit 1 if any output is stale (jest checks the same)
```

## How a phrase is classified (cuisine.ts `phraseCuisine`)

1. Normalise the phrase exactly as keys are normalised (`normText`).
2. Cut at the first cut word, as the portion engine does: "dosa with chutney" is a dosa. A name joined by "and" keeps the full phrase when its head ends it ("mac and cheese").
3. The head is the listed phrase that ends furthest right; the longer phrase wins a tie. An Indian or Western head decides: "paneer pizza" is a pizza, so USDA comes first.
4. A neutral head (milk, rice...), or no head at all, is tipped by the other listed words: "masala rice", "toned milk" and "amul butter" are Indian. If those words disagree, the phrase stays neutral and the region decides.
5. A listed phrase inside a longer listed phrase never counts on its own, wherever the longer one sits: "japanese curry rice" is rice (neutral), not tipped Indian by the "curry" inside "japanese curry".

A row (`rowCuisine`) is classified in this order:
1. Its tag (062's `food_item_cuisine`; this table needs a `neutral` value as well as `in` and `west`, see below).
2. Its source: `indb` and `ifct` are Indian.
3. Its recipe_ref: `INDB:`, `IFCT:` and `STEADY:` are Indian.
4. Its key's vocabulary, or its name's vocabulary when the row has no key (055 imports).
5. A USDA mixed-dish food group (FNDDS WWEIA 3002–3808; SR Fast Foods, Meals/Entrees/Side Dishes, Restaurant Foods) is Western.
6. Anything else is neutral.

## region_keys.csv: what changes for whom

The `action` column says what each row means:
- `region_row`: ship as a `food_region_keys` row in 062. The target is live today.
- `keep_today`: no row is needed, because today's exact key already gives this region's answer.
- `after_055`: the target is a 055 row (key-less, pending); ship it only after 055 is applied (WP12).
- `blocked`: no suitable row exists; a founder value is needed first.

`today_fts` is what a real user (fts search) gets today.

Biggest effects:
- **US "tea"**: today it logs the 053 Indian chai row (about 78 kcal a cup). With the region row it logs black tea (SR 174155, 1 kcal). This changes founder 053 (h)5 / addendum 1 (key 'tea' = the chai row) for US users only.
- **IN "cottage cheese"**: today it logs US low-fat cottage cheese (81 kcal/100 g). In Indian English "cottage cheese" means paneer (IFCT L003, 257.9), so today's log is about a third of the real calories. **This reverses a recorded founder default:** 053 (h) accepted "chutney, buttermilk/chaas and cottage cheese keep their current targets". The row ships only if the founder explicitly reverses that.
- **IN "banana"**: IFCT robusta (105.2) instead of USDA (89), +18%. Which Indian variety should be the default is a founder call.
- **milk, rice, eggs, curd, potato**: today these are aliases only, which real users (fts) never reach. The region rows give them the rows the founder already chose in 052/053.
- **Founder-held for IN**: buttermilk stays on today's row (`keep_today`), because 053 (h) accepted "buttermilk/chaas keep their current targets". The concern stands for the founder: Indian chaas is not US cultured buttermilk, and a STEADY chaas recipe would be a new founder question.
- **IN "egg" / "eggs"** to IFCT boiled egg: the same energy (147.7 vs 148), but it changes 053 (h)'s default ('eggs' → the verified USDA 'egg' row 3d3e2c25) for IN users.
- **Blocked for IN**:
  - coffee: no reviewed milk-coffee row exists, and today's black coffee (2 kcal) likely undercounts.
  - bread: today's row is SR "Bread, Italian".
  - cheese: today's row is SR brick cheese; IN users mostly mean processed cheese.
- **After 055 for US**: milk (Foundation 746782, 60) and yogurt (Foundation 2259793, 77.3). No plain whole-milk US row is live today.

## usda_indian_keys.csv: notes for WP7 (Q14) and the 062 backfill

The list has 32 keys. It contains every key in the plan's backfill list and every key review #16 found missing from it. It also adds 14 keys that neither hand list had: amul lassi, baingan bharta, beans ki sabji, biryani, boiled rice uble chawal, buttermilk chaas, chawal, filter coffee, ghee, haldiram bhujia sev, kodo millet, methi seeds, paani patashe and tomato garlic chutney.

Not every listed key is a WP7 re-key target:
- `chawal` and `boiled rice uble chawal` are the 053 rice copies of USDA 168930, chosen by founder decision (h)4. The plan tags them `neutral` explicitly. Classified from their keys alone they read as Indian, which is why `food_item_cuisine` must allow `neutral`.
- `biryani` (a6958211, FNDDS 2706538) is superseded by 058 (`biryani_chicken_home`).
- `ghee` and `ghee on parathas` point at SR 171314 "Butter, Clarified butter (ghee)", which is the same food. IFCT's ghee (T013) has no energy value. Probably keep these.
- `chutney` and `buttermilk chaas` are held by founder 053 (h): "chutney, buttermilk/chaas and cottage cheese keep their current targets". Re-keying them in WP7 reverses that and needs the founder's explicit go-ahead, not only a Q14 value.
- `amul lassi`, `haldiram bhujia sev`, `lassi`, `dahi`, `paani patashe` and `baingan bharta` sit on FoodData Central rows outside SR, FNDDS and Foundation (probably Branded). These are manufacturer data; check them against the kept brand data (WP10) before re-keying.

Wrong USDA rows found while drafting (from the pinned USDA descriptions; for the data audit):
- beans ki sabji → "ON THE BORDER, refried beans"
- methi seeds → "Seeds, breadfruit seeds, roasted"
- tomato garlic chutney → "Tomato products, canned, sauce, with tomato tidbits"
- filter coffee → "Beverages, coffee, brewed, breakfast blend" (black)
- finger chips, kitkat 4 finger, kitkat 4 finger bar → "T.G.I. FRIDAY'S, chicken fingers"
- cooked instant noodles (and the 052 maggi aliases) → "Noodles, egg, enriched, cooked"
- sandwich bread → Udi's gluten-free bread
- orange juice, tropicana orange juice → "Babyfood, juice, orange" (apple is fixed by 057)
- vegetables lettuce tomatoes onions etc → a Subway teriyaki sub
- corn soup → a branded corn chowder

Known vocabulary false positive on 055's names (for WP12's tagging, review #30): SR "Groundcherries, (cape-gooseberries or poha), raw" reads Indian from "poha". It is harmless for ranking (an Indian-preference log with any Indian-data candidate drops 055 rows), but WP12 should tag it neutral explicitly.

## Sign-off checklist (Q15)

1. Who signs the lists, and does approval go per file or per row?
2. Hindi names of neutral foods (dahi, chawal, doodh, anda, kela) are drafted as **Indian**, matching review #16's dahi. The English words (curd, rice, milk, egg, banana) are neutral. Alternative: treat the Hindi names as neutral too.
3. The head-noun rule: "paneer pizza", "paneer sandwich" and "masala pasta" are Western (USDA first).
4. Indo-Chinese dishes (manchurian, hakka noodles, chowmein, chilli chicken and its one-l spelling "chili chicken") and momos are Indian. "fried rice" and "noodles" are neutral. "chili" alone stays Western (US chili with beans); "green chili" is neutral.
5. Café drinks (cappuccino, latte, espresso, americano, mocha, chai latte, chai tea latte) are neutral: the region decides the size (l3, Q13).
6. Brand words amul, haldiram, mtr, parle, britannia, maggi and others mark a phrase Indian.
7. Each `region_keys.csv` row, in particular:
   - US curd → dahi
   - IN egg / eggs → IFCT boiled egg (changes the 053 (h) 'eggs' default for IN users)
   - IN banana → robusta
   - IN cottage cheese → paneer (**reverses** the 053 (h) default "cottage cheese keeps its current target")
   - US tea → black tea (changes 053 (h)5's 'tea' = chai for US users)
   - IN buttermilk stays on today's row per 053 (h); say whether a chaas recipe is wanted
   - the after_055 and blocked rows
8. The `common` rows: 179 of the 432 Indian rows, 82 of the 137 Western rows and 15 of the 98 neutral rows have no repo evidence beyond reviewer judgement.
