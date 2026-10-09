-- Insert MASTERCLASS coupon for Assistara Academy
-- This should be executed in the Supabase SQL editor or via a migration
-- Table: academy_promo_codes
-- Columns: code (text), amount_php (integer), starts_at (timestamp), expires_at (timestamp), active (boolean)

INSERT INTO academy_promo_codes (code, amount_php, starts_at, expires_at, active)
VALUES ('MASTERCLASS', 4900, NULL, NULL, true)
ON CONFLICT (code) DO UPDATE SET
  amount_php = EXCLUDED.amount_php,
  active = EXCLUDED.active,
  starts_at = EXCLUDED.starts_at,
  expires_at = EXCLUDED.expires_at;