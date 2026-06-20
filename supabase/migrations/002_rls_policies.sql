-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- RLS means every SELECT/INSERT/UPDATE/DELETE on a table automatically
-- filters by the logged-in user's ID. Without this, any authenticated user
-- could read anyone else's data just by knowing their user_id.

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_food_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_limits       ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES ───────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ─── FOOD ITEMS (shared cache — anyone authenticated can read, only creator can write) ─
CREATE POLICY "Authenticated users can read food items"
  ON public.food_items FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert food items they create"
  ON public.food_items FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update food items they created"
  ON public.food_items FOR UPDATE USING (auth.uid() = created_by);

-- ─── USER FOOD PREFERENCES ──────────────────────────────────────────────────
CREATE POLICY "Users manage own food preferences"
  ON public.user_food_preferences FOR ALL USING (auth.uid() = user_id);

-- ─── MEAL LOGS ──────────────────────────────────────────────────────────────
CREATE POLICY "Users manage own meal logs"
  ON public.meal_logs FOR ALL USING (auth.uid() = user_id);

-- ─── FOOD ENTRIES ───────────────────────────────────────────────────────────
CREATE POLICY "Users manage own food entries"
  ON public.food_entries FOR ALL USING (auth.uid() = user_id);

-- ─── WEIGHT LOGS ────────────────────────────────────────────────────────────
CREATE POLICY "Users manage own weight logs"
  ON public.weight_logs FOR ALL USING (auth.uid() = user_id);

-- ─── WATER LOGS ─────────────────────────────────────────────────────────────
CREATE POLICY "Users manage own water logs"
  ON public.water_logs FOR ALL USING (auth.uid() = user_id);

-- ─── BODY MEASUREMENTS ──────────────────────────────────────────────────────
CREATE POLICY "Users manage own body measurements"
  ON public.body_measurements FOR ALL USING (auth.uid() = user_id);

-- ─── CHAT MESSAGES ──────────────────────────────────────────────────────────
CREATE POLICY "Users manage own chat messages"
  ON public.chat_messages FOR ALL USING (auth.uid() = user_id);

-- ─── DAILY SUMMARIES ────────────────────────────────────────────────────────
CREATE POLICY "Users can read own daily summaries"
  ON public.daily_summaries FOR SELECT USING (auth.uid() = user_id);

-- Summaries are written by a DB trigger running as SECURITY DEFINER,
-- so users don't need INSERT/UPDATE permissions directly.

-- ─── STREAKS ────────────────────────────────────────────────────────────────
CREATE POLICY "Users can read own streaks"
  ON public.streaks FOR SELECT USING (auth.uid() = user_id);

-- ─── USAGE LIMITS ───────────────────────────────────────────────────────────
CREATE POLICY "Users can read own usage limits"
  ON public.usage_limits FOR SELECT USING (auth.uid() = user_id);
