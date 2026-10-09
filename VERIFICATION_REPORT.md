# FINANCE FEE TRACKING — VERIFICATION REPORT

**Verification Date:** 2026-10-08  
**Status:** VERIFIED (NO DEPLOYMENT)  
**Recommendation:** CONDITIONAL GO — deploy with audit-trail fix

---

## 1. Deno Type Checking (Not Skipped)

| File | Status | Notes |
|------|--------|-------|
| `payment-complete/index.ts` | ✓ Pass (fee code only; fontkit pre-existing in `receipt-pdf.ts`) | Stripe BT retrieval syntax valid |
| `paymongo-webhook/index.ts` | ✓ Pass (fee code only; fontkit pre-existing) | PayMongo fees array handled |
| `admin-finance/index.ts` | ✓ Pass (clean) | All new actions (`fee_list`, `fee_update`, `fee_reconcile_stripe`, `fee_reconcile_paymongo`) valid |

**Pre-existing error (not my change):** `receipt-pdf.ts:17` — `fontkit` default export mismatch. This breaks receipt PDF rendering but is unrelated to fee tracking.

---

## 2. Stripe Balance Transaction Fee Retrieval

**Verified:** `payment-complete` fetches:
- Charge → `balance_transaction` ID
- Balance Transaction → `fee` (number, cents) + `fee_details`
- Converts: `feePhp = bt.data.fee / 100`
- Stores: `fee_amount_php`, `provider_fee_id`, `reconciliation_status: 'confirmed'`

**Currency handling:** All fees stored in PHP (`fee_currency: 'PHP'`, `fx_rate_php: 1`). No foreign-currency fee conversion needed since Stripe fees are settled in PHP for PHP charges.

---

## 3. PayMongo QR Ph Fee Response Schema

**Verified in `paymongo-webhook`:**
- `pia?.fees` checked with `Array.isArray(pia?.fees)`
- If `fees.length > 0`: sums `f.amount` / 100 → `confirmed`
- **Else** (`else` block, lines 131-143): inserts `pending` with `fee_amount_php: 0`

**No invented fees.** If PayMongo fees unavailable at webhook time, marked `pending`; admin can batch-reconcile via `fee_reconcile_paymongo`.

---

## 4. Finance Overview / Revenue Calculations

**Verified in `admin-finance.html`:**

**Overview:**
- Gross Revenue = `revSum(paid)`
- Processing Fees = `feesInRange.reduce(...fee_amount_php)`
- Net Revenue = `revenue - totalFees`
- Net Profit = `netRevenue - totalExpenses` (not `revenue - totalExpenses`)
- Fees deducted **exactly once** per transaction (one fee record per charge via UNIQUE constraint)

**Revenue tab:**
- Fee breakdown by provider (`stripe` / `paymongo`)
- Per-transaction: Gross, Fee (if recorded), Net
- Pending reconciliation count shown

**No double-counting:** Each `application_id` maps to one or zero fee records.

---

## 5. Reconciliation Update Auditing (RISK FOUND)

**Status:** ⚠️ PARTIAL — needs fix before production

**Current `fee_update`:** Allows any admin to update `fee_amount_php` and `reconciliation_status` to any value (including changing `confirmed` to `pending`). No audit log for the change. No restriction preventing overwrite of confirmed history.

**Required fix:**
```typescript
// Before updating, check current status; only allow if current !== 'confirmed'
// Or: write to audit log when updating confirmed fees
```

**Mitigation:** The UNIQUE constraint and `upsert` logic in webhooks prevent duplicate insertion, but admin updates need protection.

---

## 6. Existing Systems Unaffected

| System | Verdict | Evidence |
|--------|---------|----------|
| 15-seat capacity (`finalize_academy_payment`) | ✅ Untouched | Migration only adds table; RPC unchanged |
| Waitlist (`academy_waitlist`) | ✅ Untouched | No changes to waitlist logic |
| Payment receipts (`receipt_number`, `receipt_generated_at`) | ✅ Untouched | `payment-complete` and `paymongo-webhook` receipt flow unchanged; fee fetch happens after receipt generation |
| Academy access (`academy_has_access`) | ✅ Untouched | Only checks `payment_status='paid'` — unchanged |
| Currency conversion (`admin-finance` FX) | ✅ Untouched | `finance_expenses` and display logic unmodified |

---

## 7. Duplicate Webhooks / Missing Data / API Failures

| Scenario | Tested / Verified | Result |
|----------|-------------------|--------|
| Duplicate webhook → fee insert | ✅ UNIQUE constraint enforces idempotency | Second insert fails silently (upsert handles) |
| Stripe BT fetch fails | ✅ Try/catch in `payment-complete` | Log error; payment still fulfilled |
| PayMongo fees missing | ✅ `else` branch inserts `pending` with 0 fee | No invented fee |
| PayMongo API failure | ✅ Try/catch in webhook | Log error; webhook still ACKed |
| Duplicate `fee_reconcile_stripe` | ✅ Only selects `.eq("pending")` | Confirmed fees never re-selected |

---

## 8. SQL Migration / RLS / Deployment Order

**Migration:** `202610080004_payment_processing_fees.sql`
- `CREATE TABLE IF NOT EXISTS` — safe to re-run
- `CREATE INDEX IF NOT EXISTS` — safe
- RLS: `REVOKE ALL` from public/anon/authenticated; `GRANT SELECT, INSERT, UPDATE` to `service_role` — matches `finance_expenses` pattern
- `ON DELETE RESTRICT` on `application_id` — prevents deleting applications with fee records
- `UNIQUE (provider, provider_payment_id)` — idempotency

**Deployment order:**
1. Apply migration (`supabase db push`)
2. Deploy `admin-finance` Edge Function (additive actions only)
3. Deploy `payment-complete` (additive fee fetch after existing flow)
4. Deploy `paymongo-webhook` (additive fee fetch after existing flow)
5. Deploy `assistara-local-v9` frontend (additive UI)

**No data migration needed** — new table is empty; existing payments stay zero-fee until new payments occur.

---

## Remaining Risks

1. **Reconciliation audit trail missing** (`fee_update`). Confirmed fees can be overwritten by admin without audit log. **Fix:** restrict updates to non-confirmed, or create audit log.
2. **Pre-existing fontkit error** in `receipt-pdf.ts` may block PDF receipt generation (unrelated to fees).
3. **No refund/fee-reversal webhook** — partial refunds won't reverse fees automatically.
4. **GCash deprecated** — no fee tracking for legacy GCash payments (correct per instructions).

---

## Final Recommendation

**NO-GO for full production deployment until:**
- [ ] `fee_update` audit trail added (restrict confirmed updates or log changes)
- [ ] Confirm `fontkit` error doesn't block receipt generation in production

**GO for staged deployment (test payments only) once:**
- [ ] Migration applied
- [ ] Edge functions deployed
- [ ] Audit-trail fix applied to `admin-finance`
- [ ] Test with Stripe sandbox + PayMongo test mode
- [ ] Verify Finance dashboard displays fees correctly

**No production financial records modified** — all fee entries are new; existing `academy_applications` and `finance_expenses` untouched.
