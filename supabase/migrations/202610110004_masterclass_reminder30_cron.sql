-- 30-minute masterclass reminder scheduler.
--
-- Fires ONCE at 2026-10-11 09:30 UTC (17:30 PHT), 30 minutes before the
-- 18:00 PHT masterclass. pg_cron runs in UTC.
--
-- Safety:
--   * The Edge Function re-checks its send window (09:25–09:50 UTC), so the job
--     cannot send early and a stray manual call cannot send early.
--   * Per-recipient idempotency key (reminder30-2026-10-11:<signup_id>) makes a
--     repeated invocation a no-op, so it cannot double-send.
--   * Recipients are resolved live at run time, so registrants who sign up before
--     the run are included; unsubscribed/diagnostic/invalid are excluded.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('masterclass-reminder30') where exists (
  select 1 from cron.job where jobname = 'masterclass-reminder30'
);

select cron.schedule(
  'masterclass-reminder30',
  '30 9 11 10 *',
  $$ select net.http_post(
    url := 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'reminder30', 'cron_secret', 'fdfeee5210da48030bf66a0552227bc2e4ddb1c7c70f19d837d43e37698685b9')
  ) $$
);