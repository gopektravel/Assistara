---
name: Assistara Email Branding
description: Use for ANY Assistara email work — creating, editing, rendering, previewing, testing or sending transactional/promotional emails (masterclass reminders, registration confirmations, Academy emails, payment receipts). Load this before writing email HTML so you reuse the canonical branded shell and never invent a new design.
---

# Assistara Email Branding

The single source of truth for Assistara email design and delivery. **Never invent
a new email design.** Reuse the canonical branded shell and the shared modules below.

## 1. Canonical template & source locations

The canonical branded design is the **email-safe brand mark** shell (dark header +
yellow "A" + white card + yellow CTA + light footer). Deployed references:

| Component | File | Symbol |
|-----------|------|--------|
| Masterclass registration confirmation | `supabase/functions/website-form/index.ts` | `frame()` |
| Academy decision emails | `supabase/functions/admin-applications/index.ts` | `shell()` |
| Onboarding | `supabase/functions/admin-send-onboarding/index.ts` | `shell()` |
| Payment receipt | `supabase/functions/payment-complete/index.ts` | `shell()` + `logo` |
| **Shared canonical renderer (use this)** | `supabase/functions/_shared/email-brand.ts` | `brandedEmail()`, `brandedText()`, `brandEsc()` |
| Delivery / provider routing | `supabase/functions/_shared/email-delivery.ts` | `createEmailDelivery()` |
| Masterclass reminders | `supabase/functions/masterclass-reminder/index.ts` | actions + templates |

**Rule:** new emails import `brandedEmail()`/`brandedText()` from
`../_shared/email-brand.ts`. Do not copy the shell HTML into a function.

## 2. Brand tokens

- **Page background:** `#f4f3ef`
- **Card:** `#fff`, border `1px solid #e2dfd7`, `border-radius:24px`, `max-width:600px`
- **Header:** `#171717`, padding `20px 32px`
- **Brand mark:** yellow `#FFD51F` rounded square (42×42, radius 12), letter **A**,
  `color:#151515`, `font-size:27px`, `font-weight:900`, line-height 42px
- **Wordmark:** `Assistara`, `#fff`, `23px`, bold
- **Heading (h1):** `32px`, `line-height:1.15`
- **Body:** `16px`, `line-height:1.65`, `#4f4b45`
- **CTA button:** bg `#ffd51f`, text `#151515`, `border-radius:999px`,
  `padding:15px 21px`, `font-weight:700`
- **Fallback link row:** `12px`, `#77716a`, `word-break:break-all`
- **Footer:** `border-top:1px solid #ece9e2`, padding `20px 32px`, `12px`, `#77716a`
- **Font:** `Arial, Helvetica, sans-serif` (email-safe). The site uses DM Sans; **emails use Arial.**
- **Logo assets (web only):** `assistara-local-v9/assistara-logo.png`, `assistara-logo.svg`.
  **Emails must NOT load remote images** — use the email-safe brand mark instead
  (enforced by `scripts/email-branding.test.js`).

## 3. Components (from `_shared/email-brand.ts`)

- `brandedEmail({ heading?, bodyHtml, cta?, afterHtml?, footerHtml?, showFallbackUrl? })`
  — full HTML document (header + body + button + fallback + footer).
- `brandedText({ heading?, lines, cta?, afterLines?, footerLines? })`
  — plain-text mirror. **Always send both HTML and text.**
- `brandEsc(value)` — HTML-escape every dynamic value (name, URLs).

Component order: header → optional heading → body → CTA button (+ fallback URL) →
`afterHtml` → footer.

## 4. Transactional vs promotional variants

- **Transactional** (event reminders, confirmations, receipts, onboarding): relates
  only to what the recipient registered for/bought. No third-party offers. Allowed
  without marketing consent. Sender identity must match the product
  (e.g. `Xyra Mendoza <xyra@getassistara.com>`).
- **Promotional** (Academy sales, discounts, "apply now"): requires a recorded
  **marketing-consent** basis. **Masterclass registration alone is NOT consent.**
  Check `masterclass_signups`/`contacts` for a consent field/table; if none exists,
  treat as **no consent** and do not send. Keep promotional emails in separate
  campaigns from reminders.

## Permanent sender and signature conventions

- General Assistara confirmations and administrative emails: display name **Assistara**, signature **The Assistara Team 💛**.
- Academy communications and masterclass reminders: display name **Assistara Academy**, signature **The Assistara Team 💛**.
- Explicitly approved personal messages (such as the already-sent day-before masterclass reminder) may instead use **Xyra 💛**. Do not apply Xyra's personal signature by default.
- The exact team signature is **The Assistara Team 💛**, including the yellow heart, in **both HTML and plain text**. Never omit the heart.
- Use only existing verified From email addresses; the display name and From address are separate settings. Preserve the approved copy, schedules, suppression rules, and delivery routing.

## 5. Personalization & fallbacks

- First name: `(signup.name || "there").split(/\s+/)[0]` → fallback `"there"`.
- Escape all dynamic values with `brandEsc`.
- Every link (join URL, unsubscribe) must be the recipient's own token link.
- Reminder/join links: `${SITE}/live?t=<attendee_token>`;
  calendar: `${SITE}/masterclass.ics?action=calendar&t=<token>`.

## 6. Unsubscribe

- Footer must include a working unsubscribe link: `${SITE}/unsubscribe?t=<token>`.
- Eligibility always excludes `unsubscribed_at IS NOT NULL`.
- The confirm page (`assistara-local-v9/unsubscribe.html`) accepts 32–64 hex tokens;
  POST-only (`/unsubscribe` proxy → `masterclass-reminder`).
- Promotional emails must include unsubscribe; transactional emails should too.

## 7. Compatibility & responsive

- Table-based layout (`role="presentation"`), inline CSS only, no `<style>` blocks.
- `max-width:600px` card, `width="100%"`, mobile-safe padding (`28px 12px` outer).
- Avoid background images, flexbox, and remote assets. Use web-safe fonts.
- Test in Gmail, Outlook, and mobile (Outlook ignores `border-radius`/`max-width`
  gracefully; the table fallback keeps it readable).

## 8. Preview & test

- **Guard tests:** `node --test scripts/email-branding.test.js` (16 checks: no remote
  images, brand mark, fallback URLs, canonical senders). Must pass before deploy.
- **Render preview:** bundle the template functions with `npx esbuild` (stub
  `Deno.env`), write `.html`, and open it. See the render harness pattern in the
  repo's history (slice at `Deno.serve`, append `export { ... }`).
- **Single test send:** use the function's `*_test` actions with a `[TEST]` subject
  prefix and a `test:` idempotency key. Never trigger a bulk send in testing.
- **Deploy:** `npx supabase functions deploy <name> --no-verify-jwt`.

## 9. Reuse, don't duplicate

1. Import `brandedEmail`/`brandedText` — do not paste shell HTML.
2. Route all sending through `createEmailDelivery()` (Resend → Brevo → Sender.net,
   quota + idempotency + logging). Do not call provider APIs directly.
3. Use a unique, stable idempotency key per campaign per recipient
   (e.g. `reminder30-2026-10-11:<signup_id>`). Never reuse a key across campaigns.
4. Log to `email_delivery_log` with `email_type` naming the campaign.
5. Reconcile quotas (`syncQuotaInternal`) before bulk sends; never exceed real limits.

## Campaign registry (current)

| Campaign | Action | Key | Template |
|----------|--------|-----|----------|
| 24h reminder | `run` | `founding-masterclass-2026:<id>` | plain personal |
| Academy follow-up | `followup` | `academy-followup-2026-10-12:<id>` | plain personal |
| 30-min reminder | `reminder30` | `reminder30-2026-10-11:<id>` | branded |
| 7-min reminder | `reminder7` | `reminder7-2026-10-11:<id>` | branded |
