-- Expand finance_expenses currency constraint to support EUR
-- This migration safely adds EUR to the existing PHP/USD constraint
-- without destroying or recreating existing expense data.

-- 1. Drop the existing check constraint
alter table public.finance_expenses
  drop constraint if exists finance_expenses_currency_check;

-- 2. Add the new constraint with PHP, USD, EUR
alter table public.finance_expenses
  add constraint finance_expenses_currency_check
  check (currency in ('PHP', 'USD', 'EUR'));

-- 3. Verify the constraint works
-- Existing PHP/USD rows remain valid. New rows can use EUR.
-- No data migration needed - currency values are stored as-is.

notify pgrst, 'reload schema';