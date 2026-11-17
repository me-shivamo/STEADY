// Compiles the DRAFT cuisine vocabulary and classifies the snapshot's USDA-held keys (v1.2 follow-up WP6,
// pure parts; plan .claude/plans/v1.2-followup-build-plan.md WP6 + review #16 / #26, Q15).
//
//   npx tsx scripts/cuisine/emit.ts           write the three outputs (see lib.ts)
//   npx tsx scripts/cuisine/emit.ts --check   regenerate in memory; exit 1 if any output differs
//
// No database, no network: reads only the repo files listed in lib.ts. WP6's later parts add the 062
// migration (food_item_cuisine, food_region_keys) to this generator; nothing here writes SQL.

import { readFileSync, writeFileSync } from 'fs'

import { generate, keyLists, loadVocab, REPO } from './lib'

function main() {
  const check = process.argv.includes('--check')
  const out = generate()
  let ok = true
  for (const [path, text] of out) {
    const rel = path.slice(REPO.length + 1)
    if (check) {
      let cur = ''
      try { cur = readFileSync(path, 'utf8') } catch { /* missing = differs */ }
      if (cur !== text) { ok = false; console.error(`DIFFERS: ${rel} (run without --check to regenerate)`) }
    } else {
      writeFileSync(path, text)
      console.log(`wrote ${rel}`)
    }
  }
  const v = loadVocab()
  const { counts } = keyLists(v)
  const by = (c: string) => v.rows.filter((r) => r.cuisine === c).length
  console.log(`vocabulary: ${v.rows.length} phrases (in ${by('in')}, west ${by('west')}, neutral ${by('neutral')}); ` +
    `${v.rows.filter((r) => r.status === 'draft').length} draft`)
  console.log(`snapshot keys: in ${counts.in}, west ${counts.west}, neutral ${counts.neutral}`)
  if (check) {
    if (!ok) process.exit(1)
    console.log('check: all outputs match')
  }
}

main()
