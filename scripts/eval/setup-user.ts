// ── One-time eval test-user provisioner ───────────────────────────────────────
// Creates a dedicated throwaway auth user so scripts/eval/run-http.ts can call
// the REAL deployed edge function over HTTP (supabase.functions.invoke needs a
// genuine logged-in session — the service-role key alone can't act as "a user").
// Writes the session to scripts/eval/.eval-session.json (git-ignored) so
// run-http.ts doesn't need to re-auth on every run.
//
// Run: npx tsx scripts/eval/setup-user.ts

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '.env.local') })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const EVAL_EMAIL = 'eval-test@steadyapp.internal'
const EVAL_PASSWORD = randomUUID() // never needs to be remembered — only used once, right below

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  // Reuse the user if setup already ran before (idempotent).
  const { data: existing } = await admin.auth.admin.listUsers()
  let userId = existing.users.find((u) => u.email === EVAL_EMAIL)?.id

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EVAL_EMAIL,
      password: EVAL_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
    console.log('Created eval user:', userId)
  } else {
    // Reset password since we don't persist the original.
    const { error } = await admin.auth.admin.updateUserById(userId, { password: EVAL_PASSWORD })
    if (error) throw error
    console.log('Reusing existing eval user:', userId)
  }

  // Mark onboarding complete so the edge function's coaching tools (which
  // read profile fields) have something sane to work with, and set a plain
  // vegetarian-free, no-restriction profile so no dietary filter interferes
  // with test food matching.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ onboarding_complete: true, calorie_goal: 2000 })
    .eq('id', userId)
  if (profileErr) console.warn('profile update warning:', profileErr.message)

  // Sign in as that user with the anon client to get a real access token,
  // exactly like the app does after login.
  const anonKey = await getAnonKey()
  const client = createClient(SUPABASE_URL, anonKey)
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({
    email: EVAL_EMAIL,
    password: EVAL_PASSWORD,
  })
  if (signInErr) throw signInErr

  writeFileSync(
    join(__dirname, '.eval-session.json'),
    JSON.stringify({ userId, accessToken: session.session!.access_token }, null, 2),
  )
  console.log('Session written to scripts/eval/.eval-session.json')
}

// SUPABASE_URL + anon key: the eval .env.local only has the service-role key,
// but signing in as a real user needs the anon key (same as the app's own
// EXPO_PUBLIC_SUPABASE_ANON_KEY) — read it from the project's own .env,
// which already has it for the Expo client.
async function getAnonKey(): Promise<string> {
  const dotenv = await import('dotenv')
  const parsed = dotenv.config({ path: join(__dirname, '..', '..', '.env') }).parsed
  const key = parsed?.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY not found in project .env')
  return key
}

main().catch((err) => {
  console.error('setup-user failed:', err)
  process.exit(1)
})
