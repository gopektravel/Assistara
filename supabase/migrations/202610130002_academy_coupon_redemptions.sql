-- Create academy_coupon_redemptions table for tracking coupon usage and attribution
-- This table records every successful coupon redemption tied to confirmed payments

create table if not exists public.academy_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.academy_promo_codes(id) on delete restrict,
  application_id uuid not null references public.academy_applications(id) on delete restrict,
  enrollment_token uuid not null,
  customer_email text not null,
  original_price_php integer not null, -- Regular price in PHP centavos at time of redemption
  discount_amount_php integer not null, -- Discount given in PHP centavos
  final_price_php integer not null, -- Final price paid in PHP centavos
  payment_method text not null, -- 'stripe', 'paymongo_qrph', 'gcash', 'manual'
  payment_reference text, -- Stripe session ID, PayMongo payment intent ID, GCash reference
  payment_intent_id text, -- Stripe payment_intent or PayMongo payment_intent
  redeemed_at timestamp with time zone not null default now(),
  confirmed_at timestamp with time zone, -- Set when payment is confirmed (webhook)
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed', 'refunded')),
  metadata jsonb default '{}' -- Additional context (coupon type, discount breakdown, etc.)
);

comment on table public.academy_coupon_redemptions is 'Tracks confirmed coupon redemptions tied to actual payments';
comment on column public.academy_coupon_redemptions.original_price_php is 'Regular Academy price in PHP centavos at time of redemption';
comment on column public.academy_coupon_redemptions.discount_amount_php is 'Actual discount applied in PHP centavos';
comment on column public.academy_coupon_redemptions.final_price_php is 'Final amount customer paid in PHP centavos';
comment on column public.academy_coupon_redemptions.status is 'pending=checkout started, confirmed=payment verified, failed=canceled/expired, refunded=refund processed';

-- Indexes for analytics and lookups
create index if not exists academy_coupon_redemptions_coupon_idx on public.academy_coupon_redemptions (coupon_id);
create index if not exists academy_coupon_redemptions_application_idx on public.academy_coupon_redemptions (application_id);
create index if not exists academy_coupon_redemptions_email_idx on public.academy_coupon_redemptions (customer_email);
create index if not exists academy_coupon_redemptions_status_idx on public.academy_coupon_redemptions (status);
create index if not exists academy_coupon_redemptions_redeemed_at_idx on public.academy_coupon_redemptions (redeemed_at desc);
create index if not exists academy_coupon_redemptions_confirmed_at_idx on public.academy_coupon_redemptions (confirmed_at desc);

-- Unique constraint to prevent duplicate redemptions for same application+coupon
create unique index if not exists academy_coupon_redemptions_app_coupon_unique
  on public.academy_coupon_redemptions (application_id, coupon_id)
  where status in ('pending', 'confirmed');

-- RLS: Service role only
alter table public.academy_coupon_redemptions enable row level security;

create policy "Service role full access" on public.academy_coupon_redemptions
  for all using (auth.role() = 'service_role');

-- View for coupon analytics
create or replace view public.coupon_analytics as
select
  c.id as coupon_id,
  c.code,
  c.campaign_name,
  c.discount_type,
  c.discount_value,
  c.starts_at,
  c.expires_at,
  c.max_redemptions,
  c.active,
  c.created_at,
  -- Redemption counts
  count(r.id) filter (where r.status = 'confirmed') as confirmed_redemptions,
  count(r.id) filter (where r.status = 'pending') as pending_redemptions,
  count(r.id) filter (where r.status = 'failed') as failed_redemptions,
  count(r.id) filter (where r.status = 'refunded') as refunded_redemptions,
  -- Revenue metrics
  coalesce(sum(r.final_price_php) filter (where r.status = 'confirmed'), 0) as revenue_php,
  coalesce(sum(r.discount_amount_php) filter (where r.status = 'confirmed'), 0) as total_discounts_php,
  -- Per-customer limit check
  c.max_redemptions_per_customer,
  -- Most recent redemption
  max(r.confirmed_at) filter (where r.status = 'confirmed') as last_redemption_at,
  -- Remaining redemptions
  case
    when c.max_redemptions is not null
    then c.max_redemptions - count(r.id) filter (where r.status = 'confirmed')
    else null
  end as remaining_redemptions
from public.academy_promo_codes c
left join public.academy_coupon_redemptions r on r.coupon_id = c.id
group by c.id, c.code, c.campaign_name, c.discount_type, c.discount_value,
         c.starts_at, c.expires_at, c.max_redemptions, c.active, c.created_at,
         c.max_redemptions_per_customer;

comment on view public.coupon_analytics is 'Aggregated coupon metrics for admin dashboard';