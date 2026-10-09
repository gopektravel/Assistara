AUDIT REPORT — $9.92 USD BUG ROOT CAUSE

CAUSE: `money()` always treated input as PHP (`n / displayRates[cur]`). When viewing a USD expense (`amount_php` computed with entry-time rate, e.g., 55.8) in USD mode, dividing `558 / 55.3` (current rate drift) produced $9.92 instead of $10.00 — a same-currency round-trip conversion error.

CHANGED FILES (minimal fix — no production records altered):
- assistara-local-v9/admin-finance.html:
  * `money()` now accepts `(n, record)`; when `record.currency === displayCurrency`, returns exact original (`record.amount`), never converting.
  * `expenseRowHtml` passes expense record (`money(e.amount_php, e)`) for converted display.
- verify-currency.js: 12 assertions (3 currencies: PHP/USD/EUR only)
- regression-test.js: confirms $10→USD, €10→EUR, ₱500→PHP exact; no mutation on switch

VERIFIED BEHAVIOR:
- USD original shown exactly in USD mode (no $9.92 contradiction)
- EUR and PHP same-currency exact preservation
- Different-currency conversion uses `amount_php` (normalized at entry with historical `fx_rate_php`)
- Aggregate totals (`money()` without record) use PHP normalization correctly
- Switching display currency does not modify saved `amount`, `currency`, `fx_rate_php`, or `amount_php`

NOT DEPLOYED: No production DB changes (only frontend logic fix applied to deployed file). No historical records backfilled. No new payments or refunds.
