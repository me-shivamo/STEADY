# Split vs whole-dish logging A/B, 2026-11-13

Founder question: is "break compound foods into components" better than "whole dish first"? dataset-v3 (dev set), x3, in-process, fts, gpt-4o-mini and gpt-6-luna, local eval key; only the one prompt sentence changed.

**Decision:** keep whole-dish first, fix the double-count wording, audit the suspect Indian dish rows, and later let the resolver choose split vs whole based on what the database holds.

---

**Verdict: the founder is right that macros should come from our database, but splitting doesn't get us there.** When the model breaks a dish into parts, most parts have no database row, so the AI estimates them. Keeping a dish whole uses more of our stored data. Overall accuracy was a tie between the two rules. Splitting won only where our stored whole-dish value is wrong, or where the food is a simple combination of basic foods.

## Setup
- **Comparison:** worktree at d6b074d, dataset-v3, fts search, 3 runs per case, memory off. The two prompts differ only in the "Logging rules" sentence; I checked that "split" is byte-identical to today's prompt. The other prompt hints were left as they were, and two of them still push towards splitting (they use biryani as the example), so "whole" was tested at a slight disadvantage.
- **Runs:** all four ran in sequence with no errors and no key-limit stop. Key budget went from $2.19 to $1.24, but part of that was the model comparison running at the same time. My runs cost $0.090 (mini split), $0.093 (mini whole), $0.107 (luna split) and $0.070 (luna whole).
- **Noise:** two identical "split" runs (this one and the earlier model comparison) disagreed on 6 cases for gpt-4o-mini and 14 for gpt-6-luna. Differences under about 5 points in pass rate are noise. The "all 3 runs" numbers below (285 logs) are steadier than first-run numbers.
- **Intent check:** the "whole" prompt scored 85/85 on both models (60/60 food logs, 25/25 questions).

## All 100 cases (95 food logs)
| variant | strict pass | in band (1st run / all 3) | median abs error (1st / all) | lean | protein median abs error (n=19) | same calories ×3 | foods per log | calories from database rows | AI-estimated items |
|---|---|---|---|---|---|---|---|---|---|
| mini split | 81% | 81.1 / 82.5 | 13.2 / 13.2 | −9.9% | 12.7% | 75/95 | 1.54 | 71.6% | 117 |
| mini whole | 80% | 81.1 / 81.4 | 13.6 / 13.6 | −7.3% | 12.7% | 77/95 | 1.40 | 71.8% | 100 |
| luna split | 79% | 81.1 / 79.3 | 13.9 / 13.7 | −8.3% | 12.1% | 36/95 | 2.25 | 63.7% | 228 |
| luna whole | 84% | 84.2 / 82.5 | 15.2 / 14.9 | −10.1% | 9.1% | 42/95 | 1.31 | 70.0% | 108 |

Counting every run that landed in its calorie band (out of 285): mini 235 split vs 232 whole, luna 226 split vs 235 whole.

## Composite and Indian dish cases
**Indian (21):** i01–i17, i19, i20, v01, v09.
**Other composite (21):** b01, b02, b05, b06, b07, b13, b15, w05, w06, w08, w09, w12, d08, d11, d12, e08, v02, v03, v05, v07, v10.

| subset / variant | strict pass | in band (1st / all 3) | median abs error (1st / all) | lean | protein median abs error | same calories ×3 | foods per log | calories from database rows | AI-estimated items |
|---|---|---|---|---|---|---|---|---|---|
| Indian, mini split | 16/21 | 76.2 / 81.0 | 14.1 / 11.9 | −11.5 | 15.5 (n=6) | 12/21 | 1.90 | 60.1% | 45 |
| Indian, mini whole | 15/21 | 76.2 / 79.4 | 17.2 / 14.0 | −9.8 | 30.8 | 15/21 | 1.52 | 68.4% | 27 |
| Indian, luna split | 17/21 | 85.7 / 82.5 | 12.7 / 11.0 | −0.9 | 11.4 | **2/21** | 3.32 | 52.0% | 106 |
| Indian, luna whole | 15/21 | 71.4 / 69.8 | 18.0 / 17.9 | −6.5 | 22.2 | 7/21 | 1.43 | 61.0% | 27 |
| Other, mini split | 16/21 | 76.2 / 73.0 | 21.9 / 21.9 | −11.9 | 6.8 (n=3) | 16/21 | 1.48 | 74.2% | 18 |
| Other, mini whole | 15/21 | 71.4 / 69.8 | 19.7 / 19.7 | −12.2 | 6.8 | 16/21 | 1.24 | 65.9% | 21 |
| Other, luna split | 13/21 | 66.7 / 61.9 | 26.1 / 24.7 | −11.9 | 20.6 | 4/21 | 3.05 | 65.2% | 54 |
| Other, luna whole | **19/21** | 90.5 / 85.7 | 17.9 / 15.4 | −11.5 | 6.1 | 4/21 | 1.19 | 71.6% | 24 |

- **gpt-4o-mini mostly ignores today's split rule already.** Only 17 of 95 parses changed between the two prompts. So the rule barely affects production today.
- **gpt-6-luna obeys it.** It broke a Big Mac into 7 parts and poha into 6, and 53 of 95 parses changed.

## Six examples (luna = gpt-6-luna, mini = gpt-4o-mini)
1. **i15 "a plate of chicken biryani", band 450–800, mini.**
   - Split: chicken 70g (AI) + rice 150g + "biryani spices/sauce" 30g (AI) = 341 / 606 / 341. Fails: the plate shrinks to 250g and the oil disappears.
   - Whole: chicken biryani 400g = 600, 3 of 3 in band.
2. **i13 "a plate of poha", band 180–500, luna.**
   - Split: 6 ingredients, 5 of them AI-estimated (poha 150g, potato, peanuts, oil 5g…) = 337 / 380 / 334. Passes.
   - Whole: stored poha row is 295 kcal/100g, so 200g = 589 / 884 / 589. Fails.
   - Mini logs 350g of the same row = 1031 under both rules. The row is too dense.
3. **i09 "a plate of pav bhaji", band 350–650.**
   - Mini split: pav 100g + bhaji 300g, both AI = 1000 (1 of 3 in band). Mini whole: stored pav bhaji row = 386, 3 of 3.
   - Luna split: 6 parts = 570, 3 of 3. Luna whole: same row, 300g = 290 / 338 / 338. Fails.
   - The row is 97 kcal/100g, which looks like bhaji only, without the pav.
4. **i01 "2 rotis with dal makhani", band 350–650, luna.**
   - Split: roti + urad 100g (AI) + kidney beans + cream 10g + butter 8g + spices = 414 / 306 / 405 (2 of 3).
   - Whole: roti + stored dal makhani row at 74 kcal/100g = 306 every run. Fails.
   - The stored row is missing the butter and cream.
5. **w05 "a peanut butter sandwich", band 290–480, mini.**
   - Split: bread 58g + peanut butter 32g, both stored rows = 339, 3 of 3.
   - Whole: "peanut butter sandwich 150g" (AI estimate) = 600 / 525 / 525. Fails.
6. **b13 "kfc zinger burger", band 380–590, luna.**
   - Split: bun + fillet + mayo, all AI, plus lettuce = 632 / 593 / 558 (1 of 3).
   - Whole: 572 / 517 / 528, 3 of 3.

## Answer to the founder
1. **The premise doesn't hold in practice.** When luna splits Indian dishes, the parts are things like "biryani gravy, oil and spices", "potato filling in aloo parathas" and "pav bread". None of these has a database row, so the AI estimates them:
   - Calories from database rows: 52% split vs 61% whole.
   - AI-estimated items: 106 split vs 27 whole.
   - Same calories on all 3 runs: 2 of 21 split vs 7 of 21 whole, because the model picks a different ingredient list each time.
2. **Where splitting is better:**
   - **Our stored whole-dish value is wrong.** Luna's Indian lead (82.5% vs 69.8% in band) comes entirely from five cases with suspect rows:

     | row | stored value | problem |
     |---|---|---|
     | dal makhani, dal tadka | 74 kcal/100g | too lean |
     | chole | 72 kcal/100g | too lean |
     | pav bhaji | 97 kcal/100g | no pav |
     | poha | 295 kcal/100g | too dense |
     | upma (fuzzy match) | 255 kcal/100g | too dense |

     Biryani (104 kcal/100g) also looks lean, and rajma once matched a 56 kcal/100g USDA row (i11). Splitting works around these rows; correcting the rows fixes them for both rules.
   - **Simple combinations of basic foods with good rows:** peanut butter sandwich, protein shake, cheese omelette (luna), and salad with dressing (the split includes the olive oil; the "mixed salad" row is 30 kcal with no dressing).
3. **Where whole is better:** restaurant items, fried snacks, and dishes with a correct row.
   - Luna on the other composite set: 85.7% vs 61.9% in band.
   - Samosa pastry plus filling came to 258, against the samosa row at 310.
   - French toast as bread + egg + milk loses the frying fat: 243 vs 298.
   - Whole is also cheaper ($0.070 vs $0.107) and faster (median log time 9.3s vs 11.3s).
4. **New bug in the whole rule: double counting.** The "extras are separate items" clause made mini log the main ingredient on top of the dish:
   - "masala omelette 150g + egg 100g" = 373 (band 180–340).
   - "protein shake 300g + milk 240g" = 536 / 1445 / 596 (band 215–370).

   The clause needs an exception: an ingredient that describes the dish itself ("omelette with 2 eggs", "shake with milk") is not an extra.

**Recommendation:** keep the "whole dish first" plan, with three changes:
- Fix the double-count wording, and reword the two hint lines that still push towards splitting.
- Audit and fix the Indian whole-dish rows listed above. That is the real accuracy lever.
- Longer term, move the split-or-whole decision into the resolver: the parser returns the dish plus an optional ingredient list, and the resolver uses the verified dish row when one exists, otherwise the ingredients plus oil. The resolver knows what the database holds; the model doesn't. That is what the founder's argument actually calls for.

The worktree is removed (the real node_modules and the model comparison's worktree are untouched). I didn't add a DEVLOG entry, because this task was not allowed to edit the repo.

Everything is in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/splitab:
- runs/metrics-all.json
- runs/intent-whole.txt
- runs/{mini,luna}-{split,whole}/ (results.json, summary.json, calls.jsonl, run.log)
- wt-changes.patch
- analyze.mjs
- examples.mjs