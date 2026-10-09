# Assistara Academy — Launch Readiness Audit Progress

Running checklist for the pre-launch audit (target: Sunday 11 Oct 2026, 15 paid seats).
Session working directory: repository root; website source of truth: `assistara-local-v9/`.

Legend: [x] done, [~] in progress, [ ] not started, [!] blocked (needs owner approval / credentials).

## Baseline
- [x] Project discovery (routes, functions, migrations, tests, deployment config)
- [x] Baseline test run: `node --test` in `assistara-local-v9/api` → 865 pass / 0 fail
- [x] Production read-only reachability + drift sample (production `admin.html` matches local)
- [x] Repo/remote characterisation (remote `assistara-masterclass`; website tracked in `assistara-local-v9/`)

## Fixes (all tested; NONE deployed — deploy requires owner approval)
- [x] Local commit `378b71f` created with the audit changes + report + progress.
- [x] P1: Admin Test Student Portal bounced to `/admin` when the Admin token was
      restored from localStorage. Fixed in `assistara-local-v9/academy-dashboard.html`;
      regression `api/test-portal-preview.test.js` (proven to fail before the fix).
- [x] P0: No Stripe webhook — card payments could be captured without enrollment.
      Added `supabase/functions/stripe-webhook/index.ts` + `api/stripe-webhook.test.js`.
- [x] P1: Admin Suspend/Reactivate + Password reset buttons dead (called
      `admin-applications` → 503). Implemented in `supabase/functions/admin-accounts`
      and repointed `assistara-local-v9/admin.html`; test
      `api/admin-accounts-actions.test.js`.

## Audit coverage completed
- [x] Payments: Stripe checkout, PayMongo webhook, coupon, idempotency, capacity RPC
- [x] 15-seat capacity + waitlist + payment-exception design review
- [x] Email flows (website-form, admin-applications, admin-accounts, admin-academy-capacity, payment-complete, paymongo-webhook)
- [x] Student Academy server logic (session, quick check, exam, content gate)
- [x] Security & entitlement (academy_has_access, cookie sealing, exam write lockdown)
- [x] Deployment drift vs production (HTTP read-only)
- [x] Final report `LAUNCH_READINESS_AUDIT.md`
- [x] Full regression suite after all edits: 876 pass / 0 fail

## Open findings (documented in the report; not fixed)
- [ ] P1 I4: production Edge Functions `website-form-proxy`, `masterclass-attendance`,
      `track-acquisition` are not in the repo (owner: version them)
- [ ] P1 I5: `finalize_academy_payment` revoke/grant signature mismatch in
      `202610080003_academy_capacity_waitlist.sql` (needs live-signature confirmation)
- [ ] P2 I6: duplicate academy applications allowed (no email dedupe/unique)
- [ ] P2 I7: stale `vercel.json` entries for `api/admin-application-answers.js` / `-notes.js`
- [ ] P2 I8: soft 404s return HTTP 200
- [ ] P2 I9: font conflict (AGENTS.md DM Sans vs shipped Manrope)
- [ ] P3 I10: git remote `origin/main` is a different project

## Blocked / owner input
- [!] Cannot run against the live Supabase project or payment providers (credentials +
      production-safety boundary). Live payment/email verification is manual.
- [!] AGENTS.md says "DM Sans only"; the shipped site + tests enforce **Manrope**.
      Conflict to resolve with owner before any font change.
- [!] Git remote points at `assistara-masterclass`, whose `origin/main` is a different
      project (Vite presentation). GitHub drift comparison limited to production HTTP.
- [!] Deploying any fix (Vercel or Supabase functions) and configuring the Stripe
      webhook are explicit owner approvals, not done here.
