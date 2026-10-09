-- Tara provider health: persistent, self-healing prioritization.
--
-- Extends the EXISTING public.tara_provider_health table (no duplicate system).
-- Adds persisted cooldowns and two atomic, advisory-locked RPCs so concurrent
-- Tara requests cannot corrupt provider ordering.
--
-- Priority model: integer 1..N. A failed provider moves to the bottom; a
-- successful provider moves up exactly one position (gradual recovery).
-- Cooldown: exponential backoff for temporary failures, a long fixed cooldown
-- for credential failures, and Retry-After is honoured when supplied.

alter table public.tara_provider_health
  add column if not exists cooldown_until timestamptz,
  add column if not exists last_error_category text;

-- Guarantee the three configured providers exist.
insert into public.tara_provider_health (provider, priority)
values ('groq', 1), ('gemini', 2), ('openrouter', 3)
on conflict (provider) do nothing;

-- The Edge Function uses the service-role key; it is the only caller.
grant select, insert, update, delete on table public.tara_provider_health to service_role;

-- Record a provider failure: increment failures, set cooldown, move to bottom.
create or replace function public.tara_provider_failure(
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
  perform pg_advisory_xact_lock(hashtext('tara_provider_health'));

  if not exists (select 1 from public.tara_provider_health where provider = p_provider) then
    return;
  end if;

  update public.tara_provider_health
     set consecutive_failures = consecutive_failures + 1,
         last_failed_at = now(),
         last_error_category = coalesce(nullif(p_category, ''), 'unknown'),
         updated_at = now()
   where provider = p_provider
   returning consecutive_failures into v_failures;

  if p_category = 'provider_auth' then
    -- Invalid credentials need a human; do not hot-loop on them.
    v_seconds := 21600; -- 6 hours
  else
    -- Exponential backoff: 30s, 60s, 120s, ... capped at 900s (15 min).
    v_seconds := least(30 * (2 ^ least(greatest(v_failures - 1, 0), 6)), 900);
    if p_retry_after_seconds is not null and p_retry_after_seconds > 0 then
      v_seconds := greatest(v_seconds, least(p_retry_after_seconds, 900));
    end if;
  end if;

  update public.tara_provider_health
     set cooldown_until = now() + make_interval(secs => v_seconds)
   where provider = p_provider;

  -- Move to the bottom, then normalise priorities to a dense 1..N.
  select coalesce(max(priority), 0) + 1 into v_max from public.tara_provider_health;
  update public.tara_provider_health set priority = v_max where provider = p_provider;

  with ranked as (
    select provider, row_number() over (order by priority asc, provider asc) as rn
    from public.tara_provider_health
  )
  update public.tara_provider_health h
     set priority = ranked.rn
    from ranked
   where h.provider = ranked.provider
     and h.priority <> ranked.rn;
end;
$$;

-- Record a provider success: reset failures, clear cooldown, move up one step.
create or replace function public.tara_provider_success(p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_priority integer;
  v_above text;
begin
  perform pg_advisory_xact_lock(hashtext('tara_provider_health'));

  select priority into v_priority
    from public.tara_provider_health
   where provider = p_provider;
  if v_priority is null then
    return;
  end if;

  update public.tara_provider_health
     set consecutive_failures = 0,
         cooldown_until = null,
         last_error_category = null,
         last_succeeded_at = now(),
         updated_at = now()
   where provider = p_provider;

  -- Gradual recovery: swap with the provider directly above.
  if v_priority > 1 then
    select provider into v_above
      from public.tara_provider_health
     where priority < v_priority
     order by priority desc
     limit 1;
    if v_above is not null then
      update public.tara_provider_health set priority = v_priority where provider = v_above;
      update public.tara_provider_health set priority = v_priority - 1 where provider = p_provider;
    end if;
  end if;
end;
$$;

-- Functions are exposed through PostgREST; restrict execution to service_role.
revoke all on function public.tara_provider_failure(text, text, integer) from public;
revoke all on function public.tara_provider_failure(text, text, integer) from anon, authenticated;
revoke all on function public.tara_provider_success(text) from public;
revoke all on function public.tara_provider_success(text) from anon, authenticated;
grant execute on function public.tara_provider_failure(text, text, integer) to service_role;
grant execute on function public.tara_provider_success(text) to service_role;
