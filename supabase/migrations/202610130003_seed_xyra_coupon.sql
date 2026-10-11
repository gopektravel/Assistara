-- Seed the XYRA coupon into academy_promo_codes
-- Regular price: ₱6,900 (690000 centavos)
-- Discount: ₱3,000 (300000 centavos)
-- Final price: ₱3,900 (390000 centavos)
-- Using fixed_php discount type with value 300000 (₱3,000 in centavos)

insert into public.academy_promo_codes (code, campaign_name, description, discount_type, discount_value, starts_at, expires_at, max_redemptions, max_redemptions_per_customer, active)
values (
  'XYRA',
  'XYRA Promotional Campaign',
  'Fixed ₱3,000 discount on Assistara Academy founding cohort enrollment',
  'fixed_php',
  300000, -- ₱3,000 in centavos
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
  starts_at = excluded.starts_at,
  expires_at = excluded.expires_at,
  max_redemptions = excluded.max_redemptions,
  max_redemptions_per_customer = excluded.max_redemptions_per_customer,
  active = excluded.active,
  updated_at = now();