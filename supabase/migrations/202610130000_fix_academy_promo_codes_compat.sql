-- Fix academy_promo_codes table for backward compatibility
-- Production has the old schema: code, amount_php (final price), starts_at, expires_at, active
-- New schema needs: discount_type, discount_value, campaign_name, description, max_redemptions, etc.
-- This migration ALTERs the existing table to add new columns and makes amount_php a generated column

-- First, check if table exists with old schema and add new columns
do $$
begin
  -- Add new columns if they don't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'academy_promo_codes' and column_name = 'discount_type'
  ) then
    alter table public.academy_promo_codes
      add column discount_type text,
      add column discount_value integer,
      add column campaign_name text,
      add column description text,
      add column max_redemptions integer,
      add column max_redemptions_per_customer integer default 1,
      add column created_at timestamp with time zone not null default now(),
      add column updated_at timestamp with time zone not null default now(),
      add column created_by uuid references auth.users(id),
      add column updated_by uuid references auth.users(id),
      add column id uuid;

    -- Generate IDs for existing rows
    update public.academy_promo_codes set id = gen_random_uuid() where id is null;
    
    -- Make id the primary key
    alter table public.academy_promo_codes add primary key (id);
    
    -- Add unique constraint on code
    alter table public.academy_promo_codes add constraint academy_promo_codes_code_key unique (code);
  end if;
end $$;

-- Backfill discount_type and discount_value from existing amount_php (final price)
-- Regular price is ₱6,900 = 690000 centavos
-- Old amount_php was in PHP (e.g., 4900 = ₱4,900 final price)
-- New discount_value for fixed_php = discount amount in centavos = (690000 - amount_php * 100)
update public.academy_promo_codes
set
  discount_type = 'fixed_php',
  discount_value = (690000 - (amount_php * 100)),
  campaign_name = case code when 'XYRA' then 'XYRA Promotional Campaign' else code || ' Campaign' end,
  description = case code when 'XYRA' then 'Fixed ₱3,000 discount on Assistara Academy founding cohort enrollment' else 'Migrated from legacy coupon' end,
  max_redemptions = null,
  max_redemptions_per_customer = 1,
  created_at = coalesce(created_at, now()),
  updated_at = now()
where discount_type is null;

-- Add check constraint for discount_type
alter table public.academy_promo_codes
  add constraint academy_promo_codes_discount_type_check
  check (discount_type in ('fixed_php', 'percentage', 'target_price'));

-- Drop the old amount_php column and recreate as GENERATED column
-- This computes final price in PHP from discount config
alter table public.academy_promo_codes
  drop column if exists amount_php;

alter table public.academy_promo_codes
  add column amount_php integer
  generated always as (
    case discount_type
      when 'fixed_php' then (690000 - discount_value) / 100
      when 'percentage' then (690000 * (10000 - discount_value) / 10000) / 100
      when 'target_price' then discount_value / 100
      else 6900
    end
  ) stored;

-- Recreate updated_at trigger
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

-- Recreate indexes
create index if not exists academy_promo_codes_code_idx on public.academy_promo_codes (code);
create index if not exists academy_promo_codes_active_idx on public.academy_promo_codes (active);
create index if not exists academy_promo_codes_dates_idx on public.academy_promo_codes (starts_at, expires_at);

-- Enable RLS and policies
alter table public.academy_promo_codes enable row level security;

drop policy if exists "Service role full access" on public.academy_promo_codes;
create policy "Service role full access" on public.academy_promo_codes
  for all using (auth.role() = 'service_role');