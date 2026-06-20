-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PROFILES ───────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  avatar_url            TEXT,
  date_of_birth         DATE,
  sex                   TEXT CHECK (sex IN ('male', 'female', 'other')),
  height_cm             NUMERIC,
  current_weight_kg     NUMERIC,
  goal_weight_kg        NUMERIC,
  goal                  TEXT CHECK (goal IN ('lose_weight', 'gain_weight', 'maintain', 'build_muscle')),
  activity_level        TEXT CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'super_active')),
  calorie_goal          INT,
  protein_goal_g        NUMERIC,
  carb_goal_g           NUMERIC,
  fat_goal_g            NUMERIC,
  water_goal_ml         INT DEFAULT 2500,
  dietary_restrictions  TEXT[] DEFAULT '{}',
  deadline_date         DATE,
  onboarding_complete   BOOLEAN DEFAULT FALSE,
  subscription_tier     TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  units_system          TEXT DEFAULT 'metric' CHECK (units_system IN ('metric', 'imperial')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FOOD ITEMS (shared nutrition cache) ────────────────────────────────────
CREATE TABLE public.food_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id                 TEXT,
  source                      TEXT CHECK (source IN ('usda', 'open_food_facts', 'user_created', 'ai_estimated')),
  name                        TEXT NOT NULL,
  brand                       TEXT,
  barcode                     TEXT,
  calories                    NUMERIC,
  protein_g                   NUMERIC,
  carbs_g                     NUMERIC,
  fat_g                       NUMERIC,
  fiber_g                     NUMERIC,
  sugar_g                     NUMERIC,
  sodium_mg                   NUMERIC,
  serving_size_g              NUMERIC,
  serving_size_description    TEXT,
  created_by                  UUID REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX food_items_barcode_idx ON public.food_items (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX food_items_fts_idx ON public.food_items USING gin(to_tsvector('english', name));

-- ─── USER FOOD PREFERENCES (My Foods — personalized AI calibration) ──────────
CREATE TABLE public.user_food_preferences (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_name                 TEXT NOT NULL,
  normalized_name           TEXT NOT NULL,
  preferred_calories_per_g  NUMERIC,
  edit_count                INT DEFAULT 1,
  last_used_at              TIMESTAMPTZ DEFAULT NOW(),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MEAL LOGS (daily meal containers) ──────────────────────────────────────
CREATE TABLE public.meal_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  photo_url   TEXT,
  caption     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, logged_date, meal_type)
);

-- ─── FOOD ENTRIES (individual foods per meal) ───────────────────────────────
CREATE TABLE public.food_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_log_id     UUID NOT NULL REFERENCES public.meal_logs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_item_id    UUID REFERENCES public.food_items(id),
  food_name       TEXT NOT NULL,
  quantity_g      NUMERIC NOT NULL,
  calories        NUMERIC NOT NULL,
  protein_g       NUMERIC NOT NULL DEFAULT 0,
  carbs_g         NUMERIC NOT NULL DEFAULT 0,
  fat_g           NUMERIC NOT NULL DEFAULT 0,
  fiber_g         NUMERIC DEFAULT 0,
  sugar_g         NUMERIC DEFAULT 0,
  sodium_mg       NUMERIC DEFAULT 0,
  source          TEXT CHECK (source IN ('manual', 'barcode', 'ai_photo', 'ai_text', 'search')),
  ai_confidence   NUMERIC(4,3),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WEIGHT LOGS ────────────────────────────────────────────────────────────
CREATE TABLE public.weight_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg   NUMERIC NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, logged_date)
);

-- ─── WATER LOGS ─────────────────────────────────────────────────────────────
CREATE TABLE public.water_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml   INT NOT NULL,
  logged_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BODY MEASUREMENTS ──────────────────────────────────────────────────────
CREATE TABLE public.body_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  waist_cm        NUMERIC,
  hips_cm         NUMERIC,
  chest_cm        NUMERIC,
  arms_cm         NUMERIC,
  thighs_cm       NUMERIC,
  neck_cm         NUMERIC,
  body_fat_pct    NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, logged_date)
);

-- ─── CHAT MESSAGES ──────────────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  message_type  TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'food_log_confirmation', 'food_log_card')),
  meal_log_id   UUID REFERENCES public.meal_logs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DAILY SUMMARIES (cached totals — updated by trigger) ───────────────────
CREATE TABLE public.daily_summaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  summary_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  total_calories  NUMERIC DEFAULT 0,
  total_protein_g NUMERIC DEFAULT 0,
  total_carbs_g   NUMERIC DEFAULT 0,
  total_fat_g     NUMERIC DEFAULT 0,
  total_water_ml  NUMERIC DEFAULT 0,
  meal_count      INT DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, summary_date)
);

-- ─── STREAKS ────────────────────────────────────────────────────────────────
CREATE TABLE public.streaks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak    INT DEFAULT 0,
  longest_streak    INT DEFAULT 0,
  last_logged_date  DATE,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USAGE LIMITS (free tier daily caps) ────────────────────────────────────
CREATE TABLE public.usage_limits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date                      DATE NOT NULL DEFAULT CURRENT_DATE,
  barcode_scans_today       INT DEFAULT 0,
  ai_photo_scans_today      INT DEFAULT 0,
  chat_messages_today       INT DEFAULT 0,
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);
