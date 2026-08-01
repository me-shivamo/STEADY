-- AI call observability log. Every OpenRouter call made by the Edge Functions
-- (photo vision, text agent loop, macro-resolver match) writes one row here on
-- the way out, success or failure. This is a developer-facing debugging tool,
-- not user-facing data — unlike chat_messages (the conversation itself), this
-- captures the *mechanics* of each AI call: which model, what was sent, what
-- came back, how long it took, and what broke.
--
-- RLS is enabled with NO policies attached. In Postgres, RLS-enabled + zero
-- policies = deny-all for every role RLS applies to (anon, authenticated).
-- service_role bypasses RLS entirely, which is how Edge Functions (using the
-- service role key) can still write freely. Query this table via the Supabase
-- SQL Editor / dashboard, not from the app.
CREATE TABLE public.ai_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  source            TEXT NOT NULL CHECK (source IN ('analyze-food-photo', 'log-food-from-text', 'macro-resolver')),
  model             TEXT NOT NULL,

  request_payload   JSONB,
  response_payload  JSONB,

  status            TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message     TEXT,
  latency_ms        INTEGER,

  prompt_tokens     INTEGER,
  completion_tokens INTEGER
);

CREATE INDEX ai_logs_user_id_idx    ON public.ai_logs (user_id);
CREATE INDEX ai_logs_created_at_idx ON public.ai_logs (created_at DESC);
CREATE INDEX ai_logs_status_idx     ON public.ai_logs (status) WHERE status = 'error';
CREATE INDEX ai_logs_source_idx     ON public.ai_logs (source);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — see comment above.
