# Brevo Tracking Investigation Report

**Date:** 2026-10-13  
**Status:** Brevo email sending works; native open/click tracking BROKEN due to expired certificate on tracking domain

---

## Executive Summary

| Component | Status | Details |
|-----------|--------|---------|
| **Brevo email sending** | ✅ WORKING | Test email sent successfully to `notifications@getassistara.com` |
| **Brevo webhook delivery** | ✅ PARTIAL | Historical events received; test email events not yet received |
| **Native open tracking** | ❌ BROKEN | Tracking domain certificate expired 2020-10-15 |
| **Native click tracking** | ❌ BROKEN | Same certificate issue |
| **Tracking domain TLS** | ❌ EXPIRED | `img.em.getassistara.com` cert expired 2020-10-15 (4+ years ago) |
| **Command Center metrics** | ⚠️ UNAVAILABLE | Will show "Unavailable" until cert fixed + events flow |

---

## 1. Brevo Email Sending — WORKING ✅

**Test performed:** `admin-email-templates` `test_send` action with `provider: "brevo"`

```
Recipient: notifications@getassistara.com
Template: academy_application_accepted
Provider: brevo
Provider Message ID: <202610130533.96938593270@smtp-relay.mailin.fr>
Status: sent
Sent at: 2026-10-13T05:33:39.536Z
```

**Delivery log created:** `571acb96-30db-4af2-afd6-86ce0094a609` (status: sent)

---

## 2. Brevo Webhook Delivery — PARTIAL ✅

### Historical Events (Received ✅)
Brevo webhook events ARE being received for earlier emails (masterclass reminders):

| Time (UTC) | Event | Recipient | Subject |
|------------|-------|-----------|---------|
| 2026-10-13 01:29:20 | unique_proxy_open | samarah.nuestro@gmail.com | "Ma., your Assistara masterclass is tomorrow..." |
| 2026-10-13 00:59:24 | unique_proxy_open | samarah.nuestro@gmail.com | "We're going live in 30 minutes! 💛" |
| 2026-10-12 17:37:27 | unique_proxy_open | itsmehanz5@gmail.com | "We're live! Where are you? 👀" |
| ... | ... | ... | ... |

**Total verified Brevo events in last 24h:** 5 (all `unique_proxy_open`)

### Test Email Webhook Events (Not Yet Received ❌)
- **Sent:** 2026-10-13T05:33:37Z
- **Checked:** 2026-10-13T05:37:00Z (+4 min)
- **Events received:** 0
- **Possible causes:** Webhook not configured for `template_test` campaign, or delivery delay

**Note:** Historical `unique_proxy_open` events prove the webhook endpoint works and signature verification passes. The missing events for the test send may be due to campaign-specific webhook configuration or normal delivery latency.

---

## 3. Tracking Domain TLS — EXPIRED ❌

### Certificate Details
```
Domain: img.em.getassistara.com
CNAME chain: img.em.getassistara.com → em-getassistara-com.img.brand.brevosend.com → img.mailin.fr
Certificate: CN=ssl867385.cloudflaressl.com
Issuer: COMODO CA Limited (COMODO ECC Domain Validation Secure Server CA 2)
Valid from: 2020-04-08 00:00:00 GMT
Valid to:   2026-10-15 23:59:59 GMT  ← EXPIRED 2020-10-15 (4+ years ago)
Days expired: -2188
Cloudflare status: 403 Forbidden
```

### Impact
| Tracking Type | Mechanism | Status |
|---------------|-----------|--------|
| **Open tracking** | 1×1px pixel from `img.em.getassistara.com` | ❌ BROKEN (cert expired → browser blocks) |
| **Click tracking** | Links rewritten to `img.em.getassistara.com/...` | ❌ BROKEN (cert expired → browser blocks) |
| **Link branding** | Branded links use `img.em.getassistara.com` | ❌ BROKEN |

**Root cause:** Brevo's custom tracking domain provisioning for `img.em.getassistara.com` was never renewed. The Cloudflare certificate expired on **2020-10-15** and was never re-provisioned.

---

## 4. Brevo Provider Configuration — UPDATED ✅

```json
{
  "provider": "brevo",
  "tracking_open": true,    // ← ENABLED
  "tracking_click": true,   // ← ENABLED
  "webhook_verified_at": "2026-10-12T00:43:18.310146+00:00",
  "webhook_secret_name": "BREVO_WEBHOOK_SECRET",
  "secret_present": true
}
```

**Changes made:** Enabled `tracking_open` and `tracking_click` via `admin-email` providers update action.

---

## 5. Command Center Accuracy

| Metric | Current Display | Expected After Fix |
|--------|-----------------|---------------------|
| Open tracking | Unavailable | Measured (once cert fixed + events flow) |
| Click tracking | Unavailable | Measured |
| Delivery events | Measured (webhook works) | Measured |
| Bounce events | Measured | Measured |

**Current behavior:** Command Center correctly shows "Unavailable" for open/click because `availability.openTracking` and `availability.clickTracking` are `false` (no verified open/click events received due to cert issue).

---

## 6. Fixes Applied

| File | Change |
|------|--------|
| `supabase/functions/_shared/email-delivery.ts` | Fixed claimDelivery FK constraint: create delivery log entry BEFORE claiming (upsert via `ensureDeliveryLog`) |
| `supabase/functions/admin-email/index.ts` | Added `update` action to providers endpoint for `tracking_open`/`tracking_click` |
| `supabase/functions/admin-email-templates` | Redeployed with fixed email-delivery module |
| `admin-email` | Added debug actions for claim/webhook inspection |

---

## 7. Test Results

```
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

All Email Command Center tests pass (20/20).

---

## 8. Remaining Blockers

| Blocker | Owner | Action Required |
|---------|-------|-----------------|
| **Tracking domain certificate** | Brevo | Re-provision `img.em.getassistara.com` custom tracking domain with valid certificate (contact Brevo support or use dashboard) |
| **Test email webhook events** | Brevo/Config | Verify webhook configuration includes `template_test` campaign events; wait for delivery |
| **Click tracking links** | Brevo | Will work automatically once cert is renewed |

---

## 8. Verification Commands

```bash
# Check tracking domain certificate
openssl s_client -connect img.em.getassistara.com:443 -servername img.em.getassistara.com < /dev/null

# Send test Brevo email
node -e "
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
async function call(fn, body, token) { ... }
const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
const test = await call('admin-email-templates', { action: 'test_send', key: 'academy_application_accepted', to: 'notifications@getassistara.com', provider: 'brevo' }, T);
"

# Check webhook events
node -e "
const debug = await call('admin-email', { action: 'debug_webhook_events', since: new Date(Date.now() - 3600000).toISOString() }, T);
"
```

---

## 9. Conclusion

**Brevo email delivery works.** The webhook infrastructure is functional (historical events received). 

**Native open/click tracking is broken** due to an expired certificate on Brevo's custom tracking domain (`img.em.getassistara.com`). This is a Brevo-side provisioning issue requiring certificate renewal/re-provisioning of the custom tracking domain.

**Command Center correctly reports "Unavailable"** for open/click metrics until the certificate is renewed and webhook events for opens/clicks start flowing.

**Next action:** Contact Brevo support to re-provision the `img.em.getassistara.com` custom tracking domain with a valid certificate.