// The official chain-menu import (v1.2 follow-up plan WP10, generator half). Commands:
//
//   npx tsx scripts/import-brands.ts                    write the generated files below
//   npx tsx scripts/import-brands.ts --check            regenerate in memory; exit 1 if any generated file differs
//   npx tsx scripts/import-brands.ts --number NNN       push time only: write the numbered copy into supabase/migrations/
//                                                       (refuses while a decision is PENDING FOUNDER or a served brand
//                                                       has no sign-off); add --check to verify it instead
//
// Inputs: scripts/data/brands/raw/_combined.csv (the QA'd brand data, numbers as printed) and
// scripts/brands/decisions.json (the founder's choices; each has a proposed default until decided).
// Generated (never edit by hand; headers carry inputs_sha256):
//   supabase/pending/brand_items.sql            creates public.brand_items with every row (verified / held / unserved)
//   supabase/rollback/brand_items_down.sql      drops it
//   scripts/brands/out/review_list.csv          every row that is not served, with the reason
//   scripts/brands/out/manifest.json            counts, decisions in effect, the impact of each option, sign-offs
// With --number NNN the two SQL files are supabase/migrations/NNN_brand_items.sql and
// supabase/rollback/NNN_brand_items_down.sql instead.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import { renderAll } from './brands/emit'
import { REPO } from './brands/lib'

function main(): void {
  const args = process.argv.slice(2)
  let check = false
  let number: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true
    else if (args[i] === '--number' && i + 1 < args.length) number = args[++i]
    else if (args[i].startsWith('--number=')) number = args[i].slice('--number='.length)
    else { console.error('usage: import-brands.ts [--check] [--number NNN]'); process.exit(2) }
  }
  let files: Record<string, string> = {}
  try {
    files = renderAll({ number })
  } catch (e) {
    console.error(String((e as Error)?.message ?? e))
    process.exit(1)
  }
  if (check) {
    const bad = Object.entries(files).filter(([rel, text]) => !existsSync(join(REPO, rel)) || readFileSync(join(REPO, rel), 'utf8') !== text)
    for (const [rel] of bad) console.error(`differs: ${rel}`)
    if (bad.length) process.exit(1)
    console.log(`check ok: ${Object.keys(files).length} generated files are byte-identical to a fresh run`)
    return
  }
  for (const [rel, text] of Object.entries(files)) {
    const path = join(REPO, rel)
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, text)
    renameSync(tmp, path)
    console.log(`wrote ${rel} (${Buffer.byteLength(text)} bytes)`)
  }
  if (number) {
    console.log('now, in the same commit: delete supabase/pending/brand_items.sql and supabase/rollback/brand_items_down.sql;')
    console.log(`check with --check --number ${number} from then on (a plain --check renders the pending paths); and update`)
    console.log('__tests__/unit/brandItems.test.ts, which pins the pending paths on purpose, plus the row in supabase/pending/README.md')
  }
}

main()
