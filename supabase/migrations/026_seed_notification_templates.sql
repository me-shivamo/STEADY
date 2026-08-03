-- Seed notification_templates.
--
-- The table has been empty since it was created in migration 013, which had
-- two consequences. Scheduled sends survived it — pickTemplate() returns null
-- and send-scheduled-notifications falls back to FALLBACK_TEXT — but every
-- reminder of a given type would then read identically forever. Manual sends
-- did not survive it at all: admin-send-notification requires a template_id
-- and returns 404 "Template not found" when none exist, so the admin path was
-- unusable in practice.
--
-- pickTemplate() chooses uniformly at random among the active rows for a
-- reminder_type, so multiple variants per type are what stop a daily reminder
-- from becoming wallpaper the user stops seeing. Text is interpolated at send
-- time; {{streak_days}} is the only placeholder the Edge Functions understand
-- (see interpolate() in both functions). Deliberately absent from the
-- 'medicine' rows: streak language belongs to habit-building, not medical
-- adherence, and generate-template-variants encodes that same rule in its
-- prompt so AI-generated variants keep the distinction.
--
-- is_ai_generated stays FALSE here — these are hand-written baselines. The
-- admin dashboard's "Generate variants" button adds AI rows alongside them.
--
-- Guarded with NOT EXISTS so re-running against a database that already has
-- templates is a no-op rather than a duplicate seed.

INSERT INTO public.notification_templates (reminder_type, variant_text, is_ai_generated, active)
SELECT * FROM (VALUES
  -- workout
  ('workout', 'Time to move. Your workout is waiting.',                    FALSE, TRUE),
  ('workout', 'A quick session still counts. Let''s go.',                  FALSE, TRUE),
  ('workout', '{{streak_days}} days strong — keep the streak alive.',      FALSE, TRUE),
  ('workout', 'Showing up is the hard part. You''ve got this.',            FALSE, TRUE),

  -- meal
  ('meal',    'Don''t forget to log your meal.',                           FALSE, TRUE),
  ('meal',    'What did you eat? Takes 10 seconds to log.',                FALSE, TRUE),
  ('meal',    '{{streak_days}}-day streak. One photo keeps it going.',     FALSE, TRUE),
  ('meal',    'Snap it, log it, done.',                                    FALSE, TRUE),

  -- water
  ('water',   'Stay hydrated — log some water.',                           FALSE, TRUE),
  ('water',   'Time for a glass of water.',                                FALSE, TRUE),
  ('water',   'Hydration check. How are you doing today?',                 FALSE, TRUE),
  ('water',   'Small sip, big difference. Log your water.',                FALSE, TRUE),

  -- walking
  ('walking', 'Time for a walk.',                                          FALSE, TRUE),
  ('walking', 'Ten minutes outside would feel good right now.',            FALSE, TRUE),
  ('walking', 'Step away from the screen — go for a walk.',                FALSE, TRUE),
  ('walking', 'A short walk counts. Let''s get moving.',                   FALSE, TRUE),

  -- weight
  ('weight',  'Log your weight for today.',                                FALSE, TRUE),
  ('weight',  'Quick weigh-in? Consistency is what makes the trend real.', FALSE, TRUE),
  ('weight',  'Time to check in on the scale.',                            FALSE, TRUE),

  -- healthLog
  ('healthLog', 'Update your health log.',                                 FALSE, TRUE),
  ('healthLog', 'How are you feeling today? Add it to your log.',          FALSE, TRUE),
  ('healthLog', 'A minute to log how today went.',                         FALSE, TRUE),

  -- medicine (no {{streak_days}} — see note above)
  ('medicine', 'Time to take your medicine.',                              FALSE, TRUE),
  ('medicine', 'Medicine reminder.',                                       FALSE, TRUE),
  ('medicine', 'Don''t forget your medication.',                           FALSE, TRUE)
) AS seed(reminder_type, variant_text, is_ai_generated, active)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates);
