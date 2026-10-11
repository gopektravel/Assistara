-- Email Command Center — canonical tracking + analytics foundation.
--
-- ADDITIVE ONLY. This migration never drops or rewrites existing columns or rows;
-- the 470 accepted deliveries already in email_delivery_log are untouched.
--
-- It adds:
--   * email_events            canonical provider event record (one row per
--                             delivery/engagement event, deduplicated)
--   * email_delivery_attempts one row per provider send attempt (separates
--                             attempts from the logical message)
--   * email_webhook_events    raw inbound webhook receipts (idempotency gate)
--   * email_suppressions      global unsubscribe/bounce/complaint suppression
--   * email_renders           captured rendered HTML/text (exact previews)
--   * email_delivery_log      + campaign_key / recipient_id / measured timestamps
--   * email_provider_config   + tracking + webhook + capacity metadata
--
-- Metrics policy (see _shared/email-analytics.ts):
--   acceptance is NOT delivery. Delivered/opened/clicked/bounced are only shown
--   when a provider reports them (measured). Nothing is ever back-filled.

-- ---------------------------------------------------------------------------
-- 1. Provider config: tracking, webhook and capacity metadata
-- ---------------------------------------------------------------------------
alter table public.email_provider_config
  add column if not exists tracking_open boolean not null default false,
  add column if not exists tracking_click boolean not null default false,
  add column if not exists webhook_secret_name text,
  add column if not exists webhook_verified_at timestamptz,
  add column if not exists capacity_api text,
  add column if not exists dashboard_url text,
  add column if not exists domain_verified_at timestamptz;

update public.email_provider_config c
   set webhook_secret_name = case c.provider
         when 'resend' then 'RESEND_WEBHOOK_SECRET'
         when 'brevo'  then 'BREVO_WEBHOOK_SECRET'
         when 'sender' then 'SENDER_WEBHOOK_SECRET'
       end,
       capacity_api = case c.provider
         when 'resend' then 'resend_usage'
         when 'brevo'  then 'brevo_credits'
         else 'unavailable'
       end,
       dashboard_url = case c.provider
         when 'resend' then 'https://resend.com/webhooks'
         when 'brevo'  then 'https://app.brevo.com/settings/keys/webhooks'
         when 'sender' then 'https://app.sender.net/settings/integrations/webhooks'
       end,
       domain_verified_at = case
         when c.domain_verified and c.domain_verified_at is null then now()
         else c.domain_verified_at
       end
 where c.webhook_secret_name is null
    or c.capacity_api is null
    or c.dashboard_url is null;

-- ---------------------------------------------------------------------------
-- 2. Logical message: campaign grouping + measured engagement columns
-- ---------------------------------------------------------------------------
alter table public.email_delivery_log
  add column if not exists campaign_key text,
  add column if not exists recipient_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists first_opened_at timestamptz,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists click_count integer not null default 0;

-- Backfill campaign grouping from the campaign the sender already recorded in
-- metadata, falling back to the email_type. Read-only derivation; never invents
-- engagement data.
update public.email_delivery_log
   set campaign_key = coalesce(metadata->>'campaign', email_type)
 where campaign_key is null;

create index if not exists email_delivery_log_campaign_idx
  on public.email_delivery_log (campaign_key);
create index if not exists email_delivery_log_sent_at_idx
  on public.email_delivery_log (sent_at desc);

-- ---------------------------------------------------------------------------
-- 3. Canonical provider events
-- ---------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  delivery_log_id uuid references public.email_delivery_log(id) on delete set null,
  idempotency_key text,
  campaign_key text,
  email_type text,
  recipient_email text,
  recipient_id text,
  provider text not null check (provider in ('resend','brevo','sender')),
  provider_message_id text,
  event_type text not null check (event_type in (
    'queued','accepted','delivered','deferred','bounced','complained',
    'opened','clicked','unsubscribed','failed'
  )),
  event_timestamp timestamptz not null default now(),
  source text not null default 'provider_webhook',
  reliability text not null default 'measured'
    check (reliability in ('measured','reported','unavailable')),
  provider_event_id text,
  dedup_key text not null unique,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_events_message_idx
  on public.email_events (delivery_log_id);
create index if not exists email_events_campaign_idx
  on public.email_events (campaign_key, event_type);
create index if not exists email_events_recipient_idx
  on public.email_events (recipient_email);
create index if not exists email_events_pmid_idx
  on public.email_events (provider, provider_message_id);
create index if not exists email_events_time_idx
  on public.email_events (event_timestamp desc);

-- ---------------------------------------------------------------------------
-- 4. Send attempts (separate from the logical message)
-- ---------------------------------------------------------------------------
create table if not exists public.email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_log_id uuid references public.email_delivery_log(id) on delete cascade,
  idempotency_key text,
  provider text not null check (provider in ('resend','brevo','sender')),
  attempt_number integer not null default 1,
  provider_message_id text,
  status text not null default 'accepted',
  http_status integer,
  error_category text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists email_delivery_attempts_log_idx
  on public.email_delivery_attempts (delivery_log_id, attempt_number);

-- ---------------------------------------------------------------------------
-- 5. Raw inbound webhook receipts (idempotency + audit)
-- ---------------------------------------------------------------------------
create table if not exists public.email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text,
  dedup_key text not null unique,
  event_type text,
  verified boolean not null default false,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  processing_error text,
  payload jsonb
);

create index if not exists email_webhook_events_received_idx
  on public.email_webhook_events (received_at desc);

-- ---------------------------------------------------------------------------
-- 6. Global suppression (unsubscribe / bounce / complaint, all providers)
-- ---------------------------------------------------------------------------
create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribe','bounce','complaint','manual')),
  provider text,
  source text,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Captured renders (exact HTML/text that was actually sent)
-- ---------------------------------------------------------------------------
create table if not exists public.email_renders (
  id uuid primary key default gen_random_uuid(),
  delivery_log_id uuid unique references public.email_delivery_log(id) on delete cascade,
  idempotency_key text,
  campaign_key text,
  email_type text,
  subject text,
  html text not null,
  text_content text,
  created_at timestamptz not null default now()
);

create index if not exists email_renders_campaign_idx
  on public.email_renders (campaign_key, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Atomic event application (keeps first-* timestamps and counts consistent)
-- ---------------------------------------------------------------------------
create or replace function public.email_apply_event(
  p_delivery_log_id uuid,
  p_event_type text,
  p_ts timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_delivery_log_id is null then return; end if;
  update public.email_delivery_log set
    delivered_at     = case when p_event_type = 'delivered'  then coalesce(delivered_at, p_ts)     else delivered_at end,
    bounced_at       = case when p_event_type = 'bounced'    then coalesce(bounced_at, p_ts)       else bounced_at end,
    complained_at    = case when p_event_type = 'complained' then coalesce(complained_at, p_ts)    else complained_at end,
    first_opened_at  = case when p_event_type = 'opened'     then coalesce(first_opened_at, p_ts)  else first_opened_at end,
    first_clicked_at = case when p_event_type = 'clicked'    then coalesce(first_clicked_at, p_ts) else first_clicked_at end,
    open_count       = open_count  + case when p_event_type = 'opened'  then 1 else 0 end,
    click_count      = click_count + case when p_event_type = 'clicked' then 1 else 0 end,
    updated_at = now()
  where id = p_delivery_log_id;
end;
$$;

grant execute on function public.email_apply_event(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 9. RLS + grants (service_role only, matching the existing email tables)
-- ---------------------------------------------------------------------------
alter table public.email_events enable row level security;
alter table public.email_delivery_attempts enable row level security;
alter table public.email_webhook_events enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_renders enable row level security;

revoke all on public.email_events from anon, authenticated;
revoke all on public.email_delivery_attempts from anon, authenticated;
revoke all on public.email_webhook_events from anon, authenticated;
revoke all on public.email_suppressions from anon, authenticated;
revoke all on public.email_renders from anon, authenticated;

grant select, insert, update, delete on public.email_events to service_role;
grant select, insert, update, delete on public.email_delivery_attempts to service_role;
grant select, insert, update, delete on public.email_webhook_events to service_role;
grant select, insert, update, delete on public.email_suppressions to service_role;
grant select, insert, update, delete on public.email_renders to service_role;

notify pgrst, 'reload schema';
