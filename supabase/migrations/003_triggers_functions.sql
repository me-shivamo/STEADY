-- ─── TRIGGER: Auto-create profile + streak + usage_limits on signup ──────────
-- When Supabase creates a new auth.users row (user signs up), this trigger
-- fires and creates the corresponding rows in our public tables automatically.
-- Without this, we'd have to call extra API requests from the app after signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.streaks (user_id)
  VALUES (NEW.id);

  INSERT INTO public.usage_limits (user_id, date)
  VALUES (NEW.id, CURRENT_DATE);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── TRIGGER: Auto-upsert daily_summaries when food_entries change ───────────
-- Instead of recalculating totals in the app every time, a DB trigger keeps
-- daily_summaries up to date. The home screen just reads one pre-aggregated row.

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

CREATE TRIGGER on_food_entry_change
  AFTER INSERT OR UPDATE OR DELETE ON public.food_entries
  FOR EACH ROW EXECUTE PROCEDURE public.update_daily_summary();

-- ─── TRIGGER: Auto-update water total in daily_summaries ────────────────────
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

CREATE TRIGGER on_water_log_change
  AFTER INSERT OR UPDATE OR DELETE ON public.water_logs
  FOR EACH ROW EXECUTE PROCEDURE public.update_water_summary();

-- ─── FUNCTION: Reset usage limits daily (called by a Supabase cron job) ──────
CREATE OR REPLACE FUNCTION public.reset_daily_usage_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage_limits (user_id, date)
  SELECT id, CURRENT_DATE FROM public.profiles
  ON CONFLICT (user_id, date) DO NOTHING;
END;
$$;

-- ─── FUNCTION: Update profiles.updated_at automatically ─────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER set_meal_logs_updated_at
  BEFORE UPDATE ON public.meal_logs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
