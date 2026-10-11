-- Remove first-party (custom) tracking logic from Email Command Center
-- Pivot to native provider tracking (Resend, Brevo, Sender)
-- This migration:
--   1. Removes the first-party tracking columns from email_delivery_log
--   2. Drops the email_tracking_links table
--   3. Removes first_party measurement value from email_events
--   4. Replaces email_apply_event to use provider-native tracking only
--   5. Drops email_apply_first_party_event function
--   6. Updates email_events measurement check constraint

-- 1. Drop first-party tracking columns from email_delivery_log
alter table public.email_delivery_log
  drop column if exists tracking_id,
  drop column if exists has_first_party_tracking;

-- Drop the unique index if it exists
drop index if exists email_delivery_log_tracking_id_key;

-- 2. Drop the email_tracking_links table
drop table if exists public.email_tracking_links;

-- 3. Update email_events: remove first_party measurement
-- First, update any existing 'first_party' rows to 'provider'
update public.email_events
set measurement = 'provider'
where measurement = 'first_party';

-- Drop the first_party check constraint and add new one
alter table public.email_events
  drop constraint if exists email_events_measurement_check;

alter table public.email_events
  add constraint email_events_measurement_check
  check (measurement = 'provider');

-- Drop columns that were only used for first-party tracking
alter table public.email_events
  drop column if exists suspected_bot,
  drop column if exists link_index,
  drop column if exists user_agent_class;

-- 4. Replace email_apply_event to use provider-native tracking only
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
    -- Provider-native open/click timestamps (estimated for opens)
    first_opened_at  = case when p_event_type = 'opened'     then coalesce(first_opened_at, p_ts)  else first_opened_at end,
    first_clicked_at = case when p_event_type = 'clicked'    then coalesce(first_clicked_at, p_ts) else first_clicked_at end,
    -- All counts come from provider-native tracking
    open_count       = open_count  + case when p_event_type = 'opened'  then 1 else 0 end,
    click_count      = click_count + case when p_event_type = 'clicked' then 1 else 0 end,
    updated_at = now()
  where id = p_delivery_log_id;
end;
$$;

grant execute on function public.email_apply_event(uuid, text, timestamptz) to service_role;

-- 5. Drop the first-party event function
drop function if exists public.email_apply_first_party_event(uuid, text, timestamptz, boolean);

-- 6. Drop unused indexes
drop index if exists email_events_measurement_idx;

notify pgrst, 'reload schema';