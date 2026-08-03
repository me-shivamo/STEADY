-- Repoint the reminder cron job at Vault.
--
-- Migration 013 originally scheduled this job using
-- current_setting('app.settings.edge_function_url'), the approach that works
-- on self-hosted Postgres via ALTER DATABASE ... SET. Hosted Supabase doesn't
-- grant superuser, so those settings were never defined and every single run
-- failed with:
--
--   ERROR: unrecognized configuration parameter "app.settings.edge_function_url"
--
-- 1,685 consecutive failures between 2026-07-28 and 2026-08-03 — no push
-- notification was ever delivered. 013's file was later corrected to read
-- from Vault and the two secrets were created by hand, but the *already
-- scheduled* job kept its original body: `supabase db push` skips 013 because
-- it's recorded as applied, so the corrected version could never reach
-- production on its own. Hence this migration.
--
-- cron.schedule() upserts on job name, so re-running it with the same
-- 'send-scheduled-notifications' name replaces the stored command rather than
-- creating a second job. Verify after applying with:
--   SELECT command FROM cron.job WHERE jobname = 'send-scheduled-notifications';
--   SELECT status, return_message FROM cron.job_run_details
--     ORDER BY start_time DESC LIMIT 3;
--
-- Prerequisite (already done on this project, 2026-07-28): the two Vault
-- secrets must exist, or the job will fail with a NULL url instead.
--   SELECT vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-scheduled-notifications', 'edge_function_url');
--   SELECT vault.create_secret('<service-role-key>', 'service_role_key');

SELECT cron.schedule(
  'send-scheduled-notifications',
  '*/5 * * * *',  -- must stay in sync with WINDOW_MINUTES in the Edge Function
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
