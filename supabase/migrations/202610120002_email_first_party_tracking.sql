-- First-party (Assistara-owned) email tracking — open pixel + signed click redirect.
--
-- ADDITIVE ONLY. Never drops or rewrites existing columns/rows; the deliveries
-- already in email_delivery_log are untouched (they simply have no tracking_id).
--
-- Why this exists:
--   Provider open/click tracking is OFF (email_provider_config.tracking_open /
--   tracking_click are false) and cannot be relied on. Assistara therefore owns
--   the measurement: a 1x1 pixel records opens and a signed redirect records
--   clicks, for Resend, Brevo and Sender alike, because injection happens in the
--   shared delivery router (provider-agnostic) and the events land in the same
--   canonical email_events store that provider webhooks already use.
--
-- Privacy / security model (enforced by the endpoint + _shared/email-tracking.ts):
--   * Tracking URLs carry an opaque random tracking_id and an HMAC signature —
--     never a recipient email, never the destination URL, never a token.
--   * The click destination is looked up server-side in email_tracking_links, so
--     a personalized livestream link is preserved but never exposed.
--   * A forged/expired token can never cause an arbitrary redirect (no open
--     redirect): an invalid token falls back to the Assistara homepage.
--   * Opens are PROVISIONAL (proxies/image-blocking) and labelled as such.
--   * Security-scanner clicks are stored but flagged suspected_bot and are never
--     counted as human engagement.
--
-- Double-count policy:
--   First-party tracking is the PRIMARY source. When a message was sent with a
--   first-party pixel (has_first_party_tracking = true), a later provider
--   'opened'/'clicked' webhook may still be recorded for audit but must NOT
--   increment open_count/click_count (that would double-count). Provider
--   delivery/bounce/complaint signals are always applied — they are the only
--   source for those.

-- ---------------------------------------------------------------------------
-- 1. Logical message: first-party tracking identity
-- ---------------------------------------------------------------------------
alter table public.email_delivery_log
  add column if not exists tracking_id text,
  add column if not exists has_first_party_tracking boolean not null default false;

-- Opaque lookup key used by the pixel/redirect. Partial unique index: legacy
-- rows (no tracking) are unconstrained.
create unique index if not exists email_delivery_log_tracking_id_key
  on public.email_delivery_log (tracking_id)
  where tracking_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Server-side link map (destination never appears in a tracking URL)
-- ---------------------------------------------------------------------------
create table if not exists public.email_tracking_links (
  delivery_log_id uuid not null references public.email_delivery_log(id) on delete cascade,
  link_index integer not null,
  destination_url text not null,
  created_at timestamptz not null default now(),
  primary key (delivery_log_id, link_index)
);

alter table public.email_tracking_links enable row level security;
revoke all on public.email_tracking_links from anon, authenticated;
grant select, insert, update, delete on public.email_tracking_links to service_role;

-- ---------------------------------------------------------------------------
-- 3. Event provenance on the canonical event store
-- ---------------------------------------------------------------------------
alter table public.email_events
  add column if not exists measurement text not null default 'provider',
  add column if not exists suspected_bot boolean not null default false,
  add column if not exists link_index integer,
  add column if not exists user_agent_class text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_events_measurement_check') then
    alter table public.email_events
      add constraint email_events_measurement_check
      check (measurement in ('first_party','provider'));
  end if;
end $$;

create index if not exists email_events_measurement_idx
  on public.email_events (delivery_log_id, measurement);

-- ---------------------------------------------------------------------------
-- 4. Provider events: apply delivery/bounce/complaint, but never double-count
--    opens/clicks for a message that already has first-party tracking.
--    Same signature as before, so the deployed email-webhook keeps working.
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
declare
  v_fp boolean := false;
begin
  if p_delivery_log_id is null then return; end if;

  select coalesce(has_first_party_tracking, false)
    into v_fp
    from public.email_delivery_log
   where id = p_delivery_log_id;

  update public.email_delivery_log set
    delivered_at     = case when p_event_type = 'delivered'  then coalesce(delivered_at, p_ts)     else delivered_at end,
    bounced_at       = case when p_event_type = 'bounced'    then coalesce(bounced_at, p_ts)       else bounced_at end,
    complained_at    = case when p_event_type = 'complained' then coalesce(complained_at, p_ts)    else complained_at end,
    -- Timestamps are informational and always safe to backfill.
    first_opened_at  = case when p_event_type = 'opened'     then coalesce(first_opened_at, p_ts)  else first_opened_at end,
    first_clicked_at = case when p_event_type = 'clicked'    then coalesce(first_clicked_at, p_ts) else first_clicked_at end,
    -- Counts come from exactly ONE source: first-party when it is enabled.
    open_count       = open_count  + case when p_event_type = 'opened'  and not v_fp then 1 else 0 end,
    click_count      = click_count + case when p_event_type = 'clicked' and not v_fp then 1 else 0 end,
    updated_at = now()
  where id = p_delivery_log_id;
end;
$$;

grant execute on function public.email_apply_event(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. First-party events (pixel / signed redirect). Bot-suspected clicks are
--    recorded but never counted as human engagement.
-- ---------------------------------------------------------------------------
create or replace function public.email_apply_first_party_event(
  p_delivery_log_id uuid,
  p_event_type text,
  p_ts timestamptz,
  p_suspected_bot boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot boolean := coalesce(p_suspected_bot, false);
begin
  if p_delivery_log_id is null then return; end if;

  update public.email_delivery_log set
    first_opened_at  = case when p_event_type = 'opened' then coalesce(first_opened_at, p_ts) else first_opened_at end,
    first_clicked_at = case when p_event_type = 'clicked' and not v_bot then coalesce(first_clicked_at, p_ts) else first_clicked_at end,
    open_count       = open_count  + case when p_event_type = 'opened' then 1 else 0 end,
    click_count      = click_count + case when p_event_type = 'clicked' and not v_bot then 1 else 0 end,
    updated_at = now()
  where id = p_delivery_log_id;
end;
$$;

grant execute on function public.email_apply_first_party_event(uuid, text, timestamptz, boolean) to service_role;

notify pgrst, 'reload schema';
