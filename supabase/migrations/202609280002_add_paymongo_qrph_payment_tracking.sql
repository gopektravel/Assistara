alter table public.academy_applications
  add column if not exists paymongo_payment_intent_id text,
  add column if not exists paymongo_payment_id text,
  add column if not exists paymongo_qr_created_at timestamptz,
  add column if not exists paymongo_qr_expires_at timestamptz;

create unique index if not exists academy_applications_paymongo_payment_intent_uidx
  on public.academy_applications(paymongo_payment_intent_id)
  where paymongo_payment_intent_id is not null;

create table if not exists public.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  payment_id text,
  payment_intent_id text,
  livemode boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.paymongo_webhook_events enable row level security;
revoke all on public.paymongo_webhook_events from anon, authenticated;
