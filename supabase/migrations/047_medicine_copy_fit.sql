-- Tighten the medicine copy so real medicine names fit, and drop the verb.
--
-- Rendering the new templates against a real user exposed two faults that only
-- appear once a variable carries a genuine value:
--
-- 1. GRAMMAR. "F-Alexa + F-Trichoprotein is due now" is wrong the moment two
--    medicines are due, and we cannot know in advance how many there will be.
--    Rather than trying to pluralise a verb from a runtime count, the copy now
--    avoids the verb entirely: "F-Alexa + F-Trichoprotein. Due now ⏰" reads
--    correctly for one medicine or five.
--
-- 2. LENGTH. Three variants rendered past the 45-character banner limit (up to
--    49) because a 25-character medicine list plus a 24-character tail does not
--    fit. The suffixes are now 12 characters or fewer, which leaves room for a
--    realistic list of names.
--
-- The wider lesson, already learned once with {{group_name}}: a template that
-- looks fine in the catalogue can still overflow once a user-supplied value
-- lands in it. Measure the rendered string, never the template.
--
-- Note we deliberately do NOT truncate medicine names aggressively. Android
-- shows the full body when a notification is expanded, so a slightly long
-- banner is recoverable; a name hard-truncated to "F-Trichoprote…" is not, and
-- on a medical reminder completeness beats tidiness.

UPDATE public.notification_templates SET active = FALSE
 WHERE reminder_type = 'medicine' AND active;

INSERT INTO public.notification_templates
  (reminder_type, title, variant_text, tone, channel, deep_link, is_ai_generated, active)
VALUES
  ('medicine', 'Medicine time 💊',              '{{medicine_name}}. Due now ⏰',   'serious',        'reminders', 'home', FALSE, TRUE),
  ('medicine', '{{first_name}}, medicine 💊',   '{{medicine_name}}. Quick one ⏰', 'friendly',       'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Pill o clock 💊',               '{{medicine_name}}. Go on ⏰',     'funny',          'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Small thing, big payoff 💊',    '{{medicine_name}}. Take it 💪',   'motivational',   'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Take your medicine 😤',         '{{medicine_name}}. Now please 💊','cute-angry',     'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Dawai le li, {{first_name}}? 👵','{{medicine_name}}. Na bhoolna 💊','persona:grandma','reminders', 'home', FALSE, TRUE);
