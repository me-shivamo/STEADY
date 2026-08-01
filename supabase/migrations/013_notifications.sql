-- Push notification platform: device tokens, per-user reminder preferences,
-- AI-assisted copy templates, delivery log, and the pg_cron heartbeat that
-- drives scheduled sends. This is the first migration in the project to use
-- pg_cron/pg_net — nothing has been scheduled server-side before this.

-- ─── ADMIN FLAG + TIMEZONE ──────────────────────────────────────────────────
-- is_admin gates access to the separate admin dashboard (checked server-side
-- there, never trusted from a client). timezone (IANA name, e.g.
-- 'Asia/Kolkata') lets the scheduler convert a user's local reminder time to
-- UTC — without it "8:00 AM" has no fixed meaning across users.
ALTER TABLE public.profiles
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN timezone TEXT;

-- ─── DEVICE PUSH TOKENS ─────────────────────────────────────────────────────
CREATE TABLE public.device_push_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token   TEXT NOT NULL,
  platform          TEXT CHECK (platform IN ('ios', 'android')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX device_push_tokens_user_idx ON public.device_push_tokens(user_id);

-- ─── NOTIFICATION PREFERENCES ───────────────────────────────────────────────
-- One row per (user, reminder_type) — the server-side mirror of
-- reminderStore.ts's DEFAULT_REMINDERS shape, so the client can persist
-- through Supabase instead of local-only state.
CREATE TABLE public.notification_preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type       TEXT NOT NULL CHECK (reminder_type IN
                        ('workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine')),
  enabled             BOOLEAN NOT NULL DEFAULT FALSE,
  times               TEXT[] NOT NULL DEFAULT '{}',  -- "HH:mm" 24h, local to the user's timezone
  quiet_hours_start   TEXT,                          -- "HH:mm", local time
  quiet_hours_end     TEXT,                          -- "HH:mm", local time
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, reminder_type)
);

CREATE INDEX notification_preferences_user_idx ON public.notification_preferences(user_id);

-- ─── NOTIFICATION TEMPLATES ─────────────────────────────────────────────────
-- variant_text holds {{placeholder}} tokens (e.g. "{{streak_days}}-day
-- streak!"), interpolated at send time. Never queried by the mobile client —
-- only the service-role-keyed Edge Functions and the admin dashboard touch
-- this table, so RLS is enabled with zero permissive policies (deny-by-default)
-- rather than left unprotected.
CREATE TABLE public.notification_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_type     TEXT NOT NULL CHECK (reminder_type IN
                      ('workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine')),
  variant_text      TEXT NOT NULL,
  is_ai_generated   BOOLEAN NOT NULL DEFAULT FALSE,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notification_templates_type_idx ON public.notification_templates(reminder_type) WHERE active;

-- ─── NOTIFICATION LOG ───────────────────────────────────────────────────────
-- Delivery/engagement log. Same deny-by-default RLS as templates.
CREATE TABLE public.notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type   TEXT NOT NULL,
  template_id     UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'opened')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at       TIMESTAMPTZ
);

CREATE INDEX notification_log_user_idx ON public.notification_log(user_id, sent_at DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
ALTER TABLE public.device_push_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON public.device_push_tokens FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL USING (auth.uid() = user_id);

-- notification_templates and notification_log intentionally have RLS enabled
-- with no policies at all: no role other than service_role (which bypasses
-- RLS entirely) should ever read or write them. This is what the Edge
-- Functions and the admin dashboard's server-side Supabase client use.

-- ─── find_due_reminders() ───────────────────────────────────────────────────
-- Returns every (user, reminder_type) whose local "HH:mm" reminder time falls
-- within the current window_minutes-wide window, evaluated in that user's own
-- timezone. `timezone(tz, timestamptz)` converts "now" into the local wall
-- clock using Postgres's IANA database — this is what correctly handles
-- fractional-hour offsets (e.g. Asia/Kolkata, UTC+5:30) and DST without any
-- hand-rolled offset math in the calling Edge Function. Users with no
-- timezone set are skipped entirely rather than guessed at (defaulting to
-- UTC would silently fire reminders at the wrong local hour for them).
CREATE OR REPLACE FUNCTION public.find_due_reminders(window_minutes INT)
RETURNS TABLE (user_id UUID, reminder_type TEXT, local_time TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    np.user_id,
    np.reminder_type,
    t AS local_time
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  CROSS JOIN LATERAL unnest(np.times) AS t
  WHERE np.enabled
    AND p.timezone IS NOT NULL
    -- local "now" as HH:mm, truncated to the same minute granularity as `t`
    AND to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN to_char(
                  (date_trunc('day', NOW() AT TIME ZONE p.timezone)
                    + t::TIME - (window_minutes || ' minutes')::INTERVAL),
                  'HH24:MI'
                )
        AND t
    -- quiet hours: skip if local "now" falls inside [quiet_hours_start, quiet_hours_end)
    AND NOT (
      np.quiet_hours_start IS NOT NULL AND np.quiet_hours_end IS NOT NULL AND
      to_char(NOW() AT TIME ZONE p.timezone, 'HH24:MI')
        BETWEEN np.quiet_hours_start AND np.quiet_hours_end
    );
$$;

-- ─── SCHEDULING: pg_cron + pg_net ───────────────────────────────────────────
-- pg_cron runs jobs on the Postgres server's own clock (UTC). pg_net lets a
-- cron job make an HTTP call from inside Postgres — that's how we invoke the
-- send-scheduled-notifications Edge Function every 5 minutes without a
-- separate always-on server.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The Edge Function URL and service-role key are secrets, so they can't live
-- in this file (checked into git). Hosted Supabase also doesn't grant
-- superuser, so `ALTER DATABASE ... SET app.settings.*` — the usual
-- self-hosted-Postgres approach — is rejected with a permission error there.
-- Supabase's supported alternative is Vault: an encrypted secrets table built
-- into Postgres itself. Run once, manually, after this migration (not part of
-- the migration itself, via the SQL Editor or `supabase db query --linked`):
--   SELECT vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-scheduled-notifications', 'edge_function_url');
--   SELECT vault.create_secret('<service-role-key>', 'service_role_key');
SELECT cron.schedule(
  'send-scheduled-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
