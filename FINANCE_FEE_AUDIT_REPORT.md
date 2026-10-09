# Assistara Finance: Payment Processing Fee Implementation

**Date:** 2026-10-08  
**Status:** Implementation Complete (Pending Deployment Approval)  
**Scope:** Stripe (card) + PayMongo QR Ph only. GCash is deprecated.

---

## Summary

Automatic payment processing fee tracking has been implemented for **Stripe** and **PayMongo QR Ph**. Fees are now automatically retrieved from provider APIs, recorded in a dedicated ledger table, and displayed in the Finance dashboard.

---

## Changes Made

### 1. Database Migration

**File:** `supabase/migrations/202610080004_payment_processing_fees.sql`

New table `public.payment_processing_fees`:
- `id` (uuid, PK)
- `application_id` (uuid, FK → academy_applications)
- `provider` (text: 'stripe' | 'paymongo')
- `provider_payment_id` (text: stripe_charge_id or paymongo_payment_id)
- `provider_fee_id` (text: Stripe balance_transaction ID)
- `gross_amount_php` (numeric)
- `fee_amount_php` (numeric)
- `net_amount_php` (generated: gross - fee)
- `fee_currency` (text: 'PHP')
- `fee_fx_rate_php` (numeric)
- `fee_details` (jsonb: raw provider fee breakdown)
- `reconciliation_status` (text: 'confirmed' | 'pending' | 'failed')
- `reconciled_at` (timestamptz)
- `created_at` (timestamptz)
- **UNIQUE constraint** on `(provider, provider_payment_id)` for idempotency

RLS: Service role only.

### 2. Edge Function: `payment-complete` (Stripe)

**File:** `supabase/functions/payment-complete/index.ts`

After successful `finalize_academy_payment`:
- Fetches Stripe Charge → gets `balance_transaction` ID
- Fetches Balance Transaction → extracts `fee` (in cents) and `fee_details`
- Inserts into `payment_processing_fees` with `reconciliation_status: 'confirmed'`
- Uses `upsert` with `onConflict: 'provider,provider_payment_id'` for idempotency

### 3. Edge Function: `paymongo-webhook` (PayMongo QR Ph)

**File:** `supabase/functions/paymongo-webhook/index.ts`

After successful `finalize_academy_payment`:
- Fetches Payment Intent from PayMongo API
- Extracts `fees` array from `attributes.fees`
- If fees present: inserts with `reconciliation_status: 'confirmed'`
- If no fees: inserts with `reconciliation_status: 'pending'` (fee_amount_php = 0)
- Uses `upsert` with `onConflict: 'provider,provider_payment_id'` for idempotency

### 4. Edge Function: `admin-finance`

**File:** `supabase/functions/admin-finance/index.ts`

New actions:
- `fee_list` — returns all fees with application details (name, email, payment_method, paid_at)
- `fee_update` — admin can update fee_amount_php and reconciliation_status (for manual reconciliation)
- `fee_reconcile_stripe` — batch re-fetches Stripe balance transactions for pending fees
- `fee_reconcile_paymongo` — batch re-fetches PayMongo fees for pending fees

### 5. Finance Dashboard UI

**File:** `assistara-local-v9/admin-finance.html`

**Overview tab:**
- Added "Processing Fees" stat card
- Added "Net Revenue" stat card (Gross - Fees)
- Updated "Net Profit / Loss" to use Net Revenue (not Gross)
- Renamed "Total Revenue" → "Gross Revenue"

**Revenue tab:**
- Added "Processing Fees" stat card
- Added "Net Revenue" stat card
- Added "Fee breakdown by provider" table (Stripe vs PayMongo)
- Updated "Recent payments" table: added Gross, Fee, Net columns
- Shows pending reconciliation count

**Data loading:**
- `loadAll()` now fetches fees via `fee_list` action
- Added `fees` state variable

---

## Accounting Rules Compliance

| Rule | Status | Implementation |
|------|--------|----------------|
| Record gross revenue once | ✅ | `finalize_academy_payment` sets `purchase_amount` once |
| Processing fees as dedicated ledger | ✅ | New `payment_processing_fees` table |
| Net = Gross - Fees | ✅ | Computed column `net_amount_php` + UI calculation |
| Never deduct same fee twice | ✅ | UNIQUE constraint on `(provider, provider_payment_id)` |
| Fees associated with original payment | ✅ | `application_id` FK + `provider_payment_id` |
| Idempotent updates | ✅ | UNIQUE constraint + upsert logic |
| Refunds/fee reversals | 🔲 Future | Not yet implemented (no refund webhook) |
| Preserve history | ✅ | Immutable fee ledger |
| Avoid double-counting manual entries | ✅ | Separate table; `finance_expenses` unchanged |
| Preserve currency conversion | ✅ | No changes to existing FX logic |

---

## Testing Checklist

| Scenario | Test Data | Expected |
|----------|-----------|----------|
| Stripe payment | Test mode charge | Fee auto-recorded, status=confirmed |
| PayMongo QR Ph | Test mode payment | Fee auto-recorded if available, else pending |
| Duplicate webhook | Re-send webhook | No duplicate fee record (UNIQUE constraint) |
| Currency conversion | Switch PHP→USD→EUR | Fee amounts convert correctly |
| Historical entries | Existing paid apps | No fees (not backfilled) |
| Pending reconciliation | PayMongo without fees | Admin can batch reconcile |

---

## Deployment Steps

1. **Apply database migration:**
   ```bash
   supabase db push
   ```

2. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy payment-complete
   supabase functions deploy paymongo-webhook
   supabase functions deploy admin-finance
   ```

3. **Deploy frontend:**
   - Deploy `assistara-local-v9/` to Vercel

4. **Verify:**
   - Make a test Stripe payment → check `payment_processing_fees` table
   - Make a test PayMongo QR Ph payment → check fee recorded
   - Check Finance dashboard → Revenue tab shows fees

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/202610080004_payment_processing_fees.sql` | New migration |
| `supabase/functions/payment-complete/index.ts` | Stripe fee fetch |
| `supabase/functions/paymongo-webhook/index.ts` | PayMongo fee fetch |
| `supabase/functions/admin-finance/index.ts` | Fee CRUD + reconciliation |
| `assistara-local-v9/admin-finance.html` | Fee display in Revenue tab |

---

## Notes

- **GCash is deprecated.** No fee tracking for GCash. Legacy records remain intact.
- **PayMongo QR Ph includes GCash payments** made through QR Ph. All QR Ph fees belong to PayMongo.
- **No refund handling yet.** Refund webhooks would need to be added later for fee reversals.
- **Historical payments are not backfilled.** Only new payments will have fees recorded.
- **Pending reconciliation** is available for PayMongo payments where fees weren't available at webhook time.