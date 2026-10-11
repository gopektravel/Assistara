-- Fix academy_promo_codes table for backward compatibility
-- Production has the old schema: code, amount_php (final price in PHP), starts_at, expires_at, active
-- New schema adds: discount_type, discount_value, campaign_name, description, max_redemptions, max_redemptions_per_customer, id, created_at, updated_at, created_by, updated_by
-- amount_php remains a regular column (final price in PHP) for backward compatibility with existing functions

-- Step 1: Add new columns if they don't exist
do $$
begin
  -- Add id column if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'academy_promo_codes' and column_name = 'id'
  ) then
    alter table public.academy_promo_codes add column id uuid;
    
    -- Generate IDs for existing rows
    update public.academy_promo_codes set id = gen_random_uuid() where id is null;
    
    -- Make id the primary key
    alter table public.academy_promo_codes add primary key (id);
  end if;

  -- Add unique constraint on code if missing
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'academy_promo_codes' 
    and constraint_name = 'academy_promo_codes_code_key'
  ) then
    alter table public.academy_promo_codes add constraint academy_promo_codes_code_key unique (code);
  end if;

  -- Add new columns
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
      add column updated_by uuid references auth.users(id);
  end if;
end $$;

-- Step 2: Backfill new columns from existing data
-- amount_php is the FINAL price in PHP (e.g., 4900 = ₱4,900, 3900 = ₱3,900)
-- Regular price is ₱6,900 = 6900 PHP
-- For fixed_php discount: discount_value = (regular_price - final_price) * 100 centavos
update public.academy_promo_codes
set
  discount_type = 'fixed_php',
  discount_value = (6900 - amount_php) * 100,  -- discount in centavos
  campaign_name = case 
    when code = 'XYRA' then 'XYRA Promotional Campaign'
    when code = 'MASTERCLASS' then 'Masterclass Campaign'
    else code || ' Campaign' 
  end,
  description = case 
    when code = 'XYRA' then 'Fixed ₱3,000 discount on Assistara Academy founding cohort enrollment'
    when code = 'MASTERCLASS' then 'Masterclass discount'
    else 'Migrated from legacy coupon' 
  end,
  max_redemptions = null,
  max_redemptions_per_customer = coalesce(max_redemptions_per_customer, 1),
  created_at = coalesce(created_at, now()),
  updated_at = now()
where discount_type is null;

-- Step 3: Add check constraint for discount_type (idempotent)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'academy_promo_codes' 
    and constraint_name = 'academy_promo_codes_discount_type_check'
  ) then
    alter table public.academy_promo_codes
      add constraint academy_promo_codes_discount_type_check
      check (discount_type in ('fixed_php', 'percentage', 'target_price'));
  end if;
end $$;

-- Step 4: amount_php REMAINS a regular column (final price in PHP) for backward compatibility
-- DO NOT make it GENERATED - existing functions depend on it being the final price directly

-- Step 5: Recreate updated_at trigger
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

-- Step 6: Recreate indexes (idempotent)
create index if not exists academy_promo_codes_code_idx on public.academy_promo_codes (code);
create index if not exists academy_promo_codes_active_idx on public.academy_promo_codes (active);
create index if not exists academy_promo_codes_dates_idx on public.academy_promo_codes (starts_at, expires_at);

-- Step 7: Enable RLS and policies
alter table public.academy_promo_codes enable row level security;

drop policy if exists "Service role full access" on public.academy_promo_codes;
create policy "Service role full access" on public.academy_promo_codes
  for all using (auth.role() = 'service_role');