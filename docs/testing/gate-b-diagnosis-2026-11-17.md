# Gate B diagnosis: why the portion engine logs low

*2026-11-17. All analysis uses the dev set (dataset-v3, in-process) only. The held-out set (v4) was not opened. The only held-out numbers below are the Gate B headline already recorded in `docs/testing/gate-b-2026-11-17.md`. Nothing in the repo was changed.*

---

## 1. The answer in one paragraph

There is one main reason the engine logs low, and it is a design choice. Three smaller reasons are defects.

**The main reason.** Whenever any row in the approved portion table fits a food, the engine uses that row and ignores the AI's own gram guess. The approved rows are smaller than what the AI used to guess:
- an Indian teacup is 120 ml (the AI guessed 240 ml)
- a glass is 200 ml
- a katori of dal is 150 g (the AI guessed 200-250 g)
- a plate is 200 g

The AI still returns its own guess with every parse, and that guess is close to the old numbers. The engine only uses it when no row fits.

**The three defects:**
- **Made-up units.** The new parse prompt adds units the user never typed: a 30 ml "splash" of the milk in cereal or the curd with parathas, a katori for every curry, a scoop of yogurt. The engine treats these as if the user typed them, so it serves tiny amounts and never asks a follow-up question.
- **Omelette.** An omelette is weighed as one egg.
- **Fractions.** "A third of a large pizza" is read as a third of one slice.

**Why dev hides it.** On the dev set, about half of these losses are cancelled by the same defects pushing the other way. A 30 ml "splash" of butter is 6 times the usual amount, honey is 2 times, and a 240 ml bowl of curd is 1.6 times. So dev shows only −7% overall, while held-out showed about −20%. The Indian slice of dev (−23% vs −8% for legacy) and the drinks slice (−24% vs −15%) do show the held-out pattern.

**Not every low number is wrong.** In about a fifth of the reductions, legacy was the one over the band (poha, granola). The defects can be fixed in code or in the prompt. Changing the smaller approved values is the founder's decision.

### Headline numbers

| Dev set (95 cases with bands, first runs) | Engine (table) | Legacy |
|---|---|---|
| Total kcal | 24,487 | 26,391. Engine is −7.2% (−8.7% on the median of repeats) |
| Cases in calorie band | 68 | 79 (67 vs 78 on medians) |
| Median absolute error vs band | 24.0% | 13.6% |
| Median signed lean vs band midpoint | −10.2% | −9.8% |
| Indian cases (20): median signed lean | −23% | −8% |
| Drinks (15): median signed lean | −24% | −15% |
| Cases flipped | 17 lost (9 too low, 8 too high), 6 won | |

- At food level, the engine lowered calories by 4,457 kcal and raised them by 2,553 kcal, a net of −1,904.
- Gate B held-out headline (already recorded): signed lean −20.2% and −22.7% for the engine vs −7.6% and −7.4% for legacy. In band: 65/93 and 62/93 vs 76/93.
- Both sets lose about 11 in-band cases.

---

## 2. Confirmed causes, ranked by share of the under-count

"Net kcal" is engine minus legacy on dev. "Recoverable" comes from replaying the real `computePortion` offline with the defect removed. Each fix was replayed separately, so the effects may not add up exactly (see §6).

| # | Cause | Type | Dev net kcal | Recoverable on dev | Cases it puts out of band |
|---|---|---|---|---|---|
| 1 | Approved rows replace the AI's guess and are smaller | By design (founder/research values) | about −960 | Needs a founder decision | d08, v02 (part) |
| 2 | The parser makes up units and the engine trusts them | Bug (code guard + prompt) | −1,865 on the 40 affected foods (mostly overlaps #1) | **+546 kcal** (katori +196, main foods as splash +287, yogurt scoop +63). Additive splashes: ±0 kcal but **+4 in band** | w07, w09, w11 (low); w01, w02, w14 (high); i08 protein; w15 |
| 3 | Pav bhaji served on the generic 200 g plate | Founder data (spec'd value) | −346 | +290 with a dish row, +1 in band | i09 |
| 4 | An omelette is weighed as one egg | Engine bug | −304 | +188, +1 in band | i20, w12 |
| 5 | A fraction of a whole is applied to one slice | Parse/engine bug | −266 | +398, +1 in band | v05 |
| — | *Not a cause:* the engine is right and legacy is high | — | about −950 (i13 −310, w15 granola −416, i07 −224) | Should not be "fixed" | none (engine wins i07, i13) |
| — | *Not a cause:* engine over-counts that hide the low lean on dev | — | about +1,060 (bowls by volume +261, whole dishes +318, kcal/g swings +190, 250 g rice plate +185, category piece defaults +110), plus spread splashes +430 | — | i06, i18, w05, d02, w01, w02, w14, b01 (high) |

### Cause 1: Approved rows replace the AI's own guess, and they are smaller (by design)

**In plain words.** The AI still makes a gram guess for every food, and on average that guess matches the old system (geometric mean 0.97×). But the engine only looks at it when no table row fits. The table rows came from the 054 seed review, which deliberately retired the old larger anchors in favour of research and founder values. Those values sit at the low end of what people actually eat. The Indian bands are wide, so most cases still pass (14 vs 16 of 20 in band), but the typical Indian meal reads about 23% under the band midpoint.

**For the builder:**
- **Where the AI's guess goes.** `parseV2.ts:16` stores `fallback_g` as `quantity_g`. `portions.ts:383-395` uses it only at R8. `macroResolver.ts:1299` serves `pr.grams` in table mode, and the legacy grams computed at `:1290` are discarded. The V2 prompt (`foodParsePrompt.ts:108`) tells the model its guess "is used only when the app has no data".
- **Old anchors that were retired.** `scripts/portions/data/portion_units_seed.csv:204-211` (for example, `:205` tea cup 240 ml, "superseded by the 120 ml teacup").
- **Rows that answer today:**
  - teacup IN 120 ml (`:150`)
  - milk glass IN 200 ml (`:165`)
  - milk with no amount 175 ml (`:168`)
  - generic plate 150/200/300 g (`:28-30`)
  - generic splash 30 ml (`:31`)
  - cereal_dry bowl 35 g (`:173`)
  - the founder's grade-F katori of 150 g for the dal family, `is_default` (058, recalc-053 spec (i))
- **Dev evidence:**
  - Rows from portion source `category`: 39 foods, net −2,184 kcal, 55% of all reductions, engine grams ÷ legacy grams 0.80. Engine grams ÷ the AI's guess: median 0.81 (n=34). This umbrella overlaps cause 2.
  - **Dal family and curries: about −305 kcal.** i01, i02, i03, i12 and i17 get the founder 150 g katori (about −240). i08 chicken curry gets the k4 200 g vs legacy 250 g (−65).
  - **Indian drink vessels: −286 kcal over 10 foods.** d03 masala chai 124.8 g vs 240 g; d08 mango lassi 200 g vs 240 g (the one drink lost, 180 kcal against a floor of 190); also d04, d05, d06, d07, d09, d12, d15, e05. The 300 ml lassi/shake/cold-coffee rows (drinks delta) are not live.
  - **v02 "had a lot of pasta": −420 kcal.** Generic plate 200 g vs legacy 480 g. Only +150 of that is recoverable without changing the plate row (see §3, size words).
  - **AI guesses with no gram anchors: about −100 kcal.** `buildV2` dropped `GRAM_HINTS_PROMPT`, so when R8 does answer, the guess is lower: i19 moong dal chilla 100 g vs 160 g (now out of band, low); r09 papaya 150 g vs 250 g. b09 Red Bull at 250 g is *more* correct than legacy's 355 g US can.

**Fix.** This is not a bug. It needs a founder decision; options are in §4, step 4.

### Cause 2: The parser makes up units, and the engine treats them as typed

**In plain words.** The V2 prompt makes the AI over-apply a few rules. "A drink additive is a splash" gets applied to milk in cereal, curd with parathas, butter and honey. "Curry with rice gets a katori" gets applied to every curry. Because the made-up unit looks like something the user said, the engine is confident and never offers the S/M/L follow-up buttons. This was deterministic: the same output on all 5 runs.

**For the builder.** 40 of the 126 engine foods carry a unit the user did not type. They hold 58% of the reductions (−2,582 gross, −1,865 net). Most of that overlaps cause 1: with the unit removed, dal still gets its founder 150 g katori and granola still gets 35 g. The part that is verified as recoverable:

**a) Splash.** 15 foods were given unit `splash`; the user typed it in only one (d04).
- Too low: milk on cereal, in a smoothie, in a shake (w07, w09, w11) 30.9 g vs 240 g; curd with parathas (i05) 30.9 g vs 240 g.
- Too high: butter 28.4 g vs 5 g (w01); honey 42.4 g vs 21 g (w02, against the prompt's own "honey = tsp" rule); jam 40 g vs 20 g (w14); peanut butter 32 g vs 16 g (r10); maple syrup 30 g vs 15 g.
- Two main foods were logged as a splash: w11 protein shake and d01 the whole "coffee with milk".
- Code path: prompt `foodParsePrompt.ts:106`, vocabulary `portionText.ts:62`, the 30 ml row × density at R7 (`portions.ts:646-652`).
- Replay with unit null, so each food gets its category serving: total kcal −1,904 → −1,908 (no change), in band 68 → 72 (w01, w02, w07, w09, w14 come in; r10 drops out), median absolute error 24.0% → 21.1%.
- Fixing the two main-food splashes adds +287 kcal, but d01 then lands at 110 kcal against a 15-70 band, because of the separate "coffee with milk" verified row (71 kcal/100 g; see C3).

**b) Katori on every curry.** All 8 curries got `katori`. For i01, i03, i07 and i16 this breaks the prompt's own rule "No amount at all: count 1, unit null" (`:101`). i02, i12, i08 and i17 follow the "<curry> chawal" rule (`:100`) as written.
- With unit null: i07 paneer bhurji 150 → 200 g (+75); i08 chicken curry 150 → 200 g (+65, and the case turns from fail to pass on protein, 23.7 → about 29.4 against a 25-48 band); i16 bhindi 110 → 150 g (+56).
- The dal family does not change (its founder default is the same katori). Total **+196 kcal**.
- `needs_follow_up` was 0 in 8 of 8 cases and would be 1 with unit null. Founder k4 and spec (d) want the follow-up buttons shown here.

**c) Scoop.** w15 got "1 scoop" of yogurt. There is no scoop row, so R8 gives 100 g. With unit null, the liquid_dish serving gives 200 g (+63 kcal), and w15 moves from 234 kcal to about 297, inside its 240-460 band.

**Not exercised on dev, but confirmed offline (I re-ran the probe):** "thoda", "thodi" and "a little" map to `splash` for any food (`portionText.ts:62`), and the validator accepts it as typed (`invented=false`). So "thoda chawal" is 30 ml × 0.66 = **19.8 g of rice**, "thoda dal" is 30 g, and "thoda paneer tikka" is 60 g (the R8 splash cap). This matters for Hinglish phrasing.

### Cause 3: Pav bhaji is served on the generic 200 g plate (one case, founder data)

i09 "a plate of pav bhaji":
- V2 logs it as one food, which is correct per `:99`.
- 'bhaji' maps to dry_sabzi (`category_words.csv:47`), which has no plate row, so R6 serves the generic plate M of 200 g (`seed:29`).
- That is exactly the spec (d) golden value, and `__tests__/unit/portions.test.ts:78` asserts it.
- Result: 193 kcal against a 350-650 band. The INDB row does include the pav (see §3).
- The engine figure comes from one repeat=1 run. Legacy was unstable on this case (runs 540, 1000, 1000, 1000, 538; in band 2 of 5 times).

**Fix (founder data).** Add a dish plate row of about 500 g. That gives about 483 kcal: +290 kcal and +1 case in band.

### Cause 4: An omelette is weighed as one egg (engine bug)

w12 "a cheese omelette with 2 eggs" and i20 "a masala omelette with 2 eggs":
- Both parse as count 1, unit `piece`, which is correct per the prompt.
- The omelette and masala_omelette categories have only `serving` rows (`seed:105-110`; `categories.csv:20-21`, serving_unit `serving`).
- R6 walks up the category chain to egg and serves egg piece M = 50 g (`seed:103`).
- Both come out at 75 kcal on 5 of 5 runs, against bands of 250-430 and 180-340. Net −304 kcal.
- A scan of every category shows only these two borrow a piece row from a parent.

**Fix:** +188 kcal. i20 goes to 125 g, 187.5 kcal, in band. w12 goes to 100 g, 150 kcal, still under its band because the cheese is not counted (founder question C7).

### Cause 5: A fraction of a whole is applied to one slice (parse rule broken, engine follows)

v05 "shared a large pizza, I had about a third":
- It parses as count 0.333, unit null, size L, with the AI's guess at 300 g.
- With no unit, the engine goes to the pizza's serving unit, the slice: L slice 150 g × 0.333 = 50 g, 133 kcal. Legacy gave 399 kcal; the band is 400-920.
- Unit null with a count other than 1 breaks the prompt's own rule (`:101`). v05 is the only dev parse like this. The other fractions (w04, r09, v07) came back as `piece` and passed.

**Fix:** with unit `piece` there is no whole-pizza row (the founder blocked the 897 g row), so R8 serves 199.8 g, about 531 kcal, in band, with a follow-up. +398 kcal, +1 case in band.

### Confirmed in code, but no dev case exercises them

These are confirmed in code and by offline replay. They explain 0% of the dev under-count but could matter on other phrasing:
- **No amount on a food counted in pieces means one piece.** `resolveServing` step 3 (`portions.ts:747-755`) serves one unit of the category's `serving_unit`:
  - "had some almonds" is **1.2 g**, one almond (`categories.csv:28`, `seed:126`)
  - cashews 1.6 g
  - "idli sambar" is one idli, 40 g
  - "a large pizza" is one large slice, 150 g
- **Amounts written as words are dropped.** `numbersInText` only reads digits (`parseSchema.ts:90-102`). "half litre milk" loses its 500 ml as "invented" and is served as the 175 ml default: 180.3 g instead of 515 g. "quarter kg" is dropped the same way.
- **Bowls of rice and sabzi are light.** The generic 240 ml bowl × packed density gives rice or biryani 158 g and sabzi 144 g. These are approved values, not a bug, but they have not been tested on dev.

---

## 3. Causes that were refuted

- **"A made-up katori replaced the 200 g no-amount serving for dal."** False for dal makhani, rajma, sambar, chole and dal tadka. Each has a founder grade-F katori of 150 g with `is_default` (read-only SELECT, `diag/katori/q_rows.csv`), so unit null gives the same 150 g. The katori effect is −196 kcal, not −801 kcal.
- **"The pav bhaji row has no pav in it."** False. INDB OSR112 includes about 516 g of buns (`scripts/recalc/data/lab_split.csv:88`). The lab figure is 106 kcal/100 g, within 9% of the row. This was already refuted in `docs/testing/dish-row-audit-2026-11-13.md`.
- **"The poha plate is too small" (i13).** 150 g × 155.05 = 233 kcal is the founder's 2026-11-17 decision (recalc-053 §7), and it is in band. Legacy's 543 kcal is over the band.
- **"The granola bowl of 35 g, or the made-up bowl, causes the under-count" (w15).** Unit null gives the same 35 g. The engine is 116 kcal under the band midpoint; legacy is 391 over. Only the yogurt scoop part is real (cause 2c).
- **"Size and intensity words cause the under-count."** b01 "a big mac" read as size L is an *over*-count (+227 kcal, out of band high). Fixing b01 and v02 together lowers the dev total by 131 kcal. This is still worth fixing for accuracy (+1 in band, b01), but it does not explain the low lean.
- **R8 (the AI's guess as fallback).** Net +332 kcal on dev (it over-counts), and 11 of 26 R8 foods equal legacy grams exactly.
- **Cooking-oil line.** It fired 0 times on dev and can only add calories (`macroResolver.ts:1547-1588`).
- **Proposed rows.** Off in Gate B (`PORTION_EVAL_PROPOSED=off`). Only 7 are live, all condiments.
- **The follow-up flag changing grams.** It only sets the confidence band and the buttons (`portions.ts:777-782`).
- **R8 clamps biting downward.** Rare: splash ≤ 60 g, handful ≤ 80 g, peg ≤ 65 g (`portions.ts:174-179`).
- **The 056 USDA import and the drinks delta.** Not live.
- **Memory and calibrations.** Off in the eval (memory=off, persist:false).
- **Calorie-per-gram swings from matching.** Net +190 kcal, so they push calories up. i07's −224 kcal comes from legacy's outlier first run.
- **"Indian-region rows outranking the food's own USDA measures is a bug."** This is the order spec (d) R4 defines and what founder (m)2 asks for (IN users get Indian sizes on neutral foods). The one shadowing case found (the generic IN 200 ml glass over the wine row's 150 ml) raises calories. The unwired cuisine part is listed in §6.

---

## 4. Fix plan, in order

There are three classes of fix:
- **A — pure bug.** Code only; no approved value changes.
- **B — prompt or vocabulary.** No food or portion value changes. Under founder (l)5, these are measured on dev only.
- **C — needs founder approval.** Changes an approved food value, portion value or product behaviour.

**Step 1 (A): code fixes, each with jest tests**

1. **Omelette** (`portions.ts`, `run()`). Treat `piece`/`slice` as `serving` when neither the food nor any category in the chain below a `serving_unit: 'serving'` category has a row for that unit:
   ```ts
   const unit = p.unit && p.unit !== 'serving' && !this.pieceIsServing(p.unit) ? p.unit : null
   ```
   `pieceIsServing` walks `this.chain` and returns true at the first category whose `serving_unit === 'serving'` and that has no own row for the unit. The count still multiplies. Test: masala omelette, 1 piece → 125 g, source serving_default.
2. **Fraction with no unit** (`parseSchema.ts`, `validateParsedFoodV2`). If there is no unit, no stated amount, and count ≠ 1, set unit to `piece`. Tests: 0.333 + null → piece; 1 + null stays null; `serving` and tall/grande are unchanged.
3. **Splash guard** (`parseV2.ts`, `parsedFoodsFromV2`, which sees the whole meal and the user's text). Keep `splash` only in two cases:
   - milk, cream or creamer added to tea, chai or coffee that is logged as its own food; or
   - a drink where the user typed splash or dash.

   Everything else gets unit null, and gets size S if the user typed thoda, thodi or "a little". A food whose own name is the drink ("coffee with milk", "protein shake") never keeps splash. This also fixes "thoda chawal". Tests: cornflakes with milk → milk unit null; toast with butter → 5 g; oatmeal with honey → 7.1 g; "a splash of milk" keeps splash; "thoda chawal" → rice at size S.
4. **Made-up scoop** (`parseSchema.ts`). If the unit is `scoop` and nothing in the user's text maps to it, set unit null and record the issue `invented_unit`.
   **Do not** extend this to every vessel (katori, bowl, plate). In replay that cuts chutney from 50 to 15 g and moves rice-with-curry from the founder's 250 g plate to the 158 g cup, about −120 kcal per case.
5. **Amounts written as words** (`parseSchema.ts:90-102`). Read half/aadha = 0.5, quarter/pao = 0.25, a/one/ek = 1, dedh = 1.5, dhai = 2.5, and two to ten. Test: "half litre milk" keeps 500 ml.

**Step 2 (B): one prompt revision of `FOOD_LOGGING_V2`, no gram numbers in it**

1. **Curry with no amount** (`:100-101`). The curry in "<curry> chawal" becomes count 1, unit null; keep the literal `"<curry> chawal"` (`parseSchema.test.ts:29`) and the rice's plate. Add to the no-amount rule: "a side dish too ('2 rotis with dal makhani', 'idli with sambar'); never add a katori, bowl or plate the user did not type."
2. **Splash line** (`:106`). Only milk or cream added to tea or coffee is a splash, and the drink is its own food. The code guard in Step 1 stays, because the model already ignores the honey = tsp rule.
3. **Size word inside a product name** (`:103`). "Big Mac, Whopper Jr": the word is part of the name, so size null.
4. *(optional)* "a lot of / lots of / plenty of" = L, in the prompt and in `SIZE_WORDS` (`portionText.ts:84`). This gets v02 to 450 kcal, still under its band.
5. After the change, re-run the V2 intent check (it was the pre-table gate, 85/85).

**Step 3: re-test on dev** (see §5).

Estimated effect of A + B on dev, adding up the separate replays:
- in band 68 → about **77 of 95** (legacy 79)
- net gap −1,904 → about **−1,340 kcal**: +564, including b01's −281
- with C3 also fixed, the main-food splashes add about +287 more

So A + B alone probably do **not** meet "table ≥ legacy" on dev. The remaining losses are:
- founder-value rows: i09, d08, v02
- over-counts: i06 and i18 (240 ml bowls), w05 (R8 sandwich), d02 (coffee-with-milk row)
- i19 (R8 guess with no anchor), w11, w12

**Step 4 (C): founder decisions.** Each goes through the generator (l1), never hand edits.

- **C1. Pav bhaji plate row.** A food-scope row on `6614c89a-2056-410d-8ec2-6bebc9d8b2f1`: M about 500 g, S about 350 g, L about 600 g, grade C, "2 pav + bhaji", taken from INDB OSR112's own serving. Update the spec (d) golden value and `portions.test.ts:78`. Do not change the generic plate, the poha plate or the poha calorie value.
- **C2. Nuts with no amount.** Make the nuts handful M of 33 g (`seed:119`) the no-amount default for almond, cashew and walnut, instead of one nut. Related question: should "idli" with no amount be 1 idli (40 g) or 2?
- **C3. The "coffee with milk" verified row at 71 kcal/100 g.** It over-counts d02 and blocks the d01 splash fix.
- **C4. Drinks delta.** Migrate the 300 ml lassi/shake/cold-coffee rows (d08) or not.
- **C5. Policy on the smaller approved values** (teacup 120 ml, IN glass 200 ml, dal katori 150 g, generic plate 150/200/300 g, generic bowl 240 ml, which over-counts curd and upma). My recommendation: no blanket change. Legacy is not ground truth, and several engine "lows" are closer to the band than legacy. Revisit only rows where dev band evidence exists.
- **C6. Use the AI's guess as a check.** When the table grams come from a low-grade generic row, or from a unit the user didn't type, and differ from `fallback_g` by more than 2×, show the follow-up buttons. Grams stay the same. This changes the (m)3 "confident logs never ask" behaviour, so it needs approval. Blending grams with the guess would be a bigger design change.
- **C7.** A cheese-omelette serving (w12).
- **C8.** "A large pizza" = one slice, given the founder blocked the whole-pizza row.
- **C9.** Wire the cuisine-aware precedence from (m)2 (see §6).
- **C10 (optional).** The signed-lean criterion in (m)1 only guards against over-counting. Consider making it ±5 points.

**Step 5.** Re-test on dev if any C item landed, then run a fresh Gate B.

---

## 6. How to re-test (this is the §5 the task asked for; numbered 6 here because the fix plan above took two sections)

0. **Free first.** Run jest: the new tests from each fix, the existing `portions.test.ts` and `parseSchema.test.ts` (including the no-gram-numbers and `"<curry> chawal"` checks), and the replay probes in `diag/`.
1. **Dev, in-process, both modes, ×5, one run at a time.** Check the budget before every run and stop if it exits 1:
   ```
   python3 -I <scratch>/gateB/keybudget.py scripts/eval/.env.local 0.45
   npx tsx scripts/eval/run.ts --dataset=dataset-v3.json --search=fts --portion=table  --region=IN --repeat=5 --out=<scratch>/...
   npx tsx scripts/eval/run.ts --dataset=dataset-v3.json --search=fts --portion=legacy --region=IN --repeat=5 --out=<scratch>/...
   ```
   Do the same for `dataset-smoke-phase3.json`. Never use `--portion=table+proposed`.
   - Re-run any case that errors ("fetch failed") with `--ids=… --repeat=5` before comparing. Do not stand in single-run results.
   - Apply the (m)1 criteria on dev:
     - calorie-band passes: table ≥ legacy
     - mean absolute error vs band midpoint: not worse
     - signed median within +5 points of legacy
     - smoke set passes
     - ≥ 95% identical grams over 5 repeats
     - every flip listed with its portion source
     - a food with a founder row never answers from R8
   - Also look at the Indian and drinks signed-lean slices, since those are the ones that reproduced the held-out lean.
   - Judge by bands, not by total kcal vs legacy. Fixing the spread splashes removes about +430 kcal of over-count that was hiding the lean, so dev totals may not improve even when accuracy does.
2. **Fresh Gate B on held-out.** Run it only after dev passes, any C items are signed off, and the fixed functions are deployed. Use the same driver pattern:
   - back to back on the eval key, eval account only
   - `RESOLVER_SEARCH` unset (fts), `PORTION_EVAL_PROPOSED=off`, `PORTION_MODE=eval_only` for the engine legs
   - order legacy → engine → engine → legacy, memory cold, `setup-user.ts` before each leg
   - restore the secrets at the end
   - same (m)1 pass criteria

   Open held-out only for this go/no-go. No fix in this plan was chosen by looking at it.

---

## 7. Still unknown (this is the §6 the task asked for)

- **The 8 outage cases (i07-i14).** One fresh engine run recovered them (`diag/missing.json`, repeat=1): 5 of 8 pass, and i08, i09 and i11 fail. There is no ×5 consistency data for them in engine mode, and legacy i09 was unstable. Re-run them ×5 before any comparison.
- **Why held-out leans −20% when dev shows −7% total and about the same median signed lean.** Dev was used to choose seed values ((m)1), and it contains offsetting over-counts. The rules forbid checking held-out, so only the fresh Gate B can say which cause dominates there.
- **Whether the fixes add up.** Each recovery figure comes from a separate replay with hand-fixed parses. The combined effect, and how the model parses after the prompt change, have not been measured.
- **Paths with no dev case.** "thoda X", nuts or idli with no amount, amounts written as words, bowls of rice or sabzi, "a large pizza". Their weight on held-out is unknown. Consider writing *new* dev cases for them; do not copy from held-out.
- **Region.** The eval account's timezone is null, so every case runs as region IN (`portions.ts:206-209`), and the US path is untested. `_shared/cuisine.ts` and `cuisineVocab.ts` exist, but `portions.ts` and `macroResolver.ts` do not use them, so the (m)2 rule "Western dishes: USDA first" is not wired. An IN user logging a Western dish gets Indian vessel sizes. Dev western-home is not low (median signed +2%), so there is no dev evidence this matters.
- **Follow-up buttons.** 53 of 100 dev foods were flagged, but the eval never answers the buttons. How much real users would correct is unknown.
- **Gate criteria not checked in this diagnosis.** Grams-level repeat consistency (dev counted *calories*: 63/77 identical) and "founder row never R8".

---

**Evidence (scratch, all in `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/gateB/diag/`):**
- `foods.csv`, `report.txt`, `missing.json`, `missing.log`
- `engine.diag.ts`, `engine2.diag.ts` (run with `jest.diag.config.js`)
- `katori/katori.kat.ts`, `katori/q_rows.csv`
- `splash/`
- `omelette/`
- `pizza.diag.ts`, `granola3.diag.ts`

---
Notes for the caller:
- The repo is unchanged: `git status` matches the start state.
- I wrote no DEVLOG.md or LEARNING.md entries because this task was read-only; the parent should add them.
- I made no AI calls. The only extra run was the offline jest probe `engine2.diag.ts`, which confirmed thoda rice 19.8 g, almonds 1.2 g, idli 40 g and "half litre milk" 180.3 g.