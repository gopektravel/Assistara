# Release Report — Tasks 19–22 (Fix-forward)

**Branch:** `fix-currency-real` | **Commit range:** `c54ffa7` → current (working tree)  
**Date:** 2026-10-13  
**Scope:** Admin polish, title/breadcrumb hierarchy, global currency in sidebar, single shared preference. **No deployment.** Await explicit approval. No rollback/revert/reset/force-push.

## Objectives
- TASK 19: Audit Admin page titles and breadcrumbs; remove duplicates; one consistent hierarchy (breadcrumb if useful, one page title, one concise subtitle). No route renames, no rendering breaks.
- TASK 20: Polish Admin controls (selects, inputs, filter pills, badges, cards, expandable sections, tables) consistently; Manrope; subtle borders; restrained yellow accents; no unrelated rewrites.
- TASK 21: Move currency selector to Admin sidebar (one selector, near bottom above profile); remove from Dashboard/Finance/global header/others. Only PHP/USD/EUR; default PHP; compact/elegant Manrope. No conversion logic changes yet.
- TASK 22: Make sidebar selector global; one shared preference (`assistara_currency_display`) and conversion via `assistara-currency.js`; numerically update monetary displays (Dashboard/Finance); persist across nav/refresh; invalid (incl. AUD) reset to PHP; never change native records/checkout/coupons/payments; real numbers.

## Changes (exact files/edits)

### admin.html
- **Breadcrumbs (overview):** crumb `Overview/Dashboard` → `Dashboard`; subtitle trimmed.  
  - meta: `overview` crumb/title/sub cleaned.
- **renderBreadcrumbs (fix):** handles single-element crumbs (`[["Dashboard"]]`) → returns empty (no redundant title); robust for `[group, label]`/`[label]` (fixed undefined last item).
- **Sidebar footer:** added `#sidebarCurrencySwitch` (compact `.currencySwitch--compact`) below nav, above Administrator profile.
- **Overview:** removed currency bar from skeleton (`ovEnsureSkeleton`).
- **Currency wiring:** unified click handler to `#sidebarCurrencySwitch button` + legacy `#currencySwitch` (backcompat), propagate `data-currency` to `.toolRoot`, listen for `assistara:currencychange` and re-render Dashboard on change.
- **Runtime:** preserve both classes for filterBar (`"filterBar app-toolbar"`).

### admin-finance.html
- Removed header currency switch; now uses shared `AssistaraCurrency` (preference/key/rates).  
- Click handlers paint/sync `#sidebarCurrencySwitch`; `assistara:currencychange` syncs + re-renders; init pre-fetches rate for remembered currency; invalid prefs reset to PHP.  
- No changes to stored amounts, rates history, or fee/payment logic.

### admin-currency.css
- Refined `.currencySwitch` (focus-visible, transitions); added `.currencySwitch--compact` variant (Manrope, restrained styling).

### admin-components.css (append-only polish)
- Native selects/inputs in `.workspace` (dashboard filters, app-toolbar, filterBar): custom chevron, consistent borders/radii/padding, focus ring.
- `.filter-pill` utility with active/pressed + count badges.
- `.badge` refined (pill radius, micro-label style).
- Minor table/expandable header inheritance; no rewrite of existing components.

### admin-header.css
- `.workspace-search`: pill radius, height aligned to header, focus/hover states, responsive wrap.

### scripts/currency-shared.test.js
- Updated: sidebar selector only on admin shell; Finance has no currency switch; embedded tools have none. (Preserves unit test semantics.)

## Verification (node --test)

| Suite | Pass/Fail | Notes |
|---|---|---|
| `api/admin-applicants.test.js` | 16/16 PASS | Lifecycle (accepted ≠ invitation_sent), filters, expanded details, stats, nav routing, pipeline, capacity/blocked sections. |
| `api/admin-nav.test.js` | 13/13 PASS | Routing, state persistence, tool mounting in shadow DOM, clean disposal, chrome/title behavior. |
| `api/admin-finance-fees.test.js` | 6/6 PASS | Finance behavior unchanged. |
| `scripts/currency-shared.test.js` | 7/7 PASS | PHP/USD/EUR only, invalid→PHP, sidebar-only selector, others none. |
| **Total (focused)** | **42/42 PASS** | No regressions introduced by tasks 19–22. |

**Outside scope (pre-existing):** `api/waitlist.test.js` has 1 unrelated failure (token validation path vs shared module) — not introduced here.

## Browser evidence (required when authorized)

Since preview auth is blocked per checkpoint, authorized authenticated QA should capture:
1. **Dashboard** — pipeline stages (clickable/non-clickable), KPI cards (clickable), Needs Attention panel (real items), Acquisition & Masterclass (real metrics), layout balanced.  
2. **Applications** — one per row, stats (Total/Needs Admin/Awaiting Payment/Enrolled), filters (All/Needs My Action/New/Invited/Awaiting Payment/Paid/Onboarding/Enrolled/Closed), sort by action-needed+oldest, 7 expandable sections intact, actions/notes preserved, no duplicates.  
3. **Currency** — sidebar selector only. Switch PHP→USD→EUR: numbers update (Dashboard + Finance). Refresh; selection persists. Set invalid (AUD) via localStorage simulation or test harness — resets to PHP. **No** native records/checkout/coupons/payments change.  
4. **Manrope** — computed `font-family` includes Manrope; no conflicting fonts in admin shell, headers, buttons, selects, tables.

## Remaining issues
- Authenticated browser QA blocked (preview login). Require authorized access or explicit approval to proceed with live verification.
- `api/waitlist.test.js:15` pre-existing mismatch (unrelated to these tasks).
- No deploy without explicit approval; fix-forward only; no rollback/revert/reset/force-push.

## Deployment status
**BLOCKED — DO NOT DEPLOY.** All unit regressions pass for in-scope tests. Live QA pending authorization/approval. Release report ready for review.