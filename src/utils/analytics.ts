import { posthog } from './posthog';

// ═══════════════════════════════════════════════════════════════════════════
// STEADY analytics — the single front door for every product event.
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY THIS FILE EXISTS
// PostHog's own API is `capture(name: string, props?: object)` — completely
// untyped. A typo ('meal_loged') or a renamed property doesn't fail anything:
// it silently creates a brand-new event that quietly under-counts a funnel
// for weeks before anyone notices. This module puts a compile-time contract
// in front of it. `AnalyticsEvents` below is the registry — one entry per
// event, mapping its name to the exact shape of its properties — and
// `track()` is generic over that registry, so `track('meal_logged', {...})`
// only compiles if both the name and every property match. Renaming an event
// becomes a refactor the compiler walks you through, not an archaeology dig.
//
// PRIVACY RULE (deliberate, applies to every event here)
// STEADY handles health data, and PostHog is a third-party server. So:
//   - No raw body metrics leave the device. Weights and circumferences go
//     through `weightBucket()` / are reduced to field NAMES, never values.
//   - No free text ever leaves the device — not meal descriptions, not chat
//     input, not group names, not error strings from the AI (which routinely
//     quote back what the user typed). Errors go through `errorReason()`,
//     which maps anything to a fixed set of category codes.
//   - No email, no display name, no avatar URL on the person profile.
// The user id we identify with is the Supabase UUID, which is meaningless
// without database access. Everything else is a bucket, an enum, or a count.
//
// WHERE CALLS LIVE
// Outcome events ("this data actually changed") are captured in the Zustand
// stores, because a store action is the one place every UI path funnels
// through — HomeScreen and the saved-entries sheet both call logSavedEntry(),
// so one call site there can never drift out of sync with the other.
// Intent events (taps that don't mutate data, abandoned flows, permission
// prompts) are captured in screens, because the store never sees them.

// ── Shared value types ────────────────────────────────────────────────────
export type AuthMethod = 'email' | 'google' | 'apple';
export type LogSource = 'text' | 'photo' | 'saved_entry';
export type PhotoSource = 'camera' | 'library';
export type OnboardingStep = 'goal' | 'stats' | 'target_weight' | 'activity' | 'diet' | 'reveal';

// Every failure in the app collapses to one of these. Keeping it a closed
// union is the whole privacy mechanism for errors: there is no branch that
// can pass a raw message through, so user text cannot leak by accident.
export type ErrorReason =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server_error'
  | 'validation'
  | 'not_food'
  | 'unavailable'
  // The AI asked the user a question instead of logging (an "unsure" text
  // log, or a photo it couldn't identify). Nothing was saved.
  | 'needs_clarification'
  // The AI's reply wasn't readable JSON; the server reports this as
  // `error_code: 'ai_parse_failed'` instead of passing it off as a chat reply.
  | 'ai_parse_failed'
  | 'unknown';

// The four numbers a food entry carries — the closed set food_corrected's
// `basis` names (a field NAME, never its value).
export const MACRO_FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const;
export type MacroField = typeof MACRO_FIELDS[number];

// Where an entry's numbers came from — mirrors the food_entries.macro_source
// CHECK constraint, plus 'mixed' (a meal whose entries disagree) and
// 'unknown' (null, or a value this build doesn't know). A closed set, so a
// stray string can never ride along in an event.
export type MacroSourceBucket =
  | 'usda'
  | 'indb'
  | 'ifct'
  | 'ai_estimated'
  | 'user_created'
  | 'label'
  | 'mixed'
  | 'unknown';

// Events that carry no properties. `Record<string, never>` means "an object
// with no keys" — stricter than `{}`, which TypeScript treats as "anything
// non-null" and would happily accept a stray payload.
type NoProps = Record<string, never>;

// ── The event registry ────────────────────────────────────────────────────
export interface AnalyticsEvents {
  // ── Auth & account ──────────────────────────────────────────────────────
  sign_up: { method: AuthMethod };
  sign_in: { method: AuthMethod };
  sign_out: NoProps;
  account_deleted: NoProps;
  account_deletion_failed: { reason: ErrorReason };
  auth_failed: {
    action: 'sign_up' | 'sign_in' | 'password_reset_request' | 'password_reset_complete';
    method: AuthMethod | 'none';
    reason: ErrorReason;
  };
  auth_method_tapped: { method: AuthMethod; screen: 'login' | 'signup' | 'welcome' };
  password_reset_requested: NoProps;
  password_reset_completed: NoProps;
  // `fields` is the list of profile column NAMES that changed — never the
  // values, which include weight, height and date of birth.
  profile_updated: { fields: string[]; field_count: number };

  // ── Onboarding funnel ───────────────────────────────────────────────────
  onboarding_started: NoProps;
  onboarding_step_completed: {
    step: OnboardingStep;
    skipped?: boolean;
    goal?: string | null;
    activity_level?: string | null;
    units?: string | null;
    pairing?: string | null;
    restrictions?: string[];
    restriction_count?: number;
  };
  onboarding_skipped_to_home: { step: OnboardingStep };
  onboarding_completed: {
    goal: string | null;
    activity_level: string | null;
    calorie_goal_bucket: string;
    diet_restriction_count: number;
  };

  // ── Food logging — the core loop ────────────────────────────────────────
  meal_logged: {
    source: LogSource;
    meal_type: string;
    calorie_bucket: string;
    item_count: number;
    has_photo: boolean;
    // Text/photo only: false when the meal went to a past day being viewed.
    is_today?: boolean;
  };
  meal_log_failed: { source: LogSource; reason: ErrorReason; is_today?: boolean };
  // The text Edge Function answered a nutrition question instead of logging.
  ai_question_answered: { water_logged: boolean };
  meal_edited: { item_count: number };
  meal_edit_failed: { reason: ErrorReason };
  meal_deleted: NoProps;
  food_entry_deleted: NoProps;
  meal_macros_adjusted: { entries_changed: number };
  // The user corrected numbers the pipeline produced: one event per changed
  // entry from Adjust Macros, one per meal from a text edit. Only enums,
  // buckets and counts — never the food, the text or the values.
  // `direction` and `change_bucket` (absolute % change, see changeBucket())
  // are measured on the `basis` field: calories when they changed, else the
  // macro that moved most (see correctionBasis()). A text edit is always
  // measured on the meal's calories.
  food_corrected: {
    method: 'edit' | 'adjust_macros';
    macro_source: MacroSourceBucket;
    basis: MacroField;
    direction: 'up' | 'down' | 'none';
    change_bucket: string;
    // Adjust Macros only: how many of calories/protein/carbs/fat changed.
    fields_changed?: number;
  };
  meal_datetime_changed: { moved_to_different_day: boolean };
  meal_saved_as_entry: { item_count: number };
  saved_entry_logged: { item_count: number };
  saved_entry_deleted: NoProps;
  saved_entries_opened: { saved_count: number };
  // A logging ATTEMPT from the composer (intent, so it lives in the screen).
  // Every attempt ends in exactly one store outcome: meal_logged or
  // meal_log_failed with source text|photo, or ai_question_answered (text
  // only). Filter meal_logged to those two sources first: saved-entry logs
  // also emit meal_logged (source saved_entry) with no attempt. Then attempts
  // minus outcomes is the abandonment/crash gap, and meal_log_failed is the
  // failure rate. is_today is on the attempt and on both meal_* outcomes.
  chat_message_sent: { length_bucket: string; has_photo?: boolean; is_today?: boolean };

  // ── Photo capture funnel ────────────────────────────────────────────────
  photo_capture_started: { source: PhotoSource };
  photo_capture_cancelled: { source: PhotoSource };
  photo_attached: { source: PhotoSource };
  photo_discarded: NoProps;
  camera_permission_result: { granted: boolean; source: PhotoSource };

  // ── Home / navigation intent ────────────────────────────────────────────
  log_date_changed: { direction: 'previous' | 'next' | 'calendar' | 'today'; is_today: boolean };
  home_quick_action_tapped: { action: string };

  // ── Water ───────────────────────────────────────────────────────────────
  // amount_ml is a preset button choice (250 / 500 / …), not a body metric,
  // so the exact value is safe and tells us which presets actually get used.
  water_logged: { amount_ml: number; entry_index: number };
  water_entry_deleted: NoProps;

  // ── Weight ──────────────────────────────────────────────────────────────
  weight_logged: { weight_bucket_kg: string; has_notes: boolean; is_same_day_update: boolean };
  weight_entry_deleted: NoProps;
  weight_range_changed: { range: string };

  // ── Body measurements ───────────────────────────────────────────────────
  // Field names only — knowing someone tracks their waist is fine, knowing
  // the number is not.
  measurements_logged: { fields: string[]; field_count: number };
  measurement_entry_deleted: NoProps;
  measurement_range_changed: { range: string };

  // ── Progress ────────────────────────────────────────────────────────────
  progress_week_changed: { week_offset: number; direction: 'previous' | 'next' };

  // ── Reminders & push ────────────────────────────────────────────────────
  reminder_toggled: { type: string; enabled: boolean };
  reminder_config_saved: { type: string; kind: string; enabled: boolean; times_count: number };
  reminder_save_failed: { type: string; reason: ErrorReason };
  push_permission_result: { granted: boolean };
  push_token_registered: { platform: string };
  push_registration_failed: { reason: ErrorReason; stage: 'permission' | 'token' | 'server' };
  // The engagement half of the loop. `recorded` is whether the server accepted
  // the open (false means the payload carried no log id, e.g. a notification
  // sent before tap tracking shipped), so a gap between opens here and opens in
  // notification_log is visible rather than a silent undercount.
  notification_opened: {
    channel: string;
    deep_link: string;
    cold_start: boolean;
    recorded: boolean;
  };

  // ── Groups ──────────────────────────────────────────────────────────────
  group_created: { category: string };
  group_create_failed: { reason: ErrorReason };
  group_joined: { member_count: number };
  group_join_failed: { reason: ErrorReason };
  group_invite_previewed: { found: boolean };
  group_invite_shared: { method: 'copy' | 'share' };
  group_left: NoProps;
  group_renamed: NoProps;
  group_deleted: NoProps;
  group_member_removed: NoProps;
  group_switched: { group_count: number };
  group_cheer_posted: NoProps;
  group_cheer_removed: NoProps;
  group_activity_feed_paginated: NoProps;
  // Deliberately tracked even though the feature throws "coming soon" — the
  // event count is the demand signal for whether to build it.
  group_nudge_attempted: NoProps;

  // ── Settings & profile ──────────────────────────────────────────────────
  settings_row_tapped: { row: string };
  units_changed: { units_system: string };
  macro_targets_adjusted: { changed_fields: string[] };
  legal_document_opened: { document: string };
  tdee_estimate_viewed: { has_estimate: boolean };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

// PostHog types its property bag as JSON-only values. Our registry shapes are
// already JSON-safe by construction (strings, numbers, booleans, string
// arrays), but optional fields widen to `undefined`, which isn't valid JSON —
// so the single cast at the capture boundary below is where the two type
// systems are reconciled. All the real safety lives in `track()`'s signature.
type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

// ── The capture front door ────────────────────────────────────────────────
// Fire-and-forget by design: PostHog appends to an in-memory queue and
// returns immediately, so this never blocks a UI interaction and never needs
// awaiting. The try/catch is belt-and-braces — analytics must never be the
// reason a meal fails to save.
export function track<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEvents[E]
): void {
  try {
    posthog.capture(event, properties as unknown as Record<string, JsonSafe>);
  } catch (err) {
    if (__DEV__) console.warn(`[analytics] capture failed for "${event}"`, err);
  }
}

// ── Identity ──────────────────────────────────────────────────────────────
// Non-identifying person properties. These are the dimensions we actually
// segment by ("do people cutting weight log more consistently than people
// bulking?"). Note what is absent: email, name, avatar, raw weight/height.
export interface UserTraits {
  goal_type?: string | null;
  activity_level?: string | null;
  units_system?: string | null;
  diet_restriction_count?: number;
  has_target_weight?: boolean;
  signup_method?: AuthMethod;
}

// Tells PostHog "the anonymous device I've been tracking is user <uuid>", so
// pre-login events (welcome screen, signup form) get stitched onto the same
// person as everything after. Called from authStore, never from a screen.
export function identifyUser(userId: string, traits?: UserTraits): void {
  try {
    const clean: Record<string, JsonSafe> = {};
    for (const [key, value] of Object.entries(traits ?? {})) {
      if (value !== undefined && value !== null) clean[key] = value;
    }
    posthog.identify(userId, clean as Record<string, JsonSafe>);
  } catch (err) {
    if (__DEV__) console.warn('[analytics] identify failed', err);
  }
}

// Clears the stored identity on sign-out. Without this, the next person to
// sign in on the same device inherits the previous user's person profile and
// their events get merged into one impossible-looking user.
export function resetUser(): void {
  try {
    posthog.reset();
  } catch (err) {
    if (__DEV__) console.warn('[analytics] reset failed', err);
  }
}

export function trackScreen(name: string): void {
  try {
    posthog.screen(name);
  } catch (err) {
    if (__DEV__) console.warn('[analytics] screen failed', err);
  }
}

// ── Bucketing helpers ─────────────────────────────────────────────────────
// Turns a continuous number into one of a fixed set of labels. Two reasons:
// privacy (a bucket can't be matched back to an individual the way "84.3 kg
// on this date" can), and analysis (PostHog groups identical strings into
// clean bar charts, whereas thousands of distinct floats produce noise).

// `edges` are the boundaries; the returned label is always "low-high" or an
// open-ended "<low" / "high+". Buckets sort lexicographically in a sensible
// order because every label is zero-padded to the same width where it matters.
function bucketize(value: number, edges: number[]): string {
  if (!Number.isFinite(value)) return 'unknown';
  if (value < edges[0]) return `<${edges[0]}`;
  for (let i = 0; i < edges.length - 1; i++) {
    if (value < edges[i + 1]) return `${edges[i]}-${edges[i + 1]}`;
  }
  return `${edges[edges.length - 1]}+`;
}

export function calorieBucket(calories: number): string {
  return bucketize(Math.round(calories), [0, 100, 250, 500, 750, 1000, 1500, 2000]);
}

export function calorieGoalBucket(goal: number): string {
  return bucketize(Math.round(goal), [1200, 1500, 1800, 2100, 2400, 2700, 3000]);
}

// Body weight is the most sensitive number in the app, so the buckets are
// deliberately coarse — 10 kg wide, with open ends.
export function weightBucket(weightKg: number): string {
  return bucketize(Math.round(weightKg), [40, 50, 60, 70, 80, 90, 100, 120]);
}

// For free-text inputs we record only how long the message was, never what it
// said — enough to tell "one-word logs" from "paragraph logs".
export function lengthBucket(text: string): string {
  return bucketize(text.trim().length, [0, 10, 25, 50, 100, 200]);
}

// ── Correction helpers (food_corrected) ───────────────────────────────────
// A correction is described by its direction and its relative size, never by
// the numbers themselves: "someone cut a meal by 25-50%" is a quality signal,
// "someone's lunch went from 812 to 430 kcal" is health data.

// Both helpers work on one field's old and new value (kcal or grams).
// Compared at 0.1 so float noise (149.99999 vs 150) is not a "change".
export function changeDirection(oldValue: number, newValue: number): 'up' | 'down' | 'none' {
  const a = Math.round((Number.isFinite(oldValue) ? oldValue : 0) * 10);
  const b = Math.round((Number.isFinite(newValue) ? newValue : 0) * 10);
  if (b > a) return 'up';
  if (b < a) return 'down';
  return 'none';
}

// Absolute % change, bucketed. A percentage has no meaning when the old
// value was 0, so that case gets its own label instead of Infinity.
export function changeBucket(oldValue: number, newValue: number): string {
  if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) return 'unknown';
  if (changeDirection(oldValue, newValue) === 'none') return '0-5';
  if (oldValue <= 0) return 'from_zero';
  const pct = (Math.abs(newValue - oldValue) / oldValue) * 100;
  return bucketize(pct, [0, 5, 10, 25, 50, 100]);
}

// Which field a correction is measured on: calories when they changed (the
// number the user tracks against), otherwise the macro with the largest
// relative change, a change from 0 counting as largest. Calories when
// nothing changed at all.
export function correctionBasis(
  before: Partial<Record<MacroField, number | null>>,
  after: Partial<Record<MacroField, number>>,
): MacroField {
  const moved = MACRO_FIELDS.filter((f) => {
    const next = after[f];
    return typeof next === 'number' && changeDirection(before[f] ?? 0, next) !== 'none';
  });
  if (moved.length === 0 || moved.includes('calories')) return 'calories';
  let basis: MacroField = moved[0];
  let largest = -1;
  for (const f of moved) {
    const prev = before[f] ?? 0;
    const rel = prev <= 0 ? Infinity : Math.abs((after[f] as number) - prev) / prev;
    if (rel > largest) { basis = f; largest = rel; }
  }
  return basis;
}

const KNOWN_MACRO_SOURCES: ReadonlySet<string> = new Set([
  'usda', 'indb', 'ifct', 'ai_estimated', 'user_created', 'label',
]);

// Narrows a raw macro_source column value onto the closed set.
export function macroSourceBucket(source: string | null | undefined): MacroSourceBucket {
  return source && KNOWN_MACRO_SOURCES.has(source) ? (source as MacroSourceBucket) : 'unknown';
}

// One label for a whole meal: its entries' shared source, or 'mixed'.
export function mealMacroSource(sources: Array<string | null | undefined>): MacroSourceBucket {
  const buckets = new Set(sources.map(macroSourceBucket));
  if (buckets.size === 0) return 'unknown';
  if (buckets.size > 1) return 'mixed';
  return [...buckets][0];
}

// ── Error classification ──────────────────────────────────────────────────
// Maps any thrown value onto the closed `ErrorReason` union. This is the only
// path by which failures are allowed into analytics — raw `err.message` from
// the food Edge Functions frequently embeds the user's own meal text, so it
// must never be captured verbatim.
export function errorReason(err: unknown): ErrorReason {
  // A machine-readable code the store attached from the server's body (see
  // foodLogStore's bodyError). Checked against a closed list, so an unknown
  // code falls through to the message sniffing below rather than leaking.
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (code === 'ai_parse_failed' || code === 'needs_clarification') return code;
  }
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
  const m = raw.toLowerCase();

  if (!m) return 'unknown';
  if (m.includes('network') || m.includes('fetch failed') || m.includes('offline') || m.includes('connection')) {
    return 'network';
  }
  if (m.includes('timeout') || m.includes('timed out') || m.includes('aborted')) return 'timeout';
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('429') || m.includes('quota')) {
    return 'rate_limited';
  }
  if (m.includes('unauthorized') || m.includes('not authenticated') || m.includes('401') || m.includes('jwt')) {
    return 'unauthorized';
  }
  if (m.includes('forbidden') || m.includes('403') || m.includes('permission') || m.includes('row-level security')) {
    return 'forbidden';
  }
  if (m.includes('not found') || m.includes('404') || m.includes('no rows')) return 'not_found';
  if (m.includes('duplicate') || m.includes('conflict') || m.includes('already exists') || m.includes('409')) {
    return 'conflict';
  }
  if (m.includes("didn't look like food") || m.includes('did not look like food')) return 'not_food';
  if (m.includes("isn't available yet") || m.includes('coming soon') || m.includes('not implemented')) {
    return 'unavailable';
  }
  if (m.includes('invalid') || m.includes('required') || m.includes('must be') || m.includes('validation')) {
    return 'validation';
  }
  if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('server error') || m.includes('internal')) {
    return 'server_error';
  }
  return 'unknown';
}
