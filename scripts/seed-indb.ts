// ── One-time INDB seed ────────────────────────────────────────────────────────
// Loads the Indian Nutrient Databank (INDB — 1,014 common Indian recipes with
// per-100g values, built on ICMR-NIN IFCT 2017 lab data) into the food_items
// cache so Indian foods resolve locally with zero external API calls.
//
// Data file: scripts/data/indb.json — converted once from INDB.xlsx
// (https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-).
//
// Run AFTER migration 008 is applied:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   npx tsx scripts/seed-indb.ts
//
// Idempotent: re-running upserts the same rows (keyed on normalized_name).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

interface IndbFood {
  code: string
  name: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fiber_per_100g: number
}

// Must stay identical to normalizeName() in supabase/functions/_shared/macroResolver.ts
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}
const supabase = createClient(url, key)

const dataPath = join(dirname(fileURLToPath(import.meta.url)), 'data', 'indb.json')
const foods: IndbFood[] = JSON.parse(readFileSync(dataPath, 'utf8'))

// Dedupe on normalized name (a few INDB names collide once normalized) — keep first.
const seen = new Set<string>()
const rows = []
for (const f of foods) {
  if (!f.calories_per_100g && f.calories_per_100g !== 0) continue
  const norm = normalizeName(f.name)
  if (seen.has(norm)) {
    console.log(`skip duplicate: "${f.name}" → "${norm}"`)
    continue
  }
  seen.add(norm)
  rows.push({
    source: 'indb',
    external_id: f.code,
    name: f.name,
    normalized_name: norm,
    calories_per_100g: f.calories_per_100g,
    protein_per_100g: f.protein_per_100g,
    carbs_per_100g: f.carbs_per_100g,
    fat_per_100g: f.fat_per_100g,
    fiber_per_100g: f.fiber_per_100g,
    // legacy per-serving columns filled per-100g for backward compat
    calories: f.calories_per_100g,
    protein_g: f.protein_per_100g,
    carbs_g: f.carbs_per_100g,
    fat_g: f.fat_per_100g,
    fiber_g: f.fiber_per_100g,
    serving_size_g: 100,
    serving_size_description: '100 g',
    created_by: null,
  })
}

async function main() {
  console.log(`Seeding ${rows.length} INDB foods (${foods.length - rows.length} skipped)...`)

  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('food_items')
      .upsert(batch, { onConflict: 'normalized_name' })
    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message)
      process.exit(1)
    }
    console.log(`  upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  const { count } = await supabase
    .from('food_items')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'indb')
  console.log(`Done. food_items now has ${count} rows with source='indb'.`)
}

main()
