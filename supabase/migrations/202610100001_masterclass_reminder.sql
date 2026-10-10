-- Masterclass reminder — SCHEMA ONLY (inert).
--
-- This file contains no email code and starts no scheduler: applying it cannot
-- send anything to anyone. It is purely additive and does not modify, delete or
-- rewrite any existing registration. The cron/pg_net activation lives in
-- 202610100002_masterclass_reminder_cron.sql and is applied only on explicit
-- approval. Production sending additionally requires the Edge Function env var
-- MASTERCLASS_REMINDER_ENABLED=true.

-- Opt-out state + send guard on the registration row.
-- Nullable, no DEFAULT -> metadata-only change in PostgreSQL: no table rewrite,
-- existing rows keep their data and simply read NULL for the new columns.
alter table public.masterclass_signups add column if not exists unsubscribed_at timestamptz;
alter table public.masterclass_signups add column if not exists reminder_sent_at timestamptz;

-- Delivery audit + exactly-once guard: one row per (signup, event).
-- Deliberately has NO foreign key to masterclass_signups, so adding it takes no
-- lock on and places no reference on the live registrations table. Exactly-once
-- is enforced by the UNIQUE (signup_id, event_key) constraint, not by the FK.
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

create index if not exists masterclass_reminders_status_idx on public.masterclass_reminders (status);
create index if not exists masterclass_reminders_event_idx on public.masterclass_reminders (event_key);

-- Private delivery log: RLS on with no policy denies anon/authenticated, and the
-- explicit revoke is belt-and-braces in case of Supabase default privileges.
-- The service_role (used by the Edge Function) bypasses RLS.
alter table public.masterclass_reminders enable row level security;
revoke all on public.masterclass_reminders from anon, authenticated;
grant select, insert, update, delete on public.masterclass_reminders to service_role;

NOTIFY pgrst, 'reload schema';
