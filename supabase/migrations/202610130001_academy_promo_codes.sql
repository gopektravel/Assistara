-- Create academy_promo_codes table for managing Academy coupons
-- This table stores coupon definitions with support for fixed amount, percentage, and target price discounts

create table if not exists public.academy_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  campaign_name text,
  description text,
  discount_type text not null check (discount_type in ('fixed_php', 'percentage', 'target_price')),
  discount_value integer not null, -- For fixed_php: amount in PHP centavos (e.g., 300000 = ₱3,000). For percentage: basis points (e.g., 2500 = 25%). For target_price: final price in PHP centavos.
  amount_php integer not null, -- Final price in PHP (e.g., 3900 = ₱3,900). Kept as regular column for backward compatibility.
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  max_redemptions integer, -- null = unlimited
  max_redemptions_per_customer integer default 1,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

comment on table public.academy_promo_codes is 'Academy coupon codes with flexible discount types and redemption limits';
comment on column public.academy_promo_codes.discount_type is 'Type of discount: fixed_php (absolute PHP amount), percentage (percentage off), target_price (fixed final price)';
comment on column public.academy_promo_codes.discount_value is 'Discount value: fixed_php=centavos, percentage=basis_points (10000=100%), target_price=centavos';
comment on column public.academy_promo_codes.amount_php is 'Final price in PHP (e.g., 3900 = ₱3,900). Kept as regular column for backward compatibility with existing functions.';
comment on column public.academy_promo_codes.max_redemptions is 'Maximum total redemptions across all customers (null = unlimited)';
comment on column public.academy_promo_codes.max_redemptions_per_customer is 'Maximum redemptions per customer (default 1)';

-- Indexes for common queries
create index if not exists academy_promo_codes_code_idx on public.academy_promo_codes (code);
create index if not exists academy_promo_codes_active_idx on public.academy_promo_codes (active);
create index if not exists academy_promo_codes_dates_idx on public.academy_promo_codes (starts_at, expires_at);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists academy_promo_codes_updated_at on public.academy_promo_codes;
create trigger academy_promo_codes_updated_at
  before update on public.academy_promo_codes
  for each row execute function public.set_updated_at();

-- RLS: Enable but restrict to service role only (admin API handles access)
alter table public.academy_promo_codes enable row level security;

-- Admin can do everything via service role
-- Drop first if migration 0000 already created it (idempotent)
drop policy if exists "Service role full access" on public.academy_promo_codes;
create policy "Service role full access" on public.academy_promo_codes
  for all using (auth.role() = 'service_role');

-- Public can only read active coupons (for validation) - but we'll handle this via edge functions
-- No public select policy - coupon validation goes through apply-academy-promo edge function