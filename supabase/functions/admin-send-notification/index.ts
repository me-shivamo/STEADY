import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// ── Manual / targeted send (ADMIN ONLY) ───────────────────────────────────────
// Called from the admin dashboard's Send page: either one specific user, or
// every user with a given reminder_type enabled. Shares the same
// interpolate → Expo push → log flow as send-scheduled-notifications, just
// triggered on demand instead of by the pg_cron heartbeat.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError || !profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const { template_id, reminder_type, target_user_id } = await req.json()
    if (!template_id) return json({ error: 'template_id is required' }, 400)
    if (!reminder_type) return json({ error: 'reminder_type is required' }, 400)

    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('id, variant_text')
      .eq('id', template_id)
      .maybeSingle()
    if (templateError || !template) return json({ error: 'Template not found' }, 404)

    // Target either one user, or everyone with this reminder_type enabled.
    let targetUserIds: string[]
    if (target_user_id) {
      targetUserIds = [target_user_id]
    } else {
      const { data: prefs, error: prefsError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('reminder_type', reminder_type)
        .eq('enabled', true)
      if (prefsError) throw new Error(`Preference lookup failed: ${prefsError.message}`)
      targetUserIds = (prefs ?? []).map((p) => p.user_id)
    }

    let sent = 0
    let failed = 0

    for (const userId of targetUserIds) {
      try {
        const { data: tokenRow } = await supabase
          .from('device_push_tokens')
          .select('expo_push_token')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!tokenRow?.expo_push_token) {
          failed++
          await logNotification(supabase, userId, reminder_type, template.id, {
            ok: false,
            error: 'No registered device',
          })
          continue
        }

        const body = await interpolate(supabase, template.variant_text, userId)
        const result = await sendExpoPush(tokenRow.expo_push_token, body)
        await logNotification(supabase, userId, reminder_type, template.id, result)
        result.ok ? sent++ : failed++
      } catch (err) {
        failed++
        await logNotification(supabase, userId, reminder_type, template.id, {
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown send error',
        })
      }
    }

    return json({ targeted: targetUserIds.length, sent, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manual send failed'
    return json({ error: message }, 500)
  }
})

async function interpolate(
  supabase: ReturnType<typeof createClient>,
  variantText: string,
  userId: string
): Promise<string> {
  let text = variantText
  if (text.includes('{{streak_days}}')) {
    const { data } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', userId)
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
  userId: string,
  reminderType: string,
  templateId: string | null,
  result: { ok: boolean; error?: string }
) {
  await supabase.from('notification_log').insert({
    user_id: userId,
    reminder_type: reminderType,
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
