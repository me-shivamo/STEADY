// The local USDA import (v1.2 Phase 7). Three commands:
//
//   npx tsx scripts/import-usda.ts fetch     download the pinned FDC bulk zips into the gitignored .cache/usda/
//                                            (SHA-256 and size checked; a file that differs is refused, never used)
//   npx tsx scripts/import-usda.ts           (= emit) write the generated files below from the cached zips
//   npx tsx scripts/import-usda.ts --check   regenerate in memory; exit 1 if any generated file differs
//
// Generated (never edit by hand; their header carries inputs_sha256):
//   supabase/pending/055_usda_local_foods.sql         the imported food rows (verified, no name key)
//   supabase/pending/056_usda_local_portions.sql      their portion_units rows, the category map, search_usda_local
//   scripts/usda/check_056_determinism.sql            read-only: search_usda_local ranks the same on any plan
//   supabase/rollback/055_usda_local_foods_down.sql, supabase/rollback/056_usda_local_portions_down.sql
//   docs/reviews/055-usda-local.md                    the manifest: counts, exclusions, failures, sign-off lists
//   scripts/usda/manifest.json                        the same counts, machine-readable (scripts/usda/check_subset.py)
//   scripts/usda/proposed_aliases.csv                 B's key plan, flagged; only a LATER reviewed migration may use it
//
// Spec: .claude/plans/v1.2-phase5-7-spec.md (f), (b) 055/056, (j) 11/14/15, (k).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

import { CACHE, DATASETS, loadBulk, loadPins, REPO, sha256 } from './usda/lib'
import { renderAll } from './usda/emit'

async function fetchPinned(): Promise<void> {
  mkdirSync(CACHE, { recursive: true })
  const pins = loadPins()
  for (const d of DATASETS) {
    const pin = pins[d]
    const path = join(CACHE, pin.file)
    if (existsSync(path)) {
      const b = readFileSync(path)
      if (b.length === pin.bytes && sha256(b) === pin.sha256) { console.log(`ok       ${pin.file} (cached, sha256 matches)`); continue }
      console.log(`stale    ${pin.file}: cached copy differs from the pin, downloading again`)
    }
    const res = await fetch(pin.url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`${pin.url}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const h = sha256(buf)
    if (buf.length !== pin.bytes || h !== pin.sha256) {
      throw new Error(`${pin.file}: downloaded sha256 ${h} (${buf.length} bytes) differs from the pin ${pin.sha256} (${pin.bytes} bytes). ` +
        'USDA may have replaced the file: review the new release and re-pin it in scripts/usda/sources.json on purpose.')
    }
    const tmp = `${path}.part`
    writeFileSync(tmp, buf)
    renameSync(tmp, path)
    console.log(`fetched  ${pin.file} (${buf.length} bytes, sha256 ${h.slice(0, 12)}…)`)
  }
}

function main(): void {
  const arg = process.argv[2]
  const files = renderAll(loadBulk())
  if (arg === '--check') {
    const bad = Object.entries(files).filter(([rel, text]) => !existsSync(join(REPO, rel)) || readFileSync(join(REPO, rel), 'utf8') !== text)
    for (const [rel] of bad) console.error(`differs: ${rel}`)
    if (bad.length) process.exit(1)
    console.log(`check ok: ${Object.keys(files).length} generated files are byte-identical to a fresh run`)
    return
  }
  if (arg !== undefined && arg !== 'emit') { console.error('usage: import-usda.ts [fetch | emit | --check]'); process.exit(2) }
  for (const [rel, text] of Object.entries(files)) {
    const path = join(REPO, rel)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, text)
    renameSync(tmp, path)
    console.log(`wrote ${rel} (${Buffer.byteLength(text)} bytes)`)
  }
}

if (process.argv[2] === 'fetch') {
  fetchPinned().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
} else {
  main()
}
