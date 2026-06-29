-- ─── 004: One meal_log per logging action + human-readable quantity labels ──────
--
-- Why: previously meal_logs enforced UNIQUE (user_id, logged_date, meal_type),
-- so all messages of the same meal type merged into a single row/card. We now
-- want EACH logged message to be its own card, shown chronologically. Dropping
-- the constraint lets the Edge Function INSERT a fresh row per log instead of
-- upserting/merging. meal_type is still stored (inferred from time) for future
-- filtering/stats — we just no longer group by it.
--
-- Safe to drop: nothing depends on this uniqueness. The daily_summaries trigger
-- (003) recomputes from all food_entries for the day; its meal_count becomes
-- "number of logs" instead of "number of meal types" — an acceptable shift.
-- RLS (auth.uid() = user_id) and the set_updated_at trigger are unaffected.

ALTER TABLE public.meal_logs
  DROP CONSTRAINT IF EXISTS meal_logs_user_id_logged_date_meal_type_key;

-- Human-readable portion for each food entry (e.g. "2 slices", "1 large egg").
-- The AI already produces this (quantity_description) but it was only saved to
-- food_items.serving_size_description, never on the entry the card renders.
-- Nullable: rows fall back to grams (quantity_g) when null.
ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS quantity_label TEXT;

-- Keep the chronological feed fetch ordered and fast.
CREATE INDEX IF NOT EXISTS meal_logs_user_date_created_idx
  ON public.meal_logs (user_id, logged_date, created_at);
