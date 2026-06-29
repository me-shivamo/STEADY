-- Performance indexes for the hot date-fetch query path.
-- fetchEntriesForDate filters meal_logs by (user_id, logged_date) and joins
-- food_entries by meal_log_id on every calendar date tap.

CREATE INDEX IF NOT EXISTS meal_logs_user_date_idx
  ON public.meal_logs (user_id, logged_date);

CREATE INDEX IF NOT EXISTS food_entries_meal_log_idx
  ON public.food_entries (meal_log_id);
  