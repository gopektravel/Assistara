-- Fix email routing/quota RPCs: the originals referenced non-existent columns
-- (email_provider_config has daily_limit_override / monthly_limit_override, no
-- rate_limit_* columns) and used RETURNS SETOF record which PostgREST cannot
-- describe. These are corrected to a proper RETURNS TABLE with real columns.

-- 1. Provider selection (Resend -> Sender.net -> Brevo, skipping disabled/cooldown/quota-exhausted)
drop function if exists public.email_get_next_provider(integer);
create or replace function public.email_get_next_provider(
  p_required_count integer default 1
) returns table(
  provider text,
  daily_limit integer,
  monthly_limit integer,
  rate_limit_per_sec integer,
  rate_limit_per_min integer,
  from_email text,
  from_name text,
  reply_to_email text,
  api_key_name text,
  domain text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select h.provider as pv,
           coalesce(c.daily_limit_override,
             case c.provider when 'resend' then 100 when 'brevo' then 300 when 'sender' then 500 else 100 end) as dl,
           coalesce(c.monthly_limit_override,
             case c.provider when 'resend' then 3000 when 'brevo' then 9000 when 'sender' then 15000 else 3000 end) as ml,
           case c.provider when 'resend' then 2 when 'brevo' then 10 when 'sender' then 10 else 2 end as rps,
           case c.provider when 'resend' then 60 when 'brevo' then 600 when 'sender' then 600 else 60 end as rpm,
           c.from_email as fe, c.from_name as fn, c.reply_to_email as rt,
           c.api_key_name as akn, c.domain as dm
      from public.email_provider_health h
      join public.email_provider_config c on c.provider = h.provider
     where c.is_enabled
       and (h.cooldown_until is null or h.cooldown_until <= now())
     order by h.priority asc
  loop
    if exists (
      select 1 from public.email_provider_quota q
       where q.provider = r.pv
         and q.quota_date = (now() at time zone 'UTC')::date
         and q.is_active
         and q.used_count + p_required_count <= q.daily_limit
         and q.monthly_used + p_required_count <= q.monthly_limit
    ) then
      provider := r.pv; daily_limit := r.dl; monthly_limit := r.ml;
      rate_limit_per_sec := r.rps; rate_limit_per_min := r.rpm;
      from_email := r.fe; from_name := r.fn; reply_to_email := r.rt;
      api_key_name := r.akn; domain := r.dm;
      return next;
    end if;
    if not exists (
      select 1 from public.email_provider_quota q
       where q.provider = r.pv
         and q.quota_date = (now() at time zone 'UTC')::date
    ) then
      provider := r.pv; daily_limit := r.dl; monthly_limit := r.ml;
      rate_limit_per_sec := r.rps; rate_limit_per_min := r.rpm;
      from_email := r.fe; from_name := r.fn; reply_to_email := r.rt;
      api_key_name := r.akn; domain := r.dm;
      return next;
    end if;
  end loop;
  return;
end;
$$;

-- 2. Atomic quota reservation (create today's row from config defaults, then reserve)
create or replace function public.email_reserve_quota(
  p_provider text,
  p_count integer default 1
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota_date date := (now() at time zone 'UTC')::date;
  v_row integer;
begin
  perform pg_advisory_xact_lock(hashtext('email_quota:' || p_provider || ':' || v_quota_date));

  insert into public.email_provider_quota (provider, quota_date, used_count, daily_limit, monthly_limit, monthly_used)
  select c.provider, v_quota_date, 0,
         coalesce(c.daily_limit_override,
           case c.provider when 'resend' then 100 when 'brevo' then 300 when 'sender' then 500 else 100 end),
         coalesce(c.monthly_limit_override,
           case c.provider when 'resend' then 3000 when 'brevo' then 9000 when 'sender' then 15000 else 3000 end),
         0
    from public.email_provider_config c
   where c.provider = p_provider and c.is_enabled
  on conflict (provider, quota_date) do nothing;

  update public.email_provider_quota
     set used_count = used_count + p_count,
         monthly_used = monthly_used + p_count,
         updated_at = now()
   where provider = p_provider
     and quota_date = v_quota_date
     and is_active
     and used_count + p_count <= daily_limit
     and monthly_used + p_count <= monthly_limit
  returning 1 into v_row;

  return v_row is not null;
end;
$$;

-- 3. Release reservation (both daily and monthly counters)
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
         monthly_used = greatest(monthly_used - p_count, 0),
         updated_at = now()
   where provider = p_provider
     and quota_date = v_quota_date;
end;
$$;

NOTIFY pgrst, 'reload schema';