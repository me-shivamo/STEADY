-- ─── Account deletion prep ────────────────────────────────────────────────────
-- Google Play requires in-app account deletion. Deleting an auth user cascades
-- through profiles → every user-data table (set up in 001), with ONE exception:
-- food_items.created_by references auth.users WITHOUT a cascade rule, so any
-- user who authored shared food-cache rows could not be deleted (FK violation
-- would abort the whole delete). food_items is a shared nutrition cache — other
-- users benefit from those rows — so we anonymise instead of deleting them.

ALTER TABLE public.food_items
  DROP CONSTRAINT IF EXISTS food_items_created_by_fkey;

ALTER TABLE public.food_items
  ADD CONSTRAINT food_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
