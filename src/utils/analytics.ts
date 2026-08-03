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
  };
  meal_log_failed: { source: LogSource; reason: ErrorReason };
  // The text Edge Function answered a nutrition question instead of logging.
  ai_question_answered: { water_logged: boolean };
  meal_edited: { item_count: number };
  meal_edit_failed: { reason: ErrorReason };
  meal_deleted: NoProps;
  food_entry_deleted: NoProps;
  meal_macros_adjusted: { entries_changed: number };
  meal_datetime_changed: { moved_to_different_day: boolean };
  meal_saved_as_entry: { item_count: number };
  saved_entry_logged: { item_count: number };
  saved_entry_deleted: NoProps;
  saved_entries_opened: { saved_count: number };
  chat_message_sent: { length_bucket: string };

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

// ── Error classification ──────────────────────────────────────────────────
// Maps any thrown value onto the closed `ErrorReason` union. This is the only
// path by which failures are allowed into analytics — raw `err.message` from
// the food Edge Functions frequently embeds the user's own meal text, so it
// must never be captured verbatim.
export function errorReason(err: unknown): ErrorReason {
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
