# AI model testing: method and results log

The permanent record of how we test AI models and prompts for food logging, and what every
test found. **Add a new entry to the results log (section 5) after every model or prompt test,
newest first.** Keep the method (sections 1 to 4) current whenever the way we test changes.

| | |
|---|---|
| **Models in production** (14 Nov 2026) | Text logging, both the parse and the database-match calls: `openai/gpt-4o-mini`. Photo logging: `gpt-5-mini` (not covered by these tests) |
| **Current decision** | Stay on gpt-4o-mini. Re-test after the system-prompt redesign and the Indian dish-row fixes |
| **Raw files** | `scripts/eval/bakeoff/<date>/` (patches, tools, per-run results) |
| **Related** | `docs/testing/model-bakeoff-2026-11-13.md` and `split-vs-whole-2026-11-13.md` (the original reports; where they disagree with this file, this file is the corrected one), `docs/STATUS.md` (live held-out numbers), `scripts/eval/` (harness) |

---

## 1. What we test

Logging a typed meal makes up to two AI calls, and a model test can swap either one:

1. **Parse call.** Reads the message ("2 rotis with dal makhani") and returns the foods,
   quantities and gram estimates. Prompt: `supabase/functions/_shared/foodParsePrompt.ts`.
2. **Match call.** Picks the right database row from search candidates when the name alone
   isn't enough. It lives in `supabase/functions/_shared/macroResolver.ts`.

Calories come from the database wherever possible (cache, then our verified rows, then USDA,
then an AI estimate as the last resort). So a model is judged on how well it reads meals and
picks rows, not on calories it invents.

## 2. Two kinds of test, and when to use each

| | Model bake-off (in-process) | Live check (over HTTP) |
|---|---|---|
| Harness | `scripts/eval/run.ts` + the bake-off patch | `scripts/eval/run-http.ts` |
| Talks to | The pipeline code run locally against the live database, read-only (`persist:false`, `memory:'off'`) | The deployed edge functions, as the eval account |
| Dataset | **dataset-v3**, the dev set: 100 cases (95 meals + 5 non-meal questions) | **dataset-v4**, held out. Never used to choose or tune anything |
| Use it for | Comparing models, settings and prompt variants side by side | Go/no-go on what actually ships, before and after a production change |
| Model swap | `BAKE_PARSE_MODEL` / `BAKE_MATCH_MODEL` | Only by deploying |

Rule: choose on v3, then confirm the winner **once** on v4. Iterating on v4 turns it into a
second dev set (we learned this in August: tuning on v3 inflated it ~12 points over unseen v4).

Before any prompt or model can ship, it must also score **85/85 on the intent gate**: 60 food
phrases that must log, and 25 questions that must not. See section 6 for which prompt it tests.

## 3. How a fair test is run

- **Change one thing at a time**: the model, a setting, or one prompt sentence. Everything else
  stays identical: dataset, search mode (`--search=fts`, the production value), repeats, code commit.
- **3 repeats per case** (`--repeat=3`). One run hides the biggest difference between models:
  whether the same meal gets the same answer.
- **One experiment on the key at a time.** Never run two experiments in parallel or on the same
  key at once. They fight over rate limits and skew latency, and the key's spend can no longer
  be split between them. (On 13 Nov the split-vs-whole A/B overlapped the Luna Pro and split
  runs, which contaminated their cost and latency. See section 5.)
- **Use the eval key only.** `scripts/eval/.env.local` holds the eval OpenRouter key, which has
  its own $3 limit, never the live app's key. On 13 Nov tests drained the live key and logging
  went down for 7 minutes. Deployed functions now bill the eval account to
  `OPENROUTER_EVAL_API_KEY`.
- **Budget guard.** Check the key's remaining spend before each run (`key-status.mjs`) and stop
  below about $0.50. The runner exits with code 3 on HTTP 401, 402 or 403, a key-limit message,
  or 5 HTTP errors in a row. Stop then; don't loop.
- **Record what was really served.** OpenRouter can route a request elsewhere, so every call
  row logs `served_model`, provider, tokens (including reasoning and cached), latency, cost and
  whether the reply was valid JSON.
- **Note each model's settings.** We send `temperature: 0` and leave reasoning effort at the
  provider default unless that is what's being tested. GPT-6 Luna models don't support
  temperature, so their repeats aren't deterministic.

## 4. Metrics, and how to read them

| Metric | Meaning |
|---|---|
| Strict pass | Share of all 100 cases that pass. A meal must meet every band it declares (calories, plus protein and others where given) on the first run, with no food left unresolved. A non-meal question passes when nothing is logged. An errored case fails |
| Calories in band | Meals whose calories land in the band. **Always report both the first run and all 3 runs**; they can rank models differently |
| Median calorie error | Median of \|logged − band midpoint\| / midpoint (`scripts/eval/metrics.ts`). Steadier than pass rates |
| Signed lean | Median of the signed error: are we consistently low (−) or high (+)? |
| Protein median error | The same, for protein, on cases that declare a protein band |
| Consistency | Meals given the same calories (within 0.5 kcal) on all 3 repeats |
| Negatives handled | Non-meal questions correctly not logged (5 cases) |
| JSON / schema failures | Replies that weren't valid JSON or had the wrong shape |
| Latency | Per log and per call, p50 and p95. Only valid when nothing else was running |
| Cost | Per log, from the **recorded per-call cost** (OpenRouter's `usage.cost`, spot-checked with `gen-check.mjs`). Key spend is a cross-check, and only when the experiment had the key to itself |
| Calories from DB rows / AI-estimated items | How much of the answer came from real data. "DB rows" includes USDA API matches |
| USDA unavailable events | Non-OK responses from the USDA API, including HTTP 400s that can depend on how we build the request. Only in `run.log`; record the count in the results entry |

**Noise floor.**
- Two identical runs disagreed on 6 meals (gpt-4o-mini) and 14 meals (GPT-6 Luna).
- Consistency moves too: gpt-4o-mini scored 66/95 in one run and 75/95 in another.
- A bootstrap on the bake-off gives about ±7 points per setup for in-band. The pairwise 95%
  interval was as wide as −8.2 to +7.4 points (split vs gpt-4o-mini, all 3 runs).

So **treat in-band or pass-rate differences under about 7–8 points as a tie** unless a larger
test says otherwise.

**Confounders to check before concluding anything:**
- Other runs on the key or the API at the same time.
- The USDA event count for each run.
- Whether the prompt suits the model. A prompt written for one model can mislead another; see
  the "break compound foods into components" finding below.

---

## 5. Results log (newest first)

### 2026-11-13 · ChatGPT model bake-off

**Question:** is a newer ChatGPT model a better balance of accuracy, speed and cost than
gpt-4o-mini? (Founder-scoped: ChatGPT models only, not a maximal run.)

**Setup:**
- dataset-v3, ×3, fts, in-process, eval key.
- Each setup used the same model for parse and match, except the split.
- The runs recorded commit `86223a0`. The stored patch is rebased on its child `d6b074d`, which
  only adds the intent-gate files, so the code under test is identical.
- **Caveat:** the split-vs-whole A/B ran on the same key at the same time as the Luna Pro and
  split runs. Those two columns' latency and wall time are marked †: they were measured with
  another run competing.

| | gpt-4o-mini (current) | GPT-6 Luna | GPT-6 Luna Pro | Split: Luna parse + Luna Pro match |
|---|---|---|---|---|
| Strict pass | 81% | 75% | 82% (1 case errored) | 81% |
| Calories in band, first run | 77/95 (81.1%) | 73/95 (76.8%) | 78/94 (83.0%) | 79/95 (83.2%) |
| Calories in band, all 3 runs | **234/285 (82.1%)** | 225/285 (78.9%) | 224/282 (79.4%) | 232/285 (81.4%) |
| Median calorie error | 13.6% | 16.5% | 15.0% | 12.3% |
| Signed lean | −9.1% | −9.7% | −10.4% | −8.5% |
| Protein median error | 8.8% | 8.8% | 8.2% | 7.9% |
| Same calories ×3 | **66/95 (69.5%)** | 31/95 (32.6%) | 33/94 (35.1%) | 35/95 (36.8%) |
| Negatives handled | 5/5 | 5/5 | 5/5 | 5/5 |
| Latency per log p50 / p95 | **2.8 s / 8.5 s** | 11.1 s / 19.2 s | 18.7 s / 36.3 s † | 14.4 s / 29.6 s † |
| Tokens per log (prompt / completion / reasoning) | 2,673 / 152 / 0 | 3,106 / 433 / 243 | 12,669 / 1,343 / 929 | 6,699 / 811 / 549 |
| Cost per log (recorded) | $0.000308 (1×) | $0.000358 (1.16×) | $0.001165 (3.8×) | $0.000757 (2.5×) |
| USDA unavailable events | 26 | 83 | 12 | 7 |
| Wall time (100 cases ×3) | 21 min | 51 min | 91 min † | 67 min † |

Other observations:
- **More AI estimates with Luna, driven by the parse, not the matcher.**
  - First-run AI estimates went from 36 to 73–76, and USDA matches from 5 to 33–37.
  - That is mainly because Luna's parse returns more foods per log (2.2 vs 1.5): it follows the
    "break compound foods into components" sentence.
  - With the whole-dish prompt, Luna's AI-estimated items roughly equal gpt-4o-mini's (108 vs
    100 over all 3 runs; see the A/B below).
- Luna Pro sends about 4x the prompt tokens: parse 7,905 vs 2,001, match 7,299 vs 1,669.
- No HTTP or API errors in any run. The one Luna Pro error (i09) was a resolver timeout after a
  successful parse.
- **Spend.** The four runs recorded $0.748. The key moved $1.227 over the same window, because
  that window also held the A/B ($0.361 recorded) and the intent-gate checks. Recorded costs
  matched OpenRouter's per-generation records in spot checks.
- **Luna's USDA count** (83, against 7–26 for the others) was mostly HTTP 400s. It may have
  hurt Luna's accuracy, but it may also come from how the resolver builds requests for Luna's
  extra split parts. Not proven either way.

**Verdict:**
- **Stay on gpt-4o-mini.**
  - Accuracy is a tie within noise; across all 3 runs gpt-4o-mini is highest.
  - It is about twice as consistent and about 4x faster than Luna (measured cleanly).
  - It is the cheapest: Luna is only slightly more expensive (1.16x), while Luna Pro (3.8x) and
    the split (2.5x) cost clearly more.
- Re-run Luna if we revisit it, with the USDA errors investigated first.

**Files:** `scripts/eval/bakeoff/2026-11-13/results/bakeoff/` · original report
`docs/testing/model-bakeoff-2026-11-13.md`.

### 2026-11-13 · Prompt A/B: split compound dishes vs log the whole dish

**Question (founder):** since calories come from the database, is "break compound foods into
components" more accurate than "whole dish first"?

**Setup:**
- dataset-v3, ×3, fts, in-process at `d6b074d` + `split-on-d6b074d.patch`.
- The only change was the one "Logging rules" sentence (`BAKE_DECOMP=split|whole`). "split" is
  byte-identical to the production prompt.
- The "whole" prompt scored 85/85 on the intent gate for both models (`intent-whole.txt`).
- These runs overlapped the bake-off's Luna Pro and split runs, so their latency is not
  comparable. The accuracy numbers are unaffected.

| | strict (1st run) | in band (1st / all 3) | median error (1st / all 3) | lean (1st / all 3) | same ×3 | foods per log (all 3) | calories from DB rows (all 3) | AI-estimated items (all 3) |
|---|---|---|---|---|---|---|---|---|
| mini, split (today) | 81% | 81.1 / 82.5 | 13.2 / 13.2 | −9.9 / −9.8 | 75/95 | 1.54 | 71.6% | 117 |
| mini, whole | 80% | 81.1 / 81.4 | 13.6 / 13.6 | −7.3 / −8.4 | 77/95 | 1.40 | 71.8% | 100 |
| Luna, split | 79% | 81.1 / 79.3 | 13.9 / 13.7 | −8.3 / −8.3 | 36/95 | 2.25 | 63.7% | 228 |
| Luna, whole | 84% | 84.2 / 82.5 | 15.2 / 14.9 | −10.1 / −10.1 | 42/95 | 1.31 | 70.0% | 108 |

What it found:
- gpt-4o-mini mostly ignores the split sentence: only 17 of 95 parses changed.
- Luna obeys it (53 of 95 changed), splitting a Big Mac into 7 parts and poha into 6.
- On 21 Indian dishes, Luna's split parts mostly had no database row, so they were estimated:
  - AI-estimated items: 106 split vs 27 whole.
  - Calories from DB rows: 52% vs 61%.
  - Same answer ×3: 2 of 21 vs 7 of 21.
- Splitting won only in two cases:
  - Where a stored whole-dish row is wrong: dal makhani and dal tadka at 74 kcal/100 g, chole 72,
    pav bhaji 97 (no pav), poha 295, upma 255.
  - For simple combinations of good rows, such as a peanut butter sandwich.
- The "whole" wording double-counts ("masala omelette + egg", "protein shake + milk").

**Verdict:**
- Keep whole-dish first, and fix the double-count wording.
- Fix the dish rows: done as the 2026-11-13 dish-row audit (`docs/testing/dish-row-audit-2026-11-13.md`)
  and migration batch 2.
- Later, let the resolver decide split vs whole from what the database holds.

**Files:** `scripts/eval/bakeoff/2026-11-13/results/split-vs-whole/` · original report
`docs/testing/split-vs-whole-2026-11-13.md`.

### 2026-11-13 · Intent gate, first run (production prompt)

gpt-4o-mini and GPT-6 Luna both scored 85/85. Luna split dishes into parts about 3x as often.
The source is the DEVLOG entry "A permanent test that the AI logs food instead of coaching": no
result file was saved for this run. From now on, save the intent output next to the run results.

---

## 6. How to re-run

The harness is a patch, not shipped code. It touches `macroResolver.ts`, which the edge
functions share, so apply it only in a throwaway worktree. **Use one patch per worktree:** the
split patch already contains the bake patch, so never apply both.

### Model bake-off

```bash
REPO=/home/shivam/STEADY
B=<a scratch folder outside the repo>/bake      # tools expect $B/wt and $B/runs
mkdir -p $B/runs
git -C $REPO worktree add --detach $B/wt d6b074d          # see "Porting" below
git -C $B/wt apply $REPO/scripts/eval/bakeoff/2026-11-13/patches/bake-on-d6b074d.patch
ln -s $REPO/node_modules $B/wt/node_modules
# eval env: Supabase URL + service-role key (read-only use here), the EVAL OpenRouter key, USDA key
cp $REPO/scripts/eval/.env.local $B/wt/scripts/eval/.env.local
cp $REPO/scripts/eval/bakeoff/2026-11-13/tools/{run-model.sh,analyze.mjs,key-status.mjs,gen-check.mjs} $B/
# Edit TSX= in $B/run-model.sh to your tsx path:
#   ls ~/.npm/_npx/*/node_modules/tsx/dist/cli.mjs    (if empty, run `npx -y tsx --version` once)

# Repeat this block once per label. Always include a fresh baseline run (base-4o-mini) in the same campaign.
node $B/key-status.mjs > $B/runs/key-before-<label>.json  # stop if remaining < ~$0.50
$B/run-model.sh <label> <parse_model> <match_model> 3     # e.g. base-4o-mini openai/gpt-4o-mini openai/gpt-4o-mini 3
node $B/key-status.mjs > $B/runs/key-after-<label>.json
node $B/analyze.mjs <label> > $B/runs/metrics-<label>.json
node $B/gen-check.mjs <label> 6                           # recorded cost vs OpenRouter /generation
npx tsx $REPO/scripts/eval/intent-check.mts <model> | tee $B/runs/intent-<model>.txt   # must be 85/85

# Archive, then clean up
mkdir -p $REPO/scripts/eval/bakeoff/<date>/results/<campaign>
cp -r $B/runs/* $REPO/scripts/eval/bakeoff/<date>/results/<campaign>/   # drop calls.jsonl/run.log if large
git -C $REPO worktree remove --force $B/wt && git -C $REPO worktree prune
```

**Settings:**
- `BAKE_PARSE_MODEL` / `BAKE_MATCH_MODEL` default to gpt-4o-mini.
- `BAKE_PARSE_EXTRA` / `BAKE_MATCH_EXTRA` take JSON merged into that call's request body; a
  `null` value deletes a key, e.g. `'{"reasoning":{"effort":"low"}}'`.
- `BAKE_DATASET` (run-model.sh only) defaults to dataset-v3. dataset-v4 is refused.
- `BAKE_FORCE=1` lets you reuse a label.
- `BAKE_ALLOW_UNLISTED=1` allows a model that isn't on OpenRouter's public list.
- `BAKE_RUNS_DIR` moves the output, but `analyze*.mjs` and `gen-check.mjs` always read
  `<their folder>/runs`, so leave it unset.
- `$B/runs/_openrouter_models.json` caches prices: delete it if `$B` is reused much later.

### Prompt A/B (split vs whole, or any one-sentence prompt change)

Use a **separate** worktree with the split patch **instead of** the bake patch:

```bash
B=<scratch>/split; mkdir -p $B/runs
git -C $REPO worktree add --detach $B/wt d6b074d
git -C $B/wt apply $REPO/scripts/eval/bakeoff/2026-11-13/patches/split-on-d6b074d.patch
ln -s $REPO/node_modules $B/wt/node_modules
cp $REPO/scripts/eval/.env.local $B/wt/scripts/eval/.env.local
cp $REPO/scripts/eval/bakeoff/2026-11-13/tools/{run-variant-split.sh,run-all-split.sh,analyze-split.mjs,examples-split.mjs,key-status.mjs} $B/
# Edit TSX= in $B/run-variant-split.sh (same path as above)
$B/run-all-split.sh                 # runs mini/luna x split/whole one after another, with a budget check before each
node $B/analyze-split.mjs > $B/runs/metrics-all.json
# Intent gate for the VARIANT prompt (run inside the worktree so it imports the patched prompt):
(cd $B/wt && BAKE_DECOMP=whole npx tsx scripts/eval/intent-check.mts openai/gpt-4o-mini) | tee $B/runs/intent-whole.txt
```

Run from `$REPO`, `intent-check.mts` always tests the **production** prompt. That's right for a
model swap and wrong for a prompt variant.

### Porting

- The patches apply cleanly to `d6b074d`.
- Running there is equivalent to production only while the new switches (`PORTION_MODE`,
  `RESOLVER_USDA`, `RESOLVER_AI_MACROS`) stay unset, because unset means legacy behaviour.
- The database is always live, whatever commit you run.
- Once a switch goes live, rebase the patch onto the current commit. A three-way apply onto
  `b286d31` left 5 conflicts in `scripts/eval/run.ts`, all from the new `--portion`, `--region`,
  `--usda` and `--ai-macros` options.
- Better still, fold the harness into `scripts/eval/` as an opt-in tool.

## 7. Next time

- Test after the system-prompt redesign. The prompt is part of what's being tested, and today's
  still contains the split sentence.
- Test after the dish-row fixes (migration batch 2), so splitting stops being rewarded for
  working around bad rows.
- If Luna is re-tested: investigate its USDA 400s first, and run it alone on the key.
- Candidates the founder named for later: Claude models; reasoning-effort variants.
- Proposed acceptance rule for a new model (founder can change it):
  - 85/85 on the intent gate;
  - in-band no worse than the baseline beyond the noise floor on v3 (first run and all 3 runs),
    and no worse on one v4 confirmation;
  - consistency no lower than the baseline;
  - p50 per log within the latency budget (redesign target about 2.5 s end to end);
  - recorded cost per log within budget.
- Photo logging (`gpt-5-mini`) has never been bake-off tested. It needs its own image dataset.
