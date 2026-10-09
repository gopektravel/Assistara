# Assistara Academy — Launch Readiness Audit

Audit date: 2026-10-09
Target: live masterclass Sunday 11 Oct 2026; first paid cohort = **15 seats**.
Auditor role: senior full-stack / QA automation / security / launch lead.

> Scope note: this audit was performed against the local checkout only. The live
> Supabase project, payment providers, mail providers and the second GitHub repo
> (`gopektravel/Assistara`) were **not** written to, migrated, or reconfigured,
> per the production-safety boundaries. Every "live" claim below is a read-only
> HTTP observation.

---

## 1. Executive summary

**Verdict: CONDITIONAL GO.**

The Academy is in materially better shape than the surface suggests: the
architecture is sound, the capacity/payment-gate design is unusually careful,
and the offline regression suite is strong (876/876 passing, up from 865).
However, three launch-critical gaps were found and two of them were repaired in
code but **are not deployed**, and one requires a Stripe dashboard change the
owner must make.

| | |
|---|---|
| Overall launch readiness | Conditional — safe only after the blockers in §6 are closed |
| Current production version | Production `admin.html` is byte-identical to the local `assistara-local-v9/admin.html` (only CRLF differs), so production is on (or very near) the tested tree. Vercel commit SHA was not present in the pulled env file, so an exact SHA cannot be asserted. |
| Tested code revision | Local working tree, `HEAD = 8420424` (branch `main`). |
| Offline test result | **876 pass / 0 fail** (`node --test` in `assistara-local-v9/api`). |
| Confidence | High for code/static/mocked behaviour; **medium** for live payment, email delivery and DB state, which were not executable here. |
| Remaining unknowns | Live Stripe/PayMongo account state, live email inbox delivery, `academy_cohorts.capacity` value, the exact production `finalize_academy_payment` signature, and the source of three unversioned production Edge Functions. |

**"Can Assistara Academy safely accept 15 paying students on Sunday?"**
Not yet, as-is. It can after the four items in §6 are done — the most important
being the Stripe webhook (otherwise a card payment can be captured with no
enrollment) and the deployment of the three repaired local changes.

---

## 2. Test coverage (by workflow)

Evidence tiers: **U** = unit/static, **M** = mocked integration, **S** = sandbox
end-to-end, **L** = live read-only. A mocked test is not proof a live
integration works; that is stated where relevant.

| # | Workflow | Result | Method / evidence | Notes / risk |
|---|---|---|---|---|
| 1 | Visitor lands on site | PASS | L: `GET /` 200, `/academy` 200, `/login` 200, `/academy/apply` 200, `/masterclass/join` 200, `/live` 200 | Vercel, HSTS on |
| 2 | Masterclass registration persists | PASS (code) | U/M: `website-form` inserts/upserts `masterclass_signups`, dedupes by email, sends email | Live DB write not attempted |
| 3 | Confirmation email | BLOCKED | U: Resend with Brevo fallback, `Idempotency-Key` present | Inbox delivery not verified (no test inbox) |
| 4 | Attend / masterclass access | PASS (code) | U: `masterclass-status`, `live.html` attendance ping | `masterclass-attendance` fn not in repo (see I4) |
| 5 | Navigate to Academy | PASS | L: `/academy` 200 | |
| 6 | Submit application | PARTIAL | U: `academy-apply.html` posts to `website-form-proxy`; production endpoint exists (OPTIONS 204, GET 405) | **Proxy source not in repo** (I4); live insert not attempted |
| 7 | Application in admin dashboard | PASS (code) | U: `admin-api` `list` + `admin-applications` `list`; M: tests | |
| 8 | Admin reviews seven answers | PASS | U/M: `admin-api` `answers` returns canonical 7-field allowlist only | |
| 9 | Accept / decline | PASS (code) | U/M: `admin-applications` `decision`; accept emails checkout link; decline = waitlisted + email | |
| 10 | Correct email delivered | BLOCKED | U: templates + `Idempotency-Key` | Live delivery not verified |
| 11 | Open payment link | PASS | L: `/academy/checkout` routed; U: token validation `^[0-9a-f-]{36}$` | |
| 12 | Apply `MASTERCLASS` coupon | PASS (code) | U: `apply-academy-promo` reads `academy_promo_codes`; root SQL sets 4900 | **Live coupon row not verified** (I-manual) |
| 13 | Amount calculated | PASS (code) | U: Stripe unit_amount = `checkout_amount_php` or 6900; PayMongo expected = same | |
| 14 | Pay via Stripe / PayMongo | PARTIAL | M: Stripe session create; M: PayMongo webhook verify+finalize | Live charge not performed |
| 15 | Payment verified server-side | PASS (code) | U: Stripe re-fetch session; PayMongo re-fetch Payment Intent, amount+currency+livemode checks | |
| 16 | Enrollment created | PASS (code) | U/M: `finalize_academy_payment` single serialized gate | Signature mismatch risk (I5) |
| 17 | Onboarding instructions | PASS (code) | U: confirmation email with onboarding URL + receipt PDF | Live delivery not verified |
| 18 | Account created/activated | PASS (code) | U: `onboarding-api`, `academy-login`; L: `/api/academy-session` 403 without session | |
| 19 | Student logs in | PASS | L: `/login` 200; U: session exchange + entitlement predicate | |
| 20 | Authorized lessons | PASS | L: `/academy/dashboard` 302 → `/login`; `/academy/test-portal` 302 → `/admin` | Gate fails closed |
| 21 | Quick Checks / exams | PASS | M: 865+ tests incl. server-owned grading, unlock chain, attempts | |
| 22 | Progress saved | PASS (code) | M: RPC persistence, service-role-only writes | |
| 23 | Admin sees progress | PASS (code) | U: `admin-api` `student-progress`; admin UI renders %/position/exams | |
| 24 | 15-seat capacity + concurrency | PASS (design) | U: advisory-lock RPC + capacity trigger + waitlist + payment exceptions | Live concurrency not executed (I-manual) |
| 25 | Security / RLS / entitlement | PASS (code) | U/M: strict `academy_has_access`, exam write lockdown, sealed cookies, constant-time compares | |
| 26 | Admin Test Student Portal | **FIXED** | M (real DOM harness): `api/test-portal-preview.test.js` | See I2 |
| 27 | Admin Suspend / Reactivate | **FIXED** | U: `api/admin-accounts-actions.test.js` | See I3 |

---

## 3. Issues discovered

### I1 — P0 — Stripe card payments have no server-to-server fulfillment
- **Description:** A Stripe payment was only finalized when the buyer's browser
  reached `/academy/payment-success` and called `payment-complete`. There was no
  Stripe webhook. If the tab was closed, the redirect failed, or an extension
  blocked the request, Stripe captured the money but the application was never
  marked paid: no seat counted, no receipt, no onboarding email.
- **Reproduction:** Grep for `checkout.session.completed` / `stripe-signature` /
  `stripe-webhook` across `supabase/functions` → none. `academy-payment-success.html`
  is the only caller of `payment-complete`.
- **Root cause:** Missing webhook endpoint; fulfillment coupled to the client redirect.
- **Files:** `supabase/functions/payment-complete/index.ts`,
  `assistara-local-v9/academy-payment-success.html`.
- **Fix implemented:** Added `supabase/functions/stripe-webhook/index.ts` — verifies
  `Stripe-Signature` (HMAC-SHA256, 300s tolerance, constant-time compare), only
  acts on `checkout.session.completed` / `checkout.session.async_payment_succeeded`
  with `metadata.source === "assistara_academy"` and `payment_status === "paid"`,
  then delegates to the tested, idempotent `payment-complete` path (which
  re-verifies the session with Stripe). Returns 500 on failure so Stripe retries.
  Added `api/stripe-webhook.test.js`.
- **Verification:** 4/4 new tests pass; full suite 876/876.
- **Deployment status:** **NOT DEPLOYED.** Requires owner action: create the
  Stripe webhook endpoint, subscribe to the two events, set
  `STRIPE_WEBHOOK_SECRET`, deploy with JWT verification disabled.

### I2 — P1 — Admin Test Student Portal bounced to `/admin`
- **Description:** Reported broken. After an Admin session was restored from
  `localStorage` (browser/tab reopened, or a new tab), clicking "Test student
  portal" landed on `/academy/test-portal` with a valid server QA cookie but the
  client gate redirected straight back to `/admin`.
- **Reproduction:** `academy-dashboard.html` boot: `if(preview){if(!sessionStorage.getItem("assistara_admin_token")){location.replace("/admin");return}...}`.
  `sessionStorage` is per-tab and cleared on close, while every other admin
  surface reads `localStorage || sessionStorage`.
- **Root cause:** Test Portal client gate read `sessionStorage` only.
- **Files:** `assistara-local-v9/academy-dashboard.html`.
- **Fix implemented:** Gate now accepts `sessionStorage || localStorage`, matching
  `client-finder.html`, `admin-finance.html`, `admin-acquisition.html`. Added
  `api/test-portal-preview.test.js`, which runs the **real unmodified inline
  script** in the DOM harness.
- **Verification:** New test **failed on the pre-fix code** (`actual: ['/admin']`)
  and passes after the fix. Full suite green.
- **Deployment status:** **NOT DEPLOYED** (Vercel).

### I3 — P1 — Admin "Suspend/Reactivate" and "Password reset" buttons were dead
- **Description:** The student card renders "Suspend account / Reactivate" and
  "Password reset". Both called `admin-applications`, which answers
  `503 {error:'This admin action is temporarily unavailable'}`. Suspension is a
  security control the entitlement predicate already enforces
  (`academy_has_access` requires `suspended_at IS NULL`), but there was no server
  implementation.
- **Reproduction:** `admin.html` `suspend()` → `req("suspend_account", …)` with
  default API = `admin-applications`; `resetPw()` likewise. Grep `admin-accounts`
  for `suspend_account` → absent.
- **Root cause:** Actions were disabled in `admin-applications` but never
  implemented in the account-management function, and the UI was not repointed.
- **Files:** `assistara-local-v9/admin.html`, `supabase/functions/admin-accounts/index.ts`.
- **Fix implemented:** `admin-accounts` now implements `suspend_account`
  (sets/clears `academy_applications.suspended_at`, writes an activity-log entry)
  and `send_password_reset` (uses Supabase Auth `resetPasswordForEmail`). The UI
  now targets `ACC` for both. Added `api/admin-accounts-actions.test.js`.
- **Verification:** 4/4 new tests pass; `admin.html` inline scripts still parse.
- **Deployment status:** **NOT DEPLOYED** (Vercel + Supabase function).

### I4 — P1 — Deployment drift: three production Edge Functions are not in the repo
- **Description:** The frontends call `website-form-proxy` (apply form),
  `masterclass-attendance` (`live.html`) and `track-acquisition` (`academy.html`).
  All three exist and respond in production (OPTIONS 204 / GET 405 / GET 403) but
  have **no source in this repository**. The application-submission path depends
  on `website-form-proxy`.
- **Root cause:** Functions deployed outside the version-controlled tree.
- **Impact:** A rebuild-from-repo would silently drop acquisition attribution,
  masterclass attendance tracking, and the Academy application endpoint.
- **Files (references):** `assistara-local-v9/academy-apply.html`,
  `assistara-local-v9/academy.html`, `assistara-local-v9/live.html`.
- **Fix:** Not applied — the source is unknown, so recreating it would risk
  overwriting the live behaviour. **Owner action:** add the three function
  sources to `supabase/functions/` (or repoint the apply form at the versioned
  `website-form`, which already handles `academy_application`).
- **Deployment status:** n/a (needs owner).

### I5 — P1 — `finalize_academy_payment` privilege statement signature mismatch
- **Description:** `202610080003_academy_capacity_waitlist.sql` defines
  `finalize_academy_payment(uuid,numeric,text,text,text,text,text)` (7 args) but
  the `REVOKE`/`GRANT` at the end reference a **9-arg** signature
  `(uuid,numeric,text,text,text,text,text,boolean,text)`. On a clean apply,
  PostgreSQL errors `function … does not exist` and aborts the migration.
- **Root cause:** The migration was written to version-control a live function
  whose signature differs from the one it creates.
- **Files:** `supabase/migrations/202610080003_academy_capacity_waitlist.sql`
  (lines 549–550).
- **Fix:** Not applied — correcting it requires knowing the live signature, and
  running migrations is out of bounds. **Owner action:** confirm the live
  signature (`select proname, pg_get_function_arguments(oid) from pg_proc …`) and
  reconcile the file before any fresh environment is provisioned.
- **Deployment status:** n/a (existing project already provisioned).

### I6 — P2 — Duplicate Academy applications are possible
- **Description:** `website-form` `insert('academy_applications', …)` always
  creates a new row; there is no unique constraint or dedupe on email. A repeat
  submit yields a second application, a second confirmation email (new idempotency
  key) and a second card in Admin.
- **Files:** `supabase/functions/website-form/index.ts` (and the unversioned
  `website-form-proxy`), `assistara-local-v9/academy-apply.html`.
- **Fix:** Not applied (the live path runs through `website-form-proxy`, whose
  source is unknown — I4). Recommend a partial unique index on lower(email) for
  non-onboarded rows, or an upsert. Low customer impact; matters for admin data
  hygiene.

### I7 — P2 — Stale `vercel.json` entries reference non-existent files
- **Description:** `vercel.json` builds and routes `api/admin-application-answers.js`
  and `api/admin-application-notes.js`; neither file exists (answers/notes live in
  the `admin-api` Edge Function). Production returns 404 for those routes.
- **Files:** `assistara-local-v9/vercel.json`.
- **Fix:** Not applied (harmless today; production deploys successfully with the
  entries). Recommend deleting the four stale entries as hygiene so a future
  Vercel stricter-mode build cannot fail on a missing `src`.

### I8 — P2 — Soft 404s return HTTP 200
- **Description:** Unknown paths (e.g. `/vercel.json`, `/academy-checkout.html`)
  fall through the catch-all and serve `404.html` with status **200**.
- **Files:** `assistara-local-v9/vercel.json` (`/(.*) → /404.html`).
- **Impact:** SEO/analytics noise; monitoring cannot see real 404s. Cosmetic.

### I9 — P2 — Font inconsistency vs AGENTS.md
- **Description:** `AGENTS.md` says DM Sans is the only web font. Most pages ship
  **Manrope** (and `api/F-03` asserts Manrope as the single family), while
  `login.html` uses **DM Sans**. This is a genuine conflict between the stated
  source-of-truth rule and the shipped/tested site.
- **Fix:** Not applied — changing fonts is cosmetic (P3) and would break the
  existing F-03 test. **Owner decision required** before any font change.

### I10 — P3 — Repo/remote drift
- **Description:** The git remote is `gopektravel/assistara-masterclass`, whose
  `origin/main` is an unrelated Vite presentation project (273 files, ~52k
  insertions different). The website under `assistara-local-v9/` is tracked on the
  local branch but not present on `origin/main`. GitHub-branch drift comparison is
  therefore not possible for the website; only production HTTP read-only was used.
- **Impact:** No branch currently holds the website history on the configured
  remote. Confirm which repository/branch Vercel deploys from before relying on
  git-based rollback.

---

## 4. Code changes

**Files modified**
- `assistara-local-v9/academy-dashboard.html` — Test Portal client gate accepts
  `localStorage || sessionStorage` (I2).
- `assistara-local-v9/admin.html` — Suspend/Reactivate and Password reset now call
  `admin-accounts` (`ACC`) (I3).
- `supabase/functions/admin-accounts/index.ts` — added `suspend_account` and
  `send_password_reset` (I3).

**Files added**
- `supabase/functions/stripe-webhook/index.ts` — Stripe server-to-server
  fulfillment safety net (I1).
- `assistara-local-v9/api/test-portal-preview.test.js` — 3 tests (I2).
- `assistara-local-v9/api/stripe-webhook.test.js` — 4 tests (I1).
- `assistara-local-v9/api/admin-accounts-actions.test.js` — 4 tests (I3).
- `LAUNCH_READINESS_AUDIT.md`, `LAUNCH_AUDIT_PROGRESS.md`.

**Removed code:** none.

**Test suite:** 865 → **876 passing, 0 failing**.

**Remaining technical debt:** I4 (unversioned functions), I5 (migration
signature), I6 (duplicate applications), I7 (stale vercel entries), I8 (soft 404),
I9 (font conflict), I10 (repo/remote drift), and unused `LIMIT = 15` constants in
`create-checkout-session` / `enrollment-invitation` / `admin-applications`
(capacity is DB-driven; these constants are dead but harmless).

---

## 5. Security findings (defensive)

Verified as sound (offline/mocked):
- **RLS / entitlement:** `academy_has_access` is service-role only and requires
  `status='onboarded'`, `payment_status='paid'`, `onboarding_completed_at NOT NULL`,
  `suspended_at IS NULL`, and exactly one matching `auth_user_id`.
- **Session gate:** sealed AES-256-GCM cookies, expiry-capped, `Secure`/`HttpOnly`/
  `SameSite=Lax`, origin allowlist, live Auth user re-check (bans/deletes revoke).
- **Exam integrity:** answer key server-only; grading server-owned; learners hold
  no INSERT/UPDATE on `academy_exam_attempts`; writes go through a service-role RPC.
- **Payment integrity:** PayMongo webhook verifies signature + timestamp, checks
  livemode, dedupes by `event_id`, and re-fetches the Payment Intent before
  fulfilling (amount/currency/livemode). Stripe `payment-complete` re-fetches the
  session. Capacity is enforced by an advisory-lock RPC plus a DB trigger;
  overflow becomes a `academy_payment_exceptions` row, never a paid enrollment.
- **Admin token:** two-segment HMAC, `u==='admin'`, future ms expiry, verified by
  the `admin-api` authority; QA cookie is a separate sealed audience and cannot be
  replayed as Admin.
- **No service-role key in browser code** (grep clean); Supabase publishable key
  in `login.html` is a public key by design.

Not verifiable here: live RLS policies on every table, live env-var values, and
live webhook configuration.

---

## 6. Launch blockers (must close before taking real students)

1. **Deploy I1 + configure Stripe webhook.** Without it, a card payment can be
   captured with no enrollment. (Owner: Stripe endpoint + `STRIPE_WEBHOOK_SECRET`
   + deploy `stripe-webhook` with JWT verification off; and deploy the updated
   `payment-complete` if changed.)
2. **Deploy the repaired local changes** (I2 dashboard, I3 admin UI +
   `admin-accounts`).
3. **Confirm production data:** `academy_cohorts` capacity = 15, cohort open, and
   the `MASTERCLASS` row in `academy_promo_codes` (`amount_php = 4900`, `active`).
4. **Email smoke test:** one real send through the production function to a
   controlled inbox and confirm inbox delivery + SPF/DKIM, before the cohort emails
   go out.

## 7. Manual launch checks (human verification required)

- Stripe: test-mode end-to-end charge → webhook → enrollment; then confirm the
  live webhook endpoint is enabled and the secret matches.
- PayMongo: confirm webhook secret + endpoint, and one sandbox QR Ph payment.
- Email: Resend domain verification and/or `BREVO_API_KEY`; check
  `forms@getassistara.com` / `academy@getassistara.com` reply-to deliverability.
- Capacity concurrency: fire parallel `create-checkout-session` calls near 15 and
  confirm the 16th gets `full:true` and a waitlist row.
- Confirm `finalize_academy_payment` live signature (I5) before any DB rebuild.
- Confirm the source of `website-form-proxy`, `masterclass-attendance`,
  `track-acquisition` (I4).
- Confirm Supabase Edge Function JWT settings (public functions such as
  `payment-complete`, `website-form`, `stripe-webhook` must accept unauthenticated
  provider/browser calls).

## 8. Rollback plan

- **Vercel:** promote the previous deployment (Vercel dashboard → Deployments →
  Promote), or revert the local commit and redeploy. Static HTML changes are
  independently revertible.
- **Supabase functions:** redeploy the previous version of each function
  individually (functions deploy independently; no schema change is involved in
  I1/I3).
- **Migrations:** all migrations are additive/idempotent; do **not** roll back
  data. If I5 is edited, re-run only after a backup and signature confirmation.
- **Data:** no production data was modified by this audit; no rollback of data is
  required.

## 9. Final verdict

**Can Assistara Academy safely accept 15 paying students on Sunday?**

**Conditional YES.** The platform is architecturally ready and the tested code
paths are strong, but three repaired defects are not yet deployed and Stripe
card fulfillment needs its webhook configured. Complete §6 (≈1–2 hours of
owner-side work plus deploys) and it can safely take the cohort. Do **not** take
card payments before the Stripe webhook is live — that is the one path where a
student can pay and not receive access.
