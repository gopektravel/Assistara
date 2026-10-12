# MANUAL COUPONS ONLY — FINAL CLOSE-OUT

## PASS / FAIL

| Check | Status | Evidence |
|---|---|---|
| Initial price ₱6,900 (no coupon) | **PASS** | enrollment-invitation for Pearl/Angelen returned amount_php=6900, promo_code=null |
| MASTERCLASS manual → ₱4,900 | **PASS** | DB: amount_php=4900, discount_value=200000 (₱2,000 off); manual entry works via apply-academy-promo |
| XYRA manual → ₱3,900 | **PASS** | DB: amount_php=3900, discount_value=300000 (₱3,000 off); manual entry works |
| No auto-apply | **PASS** | `assigned_promo_code_id` column ABSENT in production DB; checkout functions stripped of assigned-promo branch; enrollment-invitation stripped of lookup |
| No coupon stacking / duplicates | **PASS** | `academy_coupon_redemptions` has unique index on (application_id, coupon_id) for pending/confirmed; apply-academy-promo guards |
| Stripe checkout (with manual coupon) | **NOT TESTED** | Code paths verified (limit/expiry checks preserved); live sandbox not run per instructions |
| PayMongo checkout (with manual coupon) | **NOT TESTED** | Same — code verified, no live charge |
| All applicants preserved | **PASS** | 18 total, 18 accepted; Pearson/Angelen/Floremae + Group 1/2/3 intact; tokens preserved; 0 resends; 0 status changes |
| Emails preserved (no resends) | **PASS** | All existing delivery records intact; latest subjects correct (full-price standard for Pearl/Angelen; discounted for G2) |
| Floremae | **BLOCKED correctly** | Age 16 (answered "student 16 years old"); decision=accepted (from earlier event); not changed; no new email |

## Changes made (this final step only)
- `create-checkout-session/index.ts`: removed `assigned_promo_code_id` auto-apply branch (manual only)
- `create-paymongo-qrph/index.ts`: same
- `enrollment-invitation/index.ts`: same
- Deployed all three via `--no-verify-jwt`
- No applicant records changed
- No emails sent/resen
- No payments
- No coupon/template/infrastructure redesign

## Confirmed behavior (manual-only)
- Every applicant starts at ₱6,900
- Must type `MASTERCLASS` or `XYRA` and click Apply
- No prefilled code, no URL discount, no per-applicant assignment
- Both coupons publicly usable
- Redemption limits enforced (max_redemptions / max_redemptions_per_customer)

## Not done / requires approval
- Migration 202610120005 (create column + assign MASTERCLASS to G2)
- Apply 202610130002 + 004 + 202610160000 after 12005
- Once applied, Group 2 can optionally switch to auto-apply (manual still works); Group 3 can optionally get XYRA assigned (manual still works)

## Close
Manual-coupon-only checkout is enforced. All previous work preserved. Task finished.
