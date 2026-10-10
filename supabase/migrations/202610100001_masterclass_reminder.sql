-- Masterclass reminder — one-shot 24h reminder email.
-- Additive only. No existing records modified.
--
-- Gating: production sends are controlled by the Edge Function env var
-- MASTERCLASS_REMINDER_ENABLED. It ships "false", so even though this migration
-- schedules the cron, NOTHING is sent until an operator sets it to "true" after
-- explicit approval. The cron simply runs the function every 15 minutes; the
-- function decides who is eligible (registered before scheduled_at - 24h, no
-- unsubscribe, valid token) and the unique constraint below guarantees each
-- attendee receives exactly one reminder even across retries/deployments.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Opt-out state + send guard on the registration row.
alter table public.masterclass_signups add column if not exists unsubscribed_at timestamptz;
alter table public.masterclass_signups add column if not exists reminder_sent_at timestamptz;

-- Delivery audit + exactly-once guard: one row per (signup, event).
create table if not exists public.masterclass_reminders (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null,
  event_key text not null,
  status text not null default 'sending'
    check (status in ('sending','sent','retryable','failed')),
  provider text,
  provider_id text,
  attempts integer not null default 1,
  error text,
  trigger text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signup_id, event_key)
);
alter table public.masterclass_reminders
  add constraint masterclass_reminders_signup_fk
  foreign key (signup_id) references public.masterclass_signups (id) on delete cascade;
create index if not exists masterclass_reminders_status_idx on public.masterclass_reminders (status);
create index if not exists masterclass_reminders_event_idx on public.masterclass_reminders (event_key);
alter table public.masterclass_reminders enable row level security;

-- Reminder check every 15 minutes. The __CRON_SECRET__ placeholder is replaced
-- with the real MASTERCLASS_CRON_SECRET value when applied (matching the Edge
-- Function secret). Insert via cron.unschedule first keeps this re-runnable.
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