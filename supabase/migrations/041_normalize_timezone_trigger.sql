-- Normalise deprecated IANA timezone aliases on write, not once.
--
-- Migration 030 ran a one-time UPDATE turning 'Asia/Calcutta' into
-- 'Asia/Kolkata'. Six days later, 5 users with push tokens are on
-- 'Asia/Calcutta' again. The one-time fix was always going to lose, because the
-- app writes the device's reported timezone on every launch
-- (authStore.fetchProfile and saveDeviceTimezone), and some Android devices
-- still report the old alias. Cleaning data that a live write path keeps
-- re-dirtying is not a fix, it is a chore on a timer.
--
-- Worth being precise about the impact, because it is narrower than it looks.
-- Postgres resolves both spellings to the same zone, so AT TIME ZONE has always
-- produced the correct local time and no user has ever been notified at the
-- wrong hour. The damage is analytical: every GROUP BY timezone splits one
-- population into two, every `WHERE timezone = 'Asia/Kolkata'` silently misses a
-- third of our Indian users, and the send-time heatmap in migration 033 gets
-- built from a fragmented view.
--
-- A BEFORE trigger fixes it at the only place it can actually stick: the moment
-- of writing. Every future write is normalised regardless of which client sent
-- it or which build they are running.

CREATE OR REPLACE FUNCTION public.normalize_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.timezone IS NOT NULL THEN
    NEW.timezone := CASE NEW.timezone
      WHEN 'Asia/Calcutta'   THEN 'Asia/Kolkata'
      WHEN 'Asia/Katmandu'   THEN 'Asia/Kathmandu'
      WHEN 'Asia/Rangoon'    THEN 'Asia/Yangon'
      WHEN 'Asia/Saigon'     THEN 'Asia/Ho_Chi_Minh'
      WHEN 'Europe/Kiev'     THEN 'Europe/Kyiv'
      WHEN 'America/Buenos_Aires' THEN 'America/Argentina/Buenos_Aires'
      ELSE NEW.timezone
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS normalize_timezone_trigger ON public.profiles;
CREATE TRIGGER normalize_timezone_trigger
  BEFORE INSERT OR UPDATE OF timezone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_timezone();

-- Clean what is already there. This time it stays clean.
UPDATE public.profiles SET timezone = timezone WHERE timezone IS NOT NULL;

-- The activity prior was built from the fragmented view, so rebuild it now that
-- the zones agree.
SELECT public.refresh_activity_prior();
