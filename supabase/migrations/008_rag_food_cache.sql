-- ─── RAG FOOD CACHE ───────────────────────────────────────────────────────────
-- Turns food_items into a real read-through nutrition cache. Foods are stored
-- once, canonically per 100g, and every log computes macros deterministically
-- from these values (quantity_g × per_100g / 100) instead of asking the AI to
-- invent numbers on every log.

-- Canonical per-100g columns. Legacy rows (per-serving, one per log) keep
-- NULLs here; the resolver only trusts rows where calories_per_100g IS NOT NULL.
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS normalized_name   TEXT,
  ADD COLUMN IF NOT EXISTS calories_per_100g NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_per_100g  NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_per_100g    NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_per_100g      NUMERIC,
  ADD COLUMN IF NOT EXISTS fiber_per_100g    NUMERIC,
  ADD COLUMN IF NOT EXISTS fdc_id            BIGINT,
  ADD COLUMN IF NOT EXISTS last_used_at      TIMESTAMPTZ DEFAULT NOW();

-- Allow 'indb' (Indian Nutrient Databank seed) as a source.
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_source_check;
ALTER TABLE public.food_items ADD CONSTRAINT food_items_source_check
  CHECK (source IN ('usda', 'open_food_facts', 'user_created', 'ai_estimated', 'indb'));

-- One canonical cache row per normalized name. Postgres allows unlimited NULLs
-- in a unique index, so legacy rows (normalized_name NULL) coexist, and
-- supabase-js .upsert(onConflict: 'normalized_name') works against it.
CREATE UNIQUE INDEX IF NOT EXISTS food_items_normalized_name_uidx
  ON public.food_items (normalized_name);

-- Macro provenance per logged entry ('usda'/'indb'/'ai_estimated'/'user_created').
-- Distinct from food_entries.source, which records the input channel (text/photo).
ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS macro_source TEXT
  CHECK (macro_source IN ('usda', 'indb', 'ai_estimated', 'user_created'));
