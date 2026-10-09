# Assistara Academy — Launch Readiness Audit Progress

Running checklist (target: Sunday 11 Oct 2026, 15 paid seats).
Website source of truth: `assistara-local-v9/`. Production: Vercel project
`assistara` → `www.getassistara.com`, repo `gopektravel/Assistara` branch `main`.

Legend: [x] done, [~] in progress, [ ] not started, [!] owner action / blocked.

## Baseline
- [x] Discovery (routes, functions, migrations, tests, deployment config)
- [x] Baseline suite 865 → now **897 pass / 0 fail**
- [x] Production read-only checks + drift detection
- [x] Identified production repo/branch via Vercel API

## Fixed and verified (offline; deploy pending owner approval)
- [x] P1 Admin Test Student Portal (localStorage OR sessionStorage gate) + regression
- [x] P1 Admin Suspend/Reactivate + Password Reset implemented in `admin-accounts`
- [x] P0→removed Stripe webhook per owner decision; manual recovery documented
- [x] P1 `finalize_academy_payment` migration signature mismatch + guard test
- [x] P2 Duplicate Academy applications folded onto existing row + guard test
- [x] P1 Recovered `website-form-proxy`, `masterclass-attendance`, `track-acquisition` + drift guard
- [x] P1 Git remote corrected (origin → gopektravel/Assistara)
- [x] P2 Dead Vercel builds/routes removed; `vercel build` green + build-sanity test
- [x] Journey wiring contract test (9 links of the student journey)

## Verification evidence
- [x] `node --test` in `assistara-local-v9/api` → 897 pass / 0 fail
- [x] `vercel build --yes` (repo root) → Build completed successfully
- [x] Targeted tests: test-portal-preview, admin-accounts-actions, migration-signatures,
      vercel-build-sanity, application-dedupe, edge-function-drift, journey-wiring

## Blocked / owner action
- [!] O1 Confirm `academy_cohorts.capacity = 15` (RLS blocks anon; service key redacted here)
- [!] O2 Confirm `MASTERCLASS` coupon `amount_php = 4900`, active
- [!] O3 Live email delivery (test inbox, SPF/DKIM)
- [!] O4 Live Stripe + PayMongo sandbox payments (see runbook §6)
- [!] O5 Admin buttons clicked against a controlled test student
- [!] Deploy Vercel + Supabase functions (needs explicit approval)

## Open, non-blocking
- [ ] O5 Font conflict (AGENTS.md DM Sans vs shipped Manrope) — owner decision
- [ ] O6 Soft 404s return HTTP 200
- [ ] O7 Extra unversioned functions (`submit-lead`, `cal-booking-webhook`,
      `send-masterclass-announcement`, sandbox fns) — version later
- [ ] Verify the live `finalize_academy_payment` signature before any DB rebuild
