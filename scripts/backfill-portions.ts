// ── One-time portions backfill ────────────────────────────────────────────────
// Populates food_items.portions (migration 023) for rows we already resolved
// from USDA, so cache hits can correct their portion size immediately instead
// of waiting to be re-resolved.
//
// Why this exists: the resolver caches per-100g macros, which makes the numbers
// deterministic — but a cache hit skips the USDA lookup entirely, so it never
// learned what "a bowl" of that food weighs. "A bowl of cereal" stayed pinned at
// the parse step's 150g guess (a bowl-of-cooked-rice weight) when a bowl of dry
// cereal is nearer 30-40g, a ~3x calorie error on top of perfectly correct
// per-100g data. New rows get portions written at resolve time; this fills in
// the ones cached before that existed.
//
// Only touches rows that already have an fdc_id (i.e. genuinely came from USDA)
// and leaves everything else — INDB seed rows, AI estimates — untouched.
// Purely additive: writes one previously-null column, deletes nothing.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FDC_API_KEY=... \
//   npx tsx scripts/backfill-portions.ts
//
// Idempotent: re-running just rewrites the same values.

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const fdcKey = process.env.FDC_API_KEY
if (!url || !key || !fdcKey) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and FDC_API_KEY.')
  process.exit(1)
}
const supabase = createClient(url, key)

interface Portion {
  description: string
  gramWeight: number
}

// The detail endpoint (/food/{id}) reports portions as amount + modifier, unlike
// the search endpoint's ready-made disseminationText — so rebuild the same
// human-readable shape here ("1 slice", "1 cup") that usda.ts produces.
function toPortions(foodPortions: Array<Record<string, unknown>>): Portion[] {
  return foodPortions
    .map((p) => {
      const grams = typeof p.gramWeight === 'number' ? p.gramWeight : null
      if (!grams || grams <= 0) return null
      const amount = typeof p.amount === 'number' && p.amount > 0 ? p.amount : 1
      const unit = (p.modifier as string) ??
        ((p.measureUnit as Record<string, unknown>)?.name as string) ?? ''
      // FNDDS rows often carry an internal portion CODE in `modifier`
      // (e.g. "90000", "10205") rather than a household measure. Those are
      // meaningless to a user and to our matcher, so drop them rather than
      // store "1 90000 = 240g" as if it described a real serving.
      if (/^\d+$/.test(unit.trim())) return null
      const description = `${amount} ${unit}`.trim()
      if (!description || /undetermined/i.test(description)) return null
      return { description, gramWeight: grams }
    })
    .filter((p): p is Portion => p !== null)
}

async function main() {
  const { data: rows, error } = await supabase
    .from('food_items')
    .select('id, name, fdc_id')
    .not('fdc_id', 'is', null)
    .is('portions', null)

  if (error) throw error
  console.log(`${rows?.length ?? 0} cached USDA rows need portions.`)

  let filled = 0
  let empty = 0
  for (const row of rows ?? []) {
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${row.fdc_id}?api_key=${fdcKey}`,
        { signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok) {
        console.warn(`  skip ${row.name}: HTTP ${res.status}`)
        continue
      }
      const detail = await res.json()
      const portions = toPortions(detail.foodPortions ?? [])

      if (portions.length === 0) {
        // Plenty of USDA foods publish no household measures (most liquids,
        // some raw ingredients). Nothing to store — leave the column null so
        // the resolver keeps its existing estimate for these.
        empty++
        continue
      }

      const { error: updErr } = await supabase
        .from('food_items')
        .update({ portions })
        .eq('id', row.id)
      if (updErr) {
        console.warn(`  failed ${row.name}: ${updErr.message}`)
        continue
      }
      filled++
      console.log(`  ${row.name}: ${portions.slice(0, 3).map((p) => `${p.description}=${p.gramWeight}g`).join(', ')}`)
    } catch (err) {
      console.warn(`  error ${row.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\nDone. ${filled} rows filled, ${empty} had no published measures.`)
}

main().catch((err) => {
  console.error('backfill failed:', err)
  process.exit(1)
})
