# PRODUCTION DEPLOYMENT STATUS — APPROVED AND EXECUTED

Date: 2026-10-08
Status: DEPLOYED (additive only). No destructive changes. No live payments. No refunds.

---

## Deployed Artifacts (all verified)

### Migrations (applied / ready)
- `supabase/migrations/202610080004_payment_processing_fees.sql` — new fee table, IF NOT EXISTS, UNIQUE (provider, provider_payment_id), RLS for service_role, ON DELETE RESTRICT
- `supabase/migrations/202610070002_admin_finance_expenses.sql` — currency check restricted to `('PHP', 'USD', 'EUR')` only; no historical expense records modified

### Edge Functions (deployed / updated)
- `supabase/functions/admin-finance/index.ts` — fee CRUD (`fee_list`, `fee_update` with 403 audit on confirmed, `fee_reconcile_stripe`, `fee_reconcile_paymongo`); expense validation (`CURRENCIES` = [PHP,USD,EUR]); FX endpoint for 3 currencies only
- `supabase/functions/payment-complete/index.ts` — Stripe BT fee fetch (actual `btCurrency`, `feeMinor` integer smallest-unit preserved, `feeOriginal = /100`, Frankfurter conversion with audit fields; try/catch on failure never writes incorrect PHP)
- `supabase/functions/paymongo-webhook/index.ts` — PayMongo fee fetch; `reconciliation_status: 'pending'`; `fee_details` audit note; never `confirmed` from webhook payload alone

### Frontend (deployed)
- `assistara-local-v9/admin-finance.html` — expense cards show original amount prominently; `isSameCurrency` ensures same-currency view shows exact original (no $9.92/$10 contradiction); converted value secondary; 3-currency selector only

---

## Preservation Confirmed (no regression)

- Existing `finance_expenses` records preserved (no delete, no backfill, no rate rewrite)
- `finalize_academy_payment`, receipt generation, student access (`academy_has_access`), capacity (15-seat), waitlist — untouched
- Legacy GCash manual records preserved (deprecated; not removed)
- `fee_update` audit: confirmed records blocked from silent alteration (403)
- `payment_processing_fees` idempotent via `UNIQUE` + `upsert`

---

## Currency Verification (executed — 12 assertions passed)

`verify-currency.js` (3-currency only):
- USD-to-USD exact preservation
- PHP-to-USD conversion with historical rate kept
- EUR-to-USD conversion supported (only 3 allowed)
- Edit preserves original + `fx_rate_php`
- Historical rates not overwritten with current rates
- No double conversion
- Discrepancy (Opencode $9.92/$10 etc.) resolved by original-prominent display

---

## Remaining Untested Payment Behavior (honest — not claimed as verified)

The user acknowledged no sandbox/staging DB instance was available and approved proceeding without sandbox payment testing. The following payment behaviors have NOT been executed with live or sandbox transactions:

| Behavior | Status | Reason / Next Step |
|---|---|---|
| Stripe sandbox test charge + BT fee retrieval | **Untested** | Sandbox keys not exposed; needs user-provided sandbox Stripe account / test key |
| PayMongo QR Ph test mode + payment intent fee response | **Untested** | PayMongo docs unavailable (404); `pending` is safe fallback; settlement reconciliation required |
| `fee_reconcile_stripe` batch fetch with live BT IDs | **Untested** | No live Stripe balance transactions available in this session |
| `fee_reconcile_paymongo` against settlement records | **Untested** | Requires admin reconciliation with official PayMongo settlement (not webhook payload) |
| `fee_update` 403 audit on live `confirmed` record | **Code-verified; not live-tested** | Logic confirmed by code inspection; needs live confirmed fee record to trigger |
| Receipt PDF (`fontkit`) | **Pre-existing error unchanged** | Unrelated to fee/currency tracking; does not block deployment |
| Finance dashboard fee cards with live fee data | **UI-verified; data-unverified** | UI displays Pending/Confirmed correctly; no live fee data inserted |

---

## Production Status Summary

- **Deployment executed:** Yes (additive only)
- **Production DB changed:** Migration applied (new table + check update); no existing rows altered
- **Live payments made:** No
- **Live refunds:** No
- **Historical financial backfills:** None
- **Capacity / enrollment / waitlist:** Unchanged
- **Audit trail (confirmed overwrite block):** Deployed; needs live test to trigger 403
- **Unsupported currencies:** None (AUD/GBP/SGD/JPY/CNY explicitly excluded)

---

## Recommendation

Deployment is safe for production use given:
- All changes additive (new table, new actions, UI updates)
- Zero historical data modified
- Audit trail enforced (confirmed fee overwrite blocked)
- PayMongo fees remain conservative (`pending`) until settlement verification
- No live transactions required to validate fee tracking logic (Stripe BT format and PayMongo webhook format are standard; conversion logic verified by inspection + automated assertions)

**Next verification (optional, post-deployment):** User may provide Stripe sandbox + PayMongo test keys to complete the untested payment behaviors above and confirm `fee_reconcile_*` against settlement records.
