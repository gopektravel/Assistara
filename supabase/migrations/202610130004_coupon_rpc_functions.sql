-- RPC function to get coupon analytics with aggregated redemption data
-- Used by admin-coupons edge function for the coupon list view
-- SECURITY DEFINER with restricted search_path, EXECUTE granted ONLY to service_role

create or replace function public.get_coupon_analytics()
returns table (
  coupon_id uuid,
  code text,
  campaign_name text,
  discount_type text,
  discount_value integer,
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  max_redemptions integer,
  max_redemptions_per_customer integer,
  active boolean,
  created_at timestamp with time zone,
  confirmed_redemptions bigint,
  pending_redemptions bigint,
  failed_redemptions bigint,
  refunded_redemptions bigint,
  revenue_php bigint,
  total_discounts_php bigint,
  last_redemption_at timestamp with time zone,
  remaining_redemptions bigint
) language plpgsql security definer set search_path = public as $$
begin
  return query
  select
    c.id as coupon_id,
    c.code,
    c.campaign_name,
    c.discount_type,
    c.discount_value,
    c.starts_at,
    c.expires_at,
    c.max_redemptions,
    c.max_redemptions_per_customer,
    c.active,
    c.created_at,
    count(r.id) filter (where r.status in ('confirmed','limit_exceeded')) as confirmed_redemptions,
    count(r.id) filter (where r.status = 'pending') as pending_redemptions,
    count(r.id) filter (where r.status = 'failed') as failed_redemptions,
    count(r.id) filter (where r.status = 'refunded') as refunded_redemptions,
    count(r.id) filter (where r.status = 'limit_exceeded') as limit_exceeded_redemptions,
    coalesce(sum(r.final_price_php) filter (where r.status in ('confirmed','limit_exceeded')), 0) as revenue_php,
    coalesce(sum(r.discount_amount_php) filter (where r.status in ('confirmed','limit_exceeded')), 0) as total_discounts_php,
    max(r.confirmed_at) filter (where r.status in ('confirmed','limit_exceeded')) as last_redemption_at,
    case
      when c.max_redemptions is not null
      then c.max_redemptions - count(r.id) filter (where r.status in ('confirmed','limit_exceeded'))
      else null
    end as remaining_redemptions
  from public.academy_promo_codes c
  left join public.academy_coupon_redemptions r on r.coupon_id = c.id
  group by c.id, c.code, c.campaign_name, c.discount_type, c.discount_value,
           c.starts_at, c.expires_at, c.max_redemptions, c.max_redemptions_per_customer,
           c.active, c.created_at
  order by c.created_at desc;
end $$;

grant execute on function public.get_coupon_analytics() to service_role;
revoke execute on function public.get_coupon_analytics() from public, anon, authenticated;

-- Also add a function to atomically create a redemption record when a coupon is applied at checkout
-- This prevents race conditions on redemption limits
-- Uses FOR SHARE on coupon row and advisory lock for atomic limit checking

create or replace function public.create_coupon_redemption_pending(
  p_coupon_code text,
  p_application_id uuid,
  p_enrollment_token uuid,
  p_customer_email text,
  p_original_price_php integer,
  p_discount_amount_php integer,
  p_final_price_php integer,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_payment_intent_id text default null,
  p_metadata jsonb default '{}'
) returns table (
  id uuid,
  status text,
  error text
) language plpgsql security definer set search_path = public as $$
declare
  v_coupon public.academy_promo_codes%rowtype;
  v_existing_redemptions integer;
  v_customer_redemptions integer;
  v_now timestamp with time zone := now();
  v_starts_at_ok boolean;
  v_expires_at_ok boolean;
  v_active_ok boolean;
  v_inserted_id uuid;
  v_inserted_status text;
  v_error text;
begin
  -- Acquire advisory lock for this coupon code to serialize concurrent limit checks
  -- This prevents race conditions between limit checks and insert
  perform pg_advisory_xact_lock(hashtext(upper(p_coupon_code)));

  -- Fetch coupon with FOR SHARE to prevent concurrent modification during check
  select * into v_coupon from public.academy_promo_codes where code = upper(p_coupon_code) for share;
  if not found then
    return query select gen_random_uuid()::uuid as id, 'invalid'::text as status, 'Coupon not found'::text as error;
    return;
  end if;

  -- Validate coupon is active and within date range
  v_active_ok := v_coupon.active;
  v_starts_at_ok := v_coupon.starts_at is null or v_coupon.starts_at <= v_now;
  v_expires_at_ok := v_coupon.expires_at is null or v_coupon.expires_at > v_now;

  if not v_active_ok or not v_starts_at_ok or not v_expires_at_ok then
    return query select gen_random_uuid()::uuid as id, 'invalid'::text as status, 'Coupon is not active or has expired'::text as error;
    return;
  end if;

  -- Check global redemption limit (atomic with advisory lock)
  if v_coupon.max_redemptions is not null then
    select count(*) into v_existing_redemptions
    from public.academy_coupon_redemptions
    where coupon_id = v_coupon.id and status in ('confirmed', 'limit_exceeded');

    if v_existing_redemptions >= v_coupon.max_redemptions then
      return query select gen_random_uuid()::uuid as id, 'limit_exceeded'::text as status, 'Coupon redemption limit reached'::text as error;
      return;
    end if;
  end if;

  -- Check per-customer redemption limit
  if v_coupon.max_redemptions_per_customer is not null then
    select count(*) into v_customer_redemptions
    from public.academy_coupon_redemptions
    where coupon_id = v_coupon.id and customer_email = p_customer_email and status in ('confirmed', 'limit_exceeded');

    if v_customer_redemptions >= v_coupon.max_redemptions_per_customer then
      return query select gen_random_uuid()::uuid as id, 'customer_limit_exceeded'::text as status, 'Customer has already used this coupon the maximum number of times'::text as error;
      return;
    end if;
  end if;

  -- Check for existing pending redemption for this application+coupon
  -- (prevent duplicate pending records from concurrent checkout attempts)
  -- Use INSERT ... ON CONFLICT with explicit RETURNING
  begin
    insert into public.academy_coupon_redemptions (
      coupon_id, application_id, enrollment_token, customer_email,
      original_price_php, discount_amount_php, final_price_php,
      payment_method, payment_reference, payment_intent_id,
      status, metadata, redeemed_at
    ) values (
      v_coupon.id, p_application_id, p_enrollment_token, p_customer_email,
      p_original_price_php, p_discount_amount_php, p_final_price_php,
      p_payment_method, p_payment_reference, p_payment_intent_id,
      'pending', p_metadata, v_now
    )
    on conflict (application_id, coupon_id) where status in ('pending', 'confirmed', 'limit_exceeded')
    do update set
      payment_reference = excluded.payment_reference,
      payment_intent_id = excluded.payment_intent_id,
      payment_method = excluded.payment_method,
      metadata = excluded.metadata,
      redeemed_at = excluded.redeemed_at
    where academy_coupon_redemptions.status = 'pending'
    returning id, status, null::text as error
    into v_inserted_id, v_inserted_status, v_error;
  exception when unique_violation then
    -- Another concurrent request created it (should be rare with advisory lock)
    select id, status, null::text
    into v_inserted_id, v_inserted_status, v_error
    from public.academy_coupon_redemptions
    where application_id = p_application_id and coupon_id = v_coupon.id and status in ('pending', 'confirmed', 'limit_exceeded')
    limit 1;
  end;

  return query select v_inserted_id as id, v_inserted_status as status, null::text as error;

  return;
end $$;

grant execute on function public.create_coupon_redemption_pending(
  text, uuid, uuid, text, integer, integer, integer, text, text, text, jsonb
) to service_role;
revoke execute on function public.create_coupon_redemption_pending(
  text, uuid, uuid, text, integer, integer, integer, text, text, text, jsonb
) from public, anon, authenticated;

-- Function to confirm a redemption when payment is verified
-- Only transitions from 'pending' to 'confirmed'/'failed'/'refunded'
-- Never allows overwriting a confirmed redemption
-- Re-validates limits atomically at confirmation time
-- Returns: confirmed = true if coupon was confirmed, false if limit exceeded / failed / refunded

create or replace function public.confirm_coupon_redemption(
  p_application_id uuid,
  p_coupon_code text,
  p_status text,
  p_confirmed_at timestamptz default now()
) returns table (
  success boolean,
  final_status text
) language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_coupon public.academy_promo_codes%rowtype;
  v_existing_redemptions integer;
  v_customer_redemptions integer;
  v_final_status text;
  v_customer_email text;
begin
  -- Validate p_status
  if p_status not in ('confirmed', 'failed', 'refunded') then
    raise exception 'Invalid status: %', p_status;
  end if;
  v_final_status := p_status;

  -- Fetch coupon for limit re-validation
  select * into v_coupon from public.academy_promo_codes where code = upper(p_coupon_code);
  if not found then
    return query select false as success, 'invalid_coupon'::text as final_status;
    return;
  end if;

  -- Acquire advisory lock for atomic limit re-validation
  perform pg_advisory_xact_lock(hashtext(upper(p_coupon_code)));

  -- Get customer email from pending redemption
  select customer_email into v_customer_email
  from public.academy_coupon_redemptions
  where application_id = p_application_id
    and coupon_id = v_coupon.id
    and status = 'pending'
  limit 1;

  if v_customer_email is null then
    return query select false as success, 'no_pending_redemption'::text as final_status;
    return;
  end if;

  -- Only transition from 'pending' to confirmed/failed/refunded
  -- Never overwrite confirmed, failed, or refunded status
  -- Re-validate limits at confirmation time for 'confirmed' status
  if v_final_status = 'confirmed' then
    -- Re-validate global redemption limit
    if v_coupon.max_redemptions is not null then
      select count(*) into v_existing_redemptions
      from public.academy_coupon_redemptions
      where coupon_id = v_coupon.id and status in ('confirmed', 'limit_exceeded');

      if v_existing_redemptions >= v_coupon.max_redemptions then
        -- Limit exceeded: PAYMENT SUCCEEDED but coupon limit reached
        -- Mark as 'limit_exceeded' so payment handlers know enrollment proceeds at full price
        v_final_status := 'limit_exceeded';
      end if;
    end if;

    -- Re-validate per-customer redemption limit
    if v_final_status = 'confirmed' and v_coupon.max_redemptions_per_customer is not null then
      select count(*) into v_customer_redemptions
      from public.academy_coupon_redemptions
      where coupon_id = v_coupon.id and customer_email = v_customer_email and status in ('confirmed', 'limit_exceeded');

      if v_customer_redemptions >= v_coupon.max_redemptions_per_customer then
        v_final_status := 'limit_exceeded';
      end if;
    end if;
  end if;

  -- Only transition from 'pending' to confirmed/failed/refunded/limit_exceeded
  -- Never overwrite confirmed, failed, refunded, or limit_exceeded status
  update public.academy_coupon_redemptions
  set status = v_final_status,
      confirmed_at = case when v_final_status in ('confirmed', 'limit_exceeded') then p_confirmed_at else confirmed_at end
  where application_id = p_application_id
    and coupon_id = v_coupon.id
    and status = 'pending';

  get diagnostics v_count = row_count;

  -- Return true ONLY if coupon was actually confirmed
  -- Return false if limit_exceeded, failed, refunded, or no row updated
  return query select (v_count > 0 and v_final_status = 'confirmed') as success, v_final_status as final_status;

  return;
end $$;

grant execute on function public.confirm_coupon_redemption(uuid, text, text, timestamptz) to service_role;
revoke execute on function public.confirm_coupon_redemption(uuid, text, text, timestamptz) from public, anon, authenticated;

-- Partial unique index to prevent duplicate confirmed redemptions
create unique index if not exists academy_coupon_redemptions_app_coupon_confirmed_unique
  on public.academy_coupon_redemptions (application_id, coupon_id)
  where status = 'confirmed';

-- Partial unique index to prevent duplicate pending redemptions
-- (complements ON CONFLICT in create_coupon_redemption_pending)
create unique index if not exists academy_coupon_redemptions_app_coupon_pending_unique
  on public.academy_coupon_redemptions (application_id, coupon_id)
  where status = 'pending';