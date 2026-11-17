-- scripts/eval/calibration-intercept-real-users.sql — READ-ONLY input for
--   npx tsx scripts/eval/calibration-intercept-check.ts --real-users
--
-- Real users' own chat messages (role 'user': text messages and photo captions; a successful edit saves no
-- chat row), eval accounts (@steadyapp.internal) excluded. The script runs
-- this through `npx supabase db query --linked -o csv -f <this file>`, keeps the output in memory only, and
-- prints counts. Its output IS user free text: never run it by hand into a file, a terminal or a log.
--
-- Columns (the script checks the header):
--   u       an ordinal per user (dense_rank), so distinct users can be counted without any user id
--   logged  the message became a food log when it was sent: the user row carries the meal id (Edge Functions
--           since migration 028, which backfilled older rows), or the next row in that user's thread is the
--           food_log_confirmation (the test loadChatHistory() uses). saveChatTurn() writes both rows of a turn
--           with the same created_at, so the user row sorts first within a timestamp.
--   text    the message
WITH thread AS (
  SELECT cm.user_id, cm.role, cm.content, cm.meal_log_id,
         lead(cm.message_type) OVER (PARTITION BY cm.user_id ORDER BY cm.created_at, (cm.role = 'assistant'), cm.id) AS next_type
    FROM public.chat_messages cm
)
SELECT dense_rank() OVER (ORDER BY t.user_id) AS u,
       (t.meal_log_id IS NOT NULL OR t.next_type IS NOT DISTINCT FROM 'food_log_confirmation') AS logged,
       t.content AS text
  FROM thread t
  JOIN auth.users au ON au.id = t.user_id
 WHERE t.role = 'user'
   AND lower(coalesce(au.email, '')) NOT LIKE '%@steadyapp.internal';
