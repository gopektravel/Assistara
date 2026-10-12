# Assistara Email Template Audit

**Date:** 2026-10-11  
**Repository:** assistara-local-v9 (Vercel Root Directory)

---

## Executive Summary

**10 distinct email templates** discovered across 9 Edge Functions.  
**3 use the canonical `brandedEmail` renderer** (masterclass-reminder).  
**7 use duplicated `shell()` / `frame()` functions** with hardcoded branding.  
**0 templates** are centrally managed or editable via dashboard.

---

## Discovered Templates

| # | Edge Function | Template Function | Email Type | Category | Subject Line | Uses Canonical Brand |
|---|---------------|-------------------|------------|----------|--------------|---------------------|
| 1 | `website-form/index.ts` | `frame()` | Academy application confirmation | Transactional | "Your Assistara Academy application ✨" | ❌ (duplicated) |
| 2 | `website-form/index.ts` | `frame()` | Admin notification | Internal | "New Academy application" | ❌ (duplicated) |
| 3 | `admin-applications/index.ts` | `shell()` | Application accepted | Transactional | "You're IN! Welcome to Assistara Academy!" | ❌ (duplicated) |
| 4 | `admin-applications/index.ts` | `shell()` | Application waitlisted/rejected | Transactional | "Not this round, but you're on our list!" | ❌ (duplicated) |
| 5 | `admin-send-onboarding/index.ts` | `shell()` | Onboarding / account setup | Transactional | "Set up your Assistara Academy account" | ❌ (duplicated) |
| 6 | `payment-complete/index.ts` | `shell()` | Payment confirmation | Transactional | "Payment received 🎉 {receipt} \| Assistara Academy" | ❌ (duplicated) |
| 7 | `paymongo-webhook/index.ts` | `shell()` | Payment confirmation (webhook) | Transactional | "Payment received 🎉 {receipt} \| Assistara Academy" | ❌ (duplicated) |
| 8 | `review-gcash-payment/index.ts` | `shell()` | GCash payment approved | Transactional | "GCash payment confirmed 🎉" | ❌ (duplicated) |
| 9 | `admin-gcash-payment/index.ts` | `shell()` | GCash payment instructions + QR | Transactional | "Your GCash payment link" | ❌ (duplicated) |
| 10 | `admin-academy-capacity/index.ts` | `shell()` | Waitlist spot opened | Transactional | "A seat just opened in the Academy cohort 🎉" | ❌ (duplicated) |
| 11 | `masterclass-reminder/index.ts` | `renderHtml()` + `brandedEmail()` | 24h reminder (from Xyra) | Campaign | "{first}, your Assistara masterclass is {day} — here's your join link" | ✅ |
| 12 | `masterclass-reminder/index.ts` | `renderFollowupHtml()` | Academy follow-up | Campaign | "Oops, one more thing! 💛" | ❌ (custom HTML) |
| 13 | `masterclass-reminder/index.ts` | `brandedEmail()` | 30-min reminder | Campaign | "We're going live in 30 minutes! 💛" | ✅ |
| 14 | `masterclass-reminder/index.ts` | `brandedEmail()` | 5-min reminder | Campaign | "We're live! Where are you? 👀" | ✅ |

**Total: 14 email templates** (10 unique layouts, 4 variations)

---

## Brand Compliance Analysis

### Canonical Brand (from `email-brand.ts`)
- ✅ Header: black `#171717` + official logo PNG + white "Assistara" wordmark
- ✅ Card: white `#fff`, border `#e2dfd7`, radius 24px, max-width 600px
- ✅ Body: Arial, 16px/1.65, color `#4f4b45`
- ✅ CTA: yellow `#ffd51f`, black text, radius 999px, padding 15px 21px, weight 700
- ✅ Footer: border-top `#ece9e2`, 12px `#77716a`
- ✅ Logo: `https://www.getassistara.com/assistara-logo.png` (PNG, absolute HTTPS)

### Non-Compliant Templates (7 functions)
All duplicated `shell()` / `frame()` functions have **minor deviations**:
- Logo: Some use inline yellow "A" square instead of PNG
- Border radius: Some use 12px instead of 24px
- Padding: Inconsistent (30px vs 32px)
- CTA radius: Some use 12px instead of 999px
- Font size: Some use 30px heading instead of 32px
- Footer: Some omit unsubscribe link
- Max-width: Some use 620px instead of 600px

---

## Dynamic Variables Used

| Variable | Templates Using | Source |
|----------|-----------------|--------|
| `{{first_name}}` | All | `split(/\s+/)[0]` from name |
| `{{name}}` | All | Full name |
| `{{email}}` | All | Recipient email |
| `{{join_url}}` | Masterclass reminders | Personal token link |
| `{{unsubscribe_url}}` | Masterclass reminders | Token-based |
| `{{calendar_url}}` | 24h reminder | Google Calendar link |
| `{{ics_url}}` | 24h reminder | .ics file link |
| `{{event_date}}` | 24h reminder | Formatted date |
| `{{event_time}}` | 24h reminder | Formatted time |
| `{{day_word}}` | 24h reminder | "today"/"tomorrow"/day name |
| `{{receipt_number}}` | Payment emails | Generated |
| `{{amount}}` / `{{currency}}` | Payment emails | Payment data |
| `{{payment_method}}` | Payment emails | Brand + last4 |
| `{{date}}` | Payment emails | Formatted datetime |
| `{{onboarding_url}}` | Accepted/onboarding | Enrollment token |
| `{{promo_code}}` | Payment emails | Applied promo |
| `{{apps_count}}` | Follow-up | Academy application count |
| `{{limit}}` | Follow-up | Cohort limit (15) |

---

## Sending Workflows (Edge Functions → Email Delivery)

| Workflow | Edge Function | Delivery Method | Template Source |
|----------|---------------|-----------------|-----------------|
| Academy application submit | `website-form` | Direct Resend/Brevo | Hardcoded `frame()` |
| Application decision (accept) | `admin-applications` | Direct Resend | Hardcoded `shell()` |
| Application decision (reject) | `admin-applications` | Direct Resend | Hardcoded `shell()` |
| Onboarding send | `admin-send-onboarding` | Direct Resend | Hardcoded `shell()` |
| Stripe payment success | `payment-complete` | Direct Resend | Hardcoded `shell()` |
| PayMongo webhook | `paymongo-webhook` | Direct Resend | Hardcoded `shell()` |
| GCash admin approve | `review-gcash-payment` | Direct Resend | Hardcoded `shell()` |
| GCash payment link send | `admin-gcash-payment` | Direct Resend | Hardcoded `shell()` |
| Waitlist spot opened | `admin-academy-capacity` | Direct Resend | Hardcoded `shell()` |
| Masterclass 24h reminder (cron) | `masterclass-reminder` | `createEmailDelivery()` | `renderHtml()` + `brandedEmail()` |
| Masterclass follow-up (cron) | `masterclass-reminder` | `createEmailDelivery()` | `renderFollowupHtml()` |
| Masterclass 30-min reminder (cron) | `masterclass-reminder` | `createEmailDelivery()` | `brandedEmail()` |
| Masterclass 5-min reminder (cron) | `masterclass-reminder` | `createEmailDelivery()` | `brandedEmail()` |

---

## Database Tables (Current)

| Table | Purpose |
|-------|---------|
| `email_delivery_log` | Per-message send log (idempotency, status, provider) |
| `email_delivery_attempts` | Per-provider attempt records |
| `email_events` | Provider webhook events (delivered, opened, clicked, bounced) |
| `email_renders` | Captured HTML/text for preview (per message) |
| `email_provider_config` | Provider credentials & settings |
| `email_provider_quota` | Daily/monthly usage counters |
| `email_provider_health` | Circuit breaker state |
| `email_suppressions` | Global suppression list |
| `email_webhook_events` | Raw webhook receipts |

**Missing:** Template library table, template versions, template variables schema

---

## Open-Source Editor Evaluation

### Criteria
| Factor | Weight |
|--------|--------|
| License compatibility (MIT/Apache-2.0 preferred) | Critical |
| Vanilla JS / no build step required | Critical (current admin is vanilla) |
| HTML import/export (round-trip existing templates) | High |
| Variable/merge tag support | High |
| Mobile/desktop preview | High |
| Image upload/management | Medium |
| Undo/redo | Medium |
| Component library (text, image, button, spacer, divider) | High |
| Source code / visual toggle | Medium |
| Maintenance activity / community | Medium |

### Candidates

| Repo | License | Tech | Build Required? | HTML Import | Variables | Status |
|------|---------|------|-----------------|-------------|-----------|--------|
| `maildeno/editor` | MIT | TypeScript, Preact | Yes (Vite) | Partial | Basic | Active |
| `zalify/easy-email-editor` | MIT | React | Yes (webpack) | Good | Good | Active |
| `unlayer/react-email-editor` | Proprietary (free tier limited) | React | Yes | Excellent | Excellent | Commercial |

### Recommendation

**Use `maildeno/editor`** because:
1. MIT license (unrestricted)
2. TypeScript-based, can be bundled to single IIFE for vanilla integration
3. Active maintenance
4. Component-based architecture matches our needs
5. Can fork and customize for Assistara brand components

**Fallback strategy:** Provide raw HTML source editor mode for templates that don't round-trip cleanly.

---

## Implementation Plan

### Phase 1: Database & API Foundation (Week 1)
- [ ] Create `email_templates` table with versioning
- [ ] Create `email_template_versions` table for history
- [ ] Create `email_template_variables` table for variable definitions
- [ ] Build Edge Function: `admin-email-templates` (CRUD + publish/draft)
- [ ] Migrate all 14 hardcoded templates into DB

### Phase 2: Template Library UI (Week 1-2)
- [ ] Add "Templates" tab to admin-email.html
- [ ] List view: name, category, subject, preview thumbnail, status, last updated
- [ ] Create/duplicate/archive/delete actions
- [ ] Confirmation modals for critical templates

### Phase 3: Visual Editor Integration (Week 2-3)
- [ ] Bundle maildeno/editor as ES module for vanilla JS
- [ ] Create Assistara component library (brand-compliant blocks)
- [ ] Implement variable picker with autocomplete
- [ ] HTML source mode toggle
- [ ] Undo/redo via editor history

### Phase 4: Preview & Testing (Week 3)
- [ ] Desktop/mobile preview iframe
- [ ] Sample data generator per template
- [ ] Test send to internal addresses (with [TEST] prefix)
- [ ] Email client compatibility hints

### Phase 5: Publishing & Integration (Week 3-4)
- [ ] Draft → Publish workflow with version bump
- [ ] Rollback to previous version
- [ ] Refactor all 9 Edge Functions to load published template from DB
- [ ] Preserve `createEmailDelivery()` provider fallback
- [ ] Keep provider-native tracking (no custom pixels)

### Phase 6: Safety & Polish (Week 4)
- [ ] Variable validation on publish (required vars present)
- [ ] Link validation (no broken hrefs)
- [ ] Brand compliance checks (logo, colors, footer)
- [ ] No live sends during preview/test
- [ ] Guard tests: `node --test scripts/email-branding.test.js`

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Existing HTML not round-trippable | HTML source mode fallback; import as "custom HTML" block |
| Breaking live emails during edit | Draft/publish separation; only published versions used by senders |
| Variable mismatch | Variable registry per template; validate on publish |
| Editor complexity | Start with core components; add advanced features iteratively |
| Provider integration | Keep `createEmailDelivery()` unchanged; only template loading changes |

---

## Success Metrics

- [ ] All 14 templates imported and editable
- [ ] Visual editor produces brand-compliant HTML
- [ ] All 9 Edge Functions refactored to use DB templates
- [ ] Draft/publish/rollback works end-to-end
- [ ] Test sends work to internal addresses
- [ ] `email-branding.test.js` passes
- [ ] No regression in delivery rates or tracking