import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Delete the CALLING user's account and all their data ─────────────────────
// Security model: the user id comes exclusively from the verified JWT in the
// Authorization header — the request body is ignored entirely, so nobody can
// delete anyone but themselves.
//
// Deletion order matters:
//   1. Storage photos — Storage objects live outside the Postgres FK graph, so
//      the cascade below would leave them orphaned forever.
//   2. auth.users row — ON DELETE CASCADE wipes profiles and every user table.
//      (food_items.created_by is SET NULL instead — shared cache rows survive,
//      see migration 010.)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ success: false, error: 'Missing authorization token' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Ask the auth server whose token this is — never trust a client-sent id.
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return json({ success: false, error: 'Invalid or expired token' }, 401)
    }
    const userId = userData.user.id

    // 1. Empty the user's meal-photos folder. list() pages at 100, so loop.
    while (true) {
      const { data: files, error: listErr } = await admin.storage
        .from('meal-photos')
        .list(userId, { limit: 100 })
      if (listErr) throw new Error(`Storage list failed: ${listErr.message}`)
      if (!files || files.length === 0) break

      const paths = files.map((f) => `${userId}/${f.name}`)
      const { error: removeErr } = await admin.storage.from('meal-photos').remove(paths)
      if (removeErr) throw new Error(`Storage delete failed: ${removeErr.message}`)

      if (files.length < 100) break
    }

    // 2. Delete the auth user — cascades through profiles into every user table.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) throw new Error(`Auth delete failed: ${deleteErr.message}`)

    return json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account deletion failed'
    return json({ success: false, error: message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
