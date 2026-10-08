-- Payment Processing Fees — automatic fee tracking for Stripe & PayMongo QR Ph
-- Only TWO active providers: Stripe (card) and PayMongo (QR Ph, includes GCash via QR Ph)
-- Legacy GCash manual payments are deprecated; keep existing records intact.

create table if not exists public.payment_processing_fees (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.academy_applications(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'paymongo')),
  provider_payment_id text not null, -- stripe_charge_id, paymongo_payment_id
  provider_fee_id text, -- Stripe balance_transaction ID, PayMongo fee reference
  gross_amount_php numeric(14,2) not null check (gross_amount_php >= 0),
  fee_amount_php numeric(14,2) not null check (fee_amount_php >= 0),
  net_amount_php numeric(14,2) generated always as (gross_amount_php - fee_amount_php) stored,
  fee_currency text not null default 'PHP' check (fee_currency in ('PHP')),
  fee_fx_rate_php numeric(12,6) not null default 1 check (fee_fx_rate_php > 0),
  fee_details jsonb, -- Raw fee breakdown from provider (Stripe fee_details, PayMongo fees array)
  reconciliation_status text not null default 'confirmed' check (reconciliation_status in ('confirmed', 'pending', 'failed')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id) -- Idempotency: one fee record per provider charge
);

create index if not exists payment_processing_fees_app_idx
  on public.payment_processing_fees (application_id);
create index if not exists payment_processing_fees_provider_idx
  on public.payment_processing_fees (provider);
create index if not exists payment_processing_fees_status_idx
  on public.payment_processing_fees (reconciliation_status);
create index if not exists payment_processing_fees_created_idx
  on public.payment_processing_fees (created_at);

-- RLS: Service role only
alter table public.payment_processing_fees enable row level security;
revoke all on public.payment_processing_fees from public, anon, authenticated;
grant select, insert, update on public.payment_processing_fees to service_role;

notify pgrst, 'reload schema';