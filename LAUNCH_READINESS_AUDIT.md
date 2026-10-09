# Assistara Academy — Launch Readiness Audit

Audit date: 2026-10-09 → 2026-10-10
Target: live masterclass Sunday 11 Oct 2026; first paid cohort = **15 seats**.
Scope: local checkout only. The live Supabase project, payment providers and mail
providers were **not** modified. All "live" statements are read-only observations.

---

## 1. Executive summary

**Verdict: GO, conditional on owner-side deploy + sandbox/email verification.**

Owner decision incorporated: **no Stripe webhook.** Stripe exceptional payments
will be reconciled manually (see §7). The card flow is otherwise unchanged and
remains server-verified.

| | |
|---|---|
| Overall readiness | Ready to deploy; live payment/email must be smoke-tested first |
| Production project | Vercel project **`assistara`** (`prj_IvuoCJ8hpqSgWz0pbnP9NHeR6Dox`), domain `www.getassistara.com`, root `assistara-local-v9`, repo **`gopektravel/Assistara`**, branch **`main`** |
| Local revision | `main` ahead of `origin/main` (gopektravel/Assistara `83f60f1`); audit changes committed locally |
| Offline test result | **897 pass / 0 fail** (`node --test` in `assistara-local-v9/api`) |
| Production build | `vercel build --yes` from the repo root → **Build completed successfully** |
| Confidence | High for code/static/mocked behaviour; live payment, email delivery and DB config still need owner verification |

**Can Assistara Academy safely accept 15 paying students on Sunday?**
Yes, once the owner (a) deploys the local changes, (b) confirms `academy_cohorts.capacity = 15`
and the `MASTERCLASS` coupon (`amount_php = 4900`) in the database, (c) runs one
sandbox payment per provider, and (d) sends one test email and confirms inbox
delivery. None of these were executable from the audit sandbox.

---

## 2. What changed in this pass

| Area | Action |
|---|---|
| Stripe webhook | **Removed** (`supabase/functions/stripe-webhook/` and its test deleted). Manual recovery documented in §7. Checkout + payment-success flow unchanged. |
| Payment migration | Fixed the `finalize_academy_payment` privilege/signature mismatch (see R2). |
| Duplicate applications | `website-form` now folds a repeat submit within 24h onto the existing unreviewed application (see R3). |
| Unversioned Edge Functions | **Recovered** `website-form-proxy`, `masterclass-attendance`, `track-acquisition` from the deployed project into the repo (see R4). |
| Git remote | Corrected: `origin` → `gopektravel/Assistara` (production); old remote preserved as `masterclass` (see R5). |
| Vercel config | Removed two dead build entries + two dead routes for `api/admin-application-answers.js` / `-notes.js`; build re-run green. |
| Admin fixes | Test Portal, Suspend/Reactivate, Password Reset preserved and verified (see §3). |
| Tests added | `migration-signatures`, `vercel-build-sanity`, `application-dedupe`, `edge-function-drift`, `journey-wiring` (net +12 tests). |

---

## 3. Admin functionality (preserved & verified)

| Feature | Status | Evidence |
|---|---|---|
| Admin Test Student Portal | **Verified** | `api/test-portal-preview.test.js` runs the real dashboard script; the gate accepts a token from `localStorage` **or** `sessionStorage`, and still refuses a caller with no token. The fix was proven to fail on the pre-fix code. |
| Suspend / Reactivate | **Verified (offline)** | `admin.html` calls `admin-accounts` (`ACC`); `admin-accounts` sets/clears `academy_applications.suspended_at` and logs the action. `api/admin-accounts-actions.test.js`. |
| Password Reset | **Verified (offline)** | `admin.html` calls `admin-accounts`; handler uses Supabase Auth `resetPasswordForEmail`. Students also have self-serve recovery on `login.html`. |
| Permissions | **Verified** | Every admin action is behind the HMAC admin token (`ADMIN_TOKEN_VERSION`); suspension immediately fails `academy_has_access` (`suspended_at IS NULL`). |

**Still requires a controlled live account:** clicking the three buttons in the
real Admin UI against a test student (see §6, step E). Offline tests prove wiring
and logic; they do not prove the live Supabase Auth call.

---

## 4. Issues — resolved this pass

### R1 — Stripe webhook (owner decision: not adding)
Removed the added webhook function and its tests. The existing flow is unchanged:
`create-checkout-session` → Stripe → `/academy/payment-success` →
`payment-complete`, which **re-verifies the Checkout Session with Stripe** and
finalizes through the serialized capacity RPC. Residual risk: a card payment whose
browser never returns is not auto-enrolled; the owner reconciles it manually (§7).

### R2 — `finalize_academy_payment` migration signature mismatch (P1, fixed)
`202610080003_academy_capacity_waitlist.sql` defined a 7-argument
`finalize_academy_payment(...)` but revoked/granted a 9-argument signature that
the file never creates, so a clean apply aborted. The privileges now reference the
7-argument signature it defines, with a comment about any legacy overload.
Guarded by `api/migration-signatures.test.js` (compares every function defined and
granted in the same migration).

### R3 — Duplicate Academy applications (P2, fixed)
`website-form` always inserted a new row, so a double click / refresh-resend
produced two applicants. It now looks up an existing application for the same
email that is **undecided**, **unpaid** and **created within 24h** and updates that
row instead of inserting; a paid, onboarded or already-decided row is never
touched, and a later re-application still creates a fresh row. `website-form-proxy`
is a pass-through to `website-form`, so the fix covers the live apply form.
`academy-apply.html` also suppresses an accidental same-tab resubmit.
Guarded by `api/application-dedupe.test.js`.

### R4 — Unversioned production Edge Functions (P1, fixed)
`website-form-proxy`, `masterclass-attendance` and `track-acquisition` were
deployed but had **no source in any repository** (confirmed in both
`gopektravel/Assistara` and `assistara-masterclass`). Recovered from the deployed
project with `supabase functions download`. `website-form-proxy` forwards to
`website-form`; `masterclass-attendance` updates join/heartbeat; `track-acquisition`
records attribution visits. Guarded by `api/edge-function-drift.test.js`
(every `functions/v1/<slug>` the frontend calls must have a local source).
Still unversioned and **not** frontend-referenced: `submit-lead`,
`cal-booking-webhook`, `send-masterclass-announcement`, and the two
`*-sandbox` functions — documented, not recovered (out of launch scope).

### R5 — Incorrect Git remote (P1, fixed)
The checkout's `origin` pointed at `gopektravel/assistara-masterclass`, whose
`main` is an unrelated Vite project. Production is built from
`gopektravel/Assistara`. Resolved non-destructively: the old remote was renamed to
`masterclass` and `origin` now points at `gopektravel/Assistara`; `main` tracks
`origin/main`.

### R6 — Dead Vercel routes (P2, fixed)
`vercel.json` built and routed `api/admin-application-answers.js` /
`-notes.js`, which do not exist (answers/notes are served by the `admin-api`
Edge Function). Confirmed no runtime caller, removed both builds and both routes,
and re-ran `vercel build` successfully. Guarded by `api/vercel-build-sanity.test.js`.

---

## 5. Issues — open / requiring owner action

| # | Sev | Issue | Action |
|---|---|---|---|
| O1 | — | DB `academy_cohorts.capacity` not verifiable from the sandbox (RLS denies anon; service key redacted) | Owner: confirm `capacity = 15`, cohort open |
| O2 | — | `MASTERCLASS` coupon lives only in `MASTERCLASS_COUPON_SQL.sql` (4900), not in a migration | Owner: confirm the live row `code='MASTERCLASS', amount_php=4900, active=true` |
| O3 | P2 | Live email delivery unverified (no test inbox / provider access) | Owner: send one test via each template, confirm inbox + SPF/DKIM |
| O4 | P2 | Live Stripe/PayMongo sandbox payments unverified | Owner: run §6 C/D |
| O5 | P3 | Font inconsistency: `AGENTS.md` says DM Sans; most pages ship Manrope, `login.html` uses DM Sans | Owner decision |
| O6 | P3 | Soft 404s return HTTP 200 (Vercel catch-all) | Cosmetic; leave for post-launch |
| O7 | P3 | Extra unversioned functions (`submit-lead`, `cal-booking-webhook`, `send-masterclass-announcement`, sandbox fns) | Version later; not on the launch path |

---

## 6. Manual verification runbook (owner)

**A. Deploy the changes** (only with approval): Vercel deploy of `assistara`
(`assistara-local-v9`) and `supabase functions deploy` for `website-form`,
`admin-accounts`, plus the recovered `website-form-proxy`, `masterclass-attendance`,
`track-acquisition` if not already current.

**B. Config checks (read-only SQL or Table editor):**
- `select code, capacity, is_open from academy_cohorts;` → expect `founding-2026`, `15`, `true`.
- `select code, amount_php, active from academy_promo_codes;` → expect `MASTERCLASS`, `4900`, `true`.

**C. Stripe sandbox:** on a controlled applicant, open the checkout link, apply
`MASTERCLASS` (expect ₱4,900), pay with a Stripe test card, confirm the success
page says enrolled, and confirm `academy_applications.payment_status = 'paid'` and
a seat is counted. Then test the **exception path**: close the browser after paying
and reconcile manually (§7).

**D. PayMongo sandbox:** create a QR Ph payment via the sandbox function/flow,
confirm the webhook verifies the signature, re-fetches the intent, and finalizes
the enrollment; confirm a duplicate webhook is ignored and an over-capacity payment
becomes an `academy_payment_exceptions` row (not an enrollment).

**E. Admin actions (controlled test student):** open Admin → Test student portal
(works after reopening the browser), Suspend → confirm the student loses Academy
access, Reactivate → access returns, Password reset → recovery email arrives.

**F. Full journey:** application → acceptance email → checkout → payment →
onboarding email → set up account → log in → open a lesson → pass a Quick Check →
pass a phase exam → confirm Admin sees the progress.

---

## 7. Manual recovery process — Stripe payment not auto-enrolled

If a student paid by card but their enrollment did not activate (they closed the
browser before the success page, or the redirect failed):

1. **Find the payment in Stripe** → Payments → search by the student's email or
   the amount. Confirm the Checkout Session shows **Paid**.
2. **Find the application** in the Admin dashboard (Applicants) by email, or in
   Supabase `academy_applications` by `email`. Note its `id` and
   `enrollment_token`.
3. **Confirm a seat is available:** Admin → Capacity shows `paid` and `available`.
   Do not exceed 15 paid seats.
4. **Activate the enrollment.** Preferred: open
   `https://www.getassistara.com/academy/payment-success?session_id=<cs_...>` using
   the Stripe Checkout Session id (`cs_...`). `payment-complete` re-verifies the
   session with Stripe and finalizes it idempotently; the student then gets the
   onboarding email/receipt. This is the same path the student's browser would
   have used, so no manual data edits are needed.
5. If the session id is unavailable, verify payment in Stripe, then (as a last
   resort, owner-only) call the serialized RPC with the service role:
   `select public.finalize_academy_payment('<application_id>'::uuid, 4900, 'PHP', 'card', 'stripe', '<payment_intent_id>');`
   then set `receipt_number`/send the onboarding link. Prefer step 4.
6. **Reconcile the books:** the Stripe fee may need recording in
   `payment_processing_fees` (the Finance page shows unrecorded fees).
7. **If the cohort is full:** do **not** enroll a 16th learner. Record a refund in
   Stripe and keep the applicant on the waitlist (`academy_waitlist`).

---

## 8. Test coverage summary

Offline suite: **897 pass / 0 fail**. Evidence tiers: U = unit/static, M = mocked
integration, L = live read-only. Live payment/email = **BLOCKED (owner sandbox)**.

| Workflow | Result | Method |
|---|---|---|
| Site + routes reachable | PASS | L (`/`, `/academy`, `/login`, `/academy/apply`, `/live`, `/masterclass/join` → 200) |
| Application persists + dedupe | PASS (code) | U/M (`website-form` + `application-dedupe`) |
| Acceptance email → checkout link | PASS | U (`journey-wiring` #1) |
| Checkout reserves a seat | PASS | U (`journey-wiring` #2) |
| Stripe payment server-verified | PASS (code) | U/M (`payment-complete`) |
| PayMongo webhook verified | PASS (code) | U/M (`paymongo-webhook`) |
| Enrollment via capacity gate | PASS | U/M (`finalize_academy_payment`) |
| Onboarding email → account | PASS | U (`journey-wiring` #4/#5) |
| Entitlement (paid+onboarded+not suspended) | PASS | U/M (`academy_has_access`) |
| Login / dashboard / lessons gate | PASS | L + M (302s, sealed cookies) |
| Quick Check / exams / progress | PASS | M (server-owned grading, RPC persistence) |
| Admin Test Portal / Suspend / Reset | PASS (offline) | M/U |
| Capacity 15 + coupon 4900 | **BLOCKED** | needs DB read (O1/O2) |
| Live email delivery | **BLOCKED** | needs test inbox (O3) |
| Live Stripe/PayMongo sandbox | **BLOCKED** | needs provider creds (O4) |

---

## 9. Code changes

**Added**
- `assistara-local-v9/api/migration-signatures.test.js`
- `assistara-local-v9/api/vercel-build-sanity.test.js`
- `assistara-local-v9/api/application-dedupe.test.js`
- `assistara-local-v9/api/edge-function-drift.test.js`
- `assistara-local-v9/api/journey-wiring.test.js`
- `supabase/functions/website-form-proxy/index.ts` (recovered)
- `supabase/functions/masterclass-attendance/index.ts` (recovered)
- `supabase/functions/track-acquisition/index.ts` (recovered)

**Modified**
- `supabase/migrations/202610080003_academy_capacity_waitlist.sql` (signature fix)
- `supabase/functions/website-form/index.ts` (duplicate guard)
- `assistara-local-v9/academy-apply.html` (in-tab resubmit guard)
- `assistara-local-v9/vercel.json` (dead entries removed)
- (earlier pass, preserved) `academy-dashboard.html`, `admin.html`,
  `supabase/functions/admin-accounts/index.ts`

**Removed**
- `supabase/functions/stripe-webhook/` and `assistara-local-v9/api/stripe-webhook.test.js`

**Repo config**
- `origin` → `gopektravel/Assistara`; old remote preserved as `masterclass`.

---

## 10. Rollback plan

- **Vercel:** promote the previous deployment, or revert the release commit and redeploy.
- **Supabase functions:** redeploy the previous version per function (no schema change in the function edits).
- **Migration:** the change only corrects privileges; do not run it against production without a backup, and confirm the live `finalize_academy_payment` signature first.
- **Git remote:** reversible with `git remote rename masterclass origin`.
- No production data was modified by this audit.

---

## 11. Final verdict

**GO, conditional.** The Academy's critical paths are wired, tested and build
cleanly, and the owner's "no Stripe webhook" decision is implemented with a safe
manual recovery process. Before the first 15 students: deploy the changes, confirm
capacity = 15 and the `MASTERCLASS` coupon = ₱4,900 in the database, run one
sandbox payment per provider, and send one real test email. The only path where a
student can pay without auto-enrollment is a card payment whose browser never
returns — recoverable by the documented §7 process.
