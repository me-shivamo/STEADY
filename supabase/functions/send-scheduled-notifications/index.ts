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
    let capped = 0

    for (const reminder of dueReminders) {
      try {
        if (await alreadySatisfied(supabase, reminder)) continue

        // Frequency gate. The per-day volume cap was REMOVED in migration 045
        // (product decision: in a habit-tracking app, a message worth sending
        // should be sent). What remains here is the 90-minute anti-burst gap,
        // which stops two notifications landing inside one coffee break, plus
        // the dormant carve-out for users we explicitly promised to stop
        // messaging on day 30.
        //
        // One snapshot serves both this decision and the tone choice, so they
        // can never disagree about the same user.
        const state = await loadUserState(supabase, reminder.user_id)

        // Medicine is exempt from every frequency rule, and this is not a
        // nicety. Production showed a user whose 22:00 medication reminder was
        // silently dropped nine nights running: a lunch nudge and a dinner
        // nudge consumed the old 2-per-day cap, and once that was removed the
        // 90-minute anti-burst gap blocked it anyway, because dinner fires at
        // 21:00 and medicine at 22:00 is only 60 minutes later.
        //
        // Missing a meal log is an inconvenience. Missing medication is not the
        // same category of thing, and it should never lose to a nudge about
        // dinner. Everything else still respects the gates.
        const isMedicine = reminder.reminder_type === 'medicine'
        const block = isMedicine ? null : frequencyBlock(state, reminder.user_id)
        if (block !== null) {
          capped++
          // Record the suppression. Previously this path just incremented a
          // counter and moved on, so a reminder blocked every single night for
          // nine days left no trace anywhere and read as "never configured".
          // A silent skip is indistinguishable from a feature that was never
          // switched on.
          await supabase.from('notification_log').insert({
            user_id: reminder.user_id,
            reminder_type: reminder.reminder_type,
            template_id: null,
            status: 'failed',
            error_message: `suppressed: ${block}`,
          })
          continue
        }
        const preferredTone = (state?.preferred_tone as string | null) ?? null

        const device = await getDevice(supabase, reminder.user_id)
        if (!device) continue // no registered device, nothing to send to

        const template = await pickTemplate(supabase, reminder.reminder_type, preferredTone)

        // Clock reminders used to interpolate only {{streak_days}}. They now
        // go through the same interpolateState() the event queue uses, so every
        // variable in build_user_state (first_name, calories_left, streak...)
        // works here too.
        //
        // Medicine gets one extra: the names of the medicines actually due at
        // this time today. "Time for your medicine" cannot answer the only
        // question it raises for someone taking seven of them on four
        // different day-patterns, which is *which one tonight*.
        const vars: Record<string, unknown> = { ...(state ?? {}) }
        if (isMedicine) {
          const { data: meds } = await supabase.rpc('medicines_due_at', {
            p_user: reminder.user_id,
            p_time: reminder.local_time,
          })
          // Never leave the placeholder or an empty gap in a medical
          // notification: fall back to wording that still reads correctly.
          vars.medicine_name = typeof meds === 'string' && meds.length > 0 ? meds : 'Your medicine'
        }

        const body = interpolateState(
          template?.variant_text ?? FALLBACK_TEXT[reminder.reminder_type] ?? 'Reminder from STEADY',
          vars as UserState,
        )
        const title = interpolateState(template?.title ?? 'STEADY', vars as UserState)

        // The id is minted HERE rather than by the database default, because it
        // has to travel out in the push payload so the app can report the open
        // back against this exact row. Inserting first to get an id would mean
        // writing status='sent' before the send actually happened; adding a
        // 'pending' status would mean widening a CHECK constraint. Generating
        // the uuid up front sidesteps both: same value in the payload and in the
        // row, and the row still records the true outcome.
        const logId = crypto.randomUUID()
        // Template columns win when set; the per-reminder-type map is the
        // fallback for rows that predate migration 035.
        const deepLink = template?.deep_link ?? DEEP_LINK[reminder.reminder_type] ?? 'home'

        const pushResult = await sendExpoPush(
          device.token,
          title,
          body,
          {
            log_id: logId,
            deep_link: deepLink,
            // The channel the copy WANTS, kept in the data payload for
            // analytics even when the device can only render 'default'.
            channel: template?.channel ?? 'reminders',
          },
          channelFor(device, template?.channel)
        )

        // A token Expo rejects as DeviceNotRegistered belongs to an uninstalled
        // app and will never work again. Left in place it would be retried every
        // five minutes forever, and would keep counting toward this user's
        // delivery stats as if it were a real recipient.
        if (pushResult.unregistered) {
          await supabase.from('device_push_tokens').delete().eq('expo_push_token', device.token)
          console.log(`Pruned unregistered token for user ${reminder.user_id}.`)
        }
        await logNotification(supabase, reminder, template?.id ?? null, pushResult, logId)
        pushResult.ok ? sent++ : failed++
      } catch (err) {
        failed++
        await logNotification(supabase, reminder, null, {
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown send error',
        })
      }
    }

    const events = await drainEventQueue(supabase)
    const receipts = await pollReceipts(supabase)

    return json({
      checked: dueReminders.length, sent, failed, capped,
      events, receipts,
    })
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
  if (reminder.reminder_type !== 'meal' && reminder.reminder_type !== 'water') return false

  // Guard against the exact regression migration 029 fixes. local_date is
  // supplied by find_due_reminders(); migrations 021 and 022 both dropped that
  // output column while rewriting the function, and because a missing key in JS
  // is `undefined` rather than an error, this check degraded silently into
  // "nobody has ever logged anything" — so every meal and water reminder fired
  // even for users who had already logged. Anything that breaks this contract
  // again should be noisy in the function logs, not invisible.
  if (!reminder.local_date) {
    console.error(
      `alreadySatisfied: local_date missing from find_due_reminders output ` +
      `(user ${reminder.user_id}, type ${reminder.reminder_type}). ` +
      `The RPC signature is out of sync — see migration 029.`
    )
    return false
  }

  // `error` is deliberately read rather than discarded. Discarding it is what
  // turned the bug above into a wrong answer instead of a visible failure: a
  // rejected query yields data = null, and `!!null` reads identically to a
  // legitimate "no rows found".
  const { data, error } =
    reminder.reminder_type === 'meal'
      ? await supabase
          .from('food_entries')
          .select('id, meal_logs!inner(logged_date)')
          .eq('user_id', reminder.user_id)
          .eq('meal_logs.logged_date', reminder.local_date)
          .limit(1)
      : await supabase
          .from('water_logs')
          .select('id')
          .eq('user_id', reminder.user_id)
          .eq('logged_date', reminder.local_date)
          .limit(1)

  // Fail open, but loudly: a broken lookup should not silently switch off every
  // user's reminders (a worse and far harder-to-notice failure than sending one
  // redundant nudge). The console.error is what makes it findable.
  if (error) {
    console.error(
      `alreadySatisfied: ${reminder.reminder_type} lookup failed for user ` +
      `${reminder.user_id} on ${reminder.local_date}: ${error.message}. ` +
      `Sending anyway.`
    )
    return false
  }

  return !!data && data.length > 0
}

// ── Delivery receipts ────────────────────────────────────────────────────────
// Expo answers a push in two stages, and until now we only listened to the
// first. A TICKET means Expo accepted the message into its queue. A RECEIPT,
// fetched separately, is FCM's or APNs' verdict on whether the device actually
// got it. Checking only tickets meant every post-handoff failure was recorded
// as a successful send, so our delivery numbers were confidently wrong.
//
// The prize is DeviceNotRegistered, which is what an uninstalled app looks
// like. It rarely appears in the ticket, because Expo cannot know the app is
// gone until FCM says so at receipt time.
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const RECEIPT_DELAY_MINUTES = 15
const RECEIPT_BATCH = 300 // Expo accepts up to 1000 ids per call

async function pollReceipts(supabase: ReturnType<typeof createClient>) {
  // Receipts are not available immediately, so only look at sends old enough
  // to have one. Asking too early just returns nothing and wastes the row's
  // only check.
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MINUTES * 60_000).toISOString()

  const { data, error } = await supabase
    .from('notification_log')
    .select('id, user_id, ticket_id')
    .not('ticket_id', 'is', null)
    .is('receipt_checked_at', null)
    .lt('sent_at', cutoff)
    .limit(RECEIPT_BATCH)

  if (error || !data || data.length === 0) {
    if (error) console.error(`pollReceipts: fetch failed: ${error.message}`)
    return { checked: 0, delivered: 0, failed: 0, pruned: 0 }
  }

  const rows = data as { id: string; user_id: string; ticket_id: string }[]
  const byTicket = new Map(rows.map((r) => [r.ticket_id, r]))

  let receipts: Record<string, { status: string; message?: string; details?: { error?: string } }>
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: [...byTicket.keys()] }),
    })
    const body = await res.json()
    receipts = body?.data ?? {}
  } catch (err) {
    console.error('pollReceipts: Expo request failed:', err)
    return { checked: 0, delivered: 0, failed: 0, pruned: 0 }
  }

  let delivered = 0
  let failedCount = 0
  let pruned = 0
  const now = new Date().toISOString()

  for (const [ticketId, receipt] of Object.entries(receipts)) {
    const row = byTicket.get(ticketId)
    if (!row) continue

    const code = receipt?.details?.error
    const ok = receipt?.status === 'ok'

    await supabase
      .from('notification_log')
      .update({
        receipt_status: receipt?.status ?? 'unknown',
        receipt_error: code ?? receipt?.message ?? null,
        receipt_checked_at: now,
      })
      .eq('id', row.id)

    if (ok) {
      delivered++
    } else {
      failedCount++
      // The app is gone. Stop sending to this token rather than retrying it
      // every five minutes forever while it inflates the delivery stats.
      if (code === 'DeviceNotRegistered') {
        const { count } = await supabase
          .from('device_push_tokens')
          .delete({ count: 'exact' })
          .eq('user_id', row.user_id)
        pruned += count ?? 0
        console.log(`Pruned token(s) for ${row.user_id}: DeviceNotRegistered receipt.`)
      }
    }
  }

  // Tickets Expo has no receipt for are marked checked anyway, so a permanently
  // unanswered id cannot be re-queried forever.
  const unanswered = rows.filter((r) => !(r.ticket_id in receipts)).map((r) => r.id)
  if (unanswered.length > 0) {
    await supabase
      .from('notification_log')
      .update({ receipt_status: 'no_receipt', receipt_checked_at: now })
      .in('id', unanswered)
  }

  return { checked: rows.length, delivered, failed: failedCount, pruned }
}

// ── The event queue drainer ──────────────────────────────────────────────────
// Takes candidates out of notification_events and turns the ones that survive
// into real notifications. Every row leaves this function with a terminal
// status and, when it wasn't sent, a skip_reason: a queue that goes quiet
// without saying why is exactly the kind of silent failure that has cost this
// project days at a time.
//
// The order of the gates matters. Cheapest and most decisive first, so we never
// pay for a template lookup on a message we were always going to drop.
const QUIET_START_HOUR = 8
const QUIET_END_HOUR = 21
const MAX_EVENTS_PER_RUN = 100

interface QueuedEvent {
  id: string
  user_id: string
  event_key: string
  notification_event_types: {
    channel: string
    deep_link: string
    bypasses_cap: boolean
  } | null
}

async function drainEventQueue(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('notification_events')
    .select('id, user_id, event_key, notification_event_types(channel, deep_link, bypasses_cap)')
    .eq('status', 'queued')
    .lte('send_after', nowIso)
    .gt('expires_at', nowIso)
    // Priority lives on the event type, so this orders across the embedded
    // table: celebrations (10) beat lapse nudges (80). It matters because the
    // frequency cap is consumed in the order rows are processed, so whatever
    // sorts first is what gets the day's remaining budget. If the cap only
    // allows one message through, it should be the good news.
    .order('priority', { referencedTable: 'notification_event_types', ascending: true })
    .order('send_after', { ascending: true })
    .limit(MAX_EVENTS_PER_RUN)

  if (error) {
    console.error(`drainEventQueue: fetch failed: ${error.message}`)
    return { due: 0, sent: 0, skipped: 0, failed: 0 }
  }

  // Anything past its expiry is retired in bulk rather than one at a time. A
  // "you've been quiet three days" nudge that missed its window should die,
  // not arrive a week late.
  await supabase
    .from('notification_events')
    .update({ status: 'expired', skip_reason: 'expired', updated_at: nowIso })
    .eq('status', 'queued')
    .lte('expires_at', nowIso)

  const rows = (data ?? []) as unknown as QueuedEvent[]
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const ev of rows) {
    try {
      const settle = async (status: string, reason: string | null, logId?: string) => {
        await supabase
          .from('notification_events')
          .update({
            status,
            skip_reason: reason,
            log_id: logId ?? null,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ev.id)
      }

      // 1. Is it still true? This is the cancel-on-action replacement: the
      //    condition is re-read from live state rather than mirrored by
      //    triggers, so it cannot drift.
      const { data: valid } = await supabase.rpc('event_still_valid', {
        p_user: ev.user_id,
        p_event: ev.event_key,
      })
      if (valid === false) {
        await settle('skipped', 'condition_no_longer_true')
        skipped++
        continue
      }

      const state = await loadUserState(supabase, ev.user_id)

      // 2. Quiet hours, enforced here rather than trusted from send_after.
      //    enqueue_event falls back to "send at the next tick" when the chosen
      //    hour has already passed, which without this gate could put a
      //    notification on someone's phone at 3am.
      const localHour = Number(state?.local_hour ?? 12)
      if (localHour < QUIET_START_HOUR || localHour > QUIET_END_HOUR) {
        skipped++
        continue // stays queued; retried on a later tick inside waking hours
      }

      // 3. Frequency cap, unless this event is exempt. Celebrations are: being
      //    told about a 100-day streak should not lose to two earlier nudges.
      const block = ev.notification_event_types?.bypasses_cap
        ? null
        : frequencyBlock(state, ev.user_id)
      if (block === 'daily_cap') {
        await settle('skipped', 'daily_cap')
        skipped++
        continue
      }

      const device = await getDevice(supabase, ev.user_id)
      if (!device) {
        await settle('skipped', 'no_token')
        skipped++
        continue
      }

      const template = await pickEventTemplate(
        supabase,
        ev.event_key,
        (state?.preferred_tone as string | null) ?? null,
      )
      if (!template) {
        await settle('failed', 'no_template')
        failed++
        continue
      }

      const body = interpolateState(template.variant_text, state)
      const title = interpolateState(template.title ?? 'STEADY', state)
      const logId = crypto.randomUUID()
      const deepLink = template.deep_link ?? ev.notification_event_types?.deep_link ?? 'home'
      const channel = template.channel ?? ev.notification_event_types?.channel ?? 'default'

      const result = await sendExpoPush(
        device.token,
        title,
        body,
        { log_id: logId, deep_link: deepLink, channel },
        channelFor(device, channel),
      )

      if (result.unregistered) {
        await supabase.from('device_push_tokens').delete().eq('expo_push_token', device.token)
      }

      await supabase.from('notification_log').insert({
        id: logId,
        user_id: ev.user_id,
        // notification_log.reminder_type is plain TEXT with no CHECK, so an
        // event key can be recorded honestly instead of being mislabelled as
        // one of the seven clock reminders.
        reminder_type: ev.event_key,
        template_id: template.id,
        status: result.ok ? 'sent' : 'failed',
        error_message: result.error ?? null,
        ticket_id: result.ticketId ?? null,
      })

      await settle(result.ok ? 'sent' : 'failed', result.ok ? null : (result.error ?? 'send_failed'), logId)
      result.ok ? sent++ : failed++
    } catch (err) {
      failed++
      console.error(`drainEventQueue: ${ev.event_key} for ${ev.user_id} threw:`, err)
    }
  }

  return { due: rows.length, sent, skipped, failed }
}

async function pickEventTemplate(
  supabase: ReturnType<typeof createClient>,
  eventKey: string,
  preferredTone: string | null,
): Promise<Template | null> {
  const { data } = await supabase
    .from('notification_templates')
    .select('id, variant_text, title, tone, channel, deep_link')
    .eq('event_key', eventKey)
    .eq('active', true)
  if (!data || data.length === 0) return null

  const all = data as Template[]
  if (preferredTone && Math.random() > EXPLORATION_RATE) {
    const preferred = all.filter((t) => t.tone === preferredTone)
    if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)]
  }
  return all[Math.floor(Math.random() * all.length)]
}

// Fills {{placeholders}} from the user-state snapshot. User-supplied values are
// truncated first: {{group_name}} and {{first_name}} are whatever somebody
// typed, so no amount of careful copywriting keeps a notification inside
// Android's banner width without this.
const VAR_CAPS: Record<string, number> = {
  group_name: 14, first_name: 12, last_food: 16,
  // Medicine names are user-typed and several can be joined with " + ". The
  // cap is generous on purpose: Android reveals the full body when a
  // notification is expanded, so an overlong banner is recoverable, whereas a
  // name hard-truncated to "F-Trichoprote…" is not. On a medical reminder,
  // completeness beats a tidy banner.
  medicine_name: 40,
}

function interpolateState(text: string, state: UserState): string {
  if (!state) return text
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const raw = state[key]
    if (raw === null || raw === undefined) return whole
    const value = String(raw)
    const cap = VAR_CAPS[key]
    return cap && value.length > cap ? `${value.slice(0, cap)}…` : value
  })
}

// Reads the daily budget from build_user_state (migrations 030-032), which
// derives the ceiling from the user's lifecycle stage: 2/day while they're
// engaged, 1 while quiet or lapsed, 0 once dormant.
//
// Deliberately fails OPEN. If the state lookup errors we send anyway, on the
// same reasoning as alreadySatisfied(): a broken query silently muting every
// user's reminders is a worse and far less visible failure than one extra
// notification. The console.error is what keeps it from being invisible.
type UserState = Record<string, unknown> | null

async function loadUserState(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserState> {
  const { data, error } = await supabase.rpc('build_user_state', { p_user_id: userId })
  if (error || !data) {
    console.error(
      `loadUserState failed for ${userId}: ${error?.message ?? 'no data'}. ` +
      `Falling back to unconstrained send.`
    )
    return null
  }
  return data as Record<string, unknown>
}

// Returns null when the message may go, or a reason string when it may not.
// Two distinct limits live here and they used to be reported identically as
// 'capped', which made the skip stats unreadable:
//
//   'daily_cap' — the per-day volume ceiling. REMOVED for normal users in
//                 migration 045 (cap is now 999); only 'dormant' users, who
//                 were explicitly promised we would stop messaging them, still
//                 hit this.
//   'too_soon'  — REMOVED 2026-09-02. There was a 90-minute minimum gap
//                 between pushes; it is gone because back-to-back
//                 notifications are sometimes exactly what is wanted, and it
//                 was the rule that would have blocked the 22:00 medicine
//                 reminder for a user whose dinner nudge fires at 21:00.
function frequencyBlock(state: UserState, userId: string): string | null {
  // Fails OPEN when state is unavailable, on the same reasoning as
  // alreadySatisfied(): a broken lookup silently muting every user's reminders
  // is a worse and far less visible failure than one extra notification.
  if (!state) return null

  const budgetLeft = Number(state.push_budget_left ?? 0)

  if (budgetLeft <= 0) {
    console.log(
      `Blocked ${userId}: ${state.pushes_today}/${state.push_cap_today} used ` +
      `(lifecycle ${state.lifecycle}).`
    )
    return 'daily_cap'
  }
  return null
}

// The app build that created the seven named notification channels. Devices
// reporting less than this have only ever created 'default'.
const CHANNELS_VERSION_NAMED = 1

interface Device {
  token: string
  channelsVersion: number
}

async function getDevice(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Device | null> {
  const { data } = await supabase
    .from('device_push_tokens')
    .select('expo_push_token, channels_version')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.expo_push_token) return null
  return {
    token: data.expo_push_token as string,
    channelsVersion: Number(data.channels_version ?? 0),
  }
}

// Picks a channelId the device has definitely created.
//
// This is the single most dangerous field in the payload. Per Expo's docs, if
// the named channel does not exist on the device the notification "will not be
// displayed to the user" -- and Android drops it silently, with a perfectly
// successful push ticket coming back to us. Sending 'reminders' to a phone
// running the old build would make that user's notifications simply stop, with
// nothing anywhere to say why.
//
// Server code reaches everyone the moment it deploys; app code only reaches
// people who update. Any payload field whose meaning depends on client code
// must therefore be gated on a capability the client has actually reported.
function channelFor(device: Device, desired: string | null | undefined): string {
  if (device.channelsVersion >= CHANNELS_VERSION_NAMED && desired) return desired
  return 'default'
}

interface Template {
  id: string
  variant_text: string
  title: string | null
  tone: string | null
  channel: string | null
  deep_link: string | null
}

// Picks the copy. Two things happen here beyond "choose at random".
//
// TONE LOCKING: once tap tracking has shown which voice a user actually opens,
// profiles.preferred_tone is set and we bias toward it. Not exclusively though
// -- EXPLORATION_RATE of sends deliberately ignore the lock. A preference
// learned from a handful of taps can easily be wrong, and without exploration a
// bad lock is permanent because we would never again collect evidence against
// it. This is the cheap version of the explore/exploit tradeoff that Duolingo
// solves with a full bandit.
const EXPLORATION_RATE = 0.2

async function pickTemplate(
  supabase: ReturnType<typeof createClient>,
  reminderType: string,
  preferredTone: string | null
): Promise<Template | null> {
  const { data } = await supabase
    .from('notification_templates')
    .select('id, variant_text, title, tone, channel, deep_link')
    .eq('reminder_type', reminderType)
    .eq('active', true)
  if (!data || data.length === 0) return null

  const all = data as Template[]
  if (preferredTone && Math.random() > EXPLORATION_RATE) {
    const preferred = all.filter((t) => t.tone === preferredTone)
    if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)]
  }
  return all[Math.floor(Math.random() * all.length)]
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


// Which screen a tap should open, per reminder type. Consumed by the app's
// navigateToDeepLink whitelist — anything not in that whitelist is ignored on
// device rather than crashing, so the two lists can drift safely.
const DEEP_LINK: Record<string, string> = {
  meal: 'camera',
  water: 'water',
  weight: 'weight',
  workout: 'home',
  walking: 'home',
  healthLog: 'home',
  medicine: 'home',
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  channelId: string
): Promise<{ ok: boolean; error?: string; unregistered?: boolean; ticketId?: string }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: 'default',
      // `data` is an arbitrary payload the OS hands back untouched when the
      // notification is tapped. This is what carries log_id home and turns a
      // one-way broadcast into a measurable loop.
      data,
      // Names the Android channel: both the label shown next to the app name
      // in the tray and the thing the user can mute independently. Ignored on
      // iOS, which has no channel concept. Resolved by channelFor() against
      // what the device has actually created, NOT taken from the template,
      // because naming a channel the device lacks makes Android silently drop
      // the notification.
      channelId,
    }),
  })
  const result = await res.json()
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data
  // Kept so a delivery receipt can be fetched later. The ticket alone only says
  // Expo accepted the message, not that any phone received it.
  const ticketId = typeof ticket?.id === 'string' ? ticket.id : undefined
  if (ticket?.status === 'error') {
    // The ticket's details.error carries the machine-readable reason.
    // DeviceNotRegistered is the one worth acting on: the app has been
    // uninstalled and Expo's guidance is to stop sending to that token
    // entirely rather than retrying it forever.
    const code = ticket?.details?.error as string | undefined
    return {
      ok: false,
      error: ticket.message ?? 'Expo push rejected',
      unregistered: code === 'DeviceNotRegistered',
      ticketId,
    }
  }
  return { ok: true, ticketId }
}

async function logNotification(
  supabase: ReturnType<typeof createClient>,
  reminder: DueReminder,
  templateId: string | null,
  result: { ok: boolean; error?: string; ticketId?: string },
  logId?: string
) {
  await supabase.from('notification_log').insert({
    // Explicit id when we minted one for the push payload, so the row the app
    // reports an open against is this row. Omitted on the error path in
    // Deno.serve's catch, where no push was ever sent and no id exists.
    ...(logId ? { id: logId } : {}),
    user_id: reminder.user_id,
    reminder_type: reminder.reminder_type,
    template_id: templateId,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.error ?? null,
    ticket_id: result.ticketId ?? null,
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
