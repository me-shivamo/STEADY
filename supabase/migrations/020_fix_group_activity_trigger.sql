-- Fix a race condition in update_group_daily_activity() (019_groups.sql)
-- found during manual verification: when multiple meal_logs rows are
-- inserted in the same statement/transaction (e.g. a photo log that creates
-- several rows at once), every row's AFTER INSERT trigger firing saw the
-- SAME final meal_logs count for that day, so "count = 1" was never true
-- for a multi-row batch and the group_activity_events 'logged_meal' entry
-- silently never got created — even though group_daily_activity's
-- did_log/meal_count were still updated correctly. Fixed by checking
-- group_daily_activity's own prior did_log value (read before the upsert)
-- instead of inferring "first log of the day" from a meal_logs COUNT that
-- isn't stable across rows inserted together.
CREATE OR REPLACE FUNCTION public.update_group_daily_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_date           DATE;
  v_new_count      INT;
  v_already_logged BOOLEAN;
  g RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_date    := OLD.logged_date;
  ELSE
    v_user_id := NEW.user_id;
    v_date    := NEW.logged_date;
  END IF;

  SELECT COUNT(*) INTO v_new_count
  FROM public.meal_logs
  WHERE user_id = v_user_id AND logged_date = v_date;

  FOR g IN SELECT group_id FROM public.group_members WHERE user_id = v_user_id LOOP
    SELECT did_log INTO v_already_logged
    FROM public.group_daily_activity
    WHERE group_id = g.group_id AND user_id = v_user_id AND activity_date = v_date;

    INSERT INTO public.group_daily_activity (group_id, user_id, activity_date, did_log, meal_count, updated_at)
    VALUES (g.group_id, v_user_id, v_date, v_new_count > 0, v_new_count, NOW())
    ON CONFLICT (group_id, user_id, activity_date)
    DO UPDATE SET did_log = EXCLUDED.did_log, meal_count = EXCLUDED.meal_count, updated_at = NOW();

    IF TG_OP = 'INSERT' AND v_new_count > 0 AND NOT COALESCE(v_already_logged, FALSE) THEN
      INSERT INTO public.group_activity_events (group_id, user_id, event_type, event_meta)
      VALUES (g.group_id, v_user_id, 'logged_meal', jsonb_build_object('date', v_date));
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;
