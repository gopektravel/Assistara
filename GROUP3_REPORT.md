=== GROUP 3 ACADEMY ACCEPTANCE — FINAL REPORT ===
Sent: Mon 2026-10-12 03:47–04:04 UTC (9 applicants, all via Resend, all delivered status=sent)
Deployment: admin-applications redeployed (gateway version with discount logic); admin-email-templates redeployed (--no-verify-jwt); academy_application_accepted published (XYRA template v1)
Migration: 202610120005 (assigned_promo_code_id) NOT in production DB yet — Group 2/3 applicants have promo_code=none; manual XYRA entry used for this send

RECIPIENTS:
- Alexia Guzman Santiago | ale... @gmail.com | id=53f7... | decision=accepted | token=yes | msgId=01a12e40-6591... | subject="You're IN! Your Assistara Academy application is approved!"
- Rhode Drigce Awitan | rho... @gmail.com | id=7833... | accepted | token=yes | msgId=01a12e48-baef...
- Lehlee Amor A. McNiven | lee... @gmail.com | id=2e8a... | accepted | token=yes | msgId=01a12e48-c1e4...
- Christine Villaruel | chri... @gmail.com | id=8399... | accepted | token=yes | msgId=01a12e48-c989...
- Diarrassouba Saliou | sali... @gmail.com | id=1fd4... | accepted | token=yes | msgId=01a12e48-cfcd...
- Jenmark Samaniego Patagan | jenm... @gmail.com | id=304c... | accepted | token=yes | msgId=01a12e48-d5c8...
- Hazel Saturay | haz... @gmail.com | id=6319... | accepted | token=yes | msgId=01a12e48-e150...
- Edeza Uayan Yu | ede... @gmail.com | id=df3c... | accepted | token=yes | msgId=01a12e48-e881...
- Jeramie Matugas | matu... @gmail.com | id=6089... | accepted | token=yes | msgId=01a12e48-eedd...

COUPON / PRICE:
- XYRA active (code=XYRA, amount_php=3900 → ₱3,000 discount, regular ₱6,900 → ₱3,900)
- No auto-apply (assigned_promo_code_id column missing in production DB); manual XYRA entry verified

DO NOT EMAIL — untouched (0 acceptance messages, decision=null, status=new):
- Pearl Angelica Lacdag (8572...)
- Angelen Saplad (b68c...)
- Floremae M. Abejo (e96f...)

PRIOR GROUPS — untouched (still accepted, original tokens preserved, no new emails):
- G1: Stephanie, Cristy, Angelica (accepted 2026-10-12, original Resend msg IDs preserved)
- G2: iresh, Gadilyn, Edward (accepted 2026-10-12, discounted subject preserved, assigned gift preserved)

CAPACITY: 15 spots / 0 paid / 15 left (no over-commit; all 9 new + existing = within cohort)

NOTES / BLOCKERS ENCOUNTERED:
- Production email_templates table row for academy_application_accepted was not driving the deployed function initially (deployed 02ceffb = inline fallback only). Published v1 under the correct key after deploy.
- Migration 202610120005 (assigned_promo_code_id column) is not yet applied in production DB — requires production deployment (not performed per instructions).
- Alexia initially received 2x wrong-subject emails from pre-deploy attempts; no further sends after verification.
- All 9 final sends verified via res delivery log (provider=resend, status=sent, message IDs captured).
- No real payments, no duplicate acceptance events, no dashboard changes.
