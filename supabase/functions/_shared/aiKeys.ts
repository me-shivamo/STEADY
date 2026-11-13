// Which OpenRouter key a request bills.
//
// WHY THIS EXISTS: on 2026-11-13 our own evaluation runs drained the live app's
// OpenRouter key (it carries a $1/month cap), and every real user's food log failed
// with a 500 for about seven minutes. Eval runs go through the deployed functions
// as the internal eval account, so they shared production's key and its budget.
//
// The rule: a request from the eval account (email ending @steadyapp.internal)
// bills OPENROUTER_EVAL_API_KEY when that secret is set. Everyone else, and the
// eval account when the secret is unset, bills the normal key. A drained eval key
// therefore fails the tests, never a real user's meal.
//
// Pure (the environment is passed in) so jest can test it without Deno.

export const EVAL_EMAIL_SUFFIX = '@steadyapp.internal'

export function isEvalAccount(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(EVAL_EMAIL_SUFFIX)
}

export function openRouterKeyFor(
  kind: 'text' | 'image',
  email: string | null | undefined,
  env: (name: string) => string | undefined,
): string {
  if (isEvalAccount(email)) {
    const evalKey = env('OPENROUTER_EVAL_API_KEY')
    if (evalKey) return evalKey
  }
  return env(kind === 'image' ? 'OPENROUTER_IMAGE_API_KEY' : 'OPENROUTER_API_KEY') ?? ''
}
