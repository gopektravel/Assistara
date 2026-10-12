-- =============================================================================
-- Academy offer assignment — persistent per-applicant offer linking
-- -----------------------------------------------------------------------------
-- Replaces hardcoded email detection with explicit, auditable offer assignments.
-- Links applicants to promo codes via the existing academy_promo_codes table.
-- =============================================================================

-- Add offer assignment column to academy_applications
alter table public.academy_applications
  add column if not exists assigned_promo_code_id uuid references public.academy_promo_codes(id) on delete set null;

comment on column public.academy_applications.assigned_promo_code_id
  is 'Explicitly assigned promo code for this applicant. When set, the discount is automatically applied at checkout.';

-- Index for efficient lookups
create index if not exists academy_applications_assigned_promo_idx
  on public.academy_applications(assigned_promo_code_id)
  where assigned_promo_code_id is not null;

-- Assign the MASTERCLASS coupon to the three Group 2 applicants
-- These are the only applicants who should receive the automatic founding-cohort discount
do $$
declare
  v_masterclass_id uuid;
begin
  select id into v_masterclass_id
  from public.academy_promo_codes
  where code = 'MASTERCLASS'
  limit 1;

  if v_masterclass_id is not null then
    update public.academy_applications
    set assigned_promo_code_id = v_masterclass_id
    where id in (
      'd8144cd2-bab7-443b-972d-e60569eae605', -- iresh maragana
      'f4af3228-667b-4789-8886-cb854b83837f', -- Gadilyn Llacuna
      '1c36fb07-2a67-49a8-9901-95dcfc132ee8'  -- Edward Apolito
    )
    and assigned_promo_code_id is null; -- idempotent: only assign if not already set
  end if;
end $$;

-- =============================================================================
-- View for admin visibility: applicant offer assignments
-- =============================================================================
create or replace view public.academy_applicant_offers as
select
  a.id as application_id,
  a.name,
  a.email,
  a.status,
  a.decision,
  a.accepted_at,
  a.enrollment_token,
  p.id as promo_code_id,
  p.code as promo_code,
  p.amount_php as checkout_amount_php,
  p.discount_type,
  p.discount_value,
  p.active as promo_active,
  p.starts_at,
  p.expires_at,
  p.max_redemptions,
  p.max_redemptions_per_customer
from public.academy_applications a
left join public.academy_promo_codes p on p.id = a.assigned_promo_code_id
where a.assigned_promo_code_id is not null;

comment on view public.academy_applicant_offers is 'Visible audit trail of which applicants have which promo codes assigned.';

-- =============================================================================
-- RLS: Service role only for the new column (no additional policies needed
-- since academy_applications already has service-role-only access via existing policies)
-- =============================================================================
-- No additional RLS changes needed - existing policies cover this.