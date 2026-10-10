-- Route by the STATIC configured priority (email_provider_config.priority), not
-- by the self-healing health priority — the recovery heuristic could invert the
-- intended Resend-first order. Health still gates cooldown/failures.

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
    select c.provider as pv,
           coalesce(c.daily_limit_override,
             case c.provider when 'resend' then 100 when 'brevo' then 300 when 'sender' then 500 else 100 end) as dl,
           coalesce(c.monthly_limit_override,
             case c.provider when 'resend' then 3000 when 'brevo' then 9000 when 'sender' then 15000 else 3000 end) as ml,
           case c.provider when 'resend' then 2 when 'brevo' then 10 when 'sender' then 10 else 2 end as rps,
           case c.provider when 'resend' then 60 when 'brevo' then 600 when 'sender' then 600 else 60 end as rpm,
           c.from_email as fe, c.from_name as fn, c.reply_to_email as rt,
           c.api_key_name as akn, c.domain as dm
      from public.email_provider_config c
      left join public.email_provider_health h on h.provider = c.provider
     where c.is_enabled
       and (h.cooldown_until is null or h.cooldown_until <= now())
     order by c.priority asc
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

-- Restore the intended static health priorities (cosmetic; ordering now uses config)
UPDATE public.email_provider_health SET priority = 1 WHERE provider = 'resend';
UPDATE public.email_provider_health SET priority = 2 WHERE provider = 'brevo';
UPDATE public.email_provider_health SET priority = 3 WHERE provider = 'sender';

NOTIFY pgrst, 'reload schema';