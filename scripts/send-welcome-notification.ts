// ── One-off welcome push, outside the reminder system ────────────────────────
// Sends an arbitrary title/body to named users. This exists because STEADY's
// notification platform is *reminder*-shaped and a welcome message isn't a
// reminder:
//
//   notification_templates.reminder_type has a CHECK constraint pinning it to
//   ('workout','meal','water','walking','weight','healthLog','medicine')
//   (migration 013). There is no 'welcome'. So the existing
//   admin-send-notification path — which can only send a *stored template* —
//   would force us to either mislabel this as a 'meal' reminder (which would
//   quietly corrupt every future "how many meal reminders did we send?"
//   query against notification_log) or run a migration to widen the CHECK,
//   which is a lot of schema churn for a message going to two people.
//
//   The way out: notification_log.reminder_type is plain TEXT with NO CHECK,
//   and template_id is nullable. So a template-free send can still be logged
//   honestly as 'welcome' with zero schema change.
//
// The delivery chain is identical to the scheduled sender —
//   this script → Expo Push API → FCM/APNs → phone
// — we're just skipping the template lookup and interpolation steps.
//
// AUTH: needs SUPABASE_SERVICE_ROLE_KEY, and only that. Two reasons:
//   - device_push_tokens is RLS'd to `auth.uid() = user_id`, so a user token
//     can only ever read its *own* push token. Reading someone else's requires
//     bypassing RLS, which is what the service-role key does.
//   - resolving "saket" to a user id means reading profiles/auth.users across
//     accounts, same story.
// Unlike send-notification.ts this does NOT need an admin login, because it
// never calls an Edge Function — there's no server-side is_admin gate to
// satisfy. Possession of the service-role key IS the authorisation.
//
// Run:
//   # See who matches before sending anything
//   EXPO_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/send-welcome-notification.ts --to saket --to shivam --dry-run
//
//   # Actually send
//   EXPO_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/send-welcome-notification.ts --to saket --to shivam
//
//   # Custom copy
//   ... --to saket --title "Welcome to STEADY" --body "Snap your first meal."
//
// --to accepts a user UUID, an email address, or a (partial) full name. An
// ambiguous name is a hard error listing the candidates rather than a guess —
// sending a push to the wrong person is not undoable.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Logged against notification_log.reminder_type. Deliberately NOT one of the
// seven reminder types — this message is not a reminder, and the log should
// say so.
const LOG_TYPE = 'welcome';

const DEFAULT_TITLE = 'Welcome to STEADY 👋';
const DEFAULT_BODY = "You're in. Snap a photo of your first meal and we'll handle the macros.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Recipient = { id: string; label: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// --to is repeatable, so collect every occurrence rather than just the first.
function argAll(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) values.push(process.argv[i + 1]);
  });
  return values;
}

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function rest(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) die(`Query failed (${res.status}) on ${path}: ${await res.text()}`);
  return res.json();
}

// auth.users isn't exposed over PostgREST — emails live behind the Auth Admin
// API instead. Paginated, so walk until a short page comes back.
async function allAuthUsers(): Promise<{ id: string; email?: string }[]> {
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) die(`Auth user lookup failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { users?: { id: string; email?: string }[] };
    const batch = body.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

// Prints every account with a name or email, so you can find the right
// identifier without opening the Supabase dashboard.
async function listUsers(): Promise<void> {
  const [profiles, authUsers] = await Promise.all([
    rest('profiles?select=id,full_name,onboarding_complete&order=created_at') as Promise<
      { id: string; full_name: string | null; onboarding_complete: boolean | null }[]
    >,
    allAuthUsers(),
  ]);
  const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? '']));

  console.log('');
  for (const p of profiles) {
    const name = p.full_name ?? '(no name)';
    console.log(`  ${p.id}  ${name.padEnd(24)}  ${emailById.get(p.id) ?? ''}`);
  }
  console.log(`\n${profiles.length} accounts.\n`);
}

// UUID → use as-is. Contains '@' → match on auth email. Otherwise → substring
// match on profiles.full_name. Ambiguity is fatal, never resolved by guessing.
async function resolve(needle: string): Promise<Recipient> {
  if (UUID_RE.test(needle)) return { id: needle, label: needle };

  if (needle.includes('@')) {
    const matches = (await allAuthUsers()).filter(
      (u) => (u.email ?? '').toLowerCase() === needle.toLowerCase()
    );
    if (matches.length === 0) die(`No account with email "${needle}".`);
    return { id: matches[0].id, label: needle };
  }

  const rows = (await rest(
    `profiles?select=id,full_name&full_name=ilike.*${encodeURIComponent(needle)}*`
  )) as { id: string; full_name: string | null }[];

  if (rows.length === 0) {
    die(`No profile whose full_name contains "${needle}". Run with --list-users to see accounts.`);
  }
  if (rows.length > 1) {
    const candidates = rows.map((r) => `    ${r.id}  ${r.full_name ?? ''}`).join('\n');
    die(`"${needle}" is ambiguous — ${rows.length} profiles match:\n${candidates}\n  Re-run with the exact UUID.`);
  }
  return { id: rows[0].id, label: rows[0].full_name ?? rows[0].id };
}

async function newestToken(userId: string): Promise<string | null> {
  const rows = (await rest(
    `device_push_tokens?select=expo_push_token,platform,updated_at&user_id=eq.${userId}&order=updated_at.desc&limit=1`
  )) as { expo_push_token: string }[];
  return rows[0]?.expo_push_token ?? null;
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
  const result = await res.json();
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
  if (ticket?.status === 'error') return { ok: false, error: ticket.message ?? 'Expo push rejected' };
  return { ok: true };
}

// Mirrors the Edge Function's logNotification so a manual send shows up in the
// same delivery record as a scheduled one.
async function logNotification(
  userId: string,
  result: { ok: boolean; error?: string }
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      reminder_type: LOG_TYPE,
      template_id: null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error ?? null,
    }),
  });
}

async function main(): Promise<void> {
  if (!SUPABASE_URL) die('EXPO_PUBLIC_SUPABASE_URL is required.');
  if (!SERVICE_ROLE_KEY) {
    die('SUPABASE_SERVICE_ROLE_KEY is required (device_push_tokens is RLS-protected per user).');
  }

  if (process.argv.includes('--list-users')) return listUsers();

  const targets = argAll('to');
  if (targets.length === 0) {
    die('At least one --to <uuid|email|name> is required. Use --list-users to see accounts.');
  }

  const title = arg('title') ?? DEFAULT_TITLE;
  const body = arg('body') ?? DEFAULT_BODY;
  const dryRun = process.argv.includes('--dry-run');

  const recipients: Recipient[] = [];
  for (const t of targets) recipients.push(await resolve(t));

  console.log(`\n  title: ${title}\n  body:  ${body}\n`);

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const token = await newestToken(r.id);

    if (!token) {
      // Almost always means the person has only ever run the app in Expo Go,
      // which cannot receive remote push as of SDK 53 — see pushNotifications.ts.
      failed++;
      console.log(`  ✗ ${r.label} — no registered device`);
      if (!dryRun) await logNotification(r.id, { ok: false, error: 'No registered device' });
      continue;
    }

    if (dryRun) {
      console.log(`  · ${r.label} — would send to ${token.slice(0, 24)}…`);
      continue;
    }

    const result = await sendExpoPush(token, title, body);
    await logNotification(r.id, result);
    if (result.ok) {
      sent++;
      console.log(`  ✓ ${r.label}`);
    } else {
      failed++;
      console.log(`  ✗ ${r.label} — ${result.error}`);
    }
  }

  console.log(
    dryRun
      ? `\nDry run — nothing sent. Drop --dry-run to send.\n`
      : `\n✓ sent ${sent} · failed ${failed}  (recorded in notification_log as '${LOG_TYPE}')\n`
  );
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
