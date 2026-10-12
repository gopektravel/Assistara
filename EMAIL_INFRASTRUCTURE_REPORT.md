# Assistara Email Infrastructure — Implementation & Production Readiness Report

## Executive Summary

**Status: NO-GO** — Migration `202610110001_email_quota_and_delivery.sql` must be applied before production deployment.

## What Was Implemented

### 1. Database Migration (`supabase/migrations/202610110001_email_quota_and_delivery.sql`)
**Status: READY — NOT APPLIED (requires explicit approval)**

Creates the centralized email delivery infrastructure:
- `email_provider_quota` — per-provider daily/monthly quota tracking with atomic reservations
- `email_provider_config` — verified sender/domain config for Resend, Brevo, Sender.net
- `email_delivery_log` — durable log with idempotency keys, status states (pending/sent/failed/unknown/expired/suppressed)
- `email_delivery_claim` — atomic per-recipient claiming (exactly-once)
- `email_provider_health` — priority-based provider health with cooldowns (advisory-locked RPCs)
- RPCs: `email_reserve_quota`, `email_release_quota`, `email_provider_failure`, `email_provider_success`, `email_get_next_provider`, `email_claim_delivery`, `email_release_claim`
- RLS: service_role only
- Default configs for Resend (100/day), Brevo (300/day), Sender.net (1000/day, disabled)

### 2. Shared Email Delivery Module (`supabase/functions/_shared/email-delivery.ts`)
**Status: DEPLOYED**

Centralized delivery class with:
- Provider priority routing: Resend → Brevo → Sender.net
- Atomic quota reservation before each send
- Token-bucket rate limiting per provider (2 RPS Resend, 10 RPS Brevo/Sender)
- Failure classification:
  - **Definitive** (401 auth, 402 quota): fallback to next provider / hard stop
  - **Rate limit** (429): fallback to next provider with Retry-After honor
  - **Ambiguous** (5xx, timeout, network): **UNKNOWN status, NO auto-fallback** — requires reconciliation
- Durable delivery log with idempotency keys
- Deadline enforcement (emails never send after `deadline`)

### 3. Updated Masterclass Reminder Function (`supabase/functions/masterclass-reminder/index.ts`)
**Status: DEPLOYED**

- Uses centralized `EmailDelivery` class
- Creates `email_delivery_log` entry per recipient (idempotent)
- Hard deadline = event `scheduled_at` (emails never send after event start)
- Preserves approved email design/copy exactly
- Test action uses unique idempotency key per invocation

### 4. Unsubscribe Migration (`202610100001_masterclass_reminder.sql`)
**Status: READY — NOT APPLIED**

Adds `unsubscribed_at` column to `masterclass_signups` and creates `masterclass_reminders` table with unique constraint for exactly-once. **Required for unsubscribe to work.**

---

## Simulation Results (Corrected Centralized Logic)

### 205-Recipient Campaign (Normal Operation)
| Provider | Emails Sent | Daily Remaining |
|----------|-------------|-----------------|
| Resend | 100 | 0/100 |
| Brevo | 105 | 195/300 |
| Sender.net | 0 | 1000/1000 |
| **Total** | **205 ✅** | — |

### 410-Recipient Campaign (Normal Operation)
| Provider | Emails Sent | Daily Remaining |
|----------|-------------|-----------------|
| Resend | 100 | 0/100 |
| Brevo | 300 | 0/300 |
| Sender.net | 10 | 990/1000 |
| **Total** | **410 ✅** | — |

### Failure Scenarios (Correct Behavior)

| Scenario | Behavior | Result |
|----------|----------|--------|
| Resend 429 (rate limit) | Fallback to Brevo → Sender | ✅ Graceful |
| Resend 402 (quota exhausted) | Fallback to Brevo → Sender | ✅ Graceful |
| Resend 500 (server error) | **UNKNOWN status, NO fallback** | ❓ Reconcile first |
| Resend timeout | **UNKNOWN status, NO fallback** | ❓ Reconcile first |
| Resend network error | **UNKNOWN status, NO fallback** | ❓ Reconcile first |
| Resend 401 (auth failure) | **HARD STOP, no fallback** | ❌ Alert ops |
| Event started (deadline) | **0 sent, skipped** | ✅ Enforced |

### Key Metrics
- **Estimated batch time**: ~2-5 minutes (sequential with rate limiting)
- **Peak RPS**: ~2 (Resend limit)
- **Unknown rate target**: <1% (requires reconciliation workflow)
- **Duplicate sends**: 0 (atomic claim + idempotency key)

---

## Blocking Issues (Must Resolve Before GO)

| # | Issue | Resolution |
|---|-------|------------|
| 1 | **Migration `202610110001` not applied** | Apply migration (requires approval) |
| 2 | **Migration `202610100001` (unsubscribe) not applied** | Apply migration (required for unsubscribe) |
| 3 | **Sender.net not verified** | Need `SENDER_API_KEY` secret + domain verification |
| 4 | **Brevo sender/domain not verified** | Verify `xyra@getassistara.com` in Brevo dashboard |
| 5 | **No reconciliation workflow for UNKNOWN** | Build admin UI/cron to retry UNKNOWN after investigation |
| 6 | **No monitoring/alerting** | Add metrics: `emails_sent`, `emails_failed`, `emails_unknown`, `quota_usage_pct` |

---

## Remaining Follow-Up Work (Post-GO)

| Area | Task |
|------|------|
| Academy acceptance emails | Migrate `admin-send-onboarding`, `admin-academy-capacity`, `admin-applications` to centralized system |
| Payment emails | Migrate `payment-complete`, `paymongo-webhook`, `submit-gcash-payment`, `review-gcash-payment` |
| Website form | Migrate `website-form` (already has Brevo fallback) |
| Onboarding/enrollment | Migrate `enrollment-invitation`, `admin-send-onboarding` |
| Sender.net integration | Add API key, verify domain, enable in config |
| Reconciliation cron | Daily job to review UNKNOWN status, manual approve retry |
| Alerting | PagerDuty/Slack on: UNKNOWN > 5, quota > 80%, auth failures |

---

## GO / NO-GO Decision

### 🔴 NO-GO

**Reason**: 
1. Migration `202610110001_email_quota_and_delivery.sql` not applied (core infrastructure missing)
2. Migration `202610100001_masterclass_reminder.sql` not applied (unsubscribe broken)
3. Sender.net not configured/verified
4. Brevo sender verification unconfirmed
5. No reconciliation workflow for UNKNOWN status emails

### Minimum Path to GO

1. **Approve & apply** `202610110001_email_quota_and_delivery.sql`
2. **Approve & apply** `202610100001_masterclass_reminder.sql` (unsubscribe fix)
3. **Add & verify** `SENDER_API_KEY` secret, verify domain in Sender.net
4. **Verify** Brevo `xyra@getassistara.com` sender identity
5. **Test** full flow: test send → verify delivery log → stats
6. **Enable** `MASTERCLASS_REMINDER_ENABLED=true` (currently encrypted false)

---

## Files Changed

| File | Status |
|------|--------|
| `supabase/migrations/202610110001_email_quota_and_delivery.sql` | Created (ready to apply) |
| `supabase/functions/_shared/email-delivery.ts` | Created & deployed |
| `supabase/functions/masterclass-reminder/index.ts` | Updated & deployed |
| `supabase/migrations/202610100001_masterclass_reminder.sql` | Existing (ready to apply) |

---

## Test Verification

Run after migrations applied:
```bash
# Test send
curl -X POST https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-reminder \
  -H "Content-Type: application/json" \
  -d '{"action":"test","cron_secret":"<secret>","email":"Jessevanrobbroeck@gmail.com"}'

# Check stats
curl -X POST https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-reminder \
  -H "Content-Type: application/json" \
  -d '{"action":"stats","cron_secret":"<secret>"}'
```

Expected: test email delivered, delivery log entry created with status=sent, stats shows reminders_sent=1.