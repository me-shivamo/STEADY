import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const WINDOW_MINUTES = 5 // must match the pg_cron schedule in migration 013

interface DueReminder {
  user_id: string
  reminder_type: string
  local_time: string // "HH:mm", the matched entry from `times`
  local_date: string // "YYYY-MM-DD", the user's own calendar day (their timezone, not the server's)
}

// ── Scheduled push sender ─────────────────────────────────────────────────────
// Invoked only by the pg_cron heartbeat (migration 013), never by a client —
// so it authenticates with the service-role key directly rather than
// verifying a caller's JWT, same as how delete-account treats its own
// service-role client as fully trusted once instantiated.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const dueReminders = await findDueReminders(supabase)
    let sent = 0
    let failed = 0

    for (const reminder of dueReminders) {
      try {
        if (await alreadySatisfied(supabase, reminder)) continue

        const token = await getPushToken(supabase, reminder.user_id)
        if (!token) continue // no registered device — nothing to send to

        const template = await pickTemplate(supabase, reminder.reminder_type)
        const body = await interpolate(supabase, template, reminder)

        const pushResult = await sendExpoPush(token, body)
        await logNotification(supabase, reminder, template?.id ?? null, pushResult)
        pushResult.ok ? sent++ : failed++
      } catch (err) {
        failed++
        await logNotification(supabase, reminder, null, {
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown send error',
        })
      }
    }

    return json({ checked: dueReminders.length, sent, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scheduled send failed'
    return json({ error: message }, 500)
  }
})

// Find every enabled (user, reminder_type) row where at least one of its
// `times` entries matches "now" in that user's own timezone, within the
// current 5-minute window. The AT TIME ZONE conversion happens inside
// Postgres (which has the full IANA tz database) rather than in JS, so DST
// and half-hour offsets (e.g. Asia/Kolkata, UTC+5:30) are handled correctly
// without hand-rolled offset math.
async function findDueReminders(supabase: ReturnType<typeof createClient>): Promise<DueReminder[]> {
  const { data, error } = await supabase.rpc('find_due_reminders', {
    window_minutes: WINDOW_MINUTES,
  })
  if (error) throw new Error(`find_due_reminders failed: ${error.message}`)
  return (data ?? []) as DueReminder[]
}

// "Did the underlying condition already happen today" check — e.g. a meal
// reminder shouldn't fire if the user already logged a meal today. Only
// 'meal' and 'water' have a real condition for v1; other types always fire.
async function alreadySatisfied(
  supabase: ReturnType<typeof createClient>,
  reminder: DueReminder
): Promise<boolean> {
  // reminder.local_date is the user's own calendar day, computed in Postgres
  // via AT TIME ZONE (see find_due_reminders) — using server UTC "today" here
  // would undo that correctness, e.g. checking "already logged" against the
  // wrong day for anyone whose local date has already rolled over (or hasn't
  // yet) relative to the server's UTC clock.
  if (reminder.reminder_type === 'meal') {
    const { data } = await supabase
      .from('food_entries')
      .select('id, meal_logs!inner(logged_date)')
      .eq('user_id', reminder.user_id)
      .eq('meal_logs.logged_date', reminder.local_date)
      .limit(1)
    return !!data && data.length > 0
  }
  if (reminder.reminder_type === 'water') {
    const { data } = await supabase
      .from('water_logs')
      .select('id')
      .eq('user_id', reminder.user_id)
      .eq('logged_date', reminder.local_date)
      .limit(1)
    return !!data && data.length > 0
  }
  return false
}

async function getPushToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('device_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.expo_push_token ?? null
}

interface Template {
  id: string
  variant_text: string
}

async function pickTemplate(
  supabase: ReturnType<typeof createClient>,
  reminderType: string
): Promise<Template | null> {
  const { data } = await supabase
    .from('notification_templates')
    .select('id, variant_text')
    .eq('reminder_type', reminderType)
    .eq('active', true)
  if (!data || data.length === 0) return null
  return data[Math.floor(Math.random() * data.length)] as Template
}

const FALLBACK_TEXT: Record<string, string> = {
  workout: "Time for your workout — let's go!",
  meal: "Don't forget to log your meal today.",
  water: 'Stay hydrated — log some water.',
  walking: 'Time for a walk!',
  weight: 'Log your weight for today.',
  healthLog: 'Update your health log.',
  medicine: 'Time to take your medicine.',
}

async function interpolate(
  supabase: ReturnType<typeof createClient>,
  template: Template | null,
  reminder: DueReminder
): Promise<string> {
  let text = template?.variant_text ?? FALLBACK_TEXT[reminder.reminder_type] ?? 'Reminder from STEADY'

  if (text.includes('{{streak_days}}')) {
    const { data } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', reminder.user_id)
      .maybeSingle()
    text = text.replaceAll('{{streak_days}}', String(data?.current_streak ?? 0))
  }

  return text
}

async function sendExpoPush(
  token: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title: 'STEADY', body, sound: 'default' }),
  })
  const result = await res.json()
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data
  if (ticket?.status === 'error') {
    return { ok: false, error: ticket.message ?? 'Expo push rejected' }
  }
  return { ok: true }
}

async function logNotification(
  supabase: ReturnType<typeof createClient>,
  reminder: DueReminder,
  templateId: string | null,
  result: { ok: boolean; error?: string }
) {
  await supabase.from('notification_log').insert({
    user_id: reminder.user_id,
    reminder_type: reminder.reminder_type,
    template_id: templateId,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.error ?? null,
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
