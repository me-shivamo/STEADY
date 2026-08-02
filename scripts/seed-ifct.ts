// ── IFCT 2017 seed ────────────────────────────────────────────────────────────
// Loads the Indian Food Composition Tables (542 foods, lab-measured by ICMR-NIN
// across six regions) into the food_items cache.
//
// Why, when we already seeded INDB: the two hold different things. INDB is ~1,014
// COOKED dishes (poha, dosa, biryani). IFCT is RAW ingredient composition, and it
// carries the names Indian users actually type — bajra, jowar, ragi, rajmah,
// paneer are primary entries here and resolve to nothing useful in USDA.
//
// Data source: `npm pack @ifct2017/compositions` (MIT-licensed packaging of the
// ICMR-NIN published tables). We read its index.csv rather than adding a runtime
// dependency, since this runs once.
//
// Run (after migration 024):
//   npm pack @ifct2017/compositions && tar -xzf ifct2017-compositions-*.tgz
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx tsx scripts/seed-ifct.ts path/to/package/index.csv
//
// Idempotent: upserts on normalized_name, so re-running rewrites the same rows.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const csvPath = process.argv[2]
if (!url || !key || !csvPath) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-ifct.ts <index.csv>')
  process.exit(1)
}
const supabase = createClient(url, key)

// Must stay identical to normalizeName() in supabase/functions/_shared/macroResolver.ts
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// IFCT food names and local-name lists contain commas and quotes, so a split(',')
// would shred them — this is a minimal RFC4180 reader.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Food groups whose entries are measured RAW but are essentially always eaten
// cooked. Their names get an explicit "(raw)" suffix so the resolver's match step
// can see it and reject them for a cooked dish — the exact failure that had
// "a bowl of rajma" matching dry kidney beans at 337 kcal/100g and coming out
// 2.6x too high. Groups left off this list (fruit, nuts, some vegetables) are
// commonly eaten as-is, so their raw figures are the correct ones.
const COOK_REQUIRED = [
  'Cereals and Millets',
  'Grain Legumes',
  'Animal Meat',
  'Poultry',
  'Marine Fish',
  'Fresh Water Fish and Shellfish',
  'Marine Shellfish',
  'Marine Mollusks',
  'Roots and Tubers',
  'Egg and Egg Products',
]

// IFCT publishes energy in kJ. Storing it unconverted would inflate every Indian
// staple by ~4.2x (bajra reads 1456, which is 348 kcal) — verified against the
// raw file before writing this.
const KJ_PER_KCAL = 4.184

interface FoodItemRow {
  source: string
  external_id: string
  name: string
  normalized_name: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fiber_per_100g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  serving_size_g: number
  serving_size_description: string
  created_by: null
}

async function main() {
  const rows = parseCSV(readFileSync(csvPath, 'utf8'))
  // Headers look like "Energy; enerc" — the short code after the semicolon is
  // the stable identifier, so key off that rather than the display label.
  const header = rows[0].map((h) => h.split(';').pop()!.trim())
  const col = (name: string) => header.indexOf(name)
  const iCode = col('code'), iName = col('name'), iGrup = col('grup')
  const iEner = col('enerc'), iProt = col('protcnt'), iFat = col('fatce')
  const iCarb = col('choavldf'), iFib = col('fibtg')

  if ([iCode, iName, iGrup, iEner, iProt, iFat, iCarb, iFib].some((x) => x < 0)) {
    throw new Error('Unexpected CSV columns — IFCT package format may have changed')
  }

  const items: FoodItemRow[] = []
  let skipped = 0

  for (const r of rows.slice(1)) {
    const rawName = (r[iName] ?? '').trim()
    const kj = parseFloat(r[iEner])
    if (!rawName || !Number.isFinite(kj) || kj <= 0) { skipped++; continue }

    const group = (r[iGrup] ?? '').trim()
    const num = (idx: number) => {
      const v = parseFloat(r[idx])
      return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0
    }

    const name = COOK_REQUIRED.includes(group) ? `${rawName} (raw)` : rawName
    const kcal = Math.round((kj / KJ_PER_KCAL) * 10) / 10

    items.push({
      source: 'ifct',
      external_id: r[iCode],
      name,
      normalized_name: normalizeName(name),
      calories_per_100g: kcal,
      protein_per_100g: num(iProt),
      carbs_per_100g: num(iCarb),
      fat_per_100g: num(iFat),
      fiber_per_100g: num(iFib),
      // legacy per-serving columns mirror per-100g, matching seed-indb.ts
      calories: kcal,
      protein_g: num(iProt),
      carbs_g: num(iCarb),
      fat_g: num(iFat),
      fiber_g: num(iFib),
      serving_size_g: 100,
      serving_size_description: '100 g',
      created_by: null,
    })
  }

  // Two IFCT rows can normalise to the same key (e.g. regional variants of one
  // food). Upserting a batch containing duplicate conflict keys errors out, so
  // collapse to the first occurrence.
  const seen = new Set<string>()
  const unique = items.filter((i) => {
    if (seen.has(i.normalized_name)) return false
    seen.add(i.normalized_name)
    return true
  })

  console.log(`Parsed ${items.length} foods (${skipped} skipped, ${items.length - unique.length} duplicate names collapsed).`)
  console.log(`Marked "(raw)": ${unique.filter((i) => i.name.endsWith('(raw)')).length}`)

  let written = 0
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    const { error } = await supabase
      .from('food_items')
      .upsert(batch, { onConflict: 'normalized_name' })
    if (error) {
      console.error(`  batch ${i / 100 + 1} failed:`, error.message)
      continue
    }
    written += batch.length
  }
  console.log(`Done. ${written}/${unique.length} rows written.`)
}

main().catch((err) => {
  console.error('seed-ifct failed:', err)
  process.exit(1)
})
