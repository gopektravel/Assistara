-- =============================================================================
-- Academy cohort capacity hardening + priority waitlist + payment exceptions
-- -----------------------------------------------------------------------------
-- Goal: never silently mark an application PAID past cohort capacity. Every
-- mark-paid path (Stripe completion, PayMongo webhook, GCash admin/email
-- approval) routes through finalize_academy_payment(), which is serialized on
-- the same advisory lock as reserve_academy_seat(). Overflow payments become
-- academy_payment_exceptions rows (blocked enrollment, admin alert, safe
-- refund path) instead of paid enrollments.
--
-- Also introduces a first-class practice waitlist (academy_waitlist) with
-- status/priority/position + notification history, and an admin capacity
-- overview + invite-next-eligible flow. No automatic enrollment ever happens
-- for waitlisted applicants; invites are explicit, capacity-safe admin actions.
--
-- Idempotent: safe to replay. Re-creates the two live-only RPCs
-- (reserve_academy_seat, academy_cohort_status) from their current production
-- definitions so the schema is version-controlled.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Priority waitlist
-- ---------------------------------------------------------------------------
create table if not exists public.academy_waitlist (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.academy_applications(id) on delete set null,
  cohort_code    text not null default 'founding-2026' references public.academy_cohorts(code),
  name           text not null default '',
  email          text not null,
  phone          text,
  source         text not null default 'auto'
                 check (source in ('checkout_cta','auto','admin')),
  priority       integer not null default 2,   -- 1 = explicit opt-in (CTA), 2 = auto-captured, 3 = admin-added
  position       integer not null,             -- join order within the cohort (1-based)
  status         text not null default 'waiting'
                 check (status in ('waiting','invited','enrolled','declined','removed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  invited_at     timestamptz,
  enrolled_at    timestamptz,
  declined_at    timestamptz,
  removed_at     timestamptz,
  constraint academy_waitlist_email_cohort_unique unique (email, cohort_code)
);

-- At most one waitlist row per application.
create unique index if not exists academy_waitlist_application_uidx
  on public.academy_waitlist(application_id)
  where application_id is not null;

-- Invitation order: highest priority first, then earliest join.
create index if not exists academy_waitlist_invite_order_idx
  on public.academy_waitlist(cohort_code, status, priority, position);

-- Auto-assign join position on first insert.
create or replace function public.academy_waitlist_assign_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if NEW.position is null then
    select coalesce(max(position), 0) + 1 into NEW.position
    from public.academy_waitlist
    where cohort_code = NEW.cohort_code;
  end if;
  return NEW;
end $function$;

drop trigger if exists academy_waitlist_assign_position_trg on public.academy_waitlist;
create trigger academy_waitlist_assign_position_trg
  before insert on public.academy_waitlist
  for each row execute function public.academy_waitlist_assign_position();

-- Notification history for waitlist contact (invites, reopen notices).
create table if not exists public.academy_waitlist_notifications (
  id          uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references public.academy_waitlist(id) on delete cascade,
  channel     text not null default 'email',
  template    text not null default 'invite',
  status      text not null default 'sent' check (status in ('sent','failed')),
  error       text,
  sent_at     timestamptz not null default now()
);

create index if not exists academy_waitlist_notifications_wl_idx
  on public.academy_waitlist_notifications(waitlist_id, sent_at);

-- ---------------------------------------------------------------------------
-- 2. Payment exceptions (overflow / blocked-enrollment audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.academy_payment_exceptions (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid references public.academy_applications(id) on delete set null,
  cohort_code        text not null default 'founding-2026',
  amount_php         numeric,
  currency           text not null default 'PHP',
  payment_provider   text,                -- stripe | paymongo | gcash | admin
  provider_reference text,
  payment_intent_id  text,
  reason             text not null check (reason in
                     ('reservation_expired','capacity_exceeded','trigger_capacity_exceeded','admin_override','gcash_ungated','unknown')),
  resolved           boolean not null default false,
  resolution         text check (resolution in ('refunded','voided','manual_enrollment','ignored')),
  notes              text,
  resolved_at        timestamptz,
  resolved_by        text,
  created_at         timestamptz not null default now()
);

create index if not exists academy_payment_exceptions_open_idx
  on public.academy_payment_exceptions(resolved, created_at desc);
create index if not exists academy_payment_exceptions_cohort_idx
  on public.academy_payment_exceptions(cohort_code, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Hard invariant: never allow paid rows to exceed cohort capacity.
--    finalize_academy_payment() sets a transaction-scoped GUC for explicit
--    admin overrides (audited via academy_payment_exceptions + activity log).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_academy_cohort_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_capacity integer;
begin
  if NEW.payment_status = 'paid'
     and (TG_OP = 'INSERT' or OLD.payment_status is distinct from 'paid') then
    select capacity into v_capacity from public.academy_cohorts where code = NEW.cohort_code;
    if v_capacity is not null and (
      select count(*) from public.academy_applications
      where cohort_code = NEW.cohort_code
        and payment_status = 'paid'
        and id is distinct from NEW.id
    ) >= v_capacity then
      raise exception 'academy cohort % is at full capacity (% paid)', NEW.cohort_code, v_capacity;
    end if;
  end if;
  return NEW;
end $function$;

drop trigger if exists academy_applications_capacity_trg on public.academy_applications;
create trigger academy_applications_capacity_trg
  before insert or update of payment_status, cohort_code on public.academy_applications
  for each row execute function public.enforce_academy_cohort_capacity();

-- ---------------------------------------------------------------------------
-- 4. finalize_academy_payment: single, serialized mark-paid gate.
--    Every payment-confirmation path calls this BEFORE recording paid.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_academy_payment(
  p_application_id      uuid,
  p_amount              numeric default null,
  p_currency            text    default null,
  p_payment_method      text    default null,
  p_provider            text    default null,
  p_provider_reference  text    default null,
  p_payment_intent_id   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_app       public.academy_applications%rowtype;
  v_capacity  integer;
  v_open      boolean;
  v_code      text;
  v_paid      integer;
  v_exc       uuid;
begin
  perform pg_advisory_xact_lock(hashtext('assistara-academy-seat-reservation'));

  select * into v_app from public.academy_applications where id = p_application_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'application_not_found');
  end if;

  if v_app.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'paid', true, 'already', true,
                              'cohort_code', coalesce(v_app.cohort_code, 'founding-2026'));
  end if;

  v_code := coalesce(v_app.cohort_code, 'founding-2026');
  select capacity, is_open into v_capacity, v_open
  from public.academy_cohorts where code = v_code;

  select count(*) into v_paid
  from public.academy_applications
  where cohort_code = v_code and id <> p_application_id
    and (payment_status = 'paid' or (payment_status = 'pending' and payment_requested_at >= now() - interval '31 minutes'));

  if v_capacity is null or v_paid >= v_capacity then
    insert into public.academy_payment_exceptions
      (application_id, cohort_code, amount_php, currency, payment_provider,
       provider_reference, payment_intent_id, reason, resolved, resolution)
    values
      (p_application_id, v_code, p_amount, coalesce(p_currency, 'PHP'), p_provider,
       p_provider_reference, p_payment_intent_id, 'capacity_exceeded', false, null)
    returning id into v_exc;

    insert into public.admin_activity_log
      (entity_type, entity_id, action, details)
    values
      ('application', p_application_id, 'payment_capacity_exception',
       jsonb_build_object('exception_id', v_exc, 'reason', 'capacity_exceeded',
                          'paid', v_paid, 'capacity', v_capacity, 'cohort_code', v_code,
                          'provider', p_provider, 'provider_reference', p_provider_reference,
                          'amount_php', p_amount));

    return jsonb_build_object('ok', false, 'exception', true, 'full', true,
                              'code', 'capacity_exceeded', 'paid', v_paid,
                              'capacity', v_capacity, 'cohort_code', v_code,
                              'exception_id', v_exc);
  end if;

  update public.academy_applications
  set payment_status = 'paid',
      paid_at        = coalesce(paid_at, now()),
      purchase_amount = coalesce(p_amount, purchase_amount),
      purchase_currency = coalesce(p_currency, purchase_currency),
      payment_method = coalesce(p_payment_method, payment_method),
      status         = case when status = 'waitlisted' then 'accepted' else status end,
      waitlisted_at  = null,
      cohort_code    = v_code
  where id = p_application_id and payment_status <> 'paid';

  update public.academy_waitlist
  set status = 'enrolled', enrolled_at = now(), updated_at = now()
  where application_id = p_application_id and status in ('waiting','invited');

  return jsonb_build_object('ok', true, 'paid', true, 'cohort_code', v_code,
                            'capacity', v_capacity, 'paid_now', v_paid + 1);
exception when others then
  if sqlerrm like '%academy cohort % is at full capacity%' then
    insert into public.academy_payment_exceptions
      (application_id, cohort_code, amount_php, currency, payment_provider,
       provider_reference, payment_intent_id, reason, resolved)
    values
      (p_application_id, coalesce(v_app.cohort_code, 'founding-2026'), p_amount,
       coalesce(p_currency, 'PHP'), p_provider, p_provider_reference,
       p_payment_intent_id, 'trigger_capacity_exceeded', false)
    on conflict do nothing;
    return jsonb_build_object('ok', false, 'exception', true, 'full', true,
                              'code', 'trigger_capacity_exceeded', 'error', sqlerrm);
  end if;
  raise;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Waitlist join (priority opt-in from the full-cohort screen / CTA).
--    Dedupes by (email, cohort_code); reactivates removed entries.
-- ---------------------------------------------------------------------------
create or replace function public.join_academy_waitlist(
  p_application_id uuid,
  p_source         text default 'checkout_cta'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_app  public.academy_applications%rowtype;
  v_code text;
  v_w    public.academy_waitlist%rowtype;
  v_prio integer;
begin
  perform pg_advisory_xact_lock(hashtext('assistara-academy-seat-reservation'));

  select * into v_app from public.academy_applications where id = p_application_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'application_not_found');
  end if;
  v_code := coalesce(v_app.cohort_code, 'founding-2026');

  select * into v_w
  from public.academy_waitlist
  where email = v_app.email and cohort_code = v_code
  limit 1;

  if v_w.id is not null then
    if v_w.status in ('declined','removed') then
      update public.academy_waitlist
      set status = 'waiting', invited_at = null, declined_at = null, removed_at = null,
          updated_at = now()
      where id = v_w.id;
      v_w.status := 'waiting';
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'id', v_w.id,
                              'cohort_code', v_code, 'position', v_w.position,
                              'priority', v_w.priority, 'status', v_w.status);
  end if;

  v_prio := case p_source
             when 'checkout_cta' then 1
             when 'auto'         then 2
             else 3
           end;

  insert into public.academy_waitlist
    (application_id, cohort_code, name, email, source, priority, status)
  values
    (p_application_id, v_code, v_app.name, v_app.email, p_source, v_prio, 'waiting')
  returning id, position, priority, status into v_w.id, v_w.position, v_w.priority, v_w.status;

  return jsonb_build_object('ok', true, 'id', v_w.id, 'cohort_code', v_code,
                            'position', v_w.position, 'priority', v_w.priority,
                            'status', v_w.status, 'source', p_source);
end $function$;

-- ---------------------------------------------------------------------------
-- 6. Admin capacity overview (dashboard numbers).
-- ---------------------------------------------------------------------------
create or replace function public.academy_capacity_overview(p_cohort_code text default 'founding-2026')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_name text; v_capacity integer; v_open boolean;
  v_paid integer; v_reservations integer; v_stale_pending integer;
  v_waiting integer; v_invited integer; v_exceptions_open integer;
begin
  select name, capacity, is_open into v_name, v_capacity, v_open
  from public.academy_cohorts where code = p_cohort_code;

  select count(*) into v_paid
  from public.academy_applications
  where cohort_code = p_cohort_code and payment_status = 'paid';

  select count(*) into v_reservations
  from public.academy_applications
  where cohort_code = p_cohort_code
    and payment_status = 'pending'
    and payment_requested_at >= now() - interval '31 minutes';

  select count(*) into v_stale_pending
  from public.academy_applications
  where cohort_code = p_cohort_code
    and payment_status = 'pending'
    and payment_requested_at < now() - interval '31 minutes';

  select count(*) into v_waiting
  from public.academy_waitlist where cohort_code = p_cohort_code and status = 'waiting';

  select count(*) into v_invited
  from public.academy_waitlist where cohort_code = p_cohort_code and status = 'invited';

  select count(*) into v_exceptions_open
  from public.academy_payment_exceptions
  where cohort_code = p_cohort_code and not resolved;

  return jsonb_build_object(
    'ok', true,
    'cohort_code', p_cohort_code,
    'cohort_name', coalesce(v_name, 'Founding Cohort'),
    'is_open', coalesce(v_open, false),
    'capacity', coalesce(v_capacity, 0),
    'paid', coalesce(v_paid, 0),
    'reservations', coalesce(v_reservations, 0),
    'stale_pending', coalesce(v_stale_pending, 0),
    'available', greatest(0, coalesce(v_capacity,0) - coalesce(v_paid,0)),
    'spots_after_reservations', greatest(0, coalesce(v_capacity,0) - coalesce(v_paid,0) - coalesce(v_reservations,0)),
    'waitlist_waiting', coalesce(v_waiting, 0),
    'waitlist_invited', coalesce(v_invited, 0),
    'exceptions_open', coalesce(v_exceptions_open, 0)
  );
end $function$;

-- ---------------------------------------------------------------------------
-- 7. Admin waitlist list (ordered for invitation).
-- ---------------------------------------------------------------------------
create or replace function public.admin_waitlist_list(p_cohort_code text default 'founding-2026')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority, r.position, r.created_at), '[]'::jsonb)
  into v_rows
  from (
    select w.id, w.application_id, w.cohort_code, w.name, w.email, w.phone, w.source,
           w.priority, w.position, w.status, w.created_at, w.invited_at, w.enrolled_at,
           a.decision as app_decision, a.status as app_status, a.payment_status as app_payment_status
    from public.academy_waitlist w
    left join public.academy_applications a on a.id = w.application_id
    where w.cohort_code = p_cohort_code
  ) r;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;

-- ---------------------------------------------------------------------------
-- 8. Invite the next eligible waitlisted applicant.
--    Capacity-safe: refuses when every seat is paid. Never auto-enrolls;
--    sets application back to 'accepted' so the checkout flow (and its
--    reserve gate) takes over from here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_invite_next_waitlisted(p_cohort_code text default 'founding-2026')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_capacity integer; v_open boolean; v_paid integer;
  v_w public.academy_waitlist%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('assistara-academy-seat-reservation'));

  select capacity, is_open into v_capacity, v_open
  from public.academy_cohorts where code = p_cohort_code;
  if v_capacity is null or not coalesce(v_open, false) then
    return jsonb_build_object('ok', false, 'error', 'cohort_closed');
  end if;

  select count(*) into v_paid
  from public.academy_applications
  where cohort_code = p_cohort_code and payment_status = 'paid';

  if v_paid >= v_capacity then
    return jsonb_build_object('ok', false, 'error', 'cohort_full',
                              'paid', v_paid, 'capacity', v_capacity);
  end if;

  select * into v_w
  from public.academy_waitlist
  where cohort_code = p_cohort_code and status = 'waiting'
  order by priority asc, position asc, created_at asc
  limit 1
  for update skip locked;

  if v_w.id is null then
    return jsonb_build_object('ok', false, 'error', 'waitlist_empty');
  end if;

  update public.academy_waitlist
  set status = 'invited', invited_at = now(), updated_at = now()
  where id = v_w.id;

  -- Return the applicant to the standard 'accepted' state so they go through
  -- checkout (reserve_academy_seat re-verifies a seat exists before payment).
  if v_w.application_id is not null then
    update public.academy_applications
    set decision = 'accepted', status = 'accepted', accepted_at = coalesce(accepted_at, now()),
        reviewed_at = coalesce(reviewed_at, now()), opened_at = now(), waitlisted_at = null
    where id = v_w.application_id;
  end if;

  insert into public.admin_activity_log (entity_type, entity_id, action, details)
  values ('waitlist', v_w.id, 'waitlist_invite_sent',
          jsonb_build_object('cohort_code', p_cohort_code, 'application_id', v_w.application_id,
                             'name', v_w.name, 'email', v_w.email, 'priority', v_w.priority,
                             'position', v_w.position));

  return jsonb_build_object('ok', true,
    'waitlist_id', v_w.id, 'application_id', v_w.application_id, 'name', v_w.name,
    'email', v_w.email, 'cohort_code', p_cohort_code,
    'enrollment_token', (select enrollment_token from public.academy_applications where id = v_w.application_id),
    'paid', v_paid, 'capacity', v_capacity);
end $function$;

-- ---------------------------------------------------------------------------
-- 9. Re-create the two live-only reservation RPCs from their production
--    definitions so the schema is version-controlled. reserve_academy_seat is
--    additionally hardened to capture a waitlist row when the cohort is full.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_academy_seat(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_app public.academy_applications%rowtype;
  v_capacity integer;
  v_open boolean;
  v_used integer;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtext('assistara-academy-seat-reservation'));
  select * into v_app from public.academy_applications where id=p_application_id for update;
  if not found then return jsonb_build_object('ok',false,'error','application_not_found'); end if;
  if v_app.payment_status='paid' then return jsonb_build_object('ok',true,'paid',true); end if;
  v_code:=coalesce(v_app.cohort_code,'founding-2026');
  select capacity,is_open into v_capacity,v_open from public.academy_cohorts where code=v_code;
  if v_capacity is null or not coalesce(v_open,false) then
    update public.academy_applications set status='waitlisted',waitlisted_at=coalesce(waitlisted_at,now()) where id=p_application_id;
    return jsonb_build_object('ok',false,'full',true,'cohort_code',v_code,'error','cohort_closed');
  end if;
  select count(*) into v_used
  from public.academy_applications
  where cohort_code=v_code and id<>p_application_id
    and (payment_status='paid' or (payment_status='pending' and payment_requested_at>=now()-interval '31 minutes'));
  if v_used>=v_capacity then
    update public.academy_applications set status='waitlisted',waitlisted_at=coalesce(waitlisted_at,now()) where id=p_application_id;
    -- Capture the applicant on the practice waitlist (auto source) so an
    -- admin can invite them when a seat opens, even if they never clicked
    -- the waitlist CTA.
    insert into public.academy_waitlist (application_id, cohort_code, name, email, source, priority, status)
    values (p_application_id, v_code, v_app.name, v_app.email, 'auto', 2, 'waiting')
    on conflict (email, cohort_code) do nothing;
    return jsonb_build_object('ok',false,'full',true,'cohort_code',v_code,'capacity',v_capacity,'used',v_used,'spots_left',0);
  end if;
  update public.academy_applications
  set payment_status='pending',payment_requested_at=now(),status='accepted',waitlisted_at=null,cohort_code=v_code
  where id=p_application_id and payment_status<>'paid';
  return jsonb_build_object('ok',true,'cohort_code',v_code,'capacity',v_capacity,'used',v_used+1,'spots_left',greatest(0,v_capacity-v_used-1));
end $function$;

create or replace function public.academy_cohort_status(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_app public.academy_applications%rowtype; v_capacity integer; v_open boolean; v_used integer; v_name text;
begin
  select * into v_app from public.academy_applications where id=p_application_id;
  if not found then return jsonb_build_object('ok',false); end if;
  select capacity,is_open,name into v_capacity,v_open,v_name from public.academy_cohorts where code=coalesce(v_app.cohort_code,'founding-2026');
  select count(*) into v_used from public.academy_applications where cohort_code=coalesce(v_app.cohort_code,'founding-2026') and id<>p_application_id and (payment_status='paid' or (payment_status='pending' and payment_requested_at>=now()-interval '31 minutes'));
  return jsonb_build_object('ok',true,'cohort_code',coalesce(v_app.cohort_code,'founding-2026'),'cohort_name',v_name,'capacity',coalesce(v_capacity,0),'is_open',coalesce(v_open,false),'used',v_used,'full',not coalesce(v_open,false) or v_used>=coalesce(v_capacity,0),'spots_left',greatest(0,coalesce(v_capacity,0)-v_used));
end $function$;

-- ---------------------------------------------------------------------------
-- 10. Privileges: service_role only, matching the live schema (anon is blocked).
-- ---------------------------------------------------------------------------
alter table public.academy_waitlist enable row level security;
alter table public.academy_waitlist_notifications enable row level security;
alter table public.academy_payment_exceptions enable row level security;

revoke all on public.academy_waitlist from anon, authenticated;
revoke all on public.academy_waitlist_notifications from anon, authenticated;
revoke all on public.academy_payment_exceptions from anon, authenticated;
grant select, insert, update, delete on public.academy_waitlist to service_role;
grant select, insert, update, delete on public.academy_waitlist_notifications to service_role;
grant select, insert, update, delete on public.academy_payment_exceptions to service_role;

revoke execute on function public.finalize_academy_payment(uuid,numeric,text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.finalize_academy_payment(uuid,numeric,text,text,text,text,text,boolean,text) to service_role;

revoke execute on function public.join_academy_waitlist(uuid,text) from public, anon, authenticated;
grant execute on function public.join_academy_waitlist(uuid,text) to service_role;

revoke execute on function public.academy_capacity_overview(text) from public, anon, authenticated;
grant execute on function public.academy_capacity_overview(text) to service_role;

revoke execute on function public.admin_waitlist_list(text) from public, anon, authenticated;
grant execute on function public.admin_waitlist_list(text) to service_role;

revoke execute on function public.admin_invite_next_waitlisted(text) from public, anon, authenticated;
grant execute on function public.admin_invite_next_waitlisted(text) to service_role;

-- Keep the reservation RPCs service_role-only (explicit, even though
-- CREATE OR REPLACE preserves existing ACLs).
revoke execute on function public.reserve_academy_seat(uuid) from public, anon, authenticated;
grant execute on function public.reserve_academy_seat(uuid) to service_role;
revoke execute on function public.academy_cohort_status(uuid) from public, anon, authenticated;
grant execute on function public.academy_cohort_status(uuid) to service_role;

-- The enforce/academy_waitlist_assign_position triggers execute as their
-- invoking definer context already; no function-level grant is required.

