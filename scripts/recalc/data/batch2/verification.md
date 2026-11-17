## Verification: real CLI on a fresh local copy of live (2026-11-15, after the review fixes)

This file is the test record and is included verbatim in `docs/reviews/058-recalc-indian-v2.md`. It is deliberately not
one of `batch2.py`'s inputs: it describes the outputs and cannot change them. Re-run everything below whenever the
migration's `inputs_sha256` changes.

- **What was tested:** `supabase/migrations/058_recalc_indian_v2.sql`, sha256 `304c238c…92daf0` (inputs_sha256
  `6a1261d9…ebdba3f`, snapshot 2026-11-15T15:21:22Z), and `supabase/rollback/058_recalc_indian_v2_down.sql`, sha256
  `16fa9ddc…778bc6`. Supabase CLI v2.107.0, `db push --db-url` against the local copy.
- **The snapshot still holds:** `data/batch2/snapshot.sql` re-run read-only on live at 2026-11-15T16:32:32Z returned
  the same content as `snapshot.json` (every field except `taken_at`).
- **The local copy (post-054):** a PostgreSQL 16.15 cluster (live runs 17.6). Migrations 001-054 were pushed from the
  repo with the real CLI onto Supabase stand-ins for auth, storage, cron, pg_net and vault (013's two
  `CREATE EXTENSION pg_cron / pg_net` lines stripped). Live rows were then loaded from read-only `db query --linked`
  SELECTs: food_items, food_aliases, food_derivations, food_derivation_items, food_value_changes, the four portion
  tables, user_portion_calibrations, user_food_memory, food_entries, daily_summaries, saved_entries, the 050 and 053
  backups, and auth user ids (placeholder emails).
- **Fidelity:** the column definitions of every public and backup table matched live. An md5 over the rows of each of
  the 18 copied tables matched live, as did the history fingerprint `5414:e470f93a… 469:fd9ba1e9… 3:fb89f5a9…` and
  the migration history (001-050, 052-054).
- **Push 1** (dry run first: "Would push 058_recalc_indian_v2.sql" only):
  - Every key printed its NOTICE line. The aloo and bhindi copies print `default the dry_sabzi category serving` /
    `default the sabzi_bhindi category serving` (no food-level default, as for their source rows).
  - The final NOTICE: `058 ok: 19 new rows (5 successors, 9 key copies, 5 new keys), 5 quarantined, 5 aliases
    retired, 0 repointed, 0 memory pointers moved, 31 portion units, 19 category-map rows; fingerprints unchanged`.
    Plus the expected `058 note: FDC 2706538 now has no verified row …`.
  - Verified rows went 1631 → 1645. The history fingerprint was unchanged.
  - Stored facts: energy_basis `FNP77:4P+9F+4CHOavl+2FIB` on the four recipe derivations and `USDA SR Legacy as
    published …` on the pizza copy; moisture_target_pct 74.70 (dal makhani) and 65.00 (biryani); portion units carry
    source_ref `founder:2026-11-15` (the 9 dal makhani units) and `founder:2026-11-13` (the other 22).
- **Phrase probe:** the 76 phrases of §11(h) and of the jest test (each of the 19 keys as written, Title Case,
  SHOUTED with punctuation and doubled spaces, and padded upper case). The migration checks them all itself; an
  external re-run of the same 76 on the pushed copy gave 76/76 normalizing to their key (the SQL twin of
  `normalizeName`), 76/76 hitting exactly one verified row by `normalized_name` (the intended one), and 76/76
  `search_foods(q, 1)` returning that row as `exact`.
- **Ranking gate** (`scripts/eval/search-check.sql`, this version; its PASS header is now generated from the cases):
  - Before 058 on the same copy: alias 11/11, top1 17/23, top5 6/6. The 6 misses are the lines that expect 058 rows.
  - After 058: alias 11/11, top1 23/23, top5 6/6, byte-identical on two runs.
- **Rollback** (`psql -v ON_ERROR_STOP=1 -f supabase/rollback/058_recalc_indian_v2_down.sql`), then
  `supabase migration repair --status reverted 058` (local copy only):
  - `058 down ok: 19 058 rows quarantined, 5 superseded rows restored, 5 retired aliases restored; backups renamed …`.
  - md5 equal to the pre-058 copy for food_items without the 19 new ids, food_aliases, food_derivations and
    food_derivation_items without 058's, the pre-058 food_value_changes rows, all four portion tables,
    user_food_memory and user_portion_calibrations. History fingerprint and verified count (1631) back; gate output
    byte-identical to before 058. The 19 rows stay, quarantined as `reviewed:rollback_058`.
- **Push 2** (re-apply after the rollback): identical NOTICE lines, the gate byte-identical to push 1, the phrase probe
  76/76 again, verified 1645, fingerprint unchanged. The re-inserted portion units differ from push 1 only in
  `created_at`.
- **Memory on rollback** (separate copy, after a push): two user-taught pointers were added at new-key rows, `upma`
  (a0eafa15, with a 220 g plate correction) and `chicken biryani` (ca025b24). The down script moved them to 137f6250
  and a6958211 with the 220 g correction intact (`memory pointers returned … | 2`); nothing was dropped.
- **Guards** (psql, separate copies of live): a memory pointer added at pizza d1146229 after the snapshot stops 058 in
  §3 (`memory pointers at superseded rows changed since the snapshot … d1146229 has 1 (snapshot 0)`), and so does an
  active food-scoped portion calibration on poha 14a2b0ba (`active food-scoped portion calibrations on rows it
  supersedes … 14a2b0ba x1`). Nothing changed in either case.
- **Migrations-only replay** (empty databases, real CLI):
  - 001-054 + pending 055, 056, 057 + 058: 055 inserts its 11,986 rows, 056 and 057 skip as replays, then
    `058: no production food rows here (migrations-only replay): no row changed` and `058 ok: migrations-only replay,
    nothing to check`. History ends at 058. (Before the fix this stopped at 058 with `only 0 of the 8 rows it
    supersedes or copies exist (partial state?)`.)
  - Control, 001-054 + 058: the same two 058 NOTICE lines.
- **With pending 055 on a copy of live** (real CLI each step):
  - 058, then 055: a plain push refuses 055 ("Found local migration files to be inserted before the last
    migration"); `--include-all --dry-run` lists 055 alone; the push gives `055 ok … keys 1645 and aliases 26
    unchanged`. Then the 058 down script runs clean with 055 live (`058 down ok …`), `migration repair --status
    reverted 058`, and a plain push re-applies 058 (`058 ok …`). Key-less verified rows stay 11,986 throughout; the
    gate scores 11/11, 23/23, 6/6. (Before the fix the down script stopped with `11986 verified rows without a key`.)
  - 055, then 058 (numeric order): `055 ok … keys 1631 and aliases 31 unchanged`, then `058 ok …`; then the 058 down
    script runs clean. Verified 13,617 after it (1,631 + 11,986). (Before the fix 058 stopped with `058: 11986
    verified rows without a key`.)
  - 058, then 055-057 with `--include-all`: 055 applies, then 056 stops before changing anything with `056: only 96
    of the 97 live verified fdc_ids it keys have a verified row (re-take the snapshot and regenerate)`. Unchanged and
    expected: see supabase/pending/README.md.
- **Live:** `npx supabase db push --linked --dry-run` would push only `058_recalc_indian_v2.sql`. Nothing was written
  to live; every live read was a SELECT through `db query --linked`.

### Value check: poha 155.05 (spec (i)2)

- **How the value is built:** BFP044 plus BFP045's 60 g of soak water, with the oil solved so that fat is 11.7% of
  dry matter (Pune kanda pohe, lab 99). That rule cuts the oil from 10 g to 1.34 g per 40 g of poha. The 10 g of
  peanut stays, because it is a recipe line, not oil. The founder approved the rule, not this number, so it is
  pinned exactly (`batch2.py` PINNED_OUTPUTS) and awaits the founder's confirmation (review report, open items).
- **Against the audit:** 155.05 sits on the adversarial review's lean-oil line for the same recipe and water (5 g
  oil → 171.6, 2.5 g → 160.3, so 1.34 g → about 155).
- **Against the Pune dish:** lab 99 rehydrated to this row's 63.9% water is 162.2 kcal on the lab's convention; this
  row is 160.1 on that convention (−1.3%).
- **Against NIN** (270 kcal per cup of 50 g dry poha): 50 g of poha makes 200.65 g of this dish, which is 311 kcal
  (+15%). Reported, not gated: spec (i)2 sets no tolerance for it (the ±25% band of spec (e)3 is a per-piece check
  for roti, puri and medu vada). INDB's oil as written would give 408 (+51%).
  - Per 50 g of poha the energy comes from the flakes (177 kcal), BFP044's peanut (68), potato (27) and oil (15).
  - Without the peanut and potato, with the fat rule re-applied (the oil rises to 3.91 g per 40 g), 50 g of poha
    would make 245.6 kcal (−9%). So the add-ins explain part of the +15%, not all of it; simply subtracting them
    (217 kcal) overstates their share.
- **What the fat rule pins:** the dish's total fat, not its oil. Lab 99's dish has coconut and no peanut; BFP044's
  peanut carries 58% of this row's fat (3.96 of 6.79 g per 40 g poha), so the 1.34 g of oil the rule leaves is likely
  leaner than the lab cook's oil (by the nutrition review's estimate, the lab dish would need 11.5-14.4 g of fresh
  coconut per 40 g poha, far more than a garnish, for its oil to be as low).
- **Confidence C, and the plate:** the moisture is the recipe's own water (no measured anchor), so confidence stays
  C. The 150 g plate holds 37.4 g of dry poha (the 054 plate was built from 40-50 g).
