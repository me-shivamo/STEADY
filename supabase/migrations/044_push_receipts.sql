-- Store the Expo ticket id so delivery can actually be confirmed.
--
-- Expo answers a push in two stages and it is easy to mistake the first for
-- success. A TICKET comes back immediately and only means Expo accepted the
-- message into its queue. A RECEIPT, fetched separately a few minutes later,
-- is FCM's or APNs' actual verdict on whether the device received it.
--
-- STEADY has only ever checked tickets, so anything that failed after handoff
-- (an uninstalled app, an expired token, a message rejected downstream) has
-- been recorded as `sent`. Our delivery numbers have therefore been optimistic
-- by an unknown amount, which is the worst kind of wrong: confidently precise.
--
-- The most valuable thing hiding in receipts is DeviceNotRegistered, which is
-- what an uninstalled app looks like. We already handle it when it appears in
-- the ticket, but it usually does not: Expo cannot know the app is gone until
-- FCM tells it, which happens at receipt time.
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS ticket_id     TEXT,
  ADD COLUMN IF NOT EXISTS receipt_status TEXT,
  ADD COLUMN IF NOT EXISTS receipt_error TEXT,
  ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ;

-- The worklist for the receipt poller: sent, has a ticket, not yet checked.
-- Partial index because that set is small and shrinks as rows are resolved,
-- while the table only grows.
CREATE INDEX IF NOT EXISTS notification_log_pending_receipts_idx
  ON public.notification_log (sent_at)
  WHERE ticket_id IS NOT NULL AND receipt_checked_at IS NULL;

COMMENT ON COLUMN public.notification_log.ticket_id IS
  'Expo push ticket id. Exchanged for a delivery receipt ~15 min later; a ticket alone only proves Expo queued the message, not that it arrived.';
