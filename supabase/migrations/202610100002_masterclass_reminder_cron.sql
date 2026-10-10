-- Masterclass reminder — ACTIVATION (cron). APPLY ONLY ON EXPLICIT APPROVAL.
--
-- Installs the 15-minute pg_cron job that POSTs the masterclass-reminder Edge
-- Function. Installing this job does NOT send any email: the function returns
-- early unless BOTH of these hold:
--   1. MASTERCLASS_REMINDER_ENABLED == "true" (Edge Function secret; ships false), and
--   2. the request carries the correct MASTERCLASS_CRON_SECRET.
-- So with the kill switch off this is a harmless no-op heartbeat.
--
-- Replace __CRON_SECRET__ with the same value as the MASTERCLASS_CRON_SECRET
-- Edge Function secret before applying.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('masterclass-reminder-check') where exists (
  select 1 from cron.job where jobname = 'masterclass-reminder-check'
);

select cron.schedule(
  'masterclass-reminder-check',
  '*/15 * * * *',
  $$ select net.http_post(
    url := 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'run', 'cron_secret', '__CRON_SECRET__')
  ) $$
);
