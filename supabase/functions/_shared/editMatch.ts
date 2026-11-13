// Pairs the foods of an edited meal with the entries the meal had before the
// edit, for log-food-from-text's rescale guard ("same food, new quantity" →
// rescale the old numbers instead of re-resolving).
//
// Matching by name alone lost the rescale whenever a food was renamed
// ("Roti" → "Chapati", a typo fix, or the model re-wording a name), and with
// it any numbers the user had set by hand in Adjust Macros. So each previous
// entry is listed to the model with a short ref ("p1", "p2", …) and the model
// echoes `prev_id` on a food it kept. Short positional refs rather than row
// UUIDs: a model copies "p2" reliably, and it works for installed app builds
// that send no ids at all.
//
// Order of trust:
//   1. Same normalized name — deterministic, and exactly the old behaviour
//      (several foods may share one previous entry, as before).
//   2. The model's prev_id — only for a food with no name match, only to an
//      entry no name match claimed, and each ref at most once.
//
// Pure apart from normalizeName, so jest can test it.

import { normalizeName } from './macroResolver.ts'

export function prevRef(index: number): string {
  return `p${index + 1}`
}

export function matchPreviousEntries<P extends { name: string }>(
  foods: Array<{ name?: unknown; prev_id?: unknown }>,
  previous: P[],
): Array<P | undefined> {
  const out: Array<P | undefined> = new Array(foods.length).fill(undefined)
  if (previous.length === 0) return out

  // Last one wins on a duplicate name, as the old Map did.
  const byName = new Map<string, number>()
  previous.forEach((p, j) => byName.set(normalizeName(p.name), j))

  const claimed = new Set<number>()
  foods.forEach((f, i) => {
    if (typeof f.name !== 'string') return
    const j = byName.get(normalizeName(f.name))
    if (j !== undefined) {
      out[i] = previous[j]
      claimed.add(j)
    }
  })

  foods.forEach((f, i) => {
    if (out[i] || typeof f.prev_id !== 'string') return
    const m = /^p(\d+)$/i.exec(f.prev_id.trim())
    if (!m) return
    const j = Number(m[1]) - 1
    if (j < 0 || j >= previous.length || claimed.has(j)) return
    out[i] = previous[j]
    claimed.add(j)
  })

  return out
}
