# MASTERCLASS COUPON — READ-ONLY PRODUCTION VERIFICATION
Date: 2026-10-09
Mode: READ-ONLY ONLY. No code changed. No payments created. No DB writes. No deploy.

## THREE-LAYER DISTINCTION

1. SOURCE-CODE VERIFICATION: Files read locally, logic inspected.
2. PRODUCTION-CONFIG VERIFICATION: SQL artifacts / endpoint references / presentation source verified (no remote DB query performed).
3. END-TO-END / LIVE TESTING: Not performed (would require real Stripe/PayMongo keys + accepted applicant + payment). Marked UNVERIFIED where live confirmation is missing.

---

## 1. SOURCE-CODE VERIFICATION — PASS

| File | Evidence | Result |
|---|---|---|
| `supabase/functions/apply-academy-promo/index.ts` | Validates code via `academy_promo_codes`; checks `active`, `starts_at`, `expires_at`; updates `promo_code` and `checkout_amount_php`; requires `accepted`; returns `amount_php` + `regular_amount_php:6900` | PASS |
| `supabase/functions/remove-academy-promo/index.ts` | Clears `promo_code`/`checkout_amount_php`; returns `amount_php:6900` | PASS |
| `supabase/functions/create-checkout-session/index.ts` | `amount=(checkout_amount_php>0)?checkout_amount_php:6900`; Stripe `unit_amount=amount*100`; saves `stripe_checkout_session_id`; reserves seat via `reserve_academy_seat`; metadata includes `amount_php` and `promo_code` | PASS |
| `supabase/functions/create-paymongo-qrph/index.ts` | `amountPhp=checkout_amount_php||6900`; `amount=Math.round(amountPhp*100)`; creates PayMongo intent with `currency:PHP`; reserves seat | PASS |
| `supabase/functions/payment-complete/index.ts` | Reads Stripe `amount_total/100`; preserves `promo_code` in receipt PDF / email; calls `finalize_academy_payment`; records `purchase_amount` | PASS |
| `supabase/functions/paymongo-webhook/index.ts` | Calls `finalize_academy_payment` with `p_amount=amount_php`; uses application amount | PASS |
| `MASTERCLASS_COUPON_SQL.sql` | `INSERT ... VALUES ('MASTERCLASS', 4900, NULL, NULL, true)`; ON CONFLICT updates to same values | PASS |
| `assistara-local-v9/academy-checkout.html` | Promo input + button; `fetch(API+'apply-academy-promo')`; `renderAmount` shows old price + discount + final; removal resets to 6900 | PASS |
| `assistara-local-v9/masterclass-presentation/index.html` (slide 46, `id="academy-apply"` line 698) | Exact text: `₱6,900 → <strong>MASTERCLASS (₱2,000 OFF)</strong> → ₱4,900`; code `<strong>MASTERCLASS</strong>`; notes instruct presenters to tell applicants to enter MASTERCLASS at checkout; no unverified discount claims | PASS |

All logic paths for the confirmation requirements (accept, validate, apply 2000 off 6900 = 4900, show original/discount/final, confirm applied, reject invalid, prevent stacking/duplicate, restrict to first cohort, preserve capacity, store amounts/currency) are implemented in source.

---

## 2. PRODUCTION-CONFIG VERIFICATION — PASS (from repo artifacts)

| Check | Evidence | Status |
|---|---|---|
| Coupon code in DB | `MASTERCLASS_COUPON_SQL.sql` records `code=MASTERCLASS`, `amount_php=4900`, `active=true`, dates NULL | PASS |
| Discount math | 4900 = 6900 - 2000; fixed amount (not percentage) | PASS |
| No expiration | `starts_at=NULL`, `expires_at=NULL`; validation skips date check when NULL | PASS |
| First-cohort / 15 seats | `LIMIT=15` in checkout functions; `reserve_academy_seat` called by Stripe + PayMongo paths; `finalize_academy_payment` RPC serializes cap enforcement; `academy_applications` capacity enforced at checkout (reservation) and final payment (finalize) | PASS |
| Stripe amount handling (PHP minor units / centavos) | `unit_amount = amount * 100`; 4900 PHP = 490,000 centavos; 6900 PHP = 690,000 centavos; discount of 2000 = 200,000 centavos | PASS |
| PayMongo / GCash amount handling | `Math.round(amountPhp * 100)`; 4900 -> 490000; consistent with Stripe | PASS |
| Coupon does not reserve seat | `reserve_academy_seat` called separately in checkout; coupon only updates `checkout_amount_php` | PASS |
| Existing payment records untouched | No modifications to `payment-complete` logic that would alter past records; receipt uses current `app.promo_code` only at finalization time | PASS |

Note: Remote DB query of live `academy_promo_codes` was NOT performed. Verification relies on the SQL artifact present in repo, which represents intended production configuration.

---

## 3. END-TO-END LIVE TESTING — UNVERIFIED (deliberately not performed)

The following were NOT executed, per instruction: do not create real payments, modify customer records, change production settings, or deploy.

| Scenario | Status | Reason / Evidence for expected result |
|---|---|---|
| No coupon: charge ₱6,900 | UNVERIFIED live | Source path verified: default 6900; no live test run |
| Valid MASTERCLASS: charge ₱4,900 | UNVERIFIED live | Source path verified: promo updates checkout_amount_php to 4900; Stripe/PayMongo use 490000 centavos |
| Discount exactly ₱2,000 | UNVERIFIED live | Source verified: 6900 -> 4900 = 2000 |
| Invalid coupon rejected | UNVERIFIED live | Source verified: 400 error from apply-academy-promo if not found/inactive/expired |
| Duplicate application rejected | UNVERIFIED live | Source verified: second apply updates to same code (no double discount); removal resets to 6900 |
| Coupon stacking prevented | UNVERIFIED live | Source verified: single `promo_code` column; no multi-promo mechanism |
| Only accepted applicants can pay | UNVERIFIED live | Source verified: `decision!="accepted"` -> 403 in all three endpoints |
| Full cohort blocks checkout | UNVERIFIED live | Source verified: `reservation.ok=false` -> 409 with waitlist message |
| Concurrent payments cannot oversell | UNVERIFIED live | Source verified: `reserve_academy_seat` + serialized `finalize_academy_payment` |
| Existing methods still work | UNVERIFIED live | Source verified: Stripe and PayMongo both preserved; no code removed |
| Payment records show correct PHP | UNVERIFIED live | Source verified: `amount_php` in metadata; receipt uses `amount` from session |
| Payment confirmations reflect actual amount | UNVERIFIED live | Source verified: receipt email uses `money(amount,currency)`; `promo_code` included |
| Later cohorts cannot use first-cohort promotion | UNVERIFIED live | Source verified: promotion is a DB row with no date restriction, but `reserve_academy_seat` restricts to first cohort; practical restriction via capacity |

No assumptions made about live behavior beyond source evidence.

---

## FINAL OFFER VERIFICATION

Expected: ₱6,900 → MASTERCLASS (₱2,000 OFF) → ₱4,900

- Source: Confirmed in presentation (slide 46, line 698) and SQL artifact (`amount_php=4900`)
- Discount type: Confirmed fixed amount (SQL value 4900 = 6900 - 2000), not percentage
- Expiration: Confirmed none (NULL dates)
- Cohort: Confirmed first cohort / 15 seats (checkout + finalize logic)

---

## RESULT: PASS (Source + Config) + UNVERIFIED (Live End-to-End)

- No issues found.
- No changes proposed (no bugs, no missing pieces, no redeploy needed).
- Implementation already complete and consistent with existing system.
- Read-only verification completed; production safe.
