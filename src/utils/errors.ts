import type { ErrorReason } from './analytics';

/**
 * The single place where a thrown value becomes text a user is allowed to see.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, 14 different screens did some variant of
 *
 *     setErrorText(err.message ?? 'Something went wrong')
 *
 * The `??` fallback reads like a safety net but never fires: every realistic
 * throw already carries a non-empty `.message`, so the fallback copy was dead
 * code and the raw text always won. What users actually saw on screen:
 *
 *   "Edge Function returned a non-2xx status code"          (FunctionsHttpError)
 *   "duplicate key value violates unique constraint ..."    (PostgrestError)
 *   "DEVELOPER_ERROR: Follow troubleshooting instructions"  (Google Sign-In)
 *   "new row violates row-level security policy for ..."    (Postgres RLS)
 *
 * Those strings are diagnostics, not communication. Worse, the food Edge
 * Functions echo the user's own meal text back inside error messages, so
 * rendering `.message` could surface personal data in an error banner.
 *
 * WHY CLASSIFY ON TYPE, NOT ON TEXT
 * ---------------------------------
 * The obvious approach — grep the message for "network", "401", etc. — is what
 * `errorReason()` in analytics.ts originally did, and it reports 'unknown' for
 * essentially every Edge Function failure, because supabase-js compresses all
 * of them into the single opaque sentence above. There is no status code in the
 * text to match on.
 *
 * The status code IS available, just not in `.message`: FunctionsHttpError
 * carries the whole `Response` on `.context`, and PostgrestError carries a
 * SQLSTATE on `.code`. Branching on those is both exact and cheap. Message
 * sniffing stays only as the last resort, for errors we throw ourselves as
 * plain strings.
 *
 * Mental model: this is the boundary layer between "machine failure" and "human
 * explanation", the same way a controller maps an exception to an HTTP status
 * in a server codebase. Nothing above it should ever touch `.message`.
 */

/** SQLSTATE codes worth distinguishing. Postgres groups by the first two chars. */
const PG_CODE_MAP: Record<string, ErrorReason> = {
  '42501': 'forbidden', // insufficient_privilege — an RLS policy said no
  '23505': 'conflict', // unique_violation
  '23503': 'validation', // foreign_key_violation
  '23502': 'validation', // not_null_violation
  '22P02': 'validation', // invalid_text_representation
  PGRST301: 'unauthorized', // PostgREST: JWT expired
};

function statusToReason(status: number): ErrorReason {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'validation';
  return 'unknown';
}

/**
 * Maps a thrown value onto the closed ErrorReason union, preferring structured
 * fields over message text. Never throws — a classifier that can fail would
 * turn an error path into a crash.
 */
export function classify(err: unknown): ErrorReason {
  if (err == null) return 'unknown';

  const e = err as Record<string, any>;

  // supabase-js function errors. Checked by constructor name rather than
  // `instanceof` so this file doesn't need to import from @supabase/supabase-js
  // (which would pull the client into every screen that shows an error).
  const ctor = e?.constructor?.name;
  if (ctor === 'FunctionsFetchError') return 'network';
  if (ctor === 'FunctionsRelayError') return 'server_error';
  if (ctor === 'FunctionsHttpError') {
    const status = e?.context?.status;
    if (typeof status === 'number') return statusToReason(status);
    return 'server_error';
  }

  // A status we attached ourselves at the invoke site.
  if (typeof e?.status === 'number') return statusToReason(e.status);

  // PostgrestError — SQLSTATE, or PostgREST's own PGRST* codes.
  if (typeof e?.code === 'string' && PG_CODE_MAP[e.code]) return PG_CODE_MAP[e.code];

  // Google Sign-In native status codes. The library exports numeric-ish string
  // codes; 10 is DEVELOPER_ERROR (package name / SHA-1 not authorised), 12501
  // is the user backing out of the picker, 7 is a network failure.
  if (typeof e?.code === 'string' || typeof e?.code === 'number') {
    const c = String(e.code);
    if (c === '12501' || c === '-5') return 'validation'; // cancelled — caller should special-case
    if (c === '7') return 'network';
    if (c === '10') return 'server_error'; // misconfiguration, not the user's fault
  }

  // Last resort: substring matching, for errors thrown as plain strings by our
  // own code. Kept narrow on purpose — this branch is the one that gets things
  // wrong, so anything reaching it is effectively unclassified.
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(e?.message ?? '');
  const m = raw.toLowerCase();
  if (!m) return 'unknown';
  if (m.includes('network') || m.includes('fetch failed') || m.includes('offline')) return 'network';
  if (m.includes('timeout') || m.includes('timed out') || m.includes('aborted')) return 'timeout';
  // Supabase auth rate limits arrive as AuthApiError with status 429, caught
  // above — this covers hand-thrown and non-standard shapes, where telling the
  // user to wait is genuinely more useful than a generic apology.
  if (m.includes('rate limit') || m.includes('too many requests')) return 'rate_limited';
  if (m.includes("didn't look like food") || m.includes('did not look like food')) return 'not_food';
  if (m.includes("isn't available yet") || m.includes('coming soon')) return 'unavailable';
  // NOTE: deliberately no branch for auth messages like "Invalid login
  // credentials". Those must collapse into the context fallback so a wrong
  // password and a non-existent account produce identical copy — otherwise the
  // screen becomes an account-enumeration oracle.
  return 'unknown';
}

/**
 * What kind of action failed. Lets one reason produce copy that fits the
 * context — a 404 while deleting reads very differently from a 404 while
 * loading, even though the underlying failure is identical.
 */
export type ErrorContext =
  | 'generic'
  | 'signIn'
  | 'signUp'
  | 'logMeal'
  | 'editMeal'
  | 'deleteMeal'
  | 'saveProfile'
  | 'group';

const CONTEXT_FALLBACK: Record<ErrorContext, string> = {
  generic: "Something went wrong. Please try again.",
  signIn: "We couldn't sign you in. Please try again.",
  signUp: "We couldn't create your account. Please try again.",
  logMeal: "We couldn't log that meal. Please try again.",
  editMeal: "We couldn't update that meal. Please try again.",
  deleteMeal: "We couldn't delete that meal. Please try again.",
  saveProfile: "We couldn't save your changes. Please try again.",
  group: "Something went wrong with that group. Please try again.",
};

/**
 * Turns any thrown value into a sentence safe to render.
 *
 * Always logs the original to the console first: the whole point is that the
 * user stops seeing the raw error, NOT that we stop being able to debug it. In
 * release builds this reaches `adb logcat`, which is how the Google Sign-In
 * DEVELOPER_ERROR gets diagnosed without leaking it into the UI.
 */
export function toUserMessage(err: unknown, context: ErrorContext = 'generic'): string {
  console.error(`[${context}]`, err);

  const reason = classify(err);

  switch (reason) {
    case 'network':
      return "You appear to be offline. Check your connection and try again.";
    case 'timeout':
      return "That took too long. Please try again.";
    case 'rate_limited':
      return "You've made a lot of requests just now. Please wait a moment and try again.";
    case 'unauthorized':
      return "Your session has expired. Please sign in again.";
    case 'forbidden':
      return "You don't have permission to do that.";
    case 'not_found':
      return "We couldn't find that any more. It may have already been removed.";
    case 'conflict':
      return "That already exists.";
    case 'not_food':
      return "That didn't look like food. Try describing what you ate.";
    case 'unavailable':
      return "That isn't available yet.";
    case 'server_error':
    case 'validation':
    case 'unknown':
    default:
      return CONTEXT_FALLBACK[context];
  }
}

/**
 * True when the failure is the user deliberately backing out (dismissing the
 * Google account picker, cancelling the Play Services update prompt). Callers
 * should show nothing at all in that case — an error banner for an action
 * someone intentionally aborted is its own small bug.
 */
export function isCancellation(err: unknown): boolean {
  const c = String((err as Record<string, any>)?.code ?? '');
  return c === '12501' || c === '-5' || c === 'ERR_CANCELED';
}
