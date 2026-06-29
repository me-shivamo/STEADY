-- Add chat_date to chat_messages so history can be queried by the user's local date
-- rather than filtering by UTC created_at timestamps (which breaks for users in non-UTC timezones
-- who chat past midnight local time — the UTC timestamp would fall on the previous date).
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS chat_date DATE;

-- Back-fill existing rows from created_at (best effort — existing data is UTC-based anyway)
UPDATE public.chat_messages
  SET chat_date = DATE(created_at)
  WHERE chat_date IS NULL;

-- Index for fast per-user per-date queries
CREATE INDEX IF NOT EXISTS chat_messages_user_date_idx
  ON public.chat_messages (user_id, chat_date, created_at);
