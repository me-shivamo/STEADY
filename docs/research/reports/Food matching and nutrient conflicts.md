# Match the concept, then fix its water

STEADY's numbers run high and wobble for two separate reasons, and each one has a well-documented fix. **The first is matching**, meaning how the app turns "2 chapatti" or "idli" into a database row. Validated dietary-recall tools solve this with curated names, not clever models. Intake24's South Asia edition typed local dish names phonetically into English as aliases, used forgiving word search with a fixed ranking, and **failed to find a food in only 1–2% of North and South Indian recalls**. Every one of STEADY's search symptoms has a standard Postgres fix: the English stemmer cutting "idli" to "id", names joined with "/", every word being required, and results coming back in no relevance order. **The second is values.** The USDA, INDB and IFCT numbers that look contradictory mostly describe the same food in different physical states. Take out water and frying oil, and roti, dal and rice agree within about 20% on a dry-matter basis, even though the published per-100 g figures differ by up to 3×. INDB produces the extreme outliers because it adds up raw ingredients and never corrects for cooking: the dough water stays in the roti (202 kcal/100 g), the whole kadhai of frying oil counts as eaten in the poori (738), and batter recipes listed without water come out on a dry basis (plain dosa 381). The USDA rows are accurate, but they describe a commercial frozen roti, a thick lentil dal with ghee, glutinous rice and rice cooked with oil. The method set out by FAO/INFOODS and EuroFIR is: match on preparation state; compare sources on dry matter; recalculate recipes with a cooking-yield factor and only the oil actually absorbed; recompute energy from the macros; and store one chosen value per food variant, with where it came from and a confidence code. In the one Indian lab study that tested this approach, it reproduced measured energy within about 3%. For STEADY, that means five changes:

- Phase 4: aliases point at food *concepts*, and the ranking tie-break prefers a curated regional default.
- A new data step recalculates INDB's ~130 deep-fried recipes and its no-water recipes, and re-tags the mismatched USDA rows.
- Phase 5: portion rows attach to the same variant, so a katori of thin dal is never multiplied by a thick dal's density.
- Phase 6: memory pins variants, not frozen numbers.
- Phase 7: USDA is imported into an append-only source layer.

Matching accuracy and value accuracy should be scored separately, with the Chiplonkar & Agte 2007 lab table as an independent referee. Today's end-to-end eval cannot tell a wrong lookup from a wrong number.

## In plain terms: three ideas carry the whole report

**A nutrient row is a number per 100 g of one physical food, in one state.** Cooking changes the weight, mostly by adding or driving off water, while the calories in the pot barely change. 100 g of atta holds about 320 kcal. Mix it with water into dough and the same calories are spread over more grams, so the per-100 g figure falls. Cook the dough on a tawa and some water steams off, so the figure rises again. **Dry matter** is what is left once water is subtracted. Comparing two sources on dry matter is like comparing two prices per kilo after taking off the packaging: if they agree, they are selling the same thing in different-sized boxes. In that case the fix is to pick the state the user actually ate, not to pick a "winning" source. Only when two sources disagree on dry matter is there a real difference in recipe (usually added fat) or an error.

**INDB is calculated, not measured.** It takes a cookbook recipe, adds up each raw ingredient's nutrients, and divides by the total raw weight. That works for a fruit salad. For cooked food you must also account for what leaves the pot (steam) and what stays behind in the pan (most of the frying oil). INDB does neither, so its errors run in predictable directions depending on the kind of dish. Because INDB publishes the ingredient lists, those errors can be fixed at the source.

**There are three accuracies, not one.** *Matching accuracy* asks whether the app picked the right food and the right state. *Value accuracy* asks whether the number on that row is right. *Portion accuracy* asks whether the grams are right. A correct lookup into a wrong row and a wrong lookup into a correct row both show up as "calories off by 40%" in an end-to-end test, so each needs its own test.

The data design that follows maps onto software ideas you already know:

- an **append-only log** of every source's original numbers;
- a **materialised view** that holds one chosen value per food variant, computed by a deterministic, versioned rule;
- a **commit history** that records why each value changed.

Nutrition-database compilers have run their databases this way for two decades.

## A. Curated names and plain word search find Indian dishes; models refine, they do not replace

### Validated recall tools win with content, not algorithms

The strongest field evidence comes from Intake24's South Asia edition, built for the South Asia Biobank. Its food list held **2,283 items, half of them new South Asian dishes**. Regional teams supplied local names, which were "phonetically entered into the food database in English". Across **29,113 recalls**, only **2% of North Indian and 1% of South Indian recalls** hit a food the search could not find, against 19% in Sri Lanka ([Bhagtani et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11847516/)).

The paper does not describe the search algorithm, but Intake24's open-source code does:

- **Ranking:** a blend of per-locale popularity (how often each food is reported) and a match cost. The cost penalises a missing first word, word-order and word-adjacency violations, and each unmatched query word. Extra words therefore *lower* a food's rank instead of excluding it ([Intake24 admin strings](https://github.com/intake24/intake24/blob/main/packages/i18n/src/admin/en/surveys.json)).
- **Spelling correction:** applied only when no exact word matches. It uses edit distance up to 2 plus Metaphone 3 phonetic codes. It refuses to correct short words (at least 3 letters for one edit, 6 for two), because "correcting 'cake' to 'sage' … is unlikely to be helpful" ([search settings](https://github.com/intake24/intake24/blob/main/packages/common/src/surveys/search-settings.ts)).
- **Stemming:** the English stemmer deliberately skips Porter step 4, which turned "vegetable" into "veget" ([English backend](https://github.com/intake24/intake24/blob/main/apps/api/src/food-index/language-backends/en/english-language-backend.ts)). This is the same failure STEADY sees when "idli" becomes "id".

When Intake24's developers improved search during user testing, most of the changes were content: friendlier names, brand names, synonyms, and missing foods added at regular intervals ([Simpson et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5331549/)). The localisation guide follows the same approach. It asks for synonyms and regional names on every entry, for hidden metadata holding names users would not recognise, and for the most commonly eaten variety as the listed item ([Intake24 localisation toolkit](https://actionlabnet.atlassian.net/wiki/spaces/ILT/pages/1605967/Food+Lists+-+detailed+guidance)).

### INFOODS decides what counts as a correct match

The FAO/INFOODS *Guidelines for Food Matching* treat matching as a documented decision, not a string comparison ([FAO/INFOODS v1.2](https://www.fao.org/fileadmin/templates/food_composition/documents/Nutrition_assessment/INFOODSGuidelinesforFoodMatching_version_1_2.pdf)):

- **Descriptors must agree.** A match must agree on the food and on every descriptor that changes composition: raw or cooked, cooking method, absorbed water and oil, part, fat level, fortification. Applying raw-food values to prepared foods "will lead to major errors".
- **Water decides.** "Water is the most important nutrient to check the food description and the concordance between two foods." If water differs by more than 10%, every nutrient must be adjusted.
- **Generic words get a population default.** For an unspecific word like "milk", do not pick one row. Use the most common form and cooking method in the population, or a consumption-weighted mean of at least three plausible items.
- **Every match gets a quality code:**
  - **A:** food and all descriptors match.
  - **B:** a mean, a recipe calculation with yield factors, or a close relative.
  - **C:** a distant substitute, a raw value used for a cooked dish without adjustment, or a recipe without yield factors.

  The guidelines add that "it is generally better to take an A-match from another FCT than to put a C-match from the FCT of interest".

USDA applies the generic-word rule in its survey database. A vague report gets an "NFS" (not further specified) code, whose values are consumption-weighted composites reviewed every two-year cycle ([FNDDS 2019–2020 documentation](https://www.ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2019_2020_FNDDS_Doc.pdf)). For STEADY: a match is right only if the state is right, and a bare generic word needs a curated regional default, not whichever row sorts first.

### Grounded AI matchers help with ranking and abstention, not with Indian coverage

The best-documented 2026 system, Nutrition Data Service (NDS), runs entirely on PostgreSQL with pgvector ([Liao & Li 2026](https://arxiv.org/pdf/2608.10363)):

1. An LLM parses the text into a base food plus a closed set of facets: cooked state, cooking method, form, preservation, coating, dish type and additives.
2. A word-search channel and a meaning-based (embedding) channel each retrieve candidates, and Reciprocal Rank Fusion (RRF, k = 60) combines them.
3. One LLM call reranks the top 25 and may return an explicit "unsupported" instead of "silently substituting the nearest food".

On 1,000 held-out NHANES meal descriptions it reached **top-1 F1 of 0.875 and recall@5 of 0.942** against exact USDA survey codes. The authors say the remaining gap comes mainly from "ranking among near-duplicate records", not from failing to retrieve the right food. On NutriBench, grounding answers in database rows beat direct GPT-4o estimation, 84.6% vs 66.8% within 7.5 g of carbohydrate. That comparison is unpaired, and NDS is a vendor preprint tested only on US data.

Lemay et al. (*J Nutr* 2026, reported through the NDS paper) make abstention a measured outcome. They show that **similarity thresholds alone do not separate matches from non-matches**: the two systems compared were right on only 47% and 62% of the cases that had no valid match ([as reported in Liao & Li 2026](https://arxiv.org/pdf/2608.10363)). Coverage, not the algorithm, is the binding constraint for culturally specific food. A 2026 rule + embedding + LLM pipeline matched only 69% of ingredients to USDA FoodData Central, and the misses were "mainly culturally specific foods and composite products" ([Epicure](https://arxiv.org/pdf/2604.22776)).

Full faceted coding schemes such as FoodEx2 cost about **10 expert-minutes per food**, and automated coders reach only about 79% correct descriptions ([StandFood, Eftimov et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5490521/)). A small facet set extracted by the parsing model is the affordable version of the same idea.

### Hinglish defeats transliterators and embeddings more than it defeats trigrams

Romanised Hindi has no spelling standard, and the tools built for it are weak at exactly this task:

- **Transliteration.** AI4Bharat's IndicXlit converts romanised text back to native script with only **56% top-1 accuracy**, and 38% on foreign named entities ([Aksharantar](https://arxiv.org/abs/2205.03018v2)).
- **Multilingual encoders.** Mainstream models align romanised Hinglish loosely with both English and Hindi. mBERT retrieves English↔code-mixed pairs at 55% / 43% accuracy ([Mazumder et al. 2026](https://arxiv.org/html/2603.19771v1)).
- **Dense retrieval on names in general.** On entity-centric questions, which are the closest analogue to rare dish names, keyword search (BM25) found the answer in the top 20 for **72%** of queries, against **50%** for a dense retriever ([Sciavolino et al. 2021](https://arxiv.org/abs/2109.08535)). Across 18 retrieval datasets, BM25 remained "a robust baseline" ([BEIR](https://arxiv.org/abs/2104.08663)).

Trigram matching, by contrast, needs no model. It scores "chapatti", "chapathi" and "chapati" as near neighbours by counting shared three-letter fragments. The current plan already makes vector search conditional on the eval showing that aliases plus text plus trigram still miss more than 10% of foods. The evidence supports keeping that gate, and testing a Hinglish-trained embedder on STEADY's own queries before adopting one.

### What Phase 4 should build

Every current symptom maps to a documented Postgres mechanism:

| Symptom today | Cause | Fix in migration 051 | Evidence |
|---|---|---|---|
| idli → "id", chaas → "chaa" | English Snowball stemmer | Index names with the `simple` config (lowercase, no stemming). Optionally put a synonym dictionary in front of the stemmer to protect words. | Postgres docs give the exact pattern: a synonym line stops the stemmer turning "Paris" into "pari" ([text search dictionaries](https://www.postgresql.org/docs/current/textsearch-dictionaries.html)) |
| "Chapati/Roti" never matches "roti" | "/" kept inside one token | Rewrite "/", "-" and "," as spaces in a `search_name` column, and add each slash-part as its own alias | pg_trgm treats every non-alphanumeric as a word separator ([pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)) |
| "plain uttapam" finds nothing | every word required (AND query) | OR the terms and rank by coverage, or rank by `word_similarity(query, name)` | Intake24 penalises unmatched words instead of excluding the food ([surveys.json](https://github.com/intake24/intake24/blob/main/packages/i18n/src/admin/en/surveys.json)) |
| Same words, different row | 3 rows, `ORDER BY id` | Fused relevance score plus a total, fixed tie-break | NDS errors concentrate in near-duplicate ranking ([Liao & Li 2026](https://arxiv.org/pdf/2608.10363)) |

The design choice that matters most is **what the aliases point at**. If "roti" points at three source rows (USDA 297, INDB 202, some IFCT atta row), the LLM still has to choose between conflicting states, and the same words can still produce different numbers. If aliases point at a **food concept**, the candidate slate becomes three *different* foods, for example "roti", "rumali roti" and "tandoori roti". A rule, not the model, then picks the variant: the user's region default, adjusted by any facets the parse extracted. The deterministic ranking key becomes:

```sql
ORDER BY exact_alias DESC, fused_score DESC, is_region_default DESC,
         confidence_code ASC, source_priority ASC, id ASC
```

Here `fused_score` is Σ 1/(k + rank) across the full-text and trigram channels. RRF's inventors fixed k = 60 and found it "not critical" ([Cormack et al. 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)). A later analysis found a tuned weighted sum beats RRF and needs only a few labelled examples to tune ([Bruch et al. 2023](https://arxiv.org/abs/2210.11934)), so the choice between them belongs in the eval, not in the migration.

Supabase's published hybrid-search function defaults to `rrf_k = 50` and builds its index with `to_tsvector('english', …)` ([Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)). Copying it verbatim would bring back the stemmer bug.

Four more guards complete Phase 4:

- **No raw rows for cooked queries.** Raw IFCT rows never satisfy a cooked query unless the user says "raw" or "dry", per the INFOODS raw-versus-cooked rule.
- **Short-word guard on fuzzy matching.** Copy Intake24's guard: no fuzzy match under 3 letters, at most one edit under 6.
- **Slate size and an explicit "none".** The LLM sees at most five distinct concepts, plus a "none of these" option that routes to the ask-the-user path.
- **Content first.** Seed aliases from INDB's own names (many carry a Hindi name in brackets, such as "Washed moong dal (Dhuli moong ki dal)"), from romanisation variants (chapati/chapatti/chapathi/phulka; chaas/chhaas/chaach), and from the queries that miss in STEADY's logs.

A "skeleton" key that folds common romanisation pairs (aa→a, ee→i, dh→d) is a cheap optional extra. No source tests it, and over-folding causes false matches, so it must earn its place on the eval.

## B. The sources agree once water and frying oil come out

### INDB adds up raw ingredients and keeps everything in the pan

INDB was built by Anuvaad Solutions with the University of Edinburgh, published in 2024 under CC BY. It has **1,014 recipes**, taken from two University of Delhi teaching manuals plus 148 recipes from food blogs. Ingredients were matched to IFCT 2017 first, then the older IFCT 2004, then UK and USDA tables. The paper states the method plainly: the nutrients of all ingredients "was summed to obtain the total nutrient content per 100 g of the recipe". It lists "correction for loss or gain in weight while cooking, generally referred to as yield factor" as **future work**. No cooked dish was lab-analysed ([Vijayakumar et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)). INDB's unit table converts "Oil — Frying" to **2 cups**, and 1 cup to 240 g ([Units.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/Units.xlsx)).

Rebuilding the published values from INDB's own recipe file and the IFCT ingredient values reproduces them **exactly** ([recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx); [IFCT 2017 values](https://unpkg.com/@ifct2017/compositions/index.csv)). So the following explanations are verified, not guessed:

- **Roti (202 kcal):** 80 g atta + 60 g water + 1 tsp ghee, divided by the dough weight. It is raw dough at about 48% water.
- **Boiled rice (117):** 100 g parboiled rice + 200 ml water, with every drop retained.
- **Washed moong dal (50):** 30 g dry dal in about 280 g of finished dish.
- **Poori (738 kcal, 77.6 g fat):** 80 g atta plus 480 ml of frying oil, all of it counted as eaten.
- **Plain dosa (381):** the recipe lists no water at all, so the value is per 100 g of dry batter ingredients. Masala dosa (165) includes 120 ml of water and potato, which is why the "plain" version reads more than twice as dense.

That gives four predictable regimes:

| Regime | What happens | Per-100 g error |
|---|---|---|
| Dry-heat breads | Dough water never leaves | Reads low |
| Wet dishes | All the water is kept | Very dilute, but correct per whole serving |
| Deep-fried items | All the frying oil is counted | Reads 2–3× high |
| Recipes that omit their water | Value is on a dry basis | Reads high |

Across the whole table, **131 recipes carry a deep-frying oil line**, with a median of 67.8 g fat per 100 g. A few porridge and batter dishes omit their water: plain dosa, pesarattu (286), one khichdi (383), namkeen daliya (295) and maa chaane ki dal (345). The same table has a "plain khichdi" at 57 because that recipe includes 480 ml of water.

### Worked numbers: roti, dal and rice converge on dry matter

Dry-matter energy is kcal × 100 ÷ (100 − water %). The table uses each source's reported water where one exists, and water rebuilt from the recipe for INDB. The dry-matter arithmetic is ours, from the cited values.

| Food and source | Published kcal/100 g | Water % | kcal per 100 g dry matter | What the row actually describes |
|---|---|---|---|---|
| Roti, INDB ASC096 | 202 | ~48 | ~388 | Raw dough, 3.6 g fat |
| Roti, USDA SR 171844 ([FDC](https://fdc.nal.usda.gov/food-details/171844/nutrients)) | 297 | 33.0 | ~443 | Commercial chapati, 7.5 g fat |
| Chapati, lab, Pune ([Chiplonkar & Agte](https://apjcn.qdu.edu.cn/16_2_22.pdf)) | 305 | 34.7 | ~467 | Home chapati with 9.2 g fat |
| Phulka from IFCT atta at 35% water (calc.) | ≈234 | 35 | 360 | Plain, no fat; ≈252 with INDB's ghee |
| Moong dal, INDB ASC151 | 50 | ~87 | ~380 | 30 g dry dal per ~280 g dish |
| "Dal", USDA FNDDS 2707427 ([FDC](https://fdc.nal.usda.gov/food-details/2707427/nutrients)) | 145 | 66.3 | ~430 | Boiled lentils + 4% ghee, thick |
| Toor dal, lab, Pune | 68 | 84.9 | ~450 | Home dal, pressure-cooked |
| Rice, USDA SR 169711 ([FDC](https://fdc.nal.usda.gov/food-details/169711/nutrients)) | 97 | 76.6 | ~415 | **Glutinous** rice: wrong match |
| Rice, INDB ASC113 | 117 | ~70 | ~390 | Parboiled rice + 2× water, all kept |
| Rice, USDA FNDDS 2708408 ([FDC](https://fdc.nal.usda.gov/food-details/2708408/nutrients)) | 129 | 68.0 | ~403 | Plain cooked white rice |
| Rice, USDA FNDDS 2708404 ([FDC](https://fdc.nal.usda.gov/food-details/2708404/nutrients)) | 151 | 66.1 | ~445 | Rice **cooked with oil**, 3.1 g fat |
| Rice, lab, Pune | 105 | 73.7 | ~399 | Plain pressure-cooked rice |

The published figures disagree by up to 3×. On dry matter, plain rice sits within about 4% across INDB, USDA and the lab (390–403), once the glutinous-rice mismatch and the oil are set aside. Dal sits within about 20% (380–452). Roti spans 388–467, and **added fat explains most of that roti gap**: 3.6 g fat per 100 g in INDB, 7.5 in USDA, 9.2 in the lab chapati. Part of the remaining dal gap plausibly reflects different energy conventions. The lab used one convention; INDB inherits IFCT's kJ values, whose factors are unverified. That is exactly why FAO says to recompute energy yourself (section C).

**Re-watering demonstrates the point.** Take INDB's rice dry-matter value and set it to the lab's 73.7% water: you get about **103 kcal against the lab's 105**. Take INDB's dry-basis khichdi (383) and set it to the lab khichdi's 80% water: about **85 against the lab's 90**. Both calculations are ours.

The 145-versus-50 moong dal "conflict" is consistency, not composition. Set USDA's dal to INDB's 87% water and it reads about 56 kcal. Lab-analysed home dals measured 50–80 kcal at 83–89% water, so a thin home dal at 44–50 is plausible. The 44 figure in STEADY's table does not appear in INDB's published file (the nearest rows are 50.0 and a "moong dal with vadi" at 24.1). Check that row in the database before treating it as INDB data.

### Fried and batter rows are where INDB, not USDA, is the outlier

| Item | INDB kcal/100 g | Lab kcal/100 g (fat g) | INDB ÷ lab |
|---|---|---|---|
| Poori | 738 | 396 (17.8) | ~1.9× |
| Khasta kachori vs moong-dal kachori | 713 | 330 (12.0) | ~2.2× |
| Pakora vs onion pakoda | 672–713 | 208 (9.0) | ~3.3× |
| Medu vada | 745 | 272 (13.5) | ~2.7× |
| Vegetable samosa | 443 | 261 (10.9) | ~1.7× |

Lab values: [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf); INDB samosa: [Vijayakumar et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/).

Lab fat in Indian deep-fried foods sits at **9–18 g per 100 g**, not 70–90 g. UK recipe work found puri fat uptake of at most 18.4 g/100 g ([Chen, Gilbert & Khokhar 2009](https://eprints.whiterose.ac.uk/5414)).

Recalculating INDB's own poori recipe the EuroFIR way (our arithmetic) takes three steps:

1. Drop the 480 ml of frying oil.
2. Add the roughly 16 g of oil needed to reach the lab's 17.8% fat.
3. Dry the result to the lab's 23% water.

The result is **≈365 kcal/100 g**, within 8% of the lab's 396 and half of INDB's 738. The dosa works the same way. Assume about 10% moisture in the dry ingredients and set INDB's 381 dry-batter value to the lab dosa's 39.5% water: it lands near **255 against the lab's 260**.

NIN's *Dietary Guidelines for Indians* (2011) give a per-piece check: **puri 80 kcal, dosa 125, samosa 200, two pea kachori 380** ([NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)). At INDB's density, an 80-kcal puri would weigh 11 g.

### USDA's rows are right about the wrong food

USDA describes each of its rows accurately. The survey database's "Bread, chappatti or roti" (299 kcal) is built entirely from "whole wheat, commercially prepared, frozen" chapati, with 9.2 g fat and 35% water ([FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/nutrients)). Its "Dal" is 96 g boiled lentils plus 4 g ghee ([FDC 2707427](https://fdc.nal.usda.gov/food-details/2707427/nutrients)). For a home phulka (≈234 kcal/100 g), USDA roti reads about **27% high per gram**. For a thin home dal it reads **2–3× high**. These are matching errors (wrong state, wrong recipe), not bad data, and they are exactly the kind of "too high" users report.

### Phase 3's checks catch the oil but not the water

For this report we re-implemented the Phase 3 rules from `supabase/functions/_shared/validate.ts` over the 1,014 INDB rows in `scripts/data/indb.json`. This is a local replica, not a query of the live table.

**What the rules catch:** 151 rows fail at least one rule. The fat-dominant-dish rule flags **103 of the 111 rows with ≥50 g fat**, including every poori, pakora, vada, kachori, bhatura and samosa row. So Phase 3 has already removed most of the fried-food overestimate from the shared table. The cost is coverage: those dishes now fall through to a USDA row or an AI estimate.

**What the rules miss:** every water-basis error passes every rule. That includes roti 202, rice 117, moong dal 50, plain dosa 381, khichdi 383, maa chaane ki dal 345 and all seven dosa rows. Bhel puri at 510 kcal with 48 g fat also passes. The reason is that **Atwater and macro-sum checks test whether a row is arithmetically self-consistent**, and INDB's numbers are perfectly self-consistent: they are correct sums over the wrong weight. Catching them needs a *state* check, meaning an expected water or dry-matter band per dish class. The Phase 3 rules cannot provide one.

### Per serving, the spread is wider than per gram suggests

Multiply each source by one household portion and the disagreement becomes what users feel.

**A 150 g katori of dal** (our assumption for the katori weight) gives:

| Source | kcal |
|---|---|
| INDB thin moong dal | 75 |
| Lab toor dal | 102 |
| NIN ("½ cup dhal = 100 kcal", 100 ml scaled to 150) | ~150 |
| USDA dal | 218 |

That is close to a 3× range for the same bowl.

**A 40 g roti**, the USDA "medium" ([FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/nutrients)), gives:

| Source | kcal |
|---|---|
| NIN, per phulka | 80 |
| INDB | 81 |
| Plain phulka (our calculation) | 94 |
| USDA | 119 |
| Lab chapati | 122 |

Portions add error of their own. No national katori exists. NIN uses a 200 ml cup. A Haryana utensil survey measured "medium" bowls at 320 ml and found that national reference portions **underestimated real intake by 55–60%** ([Gupta et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4919938)). STEADY's own post-Phase 3 eval shows a +9.6% lean on Indian items, traced to gram guesses such as "3 dhoklas = 180 g" (`docs/STATUS.md`).

For watery and doughy staples, the quantity that stays stable is the **dry ingredient and fat per serving**. A roti carries about 3.2 kcal per gram of atta plus 9 kcal per gram of ghee, whatever its water. A bowl of dal carries about 3.3 kcal per gram of dry dal plus 9 per gram of oil.

## C. Choose one value per variant by FAO rules, and keep the receipts

### The compiler's rules are explicit and old

The rules come from FAO's compiler handbook ([Greenfield & Southgate 2003, ch. 10](https://www.fao.org/4/y4705e/y4705e15.htm)) and its 2012 checking guidelines ([FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)).

**The handbook** requires compilers to:

- prefer values from validated analytical methods;
- give recipe-based estimates "lower confidence levels than analytical values";
- compare water and fat contents before combining samples;
- "record the evidence used to select the values";
- flag statistical outliers and exclude them from means, never delete them;
- keep a changes database and never reuse food codes.

**The checking guidelines** add the architecture STEADY needs:

- **Three tiers.** An *archival* database holds data exactly as received. A *reference* database is where values are harmonised, compared, rated and selected into a "standardized" field. A *user* database serves the selection.
- **Energy and water.** "No energy values of the user table/DB were copied from other sources." Raw and boiled rice must never be aggregated.
- **Recipes.** For recipe calculations "yield factors (YF) and nutrient retention factors (RF) must be applied". The raw-ingredient method, summing raw values without factors, is "not recommended except for raw dishes, e.g. fruit salad, sandwiches". Recipe checks should look for missing added water and missing absorbed fat, the two exact holes in INDB.
- **Regional naming.** Where the same name means different recipes by region, "add the varying ingredients and/or region to the recipe name".

**Confidence codes are categories.** USDA's Data Quality Evaluation System rates each data source on sampling, sample count, handling, method and quality control. It publishes a confidence code with each value. Its aggregation was revised so that "several mediocre data points" cannot add up to the top code ([Holden et al. 2002](https://agris.fao.org/search/en/records/65df66956eef00c2cea2a16e)). FAO says such codes "should not be manipulated arithmetically" ([FAO 2003](https://www.fao.org/4/y4705e/y4705e15.htm)).

**EuroFIR's controlled vocabularies are the standard tags for how a value was obtained.** The Method Indicator thesaurus separates analytical results, simple recipe calculation, recipe calculation with factors, imputation and others ([EuroFIR thesauri](https://www.eurofir.org/our-resources/eurofir-thesauri/); [Method Indicator](https://www.eurofir.org/eurofir-thesauri-version-1-3/wp-content/uploads/thesauri/MethodIndicator/version1-3/EuroFIR_Method_Indicator_Thesaurus_version_1-3.htm)).

### Harmonise definitions and water before comparing anything

Three things must line up before two numbers are comparable.

**1. The carbohydrate definition.** The options are total carbohydrate by difference including fibre, available carbohydrate, or direct analysis. Differing carbohydrate definitions caused the largest energy differences in one cross-database analysis, up to about 8% overall ([Chevassus-Agnes et al. 2004, abstract](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi...........4ea1844aa1320a7865f0c10f085967d3)).

**2. The energy factors.** Most FoodData Central energy uses general 4/9/4 factors, with "specific" factors shown alongside where known ([FDC FAQ](http://fdc.nal.usda.gov/faq/)). General factors read about 7% higher than specific ones for whole-wheat flour, and 1–3% lower for rice ([FAO FNP 77](https://www.fao.org/4/y5022e/y5022e04.htm)).

**3. Water.** Once the definitions match, comparison and rescaling are two lines of algebra:

```
nutrient_per_100g_dry = nutrient × 100 / (100 − water%)
nutrient_at_target    = nutrient_source × (100 − water_target%) / (100 − water_source%)
```

STEADY should then recompute energy from the harmonised macros with one declared factor set. Our recommendation is FAO FNP 77's 4 kcal/g for protein and available carbohydrate, 9 for fat and 2 for fibre ([FNP 77, ch. 3](https://www.fao.org/3/y5022e/y5022e05.htm)). Keep each source's reported energy in its own column as a check. For USDA, subtract fibre from total-by-difference carbohydrate before applying 4 kcal/g.

**Open blocker:** IFCT 2017's carbohydrate definition and energy factors are unverified (its atta energy does not reproduce from standard factors). Settle them before recomputing IFCT- and INDB-derived energy.

### Recalculate recipes the EuroFIR way

EuroFIR's recipe guideline defines yield factor = cooked weight ÷ raw ingredient weight. It recommends "a cooking test to determine your own weight yield factor". For frying, it says to "insert only the amount of fat absorbed" ([EuroFIR recipe guideline](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf)). EuroFIR's harmonisation work applies yield at recipe level and retention at ingredient level ([Reinivuo & Laitinen 2007](https://www.eurofir.org/how-do-recipes-and-composite-foods-come-to-their-nutritional-values/wp-content/uploads/Final_recipe_calc_harmonisation.pdf)). Retention factors matter only for vitamins, which STEADY does not show. Energy and macros need only yield and absorbed fat.

The Indian validation is direct. Chiplonkar & Agte analysed **104 cooked foods and 92 meals** in five replicates, then computed table values from raw-ingredient data *adjusted to each dish's measured cooked moisture*. For energy, the result showed no significant difference in any food group: **ICC 0.98, bias 1.8 kcal/100 g, random error SD 18.5 kcal, about 3% average difference**. Fat still differed significantly for most groups, and vitamins were overestimated by roughly 30–55% ([Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)). Getting the water right fixes energy. Getting the fat right needs the absorbed-fat step.

### A canonical-food data model for STEADY

The proposal below maps the FAO three-tier pattern onto Supabase. It evolves today's `food_items` rather than replacing it. It is our design synthesis, not a published standard.

| Table | FAO tier | One row is | Key columns |
|---|---|---|---|
| `food_source_values` (new) | Archival, append-only | One food exactly as a source published it | `source_db`, `source_version`, `source_food_id`, `source_name`, `state`, reported per-100 g protein/fat/carbs/fibre/water/energy, `carb_definition`, `energy_basis`, `method_class` (EuroFIR term), `recipe_lines` (INDB ingredients), `check_flags[]`, `excluded_reason` |
| `food_concepts` (new) | Reference | One food identity; ID never reused | `canonical_name`, `food_group`, `dish_or_ingredient`, facets |
| `food_aliases` (Phase 4) | Search content | One name people use | `alias_norm`, `concept_id`, language/script, region, `visible` |
| `food_items` (existing, becomes variants) | User | One concept in one state, recipe and region | `concept_id`, `state`, `method`, `consistency`, `fat_level`, `region`, `target_water_pct`, per-100 g values with energy recomputed, `selection_rule`, `source_value_ids[]`, `confidence_code`, `status`, `version`, `supersedes_id`, `approved_by`, `evidence_note` |
| `region_defaults` (new) | User | Which variant a bare word means in a region | `concept_id`, `region`, `variant_id`, `rationale` |
| `portion_units` (Phase 5) | User | Grams for one household unit of one variant | `variant_id` or `food_group`, `unit`, `size`, `grams`, `source`, `n_weighings` |
| `food_value_changes` (new) | Audit | One change to a served value | `variant_id`, old and new values, `reason`, `evidence`, who, when |

Examples of variants:

- `roti | IN | home | no fat`
- `roti | IN | home | ghee`
- `chapati | US | FNDDS`
- `moong dal | IN | thin`
- `moong dal | IN | medium`

Region belongs to the variant, not to the source, as INFOODS suggests. An Indian user typing "roti" gets the Indian home default; a US user gets the FNDDS chapati; the others stay one tap away.

**Selection rule per variant (our proposal):**

1. Gather candidates whose identity and state match.
2. Harmonise each one: per 100 g edible portion, one carbohydrate definition, water recorded (imputed from proximates and flagged if missing).
3. Keep the highest tier available. In order:
   1. analysed as-eaten values, e.g. lab cooked dishes or USDA Foundation for plain commodities;
   2. analysed raw values from the user's region (IFCT for India);
   3. recipe calculations *with* yield and absorbed fat (repaired INDB, FNDDS);
   4. analysed values borrowed from another region after adjustment;
   5. raw-ingredient sums without yield (unrepaired INDB);
   6. labels;
   7. AI.
4. With one candidate, use it. With several, take the dry-matter median, excluding robust outliers.
5. Rescale to the variant's target water.
6. Recompute energy.
7. Assign a code, using the weakest-link rule.
8. If a lower tier disagrees with the winner on dry matter by more than a threshold, open a review ticket instead of overriding automatically. A placeholder of 15% for energy, to be tuned, since no published threshold exists.

| Code | Meaning | Typical rows | Role |
|---|---|---|---|
| A | Analysed, same food, same state | USDA Foundation/SR commodities; IFCT raw ingredients (raw queries only); lab-analysed cooked dish | May be region default |
| B | Recipe with yield and absorbed fat, or agreeing sources re-watered to the variant | Repaired INDB; FNDDS recipes | May be region default |
| C | Raw-ingredient sum, cross-region borrowing, or a state guess | Unrepaired INDB; USDA commercial roti offered for India | Searchable by exact name, never default, low confidence |
| D | AI estimate, label read, fallback | Private memory rows | Private only, as today |

**Review workflow (our proposal, applying FAO's "frequently consumed foods" priority).** Rank variants by exposure = log frequency × kcal per typical portion × size of the source disagreement.

- Auto-approve when tier A or B candidates agree within the threshold.
- Otherwise the founder, or a hired nutritionist, approves with a written evidence note.
- Every change writes `food_value_changes`.
- No row is hard-deleted.
- A regression guard blocks publishing if a high-exposure food's energy moves more than a set percentage without an approved note.
- Logged entries keep the values they were logged with. Memory pins variant IDs, so a repaired value flows into future logs without rewriting history.

## D. Twelve changes, in order, across Phases 4 to 8

INFOODS advises spending matching effort on the foods that make up most of intake, following USDA's "key foods" approach of covering 75% of a nutrient's intake ([FAO/INFOODS v1.2](https://www.fao.org/fileadmin/templates/food_composition/documents/Nutrition_assessment/INFOODSGuidelinesforFoodMatching_version_1_2.pdf)). Every data-repair item below should therefore start with the top ~100 concepts by STEADY's own logging frequency, not with all 1,014 INDB rows.

| # | Change | Phase | Evidence it rests on | Strength |
|---|---|---|---|---|
| 1 | Index names with the `simple` config; turn "/", "-", "," into spaces; OR semantics; trigram channel; fused score; fixed tie-break with region default before source priority | 4 (051) | [Postgres dictionaries](https://www.postgresql.org/docs/current/textsearch-dictionaries.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [Intake24 ranking](https://github.com/intake24/intake24/blob/main/packages/i18n/src/admin/en/surveys.json) | Strong (mechanics); fusion weights to tune |
| 2 | Add `food_concepts`; aliases point at concepts; seed romanisation variants, regional names, slash-parts, logged misses; visible vs hidden aliases | 4 (051) | [Intake24 South Asia](https://pmc.ncbi.nlm.nih.gov/articles/PMC11847516/), [Intake24 toolkit](https://actionlabnet.atlassian.net/wiki/spaces/ILT/pages/1605967/Food+Lists+-+detailed+guidance) | Strong field evidence |
| 3 | Fuzzy-match guard: no correction under 3 letters, one edit under 6 | 4 | [Intake24 settings](https://github.com/intake24/intake24/blob/main/packages/common/src/surveys/search-settings.ts) | Moderate (production code, unevaluated) |
| 4 | Slate of ≤5 distinct concepts; LLM picks or says "none"; raw rows excluded unless "raw"/"dry" stated | 4 resolver, 8 | [NDS](https://arxiv.org/pdf/2608.10363), [INFOODS](https://www.fao.org/fileadmin/templates/food_composition/documents/Nutrition_assessment/INFOODSGuidelinesforFoodMatching_version_1_2.pdf) | Moderate (preprint); strong for raw/cooked |
| 5 | **New step "4R": recalculate INDB.** Load recipe lines into `food_source_values`. Replace frying oil with absorbed fat (lab targets ~9–18 g/100 g by dish class). Add missing batter and porridge water. Apply yield to target cooked water (roti ~35%, rice ~70–74%, thin dal ~85%, puri ~23%, dosa ~40%). Recompute energy. Code repaired rows B and unrepaired ones C | New, data-only migration + script, between 4 and 5 | [INDB paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/), [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf), [EuroFIR](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf), [Chiplonkar & Agte](https://apjcn.qdu.edu.cn/16_2_22.pdf) | Strong method; targets moderate (one lab study) |
| 6 | Re-tag mismatched USDA rows (glutinous rice, rice with oil, commercial frozen roti, FNDDS dal) as non-default for India; tag region on every variant | 4R | FDC records cited in section B | Strong |
| 7 | Add a state check to validation: expected water band per dish class plus a dry-matter energy band per food group; flag no-water and no-yield INDB rows | 4R (`validate.ts` + SQL twin) | [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf); replica result in section B | Moderate (bands are synthesis) |
| 8 | Portion rows keyed to a **variant**; founder's cooking tests record raw and cooked weights; dal and roti stored with dry-ingredient-per-unit; `cooking_fat` modifier (none / ½ / 1 / 2–3 tsp per serving) | 5 | [EuroFIR cooking test](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf), [Gupta 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4919938), [NIN DGI](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf), [FNDDS sizes](https://fdc.nal.usda.gov/food-details/2707713/nutrients) | Moderate |
| 9 | Memory pins variant IDs plus personal grams. Corrections that imply a state ("my dal is thick") switch variant. Correction telemetry feeds the review queue | 6 | [FAO 2003](https://www.fao.org/4/y4705e/y4705e15.htm) (priority, audit) | Inference |
| 10 | Per-region popularity counter re-ranks defaults once volume allows | 6, later | [Intake24 ranking](https://github.com/intake24/intake24/blob/main/packages/i18n/src/admin/en/surveys.json) | Moderate |
| 11 | Import USDA Foundation/SR/FNDDS into `food_source_values` with data type → method class, carb definition, energy basis. FNDDS "NFS" codes become US region defaults. Energy recomputed uniformly; AI fallback returns macros only | 7 | [FDC docs](http://fdc.nal.usda.gov/data-documentation/), [FNDDS](https://www.ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2019_2020_FNDDS_Doc.pdf), [FNP 77](https://www.fao.org/3/y5022e/y5022e05.htm) | Strong |
| 12 | Confidence from data in the one-call pipeline. Exact alias + A/B variant + stated or remembered grams = confident. Fuzzy-only match, C value or category-default grams = ask. Never rely on one similarity cut-off | 8 | [Lemay via NDS](https://arxiv.org/pdf/2608.10363) | Moderate |

**Why 4R comes between Phase 4 and Phase 5.** Phase 4 needs only the concept table and the region-default flag to make search deterministic. Phase 5's portion rows must attach to variants whose water is known: a katori weight means nothing until you know which dal density it multiplies. 4R is data and SQL only, so like Phases 4–7 it reaches users without an app build. It also restores verified coverage for the fried dishes Phase 3 quarantined.

**What Phase 5's weighing protocol should capture.** The founder's home weighing should record more than "a katori of dal weighs X g":

- for roti: atta grams before cooking, plus the cooked weight;
- for dal: dry dal, oil, water and final pot weight.

Each of those is the EuroFIR cooking test, and it yields STEADY's own Indian yield factors, which no published table provides.

Vector search stays gated, per the existing plan's rule: add it only if the eval shows aliases + text + trigram still miss more than 10% of foods. If that gate trips, the Phase 10 bake-off should test a Hinglish-capable embedder on STEADY's own queries first.

## E. Score matching and values separately, with the Pune lab table as referee

**Matching accuracy needs its own gold set.** Suggested shape (our proposal):

- **Size and strata:** 300–500 real, anonymised parsed food strings. Strata: Hinglish dish names, English generics, US and packaged items, misspellings and voice-transcription errors.
- **Labels:** each string carries the acceptable concept and variant IDs as an equivalence class, plus an INFOODS-style quality code.
- **Deliberate no-match cases:** regional dishes missing from the table, brand-only items, raw-versus-cooked traps ("rice" must not land on raw rice), non-foods.
- **Metrics:** recall@5 for retrieval and top-1 for the decision, following [NDS](https://arxiv.org/pdf/2608.10363); an equivalence-aware top-1 that credits rows with the same energy and macros; and abstention precision and recall, following [Lemay et al.](https://arxiv.org/pdf/2608.10363).
- **Labelling quality:** two people label a subset and settle disagreements. The Australian Health Survey ran 100% dual coding until coders reached 90% accuracy, then never dropped below 50% ([ABS](https://www.abs.gov.au/ausstats/abs@.nsf/lookup/1704029A0DB81477CA257CD2001CA22E)).
- **Tuning discipline:** tune fusion weights and the k value on a tuning split only. Keep `dataset-v5` held out, as the project's eval rules already require.
- **Reporting:** report generic words separately from specific dishes. Generic words fail through ranking ties; dishes fail through retrieval misses.

**Value accuracy needs an independent referee: Chiplonkar & Agte 2007.** Its appendix gives lab-analysed water, energy and macros per 100 g for about 104 cooked Indian foods and 92 meals ([APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)). Map each to a STEADY variant and score twice:

- dry-matter energy against the lab, which tests composition;
- as-served energy at STEADY's default water, which tests the state default.

Report mean bias, Bland–Altman 95% limits, ICC and the share within ±10% and ±20%, by food group.

Two traps matter:

- **Leakage.** The absorbed-fat targets in change #5 come from this same table. Calibrate fat uptake on half the fried items, or on the UK puri figure ([Chen et al. 2009](https://eprints.whiterose.ac.uk/5414)) and NIN's per-piece values, and score on the rest. Otherwise the check marks its own homework.
- **Scope.** The data are Pune home recipes from 2007. The chapati contains 9.2 g fat, so it is not a plain phulka, and the authors found significant fat differences against food tables. Treat it as a referee for energy and water, not as ground truth for every recipe.

NIN's per-serving values (puri 80 kcal, dosa 125, phulka 80) give a second, coarser check once piece weights are known ([NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)). The founder's cooking tests give a third.

**End to end, attribute every error.** The existing eval reports signed bias, median error and consistency. Add a label to every failing case saying whether the error came from the match, the value or the portion. Without that split, a search fix and a data fix can cancel out and look like no progress. Published app comparisons show why the split matters: five popular trackers correlated 0.73–0.96 with a research database for energy and macros and tended to read low ([Griffiths et al. 2018](https://www.cambridge.org/core/journals/public-health-nutrition/article/assessment-of-the-accuracy-of-nutrient-calculations-of-five-popular-nutrition-tracking-applications/456D6CB0961D86CBEA2E868C52DF7ABF)). A single correlation hides which layer failed.

## F. Four decisions that need the founder, not more research

**What a bare word means for an Indian user.** INDB and IFCT have no equivalent of USDA's "NFS" defaults, and no source found defines Indian consumption-weighted defaults. Someone has to choose:

- whether "roti" means a plain phulka (≈94 kcal per 40 g) or one with ghee (≈101);
- whether "dal" means thin (≈50–70 kcal/100 g) or medium (≈80–100);
- whether "milk" means toned or full-cream.

Starting from the founder's own household, cross-checked against NIN, is defensible if it is written down as a rule with a rationale.

**Repair INDB or replace it.** The recommendation is to repair the top ~100 dishes by recalculation (change #5) and leave the long tail coded C. The alternative is to hand-enter lab or NIN values for the top 50 and keep the rest quarantined. That is faster, but it gives up recipe structure and the ability to model oil.

**Who signs off value changes.** The rules above can auto-approve agreeing sources. Contested, high-exposure foods need a person. A one-off paid nutritionist review of the top 100 variants would also give the "verified" label a defensible meaning.

**How often to ask.** Thin/medium/thick chips and an oil-level chip close the largest remaining gaps, but every question costs logging ease. The choice is between always showing them, showing them only when confidence is low, or defaulting silently and learning from corrections.

## How solid each claim is, and what nobody has measured yet

| Claim | Strength | Basis |
|---|---|---|
| INDB sums raw ingredients with no yield factor, counts all frying oil, and omits water in some recipes | **Strong** | Stated in the paper; values reproduced exactly from INDB's recipe file |
| Roti, dal and rice conflicts are mostly water and added fat | **Strong** in direction, moderate in size | Source water columns + lab data; dry-matter arithmetic is ours |
| Moisture-corrected table values match lab energy within ~3% | **Strong but narrow** | One peer-reviewed Pune study, 2007 |
| FAO/INFOODS rules (state matching, water, yield factors, recompute energy, codes, three tiers) | **Strong** | Authoritative guidance |
| Curated aliases make Indian food searchable (1–2% missing) | **Strong** field evidence; no algorithm detail | 29,113 recalls |
| Postgres `simple`, pg_trgm and synonym dictionaries behave as described | **Strong** | Official documentation |
| Hybrid retrieval + LLM rerank + abstention reaches ~0.87 top-1 | **Moderate** | Vendor preprint, US data only |
| Word search beats embeddings on name-like queries; encoders handle romanised Hinglish poorly | **Moderate** | IR benchmarks not about food; one 2026 Hinglish study |
| Phase 3 rules pass INDB's water-basis errors | **Moderate** | Our replica over the local INDB file, not the live table |
| Absorbed-fat and moisture targets, sanity bands, 15% threshold, A–D definitions, data model, review workflow | **Inference** | Synthesis from cited values and guidance |
| Katori and roti default sizes | **Weak** | No national standard; local studies only |
| How commercial apps curate | **Weak** | Self-description and secondhand copies ([Cronometer](https://cronometer.com/features/accurate-databases.html), [MacroFactor](https://help.macrofactorapp.com/en/articles/46-food-search-database)) |

**Gaps that change decisions:**

- **No benchmark** exists for matching Hinglish or Indian dish text to INDB or IFCT, and no embedding model has been tested on romanised Indian food names. STEADY's own gold set will be the first.
- **No lab validation of INDB** has been published, and there is **no Indian yield-factor table** beyond the moisture values in Chiplonkar & Agte. That makes the founder's cooking tests unusually valuable.
- **IFCT 2017's carbohydrate definition and energy factors** are unverified. Settle them before recomputing energy for IFCT- and INDB-derived rows.
- **Four USDA rows were not checked** (dosa, idli, puri, samosa), because the API key was rate-limited.
- **The 44-kcal moong dal row** does not trace to INDB's published file.
- **No canonical katori** exists in NIN's publications. Restaurant versus home oil use is **unquantified**, so any "restaurant" oil default is a guess until measured.
- **Unconfirmed sources.** It is not confirmed whether NIN's 2024 guidelines kept the cooked-preparation calorie annexure. The Lemay et al. abstention results were read only as reported by NDS.
- **INDB reuse terms.** The paper is CC BY, but the repository states no separate licence, so the reuse terms for derived values should be confirmed.

## Conclusion

The research reframes STEADY's accuracy problem. "Which source wins?" was the wrong question. The useful one is "which physical food did the user eat, and in which state?" Matching and conflict resolution are the same problem seen from two ends, and the concept-and-variant layer solves both:

- search resolves words to a concept deterministically;
- a regional default and the parsed facets pick the variant;
- the variant carries one value, chosen by written rules and stored with its provenance.

Once that layer exists, the LLM's job shrinks to choosing among distinct foods or saying "none". That is the job grounded matchers do well, and it removes the inconsistency that comes from three conflicting rows of the same food.

The second shift is about where the remaining error lives. For Indian staples, a per-100 g number is a fragile thing to argue about, because it depends on how much water is in the pot. The stable quantity is grams of dry ingredient and fat per serving. So the most valuable instrument STEADY has is not a better model or another database. It is the founder's kitchen scale, used to record raw and cooked weights: that produces the yield factors no Indian table publishes, and it calibrates portions and values in one pass. No competitor publicly documents region-aware variants with visible provenance. Doing it carefully, India first, is achievable engineering and a real difference from the other apps.
