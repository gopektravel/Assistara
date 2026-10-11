-- Seed the MASTERCLASS coupon into academy_promo_codes
-- Regular price: ₱6,900
-- Discount: ₱2,000 (6900 - 4900 = 2000)
-- Final price: ₱4,900
-- Using fixed_php discount type with value 200000 (₱2,000 in centavos)

insert into public.academy_promo_codes (code, campaign_name, description, discount_type, discount_value, amount_php, starts_at, expires_at, max_redemptions, max_redemptions_per_customer, active)
values (
  'MASTERCLASS',
  'Masterclass Campaign',
  'Masterclass discount on Assistara Academy enrollment',
  'fixed_php',
  200000, -- ₱2,000 in centavos
  4900,   -- Final price in PHP
  null,   -- No start date restriction
  null,   -- No expiration
  null,   -- Unlimited redemptions
  1,      -- One per customer
  true    -- Active
)
on conflict (code) do update set
  campaign_name = excluded.campaign_name,
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  amount_php = excluded.amount_php,
  starts_at = excluded.starts_at,
  expires_at = excluded.expires_at,
  max_redemptions = excluded.max_redemptions,
  max_redemptions_per_customer = excluded.max_redemptions_per_customer,
  active = excluded.active,
  updated_at = now();