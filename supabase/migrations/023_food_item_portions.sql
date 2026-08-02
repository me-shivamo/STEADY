-- Store USDA's household measures alongside each cached food.
--
-- Why: food_items is a read-through cache of per-100g nutrition. That makes the
-- macro numbers deterministic, but it throws away the other half of the answer —
-- how much a "bowl"/"piece"/"cup" of the food actually weighs. On a cache hit the
-- resolver skips the USDA lookup entirely (that's the point of the cache), so it
-- had no way to sanity-check the parse step's gram guess and silently kept it.
-- That's how "a bowl of cereal" stayed at 150g (a bowl of *cooked rice* weight)
-- when a bowl of dry cereal is nearer 40g — a ~3x calorie error on a food whose
-- per-100g figure was perfectly correct.
--
-- Shape mirrors usda.ts's UsdaPortion[]:
--   [{"description": "1 cup", "gramWeight": 30}, ...]
-- Nullable: rows predating this (and INDB/AI-estimated rows, which have no USDA
-- measures) simply carry no portions and fall back to the old behaviour.
alter table public.food_items
  add column if not exists portions jsonb;

comment on column public.food_items.portions is
  'USDA household measures for this food, e.g. [{"description":"1 cup","gramWeight":30}]. Used to correct portion-size estimates on cache hits. Null when unknown.';
