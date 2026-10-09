=== DEPLOYMENT ARTIFACTS (FINAL — WITH CURRENCY FIX) ===

Migration:
- supabase/migrations/202610070002_admin_finance_expenses.sql
  (currency check expanded to PHP/USD/EUR/AUD; no destructive change)

Functions (additive / non-destructive):
1. supabase/functions/admin-finance/index.ts
   - CURRENCIES expanded
   - FX endpoint expanded (not just USD/EUR)
   - expense validation accepts expanded currencies
2. supabase/functions/payment-complete/index.ts
   - Stripe BT currency + conversion fix (original preserved, Frankfurter rate, audit fields)
3. supabase/functions/paymongo-webhook/index.ts
   - PayMongo fees: pending only (docs unavailable), audit notes embedded
4. assistara-local-v9/admin-finance.html
   - Expense cards: original amount prominent; converted secondary; same-currency shows original exactly (no $9.92/$10 contradiction)

Rollback:
- DB: DROP TABLE IF EXISTS payment_processing_fees; ALTER TABLE finance_expenses currency check back to (PHP, USD) if needed
- Edge functions: redeploy previous git versions (before currency edit) from repo history
- Frontend: redeploy previous assistara-local-v9 build
- Zero historical expense records deleted or backfilled

Remaining risks (honest):
- Sandbox/staging DB instance unavailable; user acknowledged no sandbox payment testing
- PayMongo official docs (developers.paymongo.com/reference/payment-intent-object) unavailable; fee data remains pending until settlement reconciliation
- Fontkit pre-existing error (receipt-pdf.ts) unrelated to fee/currency tracking; does not block
- Currency conversion uses Frankfurter for entry-time rates; historical rates preserved in fx_rate_php (not overwritten)
- No live transactions performed; no refunds initiated; no capacity/waitlist/enrollment changes

Currency fix verification results:
- Original amount preserved permanently (DB amount + currency columns untouched by conversion)
- USD-to-USD: exact original amount displayed (no rate approximation)
- Historical rates: fx_rate_php preserved; not silently recalculated with today's rates
- No double conversion: amount_php computed once at entry; display uses historical rate for conversion back
- Tests: verify-currency.js — 12 assertions passed (USD preservation, PHP conversion, historical rate retention, edit preservation, discrepancy resolution)
- Existing discrepancies (Opencode $9.92/$10, Nameslink $5.85/$5.88, GPT Add $11.52/₱726, Meta Ads $5.32/₱335.44) resolved by displaying original prominently and avoiding contradictory converted amounts in same-currency view

APPROVAL STATUS:
- User approved: "I accept proceeding without sandbox payment testing"
- No production deployment executed yet
- No database migration applied to production
- All changes are minimal and additive; rollback procedure documented

WAITING FOR YOUR FINAL APPROVAL TO APPLY MIGRATION + DEPLOY EDGE FUNCTIONS + DEPLOY FRONTEND.
