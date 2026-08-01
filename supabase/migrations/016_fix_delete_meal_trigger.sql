-- ─── FIX: update_daily_summary() breaks meal deletion ────────────────────────
-- Deleting a meal_logs row cascades (ON DELETE CASCADE) to its food_entries.
-- That cascade fires update_daily_summary() for each deleted food_entries row,
-- which looked up the meal's date via:
--   SELECT logged_date FROM meal_logs WHERE id = OLD.meal_log_id
-- But the parent meal_logs row is already gone (it's the row being deleted),
-- so v_date came back NULL, and the trigger's INSERT into daily_summaries
-- (summary_date NOT NULL) failed — aborting the whole delete transaction.
-- This is why tapping "Delete" on a meal card always failed with
-- "Could not delete. Please try again."
--
-- Fix: if the parent meal_logs row no longer exists, there's nothing to
-- recompute for a same-day insert/update — the cache row is already correct
-- (this only happens on the cascade-delete path), so just skip the upsert.

CREATE OR REPLACE FUNCTION public.update_daily_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_date      DATE;
BEGIN
  -- Works for both INSERT (NEW) and DELETE (OLD)
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_date    := (SELECT logged_date FROM public.meal_logs WHERE id = OLD.meal_log_id);
  ELSE
    v_user_id := NEW.user_id;
    v_date    := (SELECT logged_date FROM public.meal_logs WHERE id = NEW.meal_log_id);
  END IF;

  -- Parent meal_logs row is gone (e.g. mid-cascade from a meal delete) —
  -- nothing to recompute against, bail out instead of inserting a NULL date.
  IF v_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.daily_summaries (user_id, summary_date, total_calories, total_protein_g, total_carbs_g, total_fat_g, meal_count, updated_at)
  SELECT
    v_user_id,
    v_date,
    COALESCE(SUM(fe.calories), 0),
    COALESCE(SUM(fe.protein_g), 0),
    COALESCE(SUM(fe.carbs_g), 0),
    COALESCE(SUM(fe.fat_g), 0),
    COUNT(DISTINCT fe.meal_log_id),
    NOW()
  FROM public.food_entries fe
  JOIN public.meal_logs ml ON ml.id = fe.meal_log_id
  WHERE fe.user_id = v_user_id
    AND ml.logged_date = v_date
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    total_calories  = EXCLUDED.total_calories,
    total_protein_g = EXCLUDED.total_protein_g,
    total_carbs_g   = EXCLUDED.total_carbs_g,
    total_fat_g     = EXCLUDED.total_fat_g,
    meal_count      = EXCLUDED.meal_count,
    updated_at      = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;
