# Official brand nutrition data (India)

Collected 13 Nov 2026 for branded food logging ("starbucks tall cappuccino", "mcaloo tikki"). Every
number is copied exactly as the brand prints it, typos included, with the source URL, document
date and page on each row. Not yet served to users: the import below waits in `supabase/pending/`.

## Layout

| Path | What it is |
|---|---|
| `raw/<brand>.csv` | One file per brand, 20 columns, numbers as published |
| `raw/<brand>.md` | Provenance per brand: sources, dates, gaps, known source errors |
| `raw/_combined.csv` | All 3,741 rows plus `brand_slug`, `source_row`, `basis`, `qa_severity`, `qa_flag` |
| `REPORT.md` | QA report: what the flags mean, per-brand results, top source errors |
| `COLLECTORS.md` | The collectors' own reports (how each brand was read) |
| `qa-work/` | QA summary, name collisions, match keys |
| `tools/` | Collector and QA scripts (run with `python3 -I`, paths as arguments) |

`qa/` (per-brand copies of `_combined.csv`) and `qa-work/spot_*.txt` (PDF text used for spot
checks) stay local and are git-ignored; both can be regenerated.

## Rules for the import

- Rows with `qa_severity = error` (167) or `conflict` (172) are held for a human check and never
  imported automatically. 3,402 rows (91%) have neither.
- Many rows publish no gram weight (793) or millilitres only (1,161). Don't invent a weight to
  convert them to per-100 g; store them per serving.
- Every imported value must pass the Atwater check (4P + 4C + 9F close to kcal).

## Import (v1.2 follow-up WP10, generator half)

`npx tsx scripts/import-brands.ts` turns `raw/_combined.csv` into `supabase/pending/brand_items.sql` (one
`brand_items` row per CSV row, numbers copied as printed), its rollback, `scripts/brands/out/review_list.csv` (every
row that is not served, with the reason) and `scripts/brands/out/manifest.json`. `--check` regenerates in memory and
fails on any difference. The founder's data choices (Starbucks guide, McDonald's region, Behrouz city, Domino's
duplicates, default sizes, per-100 g brands, Atwater tolerance, ...) live in `scripts/brands/decisions.json`, each
with a proposed default; edit that file and regenerate, never the SQL. Per-brand sign-offs go in the same file.

## Decisions

- **Amul (13 Nov 2026, founder):** keep. Its 66 rows come from Dudhsagar Dairy, the Amul member
  union that manufactures the products, because amul.com serves data only through a private API.
  Treated as an official manufacturer source.
- Seven brands publish no usable official numbers online (Chaayos, Bikanervala, Biryani By Kilo,
  and others listed in `REPORT.md`); they get no rows.
