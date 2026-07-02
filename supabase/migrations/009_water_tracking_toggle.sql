-- Opt-in switch for the Water feature. Off by default — the home screen's
-- water card and the goal field in Settings only appear once a user turns
-- this on, so nobody sees water UI they never asked for.
ALTER TABLE public.profiles
  ADD COLUMN water_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;
