-- Put the actual medicine names into medicine reminders.
--
-- A user in production takes seven different medicines, all at 22:00, on four
-- different day-patterns (Mon/Thu, Tue/Fri, Wed/Sat, Sun). The reminder they
-- get says "Time for your medicine 💊", which means the notification cannot
-- answer the only question it raises: WHICH one tonight? They have to open the
-- app to find out. For a habit nudge that is a small annoyance; for medication
-- it defeats the purpose of the reminder.
--
-- The day-matching logic already exists inside find_due_reminders (migration
-- 022), but it lives in a WHERE clause and only decides yes/no. This function
-- reuses the same rule to return the NAMES, so the sender can interpolate them.
-- Deliberately a separate function rather than another output column on
-- find_due_reminders: that function has now been dropped and recreated four
-- times, losing an output column twice in the process (see migration 029), and
-- it does not need a fifth reason to be rewritten.
--
-- Returns NULL when nothing matches, so the caller can fall back to generic
-- copy rather than rendering an empty string into a medical notification.
CREATE OR REPLACE FUNCTION public.medicines_due_at(p_user UUID, p_time TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(string_agg(med->>'name', ' + ' ORDER BY med->>'name'), '')
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(np.config->'meds','[]'::jsonb)) med
  WHERE np.user_id = p_user
    AND np.reminder_type = 'medicine'
    AND np.enabled
    AND med->>'time' = p_time
    -- Same rule as migration 022: an empty or absent days array means every
    -- day, otherwise today's weekday must appear in it.
    AND (
      jsonb_array_length(COALESCE(med->'days','[]'::jsonb)) = 0
      OR (med->'days') ? to_char(NOW() AT TIME ZONE COALESCE(p.timezone,'UTC'), 'Dy')
    );
$$;

GRANT EXECUTE ON FUNCTION public.medicines_due_at(UUID, TEXT) TO authenticated;

-- ─── COPY: name the medicine, and use the person's name ─────────────────────
-- {{medicine_name}} renders the medicines actually due at this time today
-- ("F-Trichoprotein + F-Alexa"), falling back to "your medicine" when the
-- lookup finds nothing, so a template can never ship an empty gap.
-- {{first_name}} is used sparingly: on a medical reminder it reads as care in
-- one or two variants and as a mail-merge in all six.
UPDATE public.notification_templates SET active = FALSE
 WHERE reminder_type = 'medicine' AND active;

INSERT INTO public.notification_templates
  (reminder_type, title, variant_text, tone, channel, deep_link, is_ai_generated, active)
VALUES
  ('medicine', 'Medicine time 💊',              '{{medicine_name}} is due now ⏰',        'serious',      'reminders', 'home', FALSE, TRUE),
  ('medicine', '{{first_name}}, medicine 💊',   '{{medicine_name}}. Quick one ⏰',        'friendly',     'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Pill o clock 💊',               '{{medicine_name}}. You know the drill ⏰','funny',       'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Small thing, big difference 💊','{{medicine_name}}. Take it and carry on 💪','motivational','reminders','home', FALSE, TRUE),
  ('medicine', 'Take your medicine 😤',         '{{medicine_name}}. I will keep asking 💊','cute-angry',  'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Dawai le li, {{first_name}}? 👵','{{medicine_name}}. Do not skip it 💊',   'persona:grandma','reminders','home', FALSE, TRUE);
