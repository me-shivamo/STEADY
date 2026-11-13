import type { Tables } from '../types/database'

// The text a meal card's inline editor works with. Pulled out of MealCard so
// the "did the user actually change anything?" check is a plain function that
// tests can call, and so the editor's starting text and the check that
// compares against it can never be built two different ways.

type EntryLike = Pick<Tables<'food_entries'>, 'food_name' | 'quantity_label' | 'quantity_g'>

// Human-readable grams fallback when a food entry has no quantity_label.
export function formatQty(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`
}

// Capitalise the first letter of each word — AI returns lowercase food names.
export function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// The AI sometimes bakes its own brackets into quantity_label (e.g. "2 spoon (30g)").
// We always wrap the quantity in our own ( ), so strip any inner brackets to avoid
// double brackets like "(2 spoon (30g))" → "(2 spoon 30g)".
export function cleanQty(s: string): string {
  return s.replace(/[()]/g, '').trim()
}

// Build a human-readable summary of AI-parsed foods, e.g.
// "Bread (2 slices), Tomato (42 g), Egg (2 large)"
// This is what the user edits — it reflects what the AI understood, not their raw input.
export function buildFoodSummary(entries: EntryLike[]): string {
  return entries
    .map(e => `${titleCase(e.food_name)} (${cleanQty(e.quantity_label ?? formatQty(e.quantity_g))})`)
    .join(', ')
}

// Whitespace-insensitive, so a stray trailing space or a newline the
// multiline input added doesn't count as an edit.
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// True when confirming the editor would re-send what the meal already says.
// The editor opens pre-filled with the food summary (startText), NOT the
// user's original caption, so comparing against the caption alone missed the
// common case — open, look, tap ✓ — and re-ran the AI on an unchanged meal.
// The caption comparison is kept for anyone who retypes their original words.
export function isUnchangedEdit(draft: string, startText: string, caption: string | null): boolean {
  const d = normalizeWs(draft)
  if (!d) return true
  if (d === normalizeWs(startText)) return true
  return caption != null && d === normalizeWs(caption)
}
