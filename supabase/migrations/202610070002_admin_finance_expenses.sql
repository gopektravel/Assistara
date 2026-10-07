-- Admin finance: expense tracking with multi-currency support.
--
-- Design notes
-- ------------
-- * Original transaction data is preserved verbatim: `amount` + `currency`
--   are the values the admin entered.
-- * Totals are normalised into the reporting currency (PHP) so they can be
--   compared with Academy revenue, which is already denominated in PHP
--   (purchase_amount / checkout_amount_php on academy_applications).
--   `fx_rate_php` is the PHP-per-1-unit rate at entry time and
--   `amount_php` is the pre-computed normalised value, so later rate changes
--   can never rewrite history.
-- * Recurring expenses are NOT duplicated into new rows. `recurring` +
--   `recurrence_frequency` describe the rule and the Finance admin materialises
--   occurrences into a date range on the fly, so a monthly expense never has
--   to be re-entered by hand. `ends_on` is the optional stop/cancel date:
--   occurrences on or before it still count, anything after it does not.
-- * To change a recurring price without rewriting history, end the old
--   schedule (`ends_on`) and add a new expense at the new price — editing the
--   amount of an existing schedule would apply to every occurrence of it.
-- * `link_id` connects an expense to an existing Acquisition Tracker
--   source/campaign (acquisition_links). It is stored as text (no foreign key)
--   because acquisition_links is owned outside this repository; the Admin
--   joins by string id exactly like the existing admin pages do.

create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'PHP' check (currency in ('PHP', 'USD')),
  fx_rate_php numeric(12, 6) not null default 1 check (fx_rate_php > 0),
  amount_php numeric(14, 2) not null check (amount_php >= 0),
  expense_date date not null,
  category text not null check (length(category) between 1 and 80),
  vendor text,
  description text,
  recurring boolean not null default false,
  recurrence_frequency text
    check (recurrence_frequency is null or recurrence_frequency in ('monthly', 'quarterly', 'yearly')),
  ends_on date
    check (ends_on is null or ends_on >= expense_date),
  link_id text,
  receipt_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_expenses_recurring_frequency_required
    check ((recurring and recurrence_frequency is not null) or not recurring)
);

create index if not exists finance_expenses_date_idx
  on public.finance_expenses (expense_date);
create index if not exists finance_expenses_link_idx
  on public.finance_expenses (link_id);
create index if not exists finance_expenses_category_idx
  on public.finance_expenses (category);

-- Expenses are admin-only. Every read and write goes through the
-- `admin-finance` Edge Function under the service role; learners (and the
-- public anon role) have no path to this table at all.
alter table public.finance_expenses enable row level security;

drop policy if exists finance_expenses_select_own
  on public.finance_expenses;

revoke all privileges on table public.finance_expenses
  from public, anon, authenticated;
do $block$
declare
  column_row record;
begin
  for column_row in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_expenses'
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I), trigger (%1$I) on table public.finance_expenses from public, anon, authenticated',
      column_row.column_name
    );
  end loop;
end;
$block$;
grant select, insert, update, delete
  on table public.finance_expenses to service_role;

create or replace function public.finance_expenses_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.finance_expenses_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists finance_expenses_set_updated_at
  on public.finance_expenses;
create trigger finance_expenses_set_updated_at
  before update on public.finance_expenses
  for each row
  execute function public.finance_expenses_touch_updated_at();

notify pgrst, 'reload schema';