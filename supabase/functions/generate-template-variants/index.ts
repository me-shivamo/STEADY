import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMINDER_TYPES = ['workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine']

const REMINDER_CONTEXT: Record<string, string> = {
  workout: 'a workout reminder. May use {{streak_days}} for the user\'s current logging streak.',
  meal: "a reminder to log a meal (food/calories). May use {{streak_days}}.",
  water: 'a reminder to drink water / log water intake. May use {{streak_days}}.',
  walking: 'a reminder to go for a walk. May use {{streak_days}}.',
  weight: 'a reminder to log today\'s body weight. May use {{streak_days}}.',
  healthLog: 'a reminder to update a general health log. May use {{streak_days}}.',
  medicine: 'a reminder to take medicine. Do NOT use {{streak_days}} here — streaks are for tracking habits, not medical adherence.',
}

// ── Generate AI copy variants for a reminder template (ADMIN ONLY) ───────────
// Called from the admin dashboard's "Generate variants" button. The AI is
// only ever invoked here, offline/on-demand — the actual per-user send path
// (send-scheduled-notifications) just interpolates whichever variant this
// function already saved, so sending stays instant and has no per-send LLM
// cost or latency.
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

    // Admin-only: verify the caller's own profile has is_admin = true. The
    // JWT proves *who* is calling, not that they're allowed to — that's a
    // separate check against their row, same principle as RLS but done
    // explicitly here since this table has no permissive RLS policies at all.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError || !profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const { reminder_type, count = 5 } = await req.json()
    if (!REMINDER_TYPES.includes(reminder_type)) {
      return json({ error: `reminder_type must be one of: ${REMINDER_TYPES.join(', ')}` }, 400)
    }

    const variants = await generateVariants(reminder_type, count)

    const rows = variants.map((variant_text: string) => ({
      reminder_type,
      variant_text,
      is_ai_generated: true,
      active: true,
    }))
    const { data: inserted, error: insertError } = await supabase
      .from('notification_templates')
      .insert(rows)
      .select()
    if (insertError) throw new Error(`Template insert failed: ${insertError.message}`)

    return json({ templates: inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate template variants'
    return json({ error: message }, 500)
  }
})

async function generateVariants(reminderType: string, count: number): Promise<string[]> {
  const prompt = `Write ${count} short, varied push-notification messages for ${REMINDER_CONTEXT[reminderType]}
Each should be under 100 characters, friendly and motivating, no more than one emoji.
Return ONLY a JSON array of strings, nothing else.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`)

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Model did not return a JSON array')

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new Error('Model response was not an array of strings')
  }
  return parsed
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
