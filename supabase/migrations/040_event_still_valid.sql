-- The send-time re-check: "is this queued message still true?"
--
-- This is the piece that replaces cancel-on-action triggers. The alternative
-- design put a trigger on meal_logs, water_logs, chat_messages and group_members
-- to delete queued rows when a user did the thing. That is a trigger per table,
-- each one duplicating a rule that lives somewhere else, and each free to drift
-- out of sync with it. This codebase has already produced that exact failure
-- twice in one week (a streak cache that stopped updating, and find_due_reminders
-- losing an output column across two migrations).
--
-- So instead the queue holds a *candidate*, and this function is consulted at
-- the moment of sending. There is nothing to keep in sync, because the check
-- reads current state rather than a mirror of it. The cost is one extra call
-- per send, which at this scale is free.
--
-- Returns FALSE when the message has stopped making sense, and the drainer
-- marks the row 'skipped' with reason 'condition_no_longer_true'. That is the
-- difference between "logged your lunch, so the lunch nudge never arrived" and
-- the far more annoying "logged your lunch, and got told to log your lunch".
--
-- Celebrations are always valid: they describe something that already happened,
-- and nothing a user does afterwards makes "you hit your target" untrue.
CREATE OR REPLACE FUNCTION public.event_still_valid(p_user UUID, p_event TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  s JSONB;
BEGIN
  s := public.build_user_state(p_user);
  IF s IS NULL THEN RETURN FALSE; END IF;

  RETURN CASE p_event
    -- Anything whose whole point is "you have not logged" dies the moment they do.
    WHEN 'lunch_nudge'             THEN COALESCE((s ->> 'meals_logged_today')::INT, 0) = 0
    WHEN 'dinner_nudge'            THEN COALESCE((s ->> 'meals_logged_today')::INT, 0) < 2
    WHEN 'first_log_nudge_evening' THEN (s ->> 'has_logged_food')::BOOLEAN IS FALSE
    WHEN 'how_to_log_food'         THEN (s ->> 'has_logged_food')::BOOLEAN IS FALSE
    WHEN 'day1_morning'            THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'streak_risk_evening'     THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'group_activity'          THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'under_eating_evening'    THEN COALESCE((s ->> 'calories_target')::NUMERIC, 0) > 0
                                    AND COALESCE((s ->> 'calories_logged')::NUMERIC, 0)
                                        < COALESCE((s ->> 'calories_target')::NUMERIC, 0) * 0.5

    -- Win-back messages are wrong the instant somebody comes back.
    WHEN 'lapse_1d'  THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'lapse_3d'  THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'lapse_7d'  THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'lapse_14d' THEN (s ->> 'logged_today')::BOOLEAN IS FALSE
    WHEN 'lapse_30d' THEN (s ->> 'logged_today')::BOOLEAN IS FALSE

    -- Discovery messages die once the feature has been discovered.
    WHEN 'discover_chat_water'      THEN (s ->> 'has_logged_water')::BOOLEAN IS FALSE
    WHEN 'discover_chat_logging'    THEN (s ->> 'has_used_chat')::BOOLEAN IS FALSE
    WHEN 'discover_groups'          THEN (s ->> 'has_group')::BOOLEAN IS FALSE
    WHEN 'group_no_join_day7'       THEN (s ->> 'has_group')::BOOLEAN IS FALSE
    WHEN 'day3_reminders_screen'    THEN (s ->> 'has_reminder_enabled')::BOOLEAN IS FALSE

    WHEN 'water_behind_afternoon'   THEN COALESCE((s ->> 'water_goal_ml')::NUMERIC, 0) > 0
                                     AND COALESCE((s ->> 'water_ml')::NUMERIC, 0)
                                         < COALESCE((s ->> 'water_goal_ml')::NUMERIC, 0) * 0.4
    WHEN 'weigh_in_nudge_7d'        THEN COALESCE((s ->> 'days_since_weigh_in')::INT, 99) >= 7

    -- Celebrations, tips and recaps describe something already true.
    ELSE TRUE
  END;
END;
$fn$;
