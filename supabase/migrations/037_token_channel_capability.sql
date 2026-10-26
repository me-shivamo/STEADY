-- Record what each device is CAPABLE of receiving, so the server can stop
-- sending notifications that a given phone will silently throw away.
--
-- ─── THE BUG THIS FIXES ─────────────────────────────────────────────────────
-- Migration 035 gave every template a `channel`, and the sender started putting
-- it in the push payload as `channelId`. Expo's documentation is unambiguous
-- about what that means:
--
--   "If an ID is specified but the corresponding channel does not exist on the
--    device (that has not yet been created by your app), the notification will
--    not be displayed to the user."
--
-- Android 8+ drops such notifications silently: no error, no log, no failed
-- ticket. The push looks perfectly successful from the server's side and simply
-- never appears on the phone.
--
-- Notification channels are created by the APP, not by the server. The build
-- currently in users' hands creates exactly one, 'default'. The new build
-- creates eight. So shipping the new server behaviour to an old client means
-- every notification it sends vanishes. Server code deploys instantly to
-- everyone; app code only reaches whoever updates, and on Android that is a
-- long tail measured in weeks.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
-- The server cannot guess, so the client tells it. register-push-token now
-- accepts a channels_version, and the sender uses a specific channel only for
-- devices known to have created it. Everyone else keeps getting 'default',
-- which every build since the feature launched has created.
--
-- This is self-healing: the moment a user updates, their next app launch
-- re-registers the token with version 1 and they start receiving channelled
-- notifications automatically. No migration of users, no cutover date, no
-- flag day.
--
--   0 = pre-channels build. Only 'default' exists. (The default, so every
--       token already in the table is correctly assumed to be old.)
--   1 = the seven-channel build from 2026-08-07.
--
-- Bump this integer whenever the set of channels the app creates changes.
-- Channels are immutable once created on a device, so a new channel really does
-- mean a new capability level rather than an edit to an existing one.

ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS channels_version INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.device_push_tokens.channels_version IS
  'Which set of Android notification channels this device has created. 0 = only "default" (pre-2026-08-07 builds); 1 = the seven-channel set. The sender must not send a channelId the device has not created, or Android silently drops the notification.';
