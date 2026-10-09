=== FINAL DEPLOYMENT MANIFEST ===
NO DEPLOYMENT EXECUTED. WAITING FOR EXPLICIT APPROVAL.

MIGRATIONS (additive, both together):
  A) supabase/migrations/202610080004_payment_processing_fees.sql  [NEW fee table, IF NOT EXISTS]
  B) supabase/migrations/202610070002_admin_finance_expenses.sql [currency check: ('PHP','USD','EUR') only; non-destructive]

EDGE FUNCTIONS (additive only):
  1) supabase/functions/admin-finance/index.ts (fee CRUD + audit trail + CURRENCIES = [PHP,USD,EUR] only + FX endpoint for 3 currencies)
  2) supabase/functions/payment-complete/index.ts (Stripe BT: btCurrency read, feeMinor preserved, conversion only on successful Frankfurter rate, audit details with original_currency/original_fee_amount/stride_currency/conversion_rate_source)
  3) supabase/functions/paymongo-webhook/index.ts (fee fetch: reconciliation_status 'pending' always; audit note in fee_details; never 'confirmed' from webhook payload)

FRONTEND:
  assistara-local-v9/admin-finance.html (expense cards: original amount prominent; isSameCurrency skips contradictory converted amount; historical rate preserved)

ROLLBACK:
  DB: DROP TABLE IF EXISTS public.payment_processing_fees; restore check (PHP,USD) if needed
  Functions: redeploy pre-edit git versions
  Frontend: redeploy previous assistara-local-v9 build
  Zero historical expense records affected

5 CHECKS CONFIRMED:
  1. DB changes in proper migrations together: YES
  2. Edit preserves original currency + entry-time fx_rate_php unless explicitly changed: YES (server validates raw; updates only on explicit change)
  3. Stripe minor units correct + failed conversion = pending (never wrong PHP): YES (integer feeMinor; try/catch; only assigns feePhp when rate fetched)
  4. PayMongo unverified = pending; not shown as confirmed/final profit: YES (reconciliation_status 'pending'; fee_details audit note; dashboard separates Pending/Confirmed for profit/net)
  5. 15-seat enrollment / waitlist / capacity untouched: YES (fee table external; finalize_academy_payment, waitlist, capacity untouched)

NO LIVE TEST CHARGES. NO HISTORICAL BACKFILLS. NO PRODUCTION DEPLOYMENT.
VERIFY: verify-currency.js (12 assertions passed — PHP/USD/EUR only) — USD preservation, PHP conversion, EUR conversion, historical rate retention, edit preservation, discrepancy resolution.
