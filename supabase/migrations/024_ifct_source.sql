-- Allow 'ifct' as a food data source.
--
-- IFCT 2017 (Indian Food Composition Tables, ICMR-NIN) is 542 Indian foods
-- lab-measured across six regions. It covers ingredients USDA simply doesn't
-- carry under the names Indian users type — bajra, jowar, ragi, rajmah, paneer
-- resolve to nothing useful in USDA but are primary entries here.
--
-- It gets its own source value rather than being folded into 'indb' because the
-- two are different kinds of data and we resolve them differently: INDB is
-- ~1,014 COOKED dishes (poha, dosa), IFCT is RAW ingredient composition. Keeping
-- them distinct means provenance stays honest and we can tell, from a row alone,
-- whether its numbers describe food as eaten or as bought.
--
-- Both constraints are restated in full (not appended to) because Postgres CHECK
-- constraints have no "add one value" operation — you drop and recreate. The
-- full prior value list is carried forward deliberately; dropping one would
-- orphan existing rows. Prior state: food_items from 008, food_entries from 012.

ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS food_items_source_check;
ALTER TABLE public.food_items ADD CONSTRAINT food_items_source_check
  CHECK (source IN ('usda', 'open_food_facts', 'user_created', 'ai_estimated', 'indb', 'label', 'ifct'));

ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_macro_source_check;
ALTER TABLE public.food_entries ADD CONSTRAINT food_entries_macro_source_check
  CHECK (macro_source IN ('usda', 'indb', 'ai_estimated', 'user_created', 'label', 'ifct'));
