DEPLOYMENT PLAN — Email Command Center (Template Studio)
Status: READY — awaiting user approval (not executed)
Commit: 02ceffb (fix: complete email template gateway integration and migration reconciliation)
Prepared: 2026-10-12

=== TEMPLATE INVENTORY (18 keys, 18 entries) ===
Transactional (12):
  academy_application_confirmation         — website-form (academy application)
  internal_new_application                 — website-form (admin notification)
  academy_application_accepted             — admin-applications (decision: accepted)
  academy_application_waitlisted           — admin-applications (decision: waitlisted)
  academy_onboarding                       — admin-send-onboarding
  academy_payment_confirmation             — payment-complete + paymongo-webhook
  gcash_payment_confirmed                  — admin-gcash-payment (approve, no receipt)
  gcash_payment_approved                   — review-gcash-payment + admin-gcash-payment (approve, with receipt)
  gcash_payment_instructions               — admin-gcash-payment (QR payment instructions)
  academy_waitlist_seat_opened             — admin-academy-capacity
  gcash_payment_unverified                 — review-gcash-payment (reject)
  gcash_screenshot_request                 — admin-gcash-payment (reject → screenshot request)
  gcash_payment_followup                   — admin-gcash-payment (no_response → followup)

Campaign (4):
  masterclass_reminder_24h                 — masterclass-reminder
  masterclass_followup                     — masterclass-reminder
  masterclass_reminder_30                  — masterclass-reminder
  masterclass_reminder_5                   — masterclass-reminder

Internal (2):
  masterclass_registration_confirmation    — website-form (masterclass signup)

=== PRE-DEPLOY BACKUP ===
1. Backup DB: export email_templates, email_drafts, email_versions via supabase CLI dump or pg_dump to assistara-db-backup-2026-10-12.sql.
2. Backup functions: archive supabase/functions/_shared/email-templates.ts, email-template-registry.ts, admin-email-templates/index.ts.
3. Confirm production gateway fallback preserved (inline builder unchanged) — verified in code.

=== MIGRATION ===
- Migration 202610150000_email_templates.sql (renamed from 202610110006) sorts AFTER last prod migration 202610140001_remove_first_party_tracking.sql
- Migration 202610120003_chat_session_audit.sql now tracked (was untracked but applied in prod)
- Empty migration 20261011234036_email_templates_only.sql removed
- Modified 202610130000_fix_academy_promo_codes_compat.sql reverted to committed state
- Verify applied in target DB before deploy: SELECT version FROM schema_migrations WHERE file='202610150000_email_templates.sql';
- If missing, apply via supabase db push or psql.

=== SMOKE TESTS (post-deploy, isolated from production sends) ===
1. Open admin-template-studio.html → load academy_application_accepted template → edit text → Save Draft.
2. Call resolveEmailTemplate('academy_application_accepted', {first_name:'Test'}) → expect source='published' or 'fallback' (not error).
3. Confirm gateway returns original inline HTML when no published row exists (production unchanged).
4. Confirm cleanEditorElements removes editor-span before serialization.
5. Confirm Manrope font loaded in admin UI (computed style check).
6. Confirm rollback restores previous version (manual DB update + reload test, not live send).
7. Verify all 18 registry keys resolve through their intended sending workflows.
8. Verify published template edits in visual editor reach gateway output (source='published').

=== REGRESSION TESTS (executed on isolated test project joeivvevdugtwzimeftn) ===
- Schema creation: 4/4 tables (email_templates, email_template_versions, email_template_variables, email_template_drafts) — PASS
- Import 18 templates as drafts — PASS
- Save draft and reload — PASS
- Publish and gateway resolution (source=published) — PASS
- Rollback to draft (status=draft, version=0) — PASS
- Fallback: no published template = inline builder — PASS
- All 18 template keys present in DB — PASS
- All expected resolveEmailTemplate call sites present in source — PASS
- 18 unique registry keys, no duplicates — PASS
- Compilation: 12/12 sender files — PASS
- Manrope font in Template Studio — PASS
- Migration ordering correct (email_templates after prod) — PASS
- Empty migration removed — PASS
- Chat session audit migration tracked — PASS

=== ROLLBACK PROCEDURES ===
- Function rollback: revert commit 02ceffb → redeploy previous function bundle.
- DB rollback: restore email_templates from pre-deploy backup; delete drafts/versions inserted during testing.
- Production email protection: gateway always falls back to inline builder; no destructive test sends to subscribers.

=== DEPLOYMENT GATE ===
User approval required before executing any deploy to production. No deploy executed in this session.