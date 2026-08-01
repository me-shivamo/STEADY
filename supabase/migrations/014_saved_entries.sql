-- Saved Entries (meal templates). Each row snapshots the already-resolved
-- food_entries data for a meal the user chose to save, so re-logging it later
-- is a plain INSERT (no Edge Function call, no LLM, no USDA lookup needed —
-- the macros were already resolved once when the meal was first logged).
-- `entries` mirrors food_entries' nutrition columns per item; stored as one
-- JSONB blob since a saved entry is always read/written as a single atomic
-- unit, never queried per-item.
CREATE TABLE public.saved_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  entries      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE public.saved_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved entries"
  ON public.saved_entries FOR ALL USING (auth.uid() = user_id);

-- food_entries.source needs a new value for rows inserted by re-logging a
-- saved entry — not 'manual' (user didn't type it this time) and not
-- 'ai_text'/'ai_photo' (no AI call happens on this path at all).
ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_source_check;
ALTER TABLE public.food_entries ADD CONSTRAINT food_entries_source_check
  CHECK (source IN ('manual', 'barcode', 'ai_photo', 'ai_text', 'search', 'saved_entry'));
