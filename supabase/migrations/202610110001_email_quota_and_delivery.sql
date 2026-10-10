-- Centralized email quota tracking and delivery log
-- Applies to all transactional email providers (Resend, Brevo, Sender.net)

-- 1. Provider quota tracking: one row per provider per day (UTC midnight reset)
create table if not exists public.email_provider_quota (
  provider text not null check (provider in ('resend','brevo','sender')),
  quota_date date not null default (now() at time zone 'UTC')::date,
  daily_limit integer not null check (daily_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  monthly_limit integer not null check (monthly_limit > 0),
  monthly_used integer not null default 0 check (monthly_used >= 0),
  rate_limit_per_sec integer not null default 2 check (rate_limit_per_sec > 0),
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min > 0),
  is_active boolean not null default true,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, quota_date)
);

create index if not exists email_provider_quota_active_idx
  on public.email_provider_quota (provider, quota_date) where is_active;

-- 2. Provider configuration (verified senders, domains, credentials status)
create table if not exists public.email_provider_config (
  provider text primary key check (provider in ('resend','brevo','sender')),
  api_key_name text not null, -- matches Supabase secret name
  from_email text not null,
  from_name text not null,
  reply_to_email text,
  domain text not null,
  verified_sender boolean not null default false,
  domain_verified boolean not null default false,
  account_tier text, -- 'free', 'pro', 'enterprise'
  daily_limit_override integer, -- null = use tier default
  monthly_limit_override integer,
  is_enabled boolean not null default true,
  priority integer not null default 1 check (priority >= 1),
  notes text,
  updated_at timestamptz not null default now()
);

-- 3. Durable email delivery log - one row per intended email
create table if not exists public.email_delivery_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  email_type text not null, -- 'masterclass_reminder', 'academy_acceptance', 'onboarding', etc.
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  provider text check (provider in ('resend','brevo','sender')),
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending','sent','failed','unknown','expired','suppressed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  last_error_category text check (last_error_category in (
    'provider_auth','provider_quota','provider_rate_limit','provider_server',
    'network_timeout','network_error','unknown'
  )),
  scheduled_for timestamptz,
  deadline timestamptz, -- hard deadline after which email must not send
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_delivery_log_status_idx on public.email_delivery_log (status);
create index if not exists email_delivery_log_type_idx on public.email_delivery_log (email_type);
create index if not exists email_delivery_log_recipient_idx on public.email_delivery_log (recipient_email);
create index if not exists email_delivery_log_deadline_idx on public.email_delivery_log (deadline) where status in ('pending','unknown');

-- 4. Atomic claim for per-recipient exactly-once processing
create table if not exists public.email_delivery_claim (
  idempotency_key text primary key references public.email_delivery_log(idempotency_key) on delete cascade,
  claimed_by text not null, -- worker/cron identifier
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists email_delivery_claim_expires_idx on public.email_delivery_claim (expires_at);

-- 5. Provider health tracking (similar to tara pattern but for email)
create table if not exists public.email_provider_health (
  provider text primary key check (provider in ('resend','brevo','sender')),
  priority integer not null default 1 check (priority >= 1),
  consecutive_failures integer not null default 0,
  last_failed_at timestamptz,
  last_succeeded_at timestamptz,
  cooldown_until timestamptz,
  last_error_category text check (last_error_category in (
    'provider_auth','provider_quota','provider_rate_limit','provider_server',
    'network_timeout','network_error','unknown'
  )),
  updated_at timestamptz not null default now()
);

insert into public.email_provider_health (provider, priority)
values ('resend', 1), ('brevo', 2), ('sender', 3)
on conflict (provider) do nothing;

-- 6. RPC: atomically reserve quota for a provider (returns true if reserved)
create or replace function public.email_reserve_quota(
  p_provider text,
  p_count integer default 1
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_limit integer;
  v_monthly_used integer;
  v_monthly_limit integer;
  v_quota_date date := (now() at time zone 'UTC')::date;
begin
  -- Lock the quota row for this provider/date
  perform pg_advisory_xact_lock(hashtext('email_quota:' || p_provider || ':' || v_quota_date));

  -- Get or create today's quota row
  update public.email_provider_quota
     set used_count = used_count + p_count,
         updated_at = now()
   where provider = p_provider
     and quota_date = v_quota_date
     and is_active
     and used_count + p_count <= daily_limit
     and monthly_used + p_count <= monthly_limit
  returning used_count, daily_limit, monthly_used, monthly_limit
    into v_used, v_limit, v_monthly_used, v_monthly_limit;

  if not found then
    -- Try to insert new quota row for today (first use)
    insert into public.email_provider_quota (provider, quota_date, used_count, daily_limit, monthly_limit, monthly_used)
    select p_provider, v_quota_date, p_count, daily_limit, monthly_limit, p_count
      from public.email_provider_config
     where provider = p_provider and is_enabled
     on conflict (provider, quota_date) do nothing
    returning used_count, daily_limit, monthly_used, monthly_limit
      into v_used, v_limit, v_monthly_used, v_monthly_limit;

    if not found then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- 7. RPC: release quota reservation (on failure/rollback)
create or replace function public.email_release_quota(
  p_provider text,
  p_count integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota_date date := (now() at time zone 'UTC')::date;
begin
  perform pg_advisory_xact_lock(hashtext('email_quota:' || p_provider || ':' || v_quota_date));
  update public.email_provider_quota
     set used_count = greatest(used_count - p_count, 0),
         updated_at = now()
   where provider = p_provider
     and quota_date = v_quota_date;
end;
$$;

-- 8. RPC: record provider failure with cooldown and priority demotion
create or replace function public.email_provider_failure(
  p_provider text,
  p_category text,
  p_retry_after_seconds integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failures integer;
  v_seconds integer;
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('email_provider_health'));

  if not exists (select 1 from public.email_provider_health where provider = p_provider) then
    return;
  end if;

  update public.email_provider_health
     set consecutive_failures = consecutive_failures + 1,
         last_failed_at = now(),
         last_error_category = coalesce(nullif(p_category, ''), 'unknown'),
         updated_at = now()
   where provider = p_provider
   returning consecutive_failures into v_failures;

  if p_category = 'provider_auth' then
    v_seconds := 21600; -- 6 hours for auth failures
  else
    v_seconds := least(30 * (2 ^ least(greatest(v_failures - 1, 0), 6)), 900);
    if p_retry_after_seconds is not null and p_retry_after_seconds > 0 then
      v_seconds := greatest(v_seconds, least(p_retry_after_seconds, 900));
    end if;
  end if;

  update public.email_provider_health
     set cooldown_until = now() + make_interval(secs => v_seconds)
   where provider = p_provider;

  -- Move to bottom, renormalize priorities
  select coalesce(max(priority), 0) + 1 into v_max from public.email_provider_health;
  update public.email_provider_health set priority = v_max where provider = p_provider;

  with ranked as (
    select provider, row_number() over (order by priority asc, provider asc) as rn
    from public.email_provider_health
  )
  update public.email_provider_health h
     set priority = ranked.rn
    from ranked
   where h.provider = ranked.provider
     and h.priority <> ranked.rn;
end;
$$;

-- 9. RPC: record provider success - reset failures, clear cooldown, gradual recovery
create or replace function public.email_provider_success(p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_priority integer;
  v_above text;
begin
  perform pg_advisory_xact_lock(hashtext('email_provider_health'));

  select priority into v_priority
    from public.email_provider_health
   where provider = p_provider;
  if v_priority is null then
    return;
  end if;

  update public.email_provider_health
     set consecutive_failures = 0,
         cooldown_until = null,
         last_error_category = null,
         last_succeeded_at = now(),
         updated_at = now()
   where provider = p_provider;

  -- Gradual recovery: swap with provider directly above
  if v_priority > 1 then
    select provider into v_above
      from public.email_provider_health
     where priority < v_priority
     order by priority desc
     limit 1;
    if v_above is not null then
      update public.email_provider_health set priority = v_priority where provider = v_above;
      update public.email_provider_health set priority = v_priority - 1 where provider = p_provider;
    end if;
  end if;
end;
$$;

-- 10. RPC: get next available provider in priority order (respects cooldowns, quota)
create or replace function public.email_get_next_provider(
  p_required_count integer default 1
) returns setof record
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select h.provider, c.daily_limit, c.monthly_limit, c.rate_limit_per_sec, c.from_email, c.from_name, c.reply_to_email, c.api_key_name
      from public.email_provider_health h
      join public.email_provider_config c on c.provider = h.provider
     where c.is_enabled
       and (h.cooldown_until is null or h.cooldown_until <= now())
     order by h.priority asc
  loop
    -- Check quota availability
    if exists (
      select 1 from public.email_provider_quota q
       where q.provider = r.provider
         and q.quota_date = (now() at time zone 'UTC')::date
         and q.is_active
         and q.used_count + p_required_count <= q.daily_limit
         and q.monthly_used + p_required_count <= q.monthly_limit
    ) then
      return next r;
    end if;
    -- Also allow if no quota row exists yet (first use today)
    if not exists (
      select 1 from public.email_provider_quota q
       where q.provider = r.provider
         and q.quota_date = (now() at time zone 'UTC')::date
    ) then
      return next r;
    end if;
  end loop;
  return;
end;
$$;

-- 11. RPC: atomic claim for idempotent delivery
create or replace function public.email_claim_delivery(
  p_idempotency_key text,
  p_claimed_by text,
  p_ttl_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_delivery_claim (idempotency_key, claimed_by, claimed_at, expires_at)
  values (p_idempotency_key, p_claimed_by, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (idempotency_key) do nothing;

  return exists (
    select 1 from public.email_delivery_claim
     where idempotency_key = p_idempotency_key
       and claimed_by = p_claimed_by
       and expires_at > now()
  );
end;
$$;

-- 12. RPC: release claim
create or replace function public.email_release_claim(
  p_idempotency_key text,
  p_claimed_by text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.email_delivery_claim
   where idempotency_key = p_idempotency_key
     and claimed_by = p_claimed_by;
end;
$$;

-- 13. RLS: service_role only for all tables
alter table public.email_provider_quota enable row level security;
alter table public.email_provider_config enable row level security;
alter table public.email_delivery_log enable row level security;
alter table public.email_delivery_claim enable row level security;
alter table public.email_provider_health enable row level security;

revoke all on public.email_provider_quota from anon, authenticated;
revoke all on public.email_provider_config from anon, authenticated;
revoke all on public.email_delivery_log from anon, authenticated;
revoke all on public.email_delivery_claim from anon, authenticated;
revoke all on public.email_provider_health from anon, authenticated;

grant select, insert, update, delete on public.email_provider_quota to service_role;
grant select, insert, update, delete on public.email_provider_config to service_role;
grant select, insert, update, delete on public.email_delivery_log to service_role;
grant select, insert, update, delete on public.email_delivery_claim to service_role;
grant select, insert, update, delete on public.email_provider_health to service_role;

grant execute on function public.email_reserve_quota(text, integer) to service_role;
grant execute on function public.email_release_quota(text, integer) to service_role;
grant execute on function public.email_provider_failure(text, text, integer) to service_role;
grant execute on function public.email_provider_success(text) to service_role;
grant execute on function public.email_get_next_provider(integer) to service_role;
grant execute on function public.email_claim_delivery(text, text, integer) to service_role;
grant execute on function public.email_release_claim(text, text) to service_role;

-- 14. Initialize default provider configs (update with actual values after deployment)
insert into public.email_provider_config (provider, api_key_name, from_email, from_name, reply_to_email, domain, verified_sender, domain_verified, account_tier, daily_limit_override, monthly_limit_override, is_enabled, priority)
values
  ('resend', 'RESEND_API_KEY', 'xyra@getassistara.com', 'Xyra from Assistara', 'xyra@getassistara.com', 'getassistara.com', true, true, 'free', 100, 3000, true, 1),
  ('brevo', 'BREVO_API_KEY', 'xyra@getassistara.com', 'Xyra from Assistara', 'xyra@getassistara.com', 'getassistara.com', false, false, 'free', 300, 9000, true, 2),
  ('sender', 'SENDER_API_KEY', 'xyra@getassistara.com', 'Xyra from Assistara', 'xyra@getassistara.com', 'getassistara.com', false, false, 'free', 1000, 30000, false, 3)
on conflict (provider) do nothing;

NOTIFY pgrst, 'reload schema';