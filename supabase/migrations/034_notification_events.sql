-- The event platform: a catalogue of what STEADY can say, and an outbox queue
-- of what it intends to say next.
--
-- ─── WHY A QUEUE AT ALL ─────────────────────────────────────────────────────
-- Until now STEADY only had clocks: find_due_reminders() looks at rows a user
-- explicitly configured and fires at the times they typed in. That reaches
-- exactly the people who visited the Reminders screen, which in production is
-- 1 of 24. Events are the other half -- the system noticing something ("three
-- days quiet", "first ever log", "target hit") and reacting.
--
-- The queue sits between noticing and sending, and that gap is where all the
-- useful behaviour lives: a message can be re-evaluated, delayed to a better
-- hour, out-prioritised by something more important, or dropped because the
-- user did the thing in the meantime.
--
-- ─── DESIGN DECISIONS WORTH KNOWING ─────────────────────────────────────────
--
-- 1. AT-LEAST-ONCE IS THE DEFAULT, SO BE IDEMPOTENT. Any cron-driven system
--    will eventually enqueue the same thing twice: a run overlaps, a retry
--    fires, a condition stays true across two ticks. Rather than trying to
--    make that impossible, `dedupe_key` is UNIQUE and every enqueue uses
--    ON CONFLICT DO NOTHING. Attempting to queue the same message twice
--    becomes a silent no-op instead of two buzzes. The key encodes the
--    intended frequency, which is what makes "once ever" and "once per day"
--    the same mechanism:
--      welcome:<uid>                  -> once, ever
--      lunch_nudge:<uid>:2026-08-07   -> once per local day
--      lapse_3d:<uid>:2026-08-04      -> once per lapse episode
--
-- 2. CONDITIONS ARE RE-CHECKED AT SEND TIME, NOT CANCELLED BY TRIGGERS. An
--    earlier draft had triggers on meal_logs, water_logs and friends deleting
--    queued rows when a user did the thing. That means a trigger on every
--    table, each one able to drift out of sync with the rules it mirrors --
--    the exact failure this codebase has already produced twice (a stale
--    streak cache, and find_due_reminders losing a column). Instead the queue
--    holds a *candidate*, and the sender re-evaluates against fresh
--    build_user_state() at the moment of sending. Nothing to keep in sync,
--    and the check is always current by construction.
--
-- 3. A WINDOW, NOT A TIMESTAMP. send_after says "not before this", expires_at
--    says "pointless after this". Between them the sender picks the hour the
--    user is actually active, via pick_send_hour() from migration 033. A
--    "you've been quiet three days" nudge that misses its window should die
--    rather than arrive a week late, which is what expires_at guarantees.
--
-- 4. THE CATALOGUE IS DATA, NOT CODE. notification_event_types holds the 33
--    events with their windows, channels and priorities, so adding or retuning
--    an event is an INSERT rather than an Edge Function deploy. The sender
--    stays generic.

-- ─── EVENT CATALOGUE ────────────────────────────────────────────────────────
CREATE TABLE public.notification_event_types (
  event_key      TEXT PRIMARY KEY,
  channel        TEXT NOT NULL,
  deep_link      TEXT NOT NULL DEFAULT 'home',

  -- Local-hour band in which this message still makes sense. pick_send_hour
  -- finds the user's most active hour inside it, and intersects it with the
  -- global 08:00-21:00 exclusion window, so a row here can never authorise a
  -- 3am send even by mistake.
  window_start   INT NOT NULL DEFAULT 8  CHECK (window_start BETWEEN 0 AND 23),
  window_end     INT NOT NULL DEFAULT 21 CHECK (window_end   BETWEEN 0 AND 23),

  -- Lower number wins when several are due at once. A celebration must always
  -- beat a nag: hitting your target and skipping dinner should get you the
  -- congratulations, not the telling off.
  priority       INT NOT NULL DEFAULT 100,

  -- How long a queued instance stays worth sending.
  ttl_hours      INT NOT NULL DEFAULT 24 CHECK (ttl_hours > 0),

  -- Celebrations are exempt from the daily frequency cap. Telling someone
  -- they hit a 100-day streak is not the message to drop because they already
  -- had two nudges; these are rare, earned, and the reason people keep
  -- notifications on at all.
  bypasses_cap   BOOLEAN NOT NULL DEFAULT FALSE,

  active         BOOLEAN NOT NULL DEFAULT TRUE,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_window_ordered CHECK (window_start <= window_end)
);

-- ─── THE OUTBOX QUEUE ───────────────────────────────────────────────────────
CREATE TABLE public.notification_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_key    TEXT NOT NULL REFERENCES public.notification_event_types(event_key) ON DELETE CASCADE,

  -- The idempotency key. See note 1 above.
  dedupe_key   TEXT NOT NULL UNIQUE,

  send_after   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,

  status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'sent', 'skipped', 'expired', 'failed')),
  -- Why a candidate didn't become a notification: 'condition_no_longer_true',
  -- 'capped', 'no_token', 'quiet_hours', 'expired'. This column is the
  -- difference between a system you can debug and one that mysteriously goes
  -- quiet -- every silent failure in this project so far has cost days.
  skip_reason  TEXT,

  -- Event-specific extras the copy might interpolate (e.g. which milestone a
  -- streak celebration is for). User state is NOT copied in here: it is read
  -- fresh at send time so a queued message can never carry stale numbers.
  payload      JSONB NOT NULL DEFAULT '{}',

  log_id       UUID,   -- set once sent, links to notification_log
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);

-- The sender's hot path: "what is due right now, most important first".
-- Partial index because queued rows are the only ones ever scanned, and the
-- table is append-mostly -- sent/expired rows would otherwise bloat it.
CREATE INDEX notification_events_due_idx
  ON public.notification_events (send_after, event_key)
  WHERE status = 'queued';

CREATE INDEX notification_events_user_idx
  ON public.notification_events (user_id, created_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Both tables follow notification_templates and notification_log: RLS enabled
-- with zero policies, so nothing but service_role (which bypasses RLS) can
-- touch them. The queue describes what we are about to say to people and is
-- not something a client has any reason to read or write.
ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events      ENABLE ROW LEVEL SECURITY;

-- ─── TEMPLATE TABLE: ROOM FOR REAL COPY ─────────────────────────────────────
-- The existing table was reminder-shaped: a reminder_type, one line of text,
-- and a hardcoded "STEADY" title on every push. The catalogue in
-- .claude/plans/notifications.md needs considerably more.
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS event_key TEXT REFERENCES public.notification_event_types(event_key) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title     TEXT,
  ADD COLUMN IF NOT EXISTS tone      TEXT,
  ADD COLUMN IF NOT EXISTS channel   TEXT,
  ADD COLUMN IF NOT EXISTS deep_link TEXT;

-- reminder_type was NOT NULL and pinned by a CHECK to the seven clock-based
-- reminders. Event rows have no reminder_type at all, so the column has to
-- become nullable and a new constraint has to enforce that a row belongs to
-- exactly one world.
ALTER TABLE public.notification_templates ALTER COLUMN reminder_type DROP NOT NULL;

ALTER TABLE public.notification_templates
  ADD CONSTRAINT template_belongs_to_one_thing
  CHECK ((reminder_type IS NULL) <> (event_key IS NULL));

-- Three of the templates seeded by migration 026 contain em-dashes, and the
-- constraint below refuses to be created while they exist. They are not
-- hypothetical: 'Stay hydrated — log some water.' is a 'water' variant, and
-- water reminders are the only notifications this app has ever delivered at
-- volume, so this copy has genuinely been landing on Shivam's phone.
--
-- Rewritten rather than patched, following the catalogue's rules: the em-dash
-- becomes a full stop (two short sentences read better on a notification
-- banner anyway) and each gains a meaningful emoji.
UPDATE public.notification_templates
   SET variant_text = '{{streak_days}} days strong. Keep it alive 🔥'
 WHERE variant_text = '{{streak_days}} days strong — keep the streak alive.';

UPDATE public.notification_templates
   SET variant_text = 'Stay hydrated. Log some water 💧'
 WHERE variant_text = 'Stay hydrated — log some water.';

UPDATE public.notification_templates
   SET variant_text = 'Step away from the screen. Go for a walk 🚶'
 WHERE variant_text = 'Step away from the screen — go for a walk.';

-- Belt and braces: any other row that still has one (an AI-generated variant
-- added between writing this migration and running it) gets the dash replaced
-- with a full stop rather than blocking the migration. A constraint that can
-- be defeated by one unlucky INSERT timing is not a constraint.
UPDATE public.notification_templates
   SET variant_text = regexp_replace(variant_text, '\s*[—–]\s*', '. ', 'g')
 WHERE variant_text ~ '[—–]';

-- The em-dash ban, enforced by the database rather than by discipline.
-- generate-template-variants calls an LLM to write new copy, and LLMs produce
-- em-dashes constantly; a rule that lives only in a prompt is a rule that will
-- be broken. Covers the en-dash too, which is the obvious near-miss.
ALTER TABLE public.notification_templates
  ADD CONSTRAINT template_no_em_dash
  CHECK (variant_text !~ '[—–]' AND (title IS NULL OR title !~ '[—–]'));

-- Length limits from the banner research: Android truncates a collapsed
-- notification past roughly these. Generous here rather than exact, because
-- interpolated values ({{first_name}} and friends) change the rendered length
-- and the real enforcement is the checker script against the catalogue.
ALTER TABLE public.notification_templates
  ADD CONSTRAINT template_lengths
  CHECK (length(variant_text) <= 120 AND (title IS NULL OR length(title) <= 60));

CREATE INDEX notification_templates_event_idx
  ON public.notification_templates (event_key, tone) WHERE active;
