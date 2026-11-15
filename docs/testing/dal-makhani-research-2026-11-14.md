# Dal makhani evidence, 2026-11-14

Research for founder decision (i)4. Outcome (founder, 2026-11-15): ship the home value, 110 kcal/100 g, in migration 058. No separate restaurant row.

---

## Dal makhani: evidence and proposed values

**Short answer.** I found no Indian lab analysis of dal makhani. The evidence that was actually measured is UK home urad dal (Leeds, n=5) and a Pakistani "daal mash" (one preparation). The Indian numbers come from labels and menus, and none of them say how they were measured.
- **Proposed home-style value:** about **110 kcal/100 g**.
- **Proposed restaurant value:** about **134 kcal/100 g**.
- **Confidence:** C for both.
- **Key:** keep "dal makhani" as its own exact key, separate from plain dal.
- **Do not apply the 84.3% dal water rule.** It would cut the row from 74 to 68.5.

I made no repo edits, ran no database queries and created no worktrees. I did not look at dataset-v4 or the eval bands.

### 1. Sources (per 100 g)

**INDB recipe maths** (053 engine; E = 4P + 9F + 4C + 2·fibre)

| Source | kcal | P | C | F | Fibre | Water | How measured | n / region |
|---|---|---|---|---|---|---|---|---|
| OSR139 Dal makhani, as published (live row 6afbebf2) | 74.04 (INDB's convention; 77.20 by E) | 3.32 | 7.96 | 3.06 | 2.27 | 82.3% | Recipe calculation, all 960 ml of water kept | 1 open-source recipe, India |
| ↳ same recipe at 84.3% (dal class rule) | 68.52 | 2.94 | 7.06 | 2.72 | 2.02 | 84.3% | Recipe calculation | — |
| ↳ at 77.4% | 98.59 | 4.23 | 10.17 | 3.91 | 2.90 | 77.4% | Recipe calculation | — |
| ↳ at 74.7% | **110.40** | 4.74 | 11.38 | 4.38 | 3.25 | 74.7% | Recipe calculation | — |
| ↳ at 72% | 122.23 | 5.25 | 12.60 | 4.85 | 3.59 | 72% | Recipe calculation | — |
| ASC160 Moti mahal dal (urad + rajma), as written | 108.38 (published 103.13) | 3.93 | 8.74 | 5.66 | 3.38 | 77.2% | Recipe calculation | ASC manual |
| ↳ at 74.7% | 120.36 | 4.37 | 9.71 | 6.28 | 3.76 | 74.7% | Recipe calculation | — |
| BFP179 Urad sabut special (whole urad + rajma + chana, 15 g cream + 20 g ghee/butter per 35 g pulses), as written | 82.88 | 2.33 | 5.03 | 5.46 | 2.15 | 84.3% | Recipe calculation | BFP manual |
| ↳ at 74.7% | **133.88** | 3.76 | 8.13 | 8.82 | 3.47 | 74.7% | Recipe calculation | — |

**Measured dishes (lab analyses)**

| Source | kcal | P | C | F | Fibre | Water | How measured | n / region |
|---|---|---|---|---|---|---|---|---|
| CoFID 12-468 "Urad dahl, homemade" (black lentil curry; Univ. of Leeds 2007) | 81 (UK factors); about 88 by E | 4.8 | 8.7 (available) | 3.2 | AOAC 2.7 | **74.7%** | Lab analysis | 5 home samples, UK South Asian |
| CoFID 13-484 "Dahl, mixed, homemade" (same study) | 60 | 4.9 | 9.1 | 0.7 | 3.1 | 78.2% | Lab analysis | 5, UK |
| Khan 2019, Progress in Nutrition 21(2):421-9, "Daal mash" (urad) | 272 | 6.36 | 21.21 (by difference, includes fibre) | 17.98 | — | 53.0% | AOAC, duplicate analysis of one standard-recipe preparation | Peshawar. Dry, oily split-urad style, not makhani; an upper bound only |
| Pune lab (scripts/recalc/data/lab.csv) | — | — | — | — | — | — | No dal makhani or urad dish | Legume curries median 84.3% water (thin, West India) |

**UK recipe calculations (CoFID)**

| Source | kcal | P | C | F | Water |
|---|---|---|---|---|---|
| 15-735 black gram whole + red kidney bean curry, homemade | 94 | 4.5 | 8.4 | 5.0 | 77.4% |
| 15-737 Gujarati black gram, thick | 154 | — | — | — | 61.1% |
| 15-736 Bengali black gram, thin | 76 | — | — | — | 80.2% |

**Packaged ready-to-eat dal makhani** (Open Food Facts label transcriptions; Indian barcodes 890-, n=17 products, retrieved 2026-11-14)
- **Median:** 127 kcal (interquartile range 109–159), P 4.2, C 11.3, F 7.4 (6.0–9.7). Full range 76–233 kcal.
- **Examples:**

| Product | kcal | P | C | F |
|---|---|---|---|---|
| MTR | 86.7 | 3.3 | 6.7 | 5.3 |
| Kohinoor | 91 | 5.1 | 9.1 | 2.9 |
| Ashoka Delhi | 115 | — | — | 6.7 |
| Haldiram's (most labels) | 120–133 | — | — | 7.0–8.0 |
| Haldiram's (one label) | 233 | — | — | 18.7 |
| Tata Sampann "Delhi style" | 147 | 5.1 | 13 | 8.3 |
| Gits | 160 | — | — | 8.7 |
| Vadilal | 176 | — | — | 12 |

- **Method:** FSSAI-format labels; whether values are analysed or calculated is not stated. No water is given; by difference it is roughly 72–78% (my estimate).

**Restaurants and chains**
- **Hotel menus (IHCL, FSSAI menu calorie display, calculated, no macros), n=7.** Only Pilibhit House was checked against the PDF: 731 kcal per 410 g, which is 178/100 g ("overnight cooked black lentil, butter and cream"). The other six come from search snippets: 134, 114, 122, 147, 186, 281 per 100 g. Median 147. The same menu lists a 32 g roti at 353 kcal, so these labels are low quality.
- **Behrouz "Royal Dal Makhani Thali with Rice"** (scripts/data/brands/raw/behrouz_biryani.csv): 822 kcal, P22, C94, F38 per thali. There are no component weights, so no per-100 g value can be derived.
- **Absolute Barbeques nutrition PDF: rejected.** It lists dal makhani twice at 299.67 kcal/100 g with different macros (C24.4/P10.2/F22.0 and C43.6/P19.0/F4.4). Those macros give 337 and 290 kcal, so neither matches. Plain rice is listed at F 10.6.
- **No dal makhani rows** in the Haldiram's, Faasos or Bikanervala brand files.

**Other sources**
- **NIN 2011:** "Plain dhal ½ cup = 100 kcal" from 20 g pulses. There is no dal makhani entry.
- **USDA FNDDS:** has only a generic "Dal" (145 kcal). Not used.
- **DFRL retort dal makhani paper (Agathian et al. 2009):** I found only the citation, no data.

### 2. Proposals

**(a) Home-style: about 110 kcal/100 g, confidence C**
- **Values:** OSR139 as coded, with the recipe's oil as written (the founder's default), at 74.7% water from the Leeds measured urad dal. **110.40 kcal / P 4.74 / C 11.38 / F 4.38 / fibre 3.25 / water 74.7%.** Yield factor 0.699: 1413 g raw becomes 988 g served.
- **Energy check:** 18.96 + 39.42 + 45.52 + 6.50 = 110.40 ✓.
- **Per serving:** 150 g katori = **166 kcal** (now 111, +55). 240 g bowl = **265 kcal** (now 178, +87).
- **Cross-checks:**
  - The recipe says it serves 4. At 74.7% that is 247 g per serving, about one bowl; with all the water kept it would be 353 g.
  - It has 18 g of dry pulse per 100 g, close to NIN's ½-cup dhal (20 g of pulse).
  - ASC160 as written gives 108.4 kcal at 77.2% water.
  - The result sits below the packaged median of 127.
- **Sensitivity:** at 77.4% water it is 98.59 kcal (148 per katori / 237 per bowl).
- **INDB coding errors in OSR139:**
  - "Whole black gram" is coded as split dal (B003); whole is B004.
  - "Ginger 1 inch" is coded as dried ground ginger (G554, 12.66 g); it should be fresh (G014).
  - Fixing both gives 108.1 kcal at 74.7%, about 2% lower. That is a recipe edit and needs founder approval.

**(b) Restaurant: about 134 kcal/100 g, confidence C**
- **Values:** BFP179 with its oil as written, at the same 74.7% water. Its fat-to-pulse ratio is 0.69, against 0.24 for OSR139. **133.88 kcal / P 3.76 / C 8.13 / F 8.82 / fibre 3.47 / water 74.7%.**
- **Energy check:** 15.04 + 79.38 + 32.52 + 6.94 = 133.88 ✓.
- **Per serving:** katori **201 kcal** (+90 vs now), bowl **321 kcal** (+143).
- **Fit with official numbers:** it falls inside the packaged range (median 127, "Delhi style" 115–233) and the hotel menu range (median 147). I held the water fixed, so only the fat differs from the home value.
- **Alternative:** home value plus Phase 5's "heavy" cooking fat (10 g per 150 g) gives 159.75 kcal / P 4.44 / C 10.67 / F 10.36 / fibre 3.05 / water 70.0% (240 per katori / 383 per bowl). It is above the official medians.

**Why both are C:**
- Spec section (a) defines B as a per-type rule that passed the test. Here that rule is the 84.3% dal class, and every dal makhani source contradicts it.
- These values are instead anchored to an outside dish (UK urad dal) that does not match the recipe. BFP179 is also not named "dal makhani".
- A home weighing would upgrade them: raw pulses and the final pot weight. This is the spec's item (g)8.

### 3. Keys and implementation
- **Separate key:** yes. The new home row supersedes 6afbebf2 (same_food_revised) and takes the key "dal makhani". Plain "dal", "daal" and "dal tadka" stay on ASC155 (73.65).
- **Spelling variants** (dal makhni, daal makhani): add as founder-approved key copies, the batch-2 pattern, if real logs use them.
- **Restaurant row:** a separate variant (for example "restaurant dal makhani") for Phase 5's restaurant context. Fts search reaches it only if someone types the exact key.
- **Kaali dal / maa ki dal** should stay on 053's dal_urad_whole, not dal makhani (no cream).
- **The 053 engine cannot express this yet.** derive() accepts lab anchors only from lab.csv and only for anchor-only classes. Adding the Leeds row to lab.csv would refit the parameters and break `check`, the same issue raised for Khan 2019. A batch-2 generator needs a new moisture basis (for example external:CoFID12-468@74.7, allowed only for legume_curry at confidence C), or a recipe_custom that supports target moisture.
- **053 and 054 stay untouched.** New row ids need portion_category_map entries in a later migration: the dal-family 150 g katori / 240 g bowl, or liquid_dish. Today 6afbebf2 has no portions and reaches liquid_dish through the 'dal' and 'makhani' words.
- **Correction to an internal note:** `dals_curries_dairy_drinks.md` says 18.8 g of fat per INDB bowl. That is the weight of the butter and cream cheese; the actual fat is 10.8 g per serving (43.3 g ÷ 4).

### 4. Files
Scratch scripts and downloaded data are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/b2/dalmakhani/:
- variants.py and fixed.py: the recipe sweeps.
- lines.py: OSR139, ASC160, BFP179 and ASC159 recipe lines.
- cofid.py and cofid/cofid2021.xlsx: the CoFID rows.
- offstats.py and off/search1.json: the packaged-label summary.
- menus/m3.txt: the Pilibhit House menu.
- abq/abq.txt: the Absolute Barbeques sheet.

The Khan 2019 text is in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/dishaudit/dl_pk/pk.txt (Table 2, "Mash bean" row).