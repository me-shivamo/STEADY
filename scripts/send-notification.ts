// ── Send a push notification from outside the app ────────────────────────────
// A command-line front end for the admin-send-notification Edge Function, so
// notifications can be sent to real users without an admin dashboard existing
// yet and without touching the app itself.
//
// The thing worth internalising: sending a notification is a purely
// server-side act. The chain is
//   this script → admin-send-notification (Supabase) → Expo Push API → FCM/APNs → phone
// The installed app is only a *receiver* holding a push token. So new
// notifications, new copy, and one-off broadcasts never require a Play Store
// release — the app on the user's phone can be months old and still receive
// whatever we send today.
//
// AUTH: two different keys are needed, for two different reasons.
//   - Sending requires a real *user* JWT belonging to an account with
//     profiles.is_admin = true, because the Edge Function calls
//     supabase.auth.getUser() on it and then checks that flag. A service-role
//     key would NOT work here — it isn't a user token, so getUser() rejects it.
//     Hence the email/password login below.
//   - Listing templates requires the service-role key, because
//     notification_templates has RLS enabled with zero policies
//     (deny-by-default, migration 013) — nothing but service_role can read it.
//
// Run:
//   # See what you can send
//   EXPO_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/send-notification.ts --list
//
//   # Send to EVERY user with 'meal' reminders enabled
//   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//     npx tsx scripts/send-notification.ts --type meal --template <template-id>
//
//   # Send to ONE user (safe way to test before broadcasting)
//   ... --type meal --template <template-id> --user <user-uuid>
//
// Every send is written to notification_log (sent/failed + error), so the
// delivery record is queryable afterwards rather than living only in stdout.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const REMINDER_TYPES = ['workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// Lists every active template with its id, so you can pick one to send.
// Reads the table directly with the service-role key (see AUTH note above).
async function listTemplates(): Promise<void> {
  if (!SERVICE_ROLE_KEY) {
    die('--list needs SUPABASE_SERVICE_ROLE_KEY (notification_templates is service-role only).');
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_templates?active=eq.true&select=id,reminder_type,variant_text&order=reminder_type`,
    { headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) die(`Template lookup failed (${res.status}): ${await res.text()}`);

  const rows = (await res.json()) as { id: string; reminder_type: string; variant_text: string }[];
  if (rows.length === 0) die('No active templates. Run migration 026 to seed them.');

  let current = '';
  for (const row of rows) {
    if (row.reminder_type !== current) {
      current = row.reminder_type;
      console.log(`\n${current}`);
    }
    console.log(`  ${row.id}  ${row.variant_text}`);
  }
  console.log(`\n${rows.length} active templates.\n`);
}

// Exchanges the admin's email/password for an access token (a JWT). This is
// the same grant the mobile app uses at login — the Edge Function can't tell
// the difference, which is the point: it authorises the *person*, not the tool.
async function adminAccessToken(): Promise<string> {
  if (!ANON_KEY) die('Sending needs EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) die('Sending needs ADMIN_EMAIL and ADMIN_PASSWORD.');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) die(`Admin login failed (${res.status}): ${await res.text()}`);

  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) die('Login returned no access token.');
  return access_token;
}

async function send(): Promise<void> {
  const reminderType = arg('type');
  const templateId = arg('template');
  const targetUserId = arg('user');

  if (!reminderType) die(`--type is required (one of: ${REMINDER_TYPES.join(', ')})`);
  if (!REMINDER_TYPES.includes(reminderType)) {
    die(`Unknown --type "${reminderType}". Must be one of: ${REMINDER_TYPES.join(', ')}`);
  }
  if (!templateId) die('--template <id> is required. Run with --list to see the ids.');

  const token = await adminAccessToken();

  // No --user means "everyone with this reminder_type enabled". Say so out
  // loud before doing it — this is the one flag that turns a test into a
  // broadcast, and the difference is a single word on the command line.
  console.log(
    targetUserId
      ? `\nSending '${reminderType}' to user ${targetUserId}...`
      : `\nBROADCAST: sending '${reminderType}' to EVERY user with that reminder enabled...`
  );

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-send-notification`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: templateId,
      reminder_type: reminderType,
      ...(targetUserId ? { target_user_id: targetUserId } : {}),
    }),
  });

  const body = await res.json();
  if (!res.ok) die(`Send failed (${res.status}): ${JSON.stringify(body)}`);

  // `failed` counts users with no registered device as well as genuine push
  // rejections — both are already recorded in notification_log with a reason.
  const { targeted, sent, failed } = body as { targeted: number; sent: number; failed: number };
  console.log(`\n✓ targeted ${targeted} · sent ${sent} · failed ${failed}`);
  if (failed > 0) {
    console.log('  Check notification_log for the per-user reason (usually "No registered device").');
  }
  console.log('');
}

async function main(): Promise<void> {
  if (!SUPABASE_URL) die('EXPO_PUBLIC_SUPABASE_URL is required.');
  if (process.argv.includes('--list')) return listTemplates();
  return send();
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
