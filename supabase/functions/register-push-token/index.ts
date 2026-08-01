import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Register (or refresh) the calling device's Expo push token ───────────────
// Called once the mobile app has permission and Notifications.getExpoPushTokenAsync()
// resolves. user_id comes exclusively from the verified JWT, matching every
// other Edge Function's security model — the body never carries an id.
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

    const { expo_push_token, platform } = await req.json()
    if (!expo_push_token || typeof expo_push_token !== 'string') {
      return json({ error: 'expo_push_token is required' }, 400)
    }
    if (platform !== 'ios' && platform !== 'android') {
      return json({ error: "platform must be 'ios' or 'android'" }, 400)
    }

    const { error: upsertError } = await supabase
      .from('device_push_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' }
      )
    if (upsertError) throw new Error(`Token upsert failed: ${upsertError.message}`)

    return json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register push token'
    return json({ error: message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
