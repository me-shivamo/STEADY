-- ─── FIX: deleting a meal left the user's own message behind ─────────────────
--
-- Migration 027 made meal deletion work by giving chat_messages.meal_log_id an
-- ON DELETE CASCADE. But only the ASSISTANT's confirmation row ever carried a
-- meal_log_id — saveChatTurn() wrote the user's own message with meal_log_id
-- NULL. So a delete removed half the pair and stranded the other half.
--
-- That produced two user-visible bugs, and the second is much worse than it
-- looks:
--
--   1. The user's message stayed in the thread with no meal card under it.
--
--   2. The next food log came back combined with the DELETED food. This is not
--      an AI quirk — it is a direct consequence of how history is filtered.
--      loadChatHistory() decides "this user turn was a food log, don't replay
--      it" by checking whether the NEXT row is a food_log_confirmation:
--
--          if (m.role === 'user' && rows[i+1]?.message_type === 'food_log_confirmation')
--
--      Cascading the confirmation away flips that test. The orphaned message is
--      then replayed as a live user turn, so the model receives two consecutive
--      user messages with no assistant turn between them, reads them as one
--      continued utterance, and logs both.
--
-- The Edge Functions now stamp meal_log_id on the user row as well, so new
-- messages cascade correctly. This migration repairs the rows already written.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- --------------------------------------------
-- It does not delete unpaired user rows. That was the obvious cleanup and it is
-- wrong: measured on the live database, only 141 of 414 user rows have an
-- assistant row at the same created_at. The missing 273 are not deleted meals —
-- they predate the `userSentAt` change (commit 1340ec2), when the two rows were
-- written with independent timestamps. Recent days pair almost perfectly
-- (2026-08-02: 10/10, 08-03: 12/12, 08-04: 11/13), which is what makes the
-- backfill below safe while a blanket delete would have destroyed months of
-- legitimate history.
--
-- Leftover orphans from meals deleted before this migration are handled as a
-- reviewed, row-by-row cleanup instead — they are few, and correctness here
-- matters more than tidiness.

-- Pair each user row with the assistant confirmation written in the same
-- saveChatTurn() insert. `created_at` is an exact key for that, not a heuristic:
-- both rows are given the identical `userSentAt` value in a single insert call.
UPDATE public.chat_messages AS u
SET    meal_log_id = a.meal_log_id
FROM   public.chat_messages AS a
WHERE  u.role          = 'user'
  AND  u.meal_log_id   IS NULL
  AND  a.role          = 'assistant'
  AND  a.message_type  = 'food_log_confirmation'
  AND  a.meal_log_id   IS NOT NULL
  AND  a.user_id       = u.user_id
  AND  a.created_at    = u.created_at;

-- Index the column we now filter and cascade on. Without it, every meal delete
-- does a sequential scan of chat_messages to find referencing rows, and
-- loadChatHistory's new meal_log_id check has no support either.
CREATE INDEX IF NOT EXISTS chat_messages_meal_log_id_idx
  ON public.chat_messages (meal_log_id)
  WHERE meal_log_id IS NOT NULL;
