-- Allow 'label' as a source: macros read verbatim off a nutrition label photo,
-- rather than derived from USDA/cache/AI-estimate. See resolveLabelFoods() in
-- supabase/functions/_shared/macroResolver.ts.
ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_source_check;
ALTER TABLE public.food_items ADD CONSTRAINT food_items_source_check
  CHECK (source IN ('usda', 'open_food_facts', 'user_created', 'ai_estimated', 'indb', 'label'));

-- macro_source lives on food_entries (migration 008), not food_items.
ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_macro_source_check;
ALTER TABLE public.food_entries
  ADD CONSTRAINT food_entries_macro_source_check
  CHECK (macro_source IN ('usda', 'indb', 'ai_estimated', 'user_created', 'label'));
