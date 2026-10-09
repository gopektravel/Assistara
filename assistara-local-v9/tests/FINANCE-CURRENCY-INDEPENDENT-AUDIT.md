# Independent Finance currency audit

## Production evidence (read-only)

- Actual URL: https://www.getassistara.com/admin/finance
- Vercel deployment: `dpl_HkUWum5L3KbPQHdhtCY91Ms6Rfic`
- Immutable deployment URL: `https://assistara-jjngrxo1w-jessevanrobbroeck-9837.vercel.app`
- Vercel metadata: commit `3c77a200b4372d7e5a82cf3a76d94374c981b1ec`, `gitDirty=1`, `gitRootDirectory=assistara-local-v9`, source `cli`. Commit alone does not identify the dirty file contents.
- `vercel inspect` and read-only `vercel api /v13/deployments/... --method GET` confirmed the production aliases and static Finance build entry.
- Served Finance SHA-256: `ad021f307d667019c9242f27e30ba1dfa67ebd975f6e85a373daea880ac0b9d1`.
- Served ETag: `be373240a9d71461d45dc420a0871622`.
- Initial request ID: `sin1::wv7wp-1791475848485-4ecf5638af6d`.
- Cache-bypassed browser request ID: `sin1::zlzpm-1791476174590-fa0356748ad2`; same source hash.
- `/admin-finance.html` returns the custom 404 document (HTTP 200); it is NOT the Finance route.
- Browser has no authorized admin token and redirects Finance to `/admin`. The authenticated expense screen and real records were NOT accessed. Publicly served HTML was accessed and compared.
- No registered service worker in this browser; repository search found no service-worker currency override. Only attribution.js is externally loaded by Finance; its source has no currency/category calculations.
- Served `categoryBlock` is a non-expandable bar chart. The user's expandable UI does not match this fetched version; their exact URL/session source must be captured with the console check below.

## Proven root causes

Served `money(n)` (line 1022 in captured HTML) divides a canonical PHP value by today's `displayRates`. Served `categoryBlock(mat)` (line 1364) sums rounded `amount_php` and calls `money(v)` WITHOUT the original record. Thus the original transaction currency is discarded before formatting. `renderOverview`, charts, and marketing/expense summaries do the same.

Executing the actual captured production functions with a controlled fixture (`amount=10`, `currency=USD`, `fx_rate_php=55.8`, `amount_php=558`, reporting rate `56.25`) produces `$9.92`. These fixture values demonstrate the running calculation defect; they are NOT claimed to be the actual user's record/rates. Actual record corruption remains unverified.

Earlier fixes failed because:
1. The served deployment does not contain `money(n, record)` or the local category correction. Earlier echo commands were not deployment commands.
2. Local row guards could not fix aggregated category/Overview paths that omit expense records.
3. The partial category fix still used rounded `amount_php` for foreign conversions and a fallback rate of 1.
4. Earlier tests used copied calculations or tautological assertions rather than running rendering functions.
5. `openForm()` called `syncFxVisibility()` which fetched a replacement rate asynchronously; the result could overwrite the stored edit rate. Metadata API updates also always recomputed `amount_php`.

## Local implementation

Files requiring deployment after approval:
- `assistara-local-v9/admin-finance.html`: original-aware `expenseDisplay`, cent-based `expenseTotal`, formatting separated from conversion, expandable category rows using the SAME calculator as their totals, corrected Overview expense/profit/marketing cards and chart, marketing reporting, expense list, fixed edit-rate fetch/race behavior. Version marker: `original-currency-v2`.
- `supabase/functions/admin-finance/index.ts`: only expense validation/update changed by this audit; metadata-only updates retain the recorded PHP amount/rate. No changes to fee actions by this audit. The file already contains earlier unreviewed fee changes; do NOT blindly deploy its entire working tree without isolating/reviewing them.

Added verification files (not runtime build inputs):
- `assistara-local-v9/tests/finance-currency.test.cjs`
- `assistara-local-v9/tests/finance-production-readonly-check.js`
- This report.

No migrations. No production writes. Payments, provider integrations, Masterclass, capacity, and access files were not edited by this audit. Pre-existing working-tree changes remain untouched.

### Explicit conversion policy

Only PHP, USD, EUR (all two-decimal currencies) are accepted. Same original/display currency uses the recorded original amount directly. Otherwise, calculate from original amount times the recorded entry PHP rate, divided by a session reporting PHP-per-unit rate. PHP uses rate 1. Target reporting rates use one fixed UTC date for the session via existing Frankfurter endpoint. Historical source rates are never replaced by reporting rates. Round each transaction occurrence to cents before summing cents. Missing original/rate data yields unknown (`—`), never fabricated rate 1 or omitted cost.

Foreign reporting values can change between sessions as reporting-date rates change; this is display-only, explicitly dated, and does not rewrite records. Historical target-currency snapshots were not stored by the old schema and are not fabricated. Stored `amount_php` inconsistencies must be reviewed separately; original fields/rate are authoritative for the new expense display policy.

## Regression results

Command: `node --test assistara-local-v9/tests/finance-currency.test.cjs`.

12 tests pass. They execute actual inline application functions in a VM with a minimal DOM and forbidden network, plus actual expense API validation stripped of TypeScript annotations. Covered: exact expanded Software row and category total, real display-currency switching, USD/EUR/PHP round trips, mixed categories and Overview/chart reconciliation, expense list, actual edit form/readForm, metadata-only validation retaining discrepant history, unknown rates/unsupported currencies, and simulated reload/reinitialization.

Optional `PRODUCTION_FINANCE_HTML` points at the captured production HTML. With this enabled a 13th test passes, demonstrating the `$9.92` defect in the actual served category function with the controlled fixture. These tests are NOT authenticated-production verification or full browser layout/network tests.

## Required authenticated check (before and after approved deployment)

1. Log in normally at https://www.getassistara.com/admin, then open Finance. Record the COMPLETE URL.
2. Open DevTools Network; enable Disable cache, hard reload. Check the document response URL is `/admin/finance`, not the `.html` 404 route.
3. Paste `finance-production-readonly-check.js` into Console. It calls only the authorized `list` action, never writes. Inspect the Software `amount`, `currency`, `fx_rate_php`, `amount_php`, current reporting rates, running category function, and source/version marker. Do not share tokens.
4. For the $10 record require `amount=10` and `currency=USD`. If not, STOP: propose a receipt-supported correction; do not edit history automatically. If amount_php differs from amount*recorded rate, flag for manual reconciliation rather than guessing which field is wrong.
5. Overview → expand Software → select USD: the single occurrence row must show `$10.00`. The category total equals `$10.00` only if that is its only occurrence; otherwise it equals the sum of all displayed Software rows.
6. Select PHP then USD; compare row and category values; no save actions. Compare console list results before/after to confirm stored fields are unchanged.
7. With existing EUR/PHP originals, select their currency and require exact original values. Mixed totals must equal summed displayed rows. Overview Total Expenses must equal category totals across the same date range and occurrences. No test expenses need be created.
8. Reload and repeat. Open Edit without saving: original amount/currency/rate must remain unchanged after waiting for network activity. Cancel.

### Deployment proof gate

After approval, deploy from the correct root/build input, capture a NEW deployment ID, verify the alias points there, fetch `/admin/finance` cache-bypassed, compare served bytes/hash to the approved build input, confirm `original-currency-v2`, then run the authenticated steps. A completed CLI command alone is insufficient. Existing routing already builds `admin-finance.html` and maps `/admin/finance` to it; no route/config change is needed.

## Risks and recommendation

NO-GO for claiming production success or blanket deployment of the dirty working tree. Local calculation fix is ready for review; actual authenticated Software data/expanded UI is still unverified. No production credentials were requested/exposed and no financial records were rewritten. Vercel metadata is confirmed, but Supabase deployed expense implementation was not fetched. Deno CLI was unavailable for full Edge Function type-checking. Node validation tests pass. `git diff --check` for this audit's changed files passes; the full workspace has unrelated pre-existing trailing whitespace in admin.html.

Roll back an approved frontend deployment by restoring the recorded previous deployment alias/version (no financial table drops). Restore the previous expense-only Edge Function implementation if needed. Preserve all financial data throughout rollback.
