# Controlled production deployment — Finance currency only

## Read-only preflight

Vercel and Supabase management credentials were available and used through their actual CLIs. Browser Admin session was NOT available; no token was manufactured or login bypassed.

Authorized SELECT against project `jhmmwleejgidrxavzdlq` confirmed the only Software expense:
- ID: `210a4110-f2c6-48fc-9b6b-c278c9ebef7a`
- Vendor: Opencode
- Original: `10.00 USD`
- Recorded entry rate: `62.478000 PHP per USD`
- Stored PHP amount: `624.78`
- Date: `2026-09-25`, non-recurring

The fields are internally consistent (`10 × 62.478 = 624.78`); no corruption was detected in this record. No repair or backfill was performed. This does not independently validate the historical rate's external provenance against a bank receipt.

## Actual deployments

### Vercel
- Project: `assistara` (`prj_IvuoCJ8hpqSgWz0pbnP9NHeR6Dox`)
- Production ID: `dpl_7cmejMMigwxxNQ7daZ2ZbdFFjfLB`
- Deployment URL: https://assistara-q6nh2lx9v-jessevanrobbroeck-9837.vercel.app
- Production Finance URL: https://www.getassistara.com/admin/finance
- Status: READY; production aliases assigned.
- Actual operation: authenticated `vercel api /v13/deployments --method POST --input ...`, followed by `vercel inspect ... --wait --timeout 180s`.
- Inputs cloned by content hash from previous production deployment `dpl_HkUWum5L3KbPQHdhtCY91Ms6Rfic`; exactly one file replaced: `assistara-local-v9/admin-finance.html`.
- BEFORE/AFTER source manifests compared through Vercel API: **234 other source files unchanged**, no additions/removals. The working-tree Masterclass/payment/config changes were NOT deployed.

### Supabase
- Only `admin-finance` deployed, using the downloaded production baseline plus the isolated expense-edit preservation patch.
- Function ID: `c81929e4-a03f-4e16-ba75-0ab94291ede0`
- Previous version: 10; new ACTIVE version: **11**.
- Actual operation: `npx --yes supabase functions deploy admin-finance --project-ref jhmmwleejgidrxavzdlq --workdir <isolated-candidate> --no-verify-jwt --use-api --yes`.
- Existing custom HMAC authentication preserved; `verify_jwt=false` was already the production setting. Unauthorized list request correctly returns 401 Session expired.
- Downloaded deployed source matches the isolated candidate exactly.
- SHA-256: `352c127ef2d80ad3a68872675f5fa65729f84b7044bca658ddd176cbb13491c6`.
- Local working-tree fee actions were NOT deployed. No other functions or migrations deployed.

## Live source proof

Cache-bypassed `/admin/finance` response: HTTP 200, `X-Vercel-Cache: MISS`, Age 0, Finance content disposition.
- ETag: `e69c91f1e456cb587b579702f7a589e8`
- Request ID: `sin1::8vlpw-1791477228018-e6b228334e3a`
- SHA-256: `89e132ef5e7a5ab5599e450df3a6761ad7a1d22a0d761bf951cb5b222d441d33`
- Response is byte-for-byte equal to approved local HTML.
- Browser cache-bypassed fetch independently confirmed this same hash and presence of `original-currency-v2`, `expenseDisplay`, `expenseTotal`, and expanded-category markup.

## Regression verification against DEPLOYED source

The existing test runner was directed to freshly downloaded LIVE HTML and LIVE Edge Function source rather than local runtime files. **13/13 tests passed.**

Covered actual inline category rendering, exact $10 row and category, USD→PHP→USD, EUR/PHP round trips, mixed-currency category sums, Overview expenses/profit/chart consistency, expense list, opening/readForm historical rate preservation, metadata-only API validation, unknown rates, unsupported currencies, and simulated reload.

The additional authorized-data test used the actual Opencode record above and produced `$10.00` for its single-occurrence Software row and category without mutation. Mixed-currency cases used controlled fixtures/reporting rates, not newly inserted production records. Backend validation was executed locally from downloaded production code; no live expense save was attempted.

## Records preserved

Read-only before/after SELECT fingerprints across every column of all finance_expenses rows matched:
- Record count: **8**
- Record hash: `ca7480d3f09bc93b6864ff6827e09f40`

No historical records, payment functions, Masterclass functions, capacity, waitlist, or student access were changed by this deployment.

## Remaining authenticated-browser verification

Actual logged-in browser UI remains **UNVERIFIED**; database read and deployed-source regression verification succeeded. User login is still needed:
1. Log in normally at `/admin`, open `/admin/finance`, disable cache and hard refresh.
2. Select a range including September 25, 2026 (All time is suitable).
3. Overview → expand Software → USD: Opencode row AND Software total must show `$10.00`.
4. PHP should show `₱624.78`; return to USD, require `$10.00` again; reload and repeat.
5. Confirm Overview Total Expenses equals all category totals for the same range/occurrences.
6. Open the Opencode edit form without saving; amount 10, currency USD, rate 62.478 must remain unchanged after waiting. Cancel.
7. Use `finance-production-readonly-check.js` for read-only console evidence if needed.

An actual production expense save was deliberately not tested because historical financial writes were forbidden. API code/source checks and validation tests do not replace that future approved live-write test.

## Rollback

Restore the previous Vercel production deployment `dpl_HkUWum5L3KbPQHdhtCY91Ms6Rfic` if necessary (verify no newer unrelated deployment has superseded this before rollback). The downloaded previous Supabase function source is retained at `C:\Users\jesse\AppData\Local\Temp\opencode\finance-edge-baseline\supabase\functions\admin-finance\index.ts`; redeploy that single function from its baseline directory with the same auth setting. Do NOT drop tables or rewrite financial data.

Deployment payload, baseline/new source manifests, live source evidence, actual read-only record snapshot, candidate/downloaded Edge source, and record fingerprints are retained in the approved OpenCode temp directory. No errors remain in the deployed artifacts. Initial CLI argument/directory preparation errors were resolved before either deployment; they did not apply production changes.
