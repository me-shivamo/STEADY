# Model bake-off on the dev set, 2026-11-13

Founder-scoped: ChatGPT models only. dataset-v3 (dev set, 100 cases / 95 food logs), x3 repeats, fts search, in-process harness, local eval key (never the live key). gpt-4o-mini (current) vs gpt-6-luna vs gpt-6-luna-pro vs split (luna parse + luna-pro match). Raw run files stayed in the session scratchpad.

**Decision:** stay on gpt-4o-mini. No Luna setup beat it on accuracy beyond noise, every Luna setup was about half as consistent (temperature is not supported on Luna, and Luna obeys the old split-compound-foods rule), 4-7x slower per log, and 1.5-8x the cost. Revisit after the system-prompt redesign and the dish-row fixes.

---

All four runs finished on dataset-v3, repeat 3, fts, one at a time, in the order given. No run exited 3 and none hit the $0.50 floor. I didn't change any setting. I used the harness defaults: no reasoning effort set, so the provider default applied, and the default `temperature: 0` was sent. The gpt-6-luna models don't list temperature as supported, but no call errored.

**Budget.** The limit was already $3 at the first check, so I didn't need to wait. The key went from $0.5667 used ($2.4333 left) to $1.7938 used ($1.2062 left), so this session spent **$1.2271**.

The key's spend is higher than the per-call costs the harness recorded, which add up to $0.7482. I checked samples against OpenRouter's per-generation records and they match the recorded costs exactly, so the extra $0.48 isn't visible per call. The gap is zero on 4o-mini, about 1.3x on luna, about 1.4x on the split and about 2x on luna-pro. Because it follows the model being run, a steady outside user of the key seems unlikely, though I can't rule it out. For budgeting, use the key numbers.

| | base-4o-mini | luna6 | luna6-pro | split-luna-pro |
|---|---|---|---|---|
| Strict pass | 81% | 75% | 82% (1 errored) | 81% |
| Calories in band | 81.1% (77/95) | 76.8% (73/95) | 83.0% (78/94) | **83.2% (79/95)** |
| Median calorie error | 13.6% | 16.5% | 15.0% | **12.3%** |
| Signed lean | −9.1% | −9.7% | −10.4% | −8.5% |
| Protein median error | 8.8% | 8.8% | 8.2% | **7.9%** |
| Same calories x3 | **66/95 (69.5%)** | 31/95 (32.6%) | 33/94 (35.1%) | 35/95 (36.8%) |
| Negatives handled | 5/5 | 5/5 | 5/5 | 5/5 |
| JSON/schema failures | 1 (n02 answered in prose; the app's reader handled it and it passed) | 0 | 0 | 0 |
| Latency per log p50/p95 | **2.8s / 8.5s** | 11.1s / 19.2s | 18.7s / 36.3s | 14.4s / 29.6s |
| Latency per call p50/p95 | 2.1s / 3.3s | 4.5s / 9.2s | 8.9s / 18.7s | 5.6s / 17.4s (match 8.8s / 25.3s) |
| Tokens per log (prompt/completion/reasoning) | 2673 / 152 / 0 | 3106 / 433 / 243 | 12669 / 1343 / 929 | 6699 / 811 / 549 |
| Cost per log, recorded | $0.000308 | $0.000358 | $0.001165 | $0.000757 |
| Cost per log, key | $0.000302 | $0.000462 | $0.002386 | $0.001079 |
| Total cost, recorded / key | $0.0893 / $0.0875 | $0.1038 / $0.1339 | $0.3355 / $0.6873 | $0.2196 / $0.3129 |
| Wall time | 21 min | 51 min | 91 min | 67 min |

**What the numbers say:**
- **No ChatGPT setup clearly beats gpt-4o-mini on pass rate.** The spread is 75–82 out of 100 on 100 cases, which is within noise. The split is best on calorie and protein error, but the margin is small.
- **Consistency got much worse on every luna setup:** 33–37% of cases gave the same calories three times, against 69.5% for 4o-mini. Temperature isn't supported on these models, so repeats aren't deterministic.
- **The luna matcher picks database candidates less often.** AI estimates went from 36 to 73–76. Matcher calls went from 126 to about 190, and USDA matches from 5 to 33–37.
- **luna-pro bills about 4x the prompt tokens.** Its native prompt count is about 7,000–8,000 against about 1,900 normalized. That is why it costs most and is slowest: up to 36s per log at p95.
- **Errors:** there were no HTTP or API errors in any run. luna6-pro has one errored case, i09: a resolver timeout after the parse call succeeded, not a model failure. Match retries were 1, 1, 0 and 1.
- **The luna6 result is muddied by USDA outages.** USDA returned 400 errors 83 times during the luna6 run, against 26, 12 and 7 in the other runs. That partly explains luna6's lower score, and is worth a re-run before you judge it.

**Cleanup:** I removed the worktree; nothing was left undone. Its `node_modules` symlink was unlinked first, so the repo's own `node_modules` is untouched. I saved the harness changes to `/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/harness-patch/`. That means `key-status.mjs`, `analyze.mjs` and `gen-check.mjs` can't read the key any more.

I didn't add a DEVLOG entry because this task forbids editing the repo; the calling workflow should add one.

Files are in /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs:
- per run: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/{base-4o-mini,luna6,luna6-pro,split-luna-pro}/{summary.json,results.json,calls.jsonl,run.log}
- metrics: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/metrics-{base-4o-mini,luna6,luna6-pro,split-luna-pro}.json
- key snapshots: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/key-{before,after}-*.json and /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/key-final.json
- spend during the split run: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/split-luna-pro.spendlog

```json
{"dataset":"dataset-v3.json","search":"fts","repeat":3,"settings_changed":"none (harness defaults: no reasoning extra, temperature 0 sent; luna models do not list temperature but did not error)","key":{"limit_usd":3,"usage_start":0.56667885,"usage_end":1.793790845,"spent_usd":1.2271,"limit_remaining_end":1.206209155,"recorded_call_cost_sum":0.7482,"unexplained_gap_usd":0.479},"undone":[],"worktree_removed":true,"runs":{"base-4o-mini":{"parse":"openai/gpt-4o-mini","match":"openai/gpt-4o-mini","strict_pass_pct":81,"calories_in_band_pct":81.1,"calories_in_band":"77/95","calorie_median_abs_err_pct":13.6,"calorie_signed_lean_pct":-9.1,"protein_median_abs_err_pct":8.8,"consistency":"66/95","consistency_pct":69.5,"negatives_handled":"5/5","json_schema_failures":{"parse_not_json":1,"match":0,"note":"n02 negative answered in prose; passed"},"latency_per_log_ms":{"p50":2785,"p95":8540},"latency_per_call_ms":{"p50":2111,"p95":3300,"parse_p50":2122,"parse_p95":3121,"match_p50":2097,"match_p95":3390},"tokens_per_log":{"prompt":2673.4,"completion":152.2,"reasoning":0},"calls_per_log":1.43,"cost_per_log_recorded":0.000308,"cost_per_log_key":0.000302,"total_cost_recorded":0.08931,"total_cost_key":0.08748,"key_usage_before":0.56667885,"key_usage_after":0.6541569,"errored_cases":0,"http_errors":0,"match_retries":1,"usda_unavailable_events":26,"wall_minutes":21},"luna6":{"parse":"openai/gpt-6-luna","match":"openai/gpt-6-luna","strict_pass_pct":75,"calories_in_band_pct":76.8,"calories_in_band":"73/95","calorie_median_abs_err_pct":16.5,"calorie_signed_lean_pct":-9.7,"protein_median_abs_err_pct":8.8,"consistency":"31/95","consistency_pct":32.6,"negatives_handled":"5/5","json_schema_failures":0,"latency_per_log_ms":{"p50":11122,"p95":19228},"latency_per_call_ms":{"p50":4512,"p95":9214,"parse_p50":4331,"parse_p95":7308,"match_p50":4823,"match_p95":10441},"tokens_per_log":{"prompt":3105.6,"completion":433.1,"reasoning":242.8},"calls_per_log":1.66,"cost_per_log_recorded":0.000358,"cost_per_log_key":0.000462,"total_cost_recorded":0.1038,"total_cost_key":0.13391,"key_usage_before":0.6554442,"key_usage_after":0.78935626,"errored_cases":0,"http_errors":0,"match_retries":1,"usda_unavailable_events":83,"wall_minutes":51},"luna6-pro":{"parse":"openai/gpt-6-luna-pro","match":"openai/gpt-6-luna-pro","strict_pass_pct":82,"calories_in_band_pct":83.0,"calories_in_band":"78/94","calorie_median_abs_err_pct":15.0,"calorie_signed_lean_pct":-10.4,"protein_median_abs_err_pct":8.2,"consistency":"33/94","consistency_pct":35.1,"negatives_handled":"5/5","json_schema_failures":0,"latency_per_log_ms":{"p50":18733,"p95":36317},"latency_per_call_ms":{"p50":8876,"p95":18740,"parse_p50":8998,"parse_p95":14927,"match_p50":8646,"match_p95":22835},"tokens_per_log":{"prompt":12668.9,"completion":1343.1,"reasoning":929.4},"calls_per_log":1.65,"cost_per_log_recorded":0.001165,"cost_per_log_key":0.002386,"total_cost_recorded":0.33548,"total_cost_key":0.68725,"key_usage_before":0.78935626,"key_usage_after":1.476690035,"errored_cases":1,"errors":["i09: resolver timeout (The operation was aborted due to timeout) after a successful parse call; not an LLM error"],"http_errors":0,"match_retries":0,"usda_unavailable_events":12,"wall_minutes":91,"note":"native prompt tokens about 4x normalized (about 8000 vs 1900)"},"split-luna-pro":{"parse":"openai/gpt-6-luna","match":"openai/gpt-6-luna-pro","strict_pass_pct":81,"calories_in_band_pct":83.2,"calories_in_band":"79/95","calorie_median_abs_err_pct":12.3,"calorie_signed_lean_pct":-8.5,"protein_median_abs_err_pct":7.9,"consistency":"35/95","consistency_pct":36.8,"negatives_handled":"5/5","json_schema_failures":0,"latency_per_log_ms":{"p50":14379,"p95":29599},"latency_per_call_ms":{"p50":5630,"p95":17409,"parse_p50":4445,"parse_p95":7082,"match_p50":8827,"match_p95":25292},"tokens_per_log":{"prompt":6699.0,"completion":810.6,"reasoning":548.5},"calls_per_log":1.65,"cost_per_log_recorded":0.000757,"cost_per_log_key":0.001079,"total_cost_recorded":0.2196,"total_cost_key":0.31294,"key_usage_before":1.48015084,"key_usage_after":1.793095945,"errored_cases":0,"http_errors":0,"match_retries":1,"usda_unavailable_events":7,"wall_minutes":67}}}
```

---

## Bake-off check: gpt-6-luna vs gpt-6-luna-pro vs the split (dataset-v3, repeat 3)

**Recommendation:** Of the three, carry forward **gpt-6-luna on both steps**. Rule out **luna-pro** for live logging, and keep the **split** only as a held-out candidate. None of the three is ready to replace gpt-4o-mini for live logging today. All three miss the 2.5 s target by 8–15x at p95, and all three roughly halve consistency. Keep gpt-4o-mini live until the held-out run says otherwise.

### 1. The previous run report checks out
I recomputed everything from `results.json`, `calls.jsonl`, `summary.json` and the key snapshots. Every figure matches. These were all confirmed:
- pass counts and calories in band
- median and signed errors, protein error and consistency
- negatives, call counts, retries and JSON failures
- latencies, tokens per log and recorded costs
- USDA outage counts (26 / 83 / 12 / 7) and wall time

There is one rounding difference. luna6-pro's key spend is $0.6873 ($0.002387 per log), not $0.68725 ($0.002386).

The key went from $0.5667 to $1.7938, so this session spent $1.2271. The recorded per-call costs add up to $0.7482, which leaves a $0.479 gap. Measured as key spend over recorded cost, the gap is 0.98x on 4o-mini, 1.29x on luna, 2.05x on luna-pro and 1.43x on the split. It isn't failed calls going unlogged: the harness logs a call even when the request throws. Between runs the key moved by only $0.0054. The cause is still unknown, so budget from the key numbers.

### 2. How much results moved between the 3 repeats
Pass/fail and the headline error figures are judged on repeat 1 only. Repeats 2 and 3 only feed the consistency figure. So "75 / 82 / 81" is a single draw. I re-scored all 3 repeats against the calorie band:

| | 4o-mini | luna | luna-pro | split |
|---|---|---|---|---|
| Calories in band, repeats 1/2/3 | 81.1 / 83.2 / 82.1 | 76.8 / 80.0 / 80.0 | 83.0 / 76.6 / 78.7 | 83.2 / 83.2 / 77.9 |
| Range across repeats | 2.1pp | 3.2pp | **6.4pp** | 5.3pp |
| All 3 repeats together | 82.1% (234/285) | 78.9% (225/285) | 79.4% (224/282) | 81.4% (232/285) |
| Median calorie error, repeats 1/2/3 | 13.6 / 13.2 / 13.6 | 16.5 / 16.5 / 13.1 | 15.0 / 15.1 / 12.0 | 12.3 / 14.0 / 13.1 |
| Signed lean, repeats 1/2/3 | −9.1 / −7.3 / −10.0 | −9.7 / −10.0 / −9.9 | −10.4 / −9.9 / −7.6 | −8.5 / −8.4 / −8.3 |
| Cases that move in or out of the band between repeats | 9 | 17 | 11 | 16 |
| Same-meal swing, (max−min)/mean: median / p90 / max | 0% / 25% / 94% | 4.2% / 36% / 127% | 4.4% / 41% / 150% | 4.7% / 31% / 64% |
| AI time per log at p95, repeats 1/2/3 | 4.9 / 6.4 / 5.6 s | 16.4 / 14.7 / 17.3 s | 33.7 / 35.8 / 30.9 s | 26.2 / 31.5 / 26.0 s |

### 3. What is within noise
**Accuracy is within noise.** The best and worst setups score only 3.2pp apart over all three repeats (78.9–82.1%). That is smaller than the 6.4pp that luna-pro moved between its own repeats. I resampled the cases 4,000 times (bootstrap) to get 95% intervals; each setup's in-band rate is about ±7pp. Every comparison between two setups includes zero:

| Comparison | Calories in band | Median calorie error |
|---|---|---|
| split vs luna | +2.8pp (−1.8 to +7.8) | −2.5pp (−6.5 to 0.0), borderline |
| luna-pro vs luna | +0.7pp (−4.3 to +5.7) | −1.1pp (−4.7 to +1.5) |
| split vs luna-pro | +2.1pp (−1.8 to +6.4) | not run |
| split vs 4o-mini | −0.4pp (−8.2 to +7.4) | not run |

- Protein error rests on only 19 cases, so the 7.9–8.8% spread is noise.
- The split's small edge over luna is clouded by USDA outages: 83 during the luna run against 7 during the split run.

**Real differences, not noise:**
- **Consistency:** the same calories came back all three times in 66 of 95 cases on 4o-mini, against 31 to 35 on the luna setups.
- **Latency:** 3–7x slower than 4o-mini.
- **Cost:** luna-pro costs 2–5x what luna does.
- **Matcher behaviour:** luna setups pick database candidates less often. AI estimates went from 36 to 73–76 and USDA matches from 5 to 33–37.

### 4. Speed against the 2.5 s target
p95 per log, with the share of logs whose AI calls finished within 2.5 s:

| Setup | Full log p95 | AI calls only, p95 | Logs within 2.5 s |
|---|---|---|---|
| luna | 19.2 s | 15.6 s | 0.3% |
| split | 29.6 s | 26.6 s | 0.7% |
| luna-pro | 36.3 s | 33.3 s | 0% |
| 4o-mini | 8.5 s | 5.7 s | 49% |

The pro mode (whole run, or just the matcher in the split) adds 10–17 s at p95 and buys no accuracy we can measure.

### 5. Cost against the $1–3 per active user per month budget
At 10 logs a day, a user makes about 300 logs a month. Text logging only (parse plus match), recorded cost / key cost:

| Setup | Per user per month |
|---|---|
| 4o-mini | $0.09 |
| luna | $0.11 / $0.14 |
| split | $0.23 / $0.32 |
| luna-pro | $0.35 / $0.72 |

All four fit the budget. luna-pro would use up to about 70% of the $1 low end on text logging alone, leaving little for photo logs (GPT-4o) and the coach.

### 6. Recommendation in plain English
1. **gpt-6-luna is the best of the three.** Its accuracy ties the other two, it is the cheapest of the three and the fastest of the three.
2. **The split is a backup only.** Pick it only if the held-out run shows an accuracy gain that is clearly real. On this data, the gain doesn't justify about +10 s at p95 and 2.3x the cost.
3. **Rule luna-pro out for live logging.** It is the slowest (36 s at p95) and the most expensive, and it shows no measurable gain.
4. **Don't switch from gpt-4o-mini to any luna setup on this evidence.** Every luna setup is far slower, and the same meal often gets a different number when logged twice. Users would notice both.
5. **One cheap follow-up is worth considering, if you want it.** All runs used the provider's default reasoning effort; the founder asked for a non-maximal run, so nothing was tuned. One small dev-set run of luna with reasoning set to low or minimal could show whether speed and consistency come back. That is the only thing likely to change point 4.

### 7. The :batch variants
`openai/gpt-6-luna:batch` and `openai/gpt-6-luna-pro:batch` cost half the list price ($0.05 / $0.25 per million tokens). They are asynchronous, so results arrive later rather than while the user waits, which rules them out for live logging. They suit offline jobs, for example:
- filling or refreshing AI estimates for unmatched foods in the food cache
- cleaning brand and chain-menu data imports
- overnight labelling or re-scoring of eval candidates
- summaries generated on a schedule

Pro-mode quality is affordable there because latency doesn't matter. Don't use them for eval runs that measure latency.

### 8. Caveat
This is the dev set (dataset-v3: 100 cases, 95 with calorie targets, 19 with protein targets), which we have tuned against. Treat these results as directional only. The final pick comes from the held-out dataset-v4 run after Phases 5 and 8. dataset-v4 was not opened.

### 9. Cleanup and files
- **Worktree:** the earlier step had already removed it. Re-running `git -C /home/shivam/STEADY worktree remove --force .../bake/wt` returned "not a working tree" (exit 128). `git worktree list` now shows only `/home/shivam/STEADY`, the folder is gone, and the repo's `node_modules` is intact. There were no other git writes and no deploys, and no secrets were printed.
- **DEVLOG:** I didn't add an entry because the repo was off limits. The calling workflow should add one.
- **Files:**
  - Verification script: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/verify/verify.py
  - Bootstrap script: /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/verify/noise.py
  - Run data (unchanged): /tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/bake/runs/