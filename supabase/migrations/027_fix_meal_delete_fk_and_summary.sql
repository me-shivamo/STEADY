-- ─── FIX: deleting a meal is still blocked, and the daily cache goes stale ───
--
-- Migration 016 fixed the FIRST blocker on this path (update_daily_summary()
-- inserting a NULL date mid-cascade). Deleting a meal still failed, and this is
-- the second, previously-undiagnosed blocker. Reproduced against the live
-- database inside a rolled-back transaction:
--
--   ERROR: 23503: update or delete on table "meal_logs" violates foreign key
--   constraint "chat_messages_meal_log_id_fkey" on table "chat_messages"
--   DETAIL: Key (id)=(...) is still referenced from table "chat_messages".
--
-- WHY IT HAPPENS
-- 001_initial_schema.sql:142 declares
--     meal_log_id UUID REFERENCES public.meal_logs(id)
-- with no ON DELETE clause. Postgres defaults that to NO ACTION, meaning "refuse
-- the delete while any row still points here" — the opposite of the CASCADE the
-- sibling food_entries FK uses.
--
-- Every AI-logged meal creates such a pointer on the very same request that
-- creates the meal: log-food-from-text/index.ts:369 and
-- analyze-food-photo/index.ts:360 both call saveChatTurn(..., mealLog.id, ...),
-- which inserts a chat_messages row with message_type='food_log_confirmation'
-- and meal_log_id set. On the live DB all 361 of those rows have a non-NULL
-- meal_log_id. So in practice EVERY meal is undeletable, which is exactly the
-- reported symptom.
--
-- The error surfaced as the generic "Could not delete. Please try again."
-- because MealCard.confirmDelete used a bare `catch {`, discarding the Postgres
-- code and detail that would have named the constraint immediately.
--
-- WHY CASCADE RATHER THAN SET NULL
-- SET NULL would keep the delete unblocked but leave orphaned
-- message_type='food_log_confirmation' rows behind. loadChatHistory selects only
-- (role, content, message_type) and never reads meal_log_id, so it cannot tell
-- an orphan from a live confirmation — the AI would keep being told the meal was
-- "already logged today" after the user deleted it. CASCADE removes the
-- confirmation alongside the meal it describes, which is what it actually means.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_meal_log_id_fkey;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_meal_log_id_fkey
  FOREIGN KEY (meal_log_id) REFERENCES public.meal_logs(id) ON DELETE CASCADE;


-- ─── FIX: daily_summaries left stale after a meal delete ─────────────────────
--
-- 016's guard makes the cascade path SAFE but not CORRECT. When a meal is
-- deleted, its food_entries cascade away and fire update_daily_summary() once
-- per row — but by then the parent meal_logs row is already gone, so v_date is
-- NULL and 016 bails out (016:36-38) without recomputing anything. The cached
-- totals therefore keep counting the deleted meal.
--
-- Measured on the live DB for 2026-08-04: deleting a 511.2 kcal meal left
-- daily_summaries at 1146.5 kcal when the true remaining sum was 635.3 kcal.
-- foodLogStore.fetchSummaryForDate reads that cached row as its fast path
-- (fetchEntriesForDate runs with skipTotals=true), so the deleted meal's
-- calories visibly reappear on the next date switch or app restart.
--
-- The fix is a statement-level AFTER DELETE trigger on meal_logs itself. It runs
-- after the cascade has finished, when the remaining rows are the truth, so a
-- plain re-aggregation is correct. Doing it here rather than inside
-- update_daily_summary() keeps 016's per-row guard intact and avoids
-- recomputing once per cascaded food_entries row.
CREATE OR REPLACE FUNCTION public.recompute_daily_summary_after_meal_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Account deletion removes profiles first; daily_summaries.user_id references
  -- it, so re-inserting here would resurrect a row for a user that no longer
  -- exists and abort the delete. Nothing to cache for a deleted account anyway.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.daily_summaries (
    user_id, summary_date, total_calories, total_protein_g,
    total_carbs_g, total_fat_g, meal_count, updated_at
  )
  SELECT
    OLD.user_id,
    OLD.logged_date,
    COALESCE(SUM(fe.calories), 0),
    COALESCE(SUM(fe.protein_g), 0),
    COALESCE(SUM(fe.carbs_g), 0),
    COALESCE(SUM(fe.fat_g), 0),
    COUNT(DISTINCT fe.meal_log_id),
    NOW()
  FROM public.food_entries fe
  JOIN public.meal_logs ml ON ml.id = fe.meal_log_id
  WHERE fe.user_id = OLD.user_id
    AND ml.logged_date = OLD.logged_date
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    total_calories  = EXCLUDED.total_calories,
    total_protein_g = EXCLUDED.total_protein_g,
    total_carbs_g   = EXCLUDED.total_carbs_g,
    total_fat_g     = EXCLUDED.total_fat_g,
    meal_count      = EXCLUDED.meal_count,
    updated_at      = NOW();

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_meal_log_delete ON public.meal_logs;
CREATE TRIGGER on_meal_log_delete
  AFTER DELETE ON public.meal_logs
  FOR EACH ROW EXECUTE PROCEDURE public.recompute_daily_summary_after_meal_delete();


-- ─── FIX: same defect class blocks account deletion via water_logs ───────────
--
-- update_water_summary() (003_triggers_functions.sql:87) has the bug 016 fixed
-- for food, but for the profiles-gone case rather than the meal-gone one. During
-- account deletion, water_logs rows cascade away and this trigger tries to
-- upsert into daily_summaries for a user whose profiles row is already deleted —
-- which the FK rejects, aborting the whole delete. Deleting your account and
-- your data is a Play Store requirement, so this ships in the same migration.
CREATE OR REPLACE FUNCTION public.update_water_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_date    DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_date    := OLD.logged_date;
  ELSE
    v_user_id := NEW.user_id;
    v_date    := NEW.logged_date;
  END IF;

  -- Owning profile is gone (mid-cascade from an account delete) — there is no
  -- cache row to keep correct, and inserting one would violate the FK.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.daily_summaries (user_id, summary_date, total_water_ml, updated_at)
  SELECT
    v_user_id,
    v_date,
    COALESCE(SUM(amount_ml), 0),
    NOW()
  FROM public.water_logs
  WHERE user_id = v_user_id AND logged_date = v_date
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    total_water_ml = EXCLUDED.total_water_ml,
    updated_at     = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;
