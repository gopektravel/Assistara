-- 7-minute livestream reminder scheduler (ONE-TIME).
--
-- Fires ONCE at 2026-10-11 10:07 UTC (18:07 PHT), 7 minutes after the masterclass
-- starts. pg_cron runs in UTC.
--
-- Safety:
--   * Self-deactivating: the job unschedules itself as its FIRST action, so it can
--     never repeat on Oct 11 in future years and cannot double-fire — even if the
--     HTTP call fails.
--   * The Edge Function re-checks its send window (10:02–10:22 UTC), so it cannot
--     send early, and a stray manual call is rejected too.
--   * Per-recipient idempotency key (reminder7-2026-10-11:<signup_id>) makes a
--     repeat invocation a no-op; provider switching cannot duplicate.
--   * Attendance is re-checked live at run time; only attendees who have never
--     joined/visited their personal livestream are eligible.
--   * The existing 30-minute reminder job (masterclass-reminder30) is untouched.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('masterclass-reminder7') where exists (
  select 1 from cron.job where jobname = 'masterclass-reminder7'
);

select cron.schedule(
  'masterclass-reminder7',
  '7 10 11 10 *',
  $$ select cron.unschedule('masterclass-reminder7'); select net.http_post(
    url := 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'reminder7', 'cron_secret', 'fdfeee5210da48030bf66a0552227bc2e4ddb1c7c70f19d837d43e37698685b9')
  ) $$
);