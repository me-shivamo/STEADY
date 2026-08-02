// ── The unit boundary ────────────────────────────────────────────────────────
//
// STEADY stores every body measurement in ONE canonical unit — weight in kg,
// height in cm — no matter what the user has chosen to see. `units_system` is
// purely a *display* preference.
//
// That means conversion may only happen at two edges:
//   1. reading a canonical value out of the profile  → format for display
//   2. writing a typed display value back            → parse to canonical
//
// Everything between those edges is display-unit text. Mixing the two is what
// broke the old Settings screen: it formatted cm→inches on render but wrote
// the typed inches straight back into the variable named `heightCm`, so every
// keystroke got divided by 2.54 a second time.
//
// Keeping the conversions here (rather than inline in a screen) means there is
// exactly one place this can be wrong, and one place to unit-test.

export type UnitSystem = 'metric' | 'imperial';

export const KG_TO_LBS = 2.20462;
export const CM_PER_INCH = 2.54;

export function weightUnitLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'lbs' : 'kg';
}

export function heightUnitLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'in' : 'cm';
}

// ── Canonical → display ──────────────────────────────────────────────────────
// Both return strings, because they feed a controlled TextInput. An absent
// value becomes '' (empty field), never 'null' or 'NaN'.

export function formatWeight(kg: number | null | undefined, units: UnitSystem): string {
  if (kg == null || !Number.isFinite(kg)) return '';
  return units === 'imperial'
    ? String(Math.round(kg * KG_TO_LBS))
    : String(Math.round(kg * 10) / 10);
}

export function formatHeight(cm: number | null | undefined, units: UnitSystem): string {
  if (cm == null || !Number.isFinite(cm)) return '';
  return units === 'imperial'
    ? String(Math.round(cm / CM_PER_INCH))
    : String(Math.round(cm));
}

// ── Display → canonical ──────────────────────────────────────────────────────
// Return null for anything unparseable so callers can store a real NULL rather
// than silently persisting 0 (a 0kg user would sail straight into the TDEE
// formula and produce a nonsense calorie target).

export function parseWeight(text: string, units: UnitSystem): number | null {
  const n = parseFloat(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = units === 'imperial' ? n / KG_TO_LBS : n;
  return Math.round(kg * 10) / 10;
}

export function parseHeight(text: string, units: UnitSystem): number | null {
  const n = parseFloat(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = units === 'imperial' ? n * CM_PER_INCH : n;
  return Math.round(cm);
}

// ── Display → display (used when the user flips the units toggle) ─────────────
// Round-trips the text through canonical so "154" in lbs becomes "70" in kg.
// Unparseable text (including an empty field mid-edit) is handed back
// untouched — flipping units must never destroy what someone is typing.

export function convertWeightText(text: string, from: UnitSystem, to: UnitSystem): string {
  if (from === to) return text;
  const kg = parseWeight(text, from);
  return kg == null ? text : formatWeight(kg, to);
}

export function convertHeightText(text: string, from: UnitSystem, to: UnitSystem): string {
  if (from === to) return text;
  const cm = parseHeight(text, from);
  return cm == null ? text : formatHeight(cm, to);
}

// ── Age ⇄ date_of_birth ──────────────────────────────────────────────────────
//
// The profile stores a date, but a settings form is a much friendlier place to
// ask for an age. calculateAge() (utils/tdee.ts) turns the date back into the
// number, so this has to be its exact inverse: feeding the result of
// ageToDateOfBirth(n) into calculateAge() must give back n.
//
// The subtlety is the birthday. If someone is 25 and their birthday hasn't
// happened yet this year, their birth year is (thisYear - 25 - 1), not
// (thisYear - 25). We preserve the month/day already on file so editing an
// unrelated field never quietly rewrites a real birth date to January 1st.

export function ageToDateOfBirth(age: number, existingDob: string | null | undefined): string {
  const today = new Date();
  const base = existingDob ? new Date(existingDob + 'T00:00:00') : new Date(today.getFullYear(), 0, 1);
  const month = base.getMonth();
  const day = base.getDate();

  const birthdayPassedThisYear =
    today.getMonth() > month || (today.getMonth() === month && today.getDate() >= day);

  const year = today.getFullYear() - age - (birthdayPassedThisYear ? 0 : 1);

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Months-from-today as a 'YYYY-MM-DD' local date. Same helper onboarding's
// target-weight step uses — kept in sync so a deadline set in Settings and one
// set during onboarding mean exactly the same thing.
export function monthsFromToday(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 2026-11-02 → "2 Nov 2026". Used for the read-only deadline caption.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
