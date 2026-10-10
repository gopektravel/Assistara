---
name: Assistara Email Branding
description: Use for ANY Assistara email work — creating, editing, rendering, previewing, testing or sending transactional/promotional emails (masterclass reminders, registration confirmations, Academy acceptance/onboarding, payment receipts, announcements). Load this before writing email HTML so every email shares the same premium Assistara identity without forcing every email into one layout.
---

# Assistara Email Branding

The single source of truth for Assistara email design and delivery. Every branded
email must **instantly look and feel like the same premium brand** — but each email
keeps its **own content, structure and CTA**. Reuse the canonical renderer and the
official logo; never invent a new design.

## 1. Golden rules

1. **Reuse, never duplicate.** Import the shared renderer; do not paste shell HTML.
2. **ALWAYS use the official logo asset** (see §2). **NEVER** replace it with a
   letter, emoji, placeholder, or a recreated shape.
3. Keep the **permanent identity** (§4) on every email: black header + real logo +
   white wordmark, white rounded card, yellow/black/white/warm-neutral palette,
   Arial, bold yellow rounded buttons, warm personal voice, minimal footer.
4. Everything in §5 (countdowns, banners, dates, join buttons, signatures) is
   **optional** and used only when it fits the email.
5. Route all sending through the shared delivery router; never call provider APIs
   directly. Respect quotas, idempotency and consent.

## 2. Sender identity & signatures (by purpose)

| Email purpose | Sender display name | Signature |
|---------------|---------------------|-----------|
| General Assistara (registration confirmations, notifications, admin) | `Assistara` | The Assistara Team 💛 |
| Academy / masterclass (reminders, enrollment, decisions) | `Assistara Academy` | The Assistara Team 💛 |
| **Personal day-before masterclass reminder** (Xyra's own) | `Assistara Academy` | `Xyra 💛` |
| 30-minute reminder | `Assistara Academy` | The Assistara Team 💛 |
| 7-minute reminder | `Assistara Academy` | The Assistara Team 💛 |

- **Signatures are chosen by email purpose**, not hardcoded into every template.
- **The team signature is always exactly `The Assistara Team 💛`** (with the yellow
  heart) in both the HTML and plain-text versions.
- **Only the personal day-before masterclass reminder is signed by Xyra.** Never
  auto-insert her name, and never sign other emails as Xyra.
- **From address:** the verified `xyra@getassistara.com` on the verified
  `getassistara.com` domain (Resend, Brevo and Sender.net all authenticate the
  domain). Set the display name per-send with the `fromName` option on
  `createEmailDelivery().send(...)` — do **not** hardcode "Xyra from Assistara".
- Keep the tone warm, professional and friendly; use emojis sparingly (avoid too
  many hearts/exclamation marks, artificial urgency, or overly promotional copy).

## 3. Canonical renderer & official logo

| Component | Location |
|-----------|----------|
| **Shared renderer (use this)** | `supabase/functions/_shared/email-brand.ts` → `brandedEmail()`, `brandedText()`, `brandEsc()`, `countdownBand()`, `infoCard()`, `banner()`, `para()`, `LOGO_URL` |
| Delivery / provider routing | `supabase/functions/_shared/email-delivery.ts` → `createEmailDelivery()` |
| Reference implementations | `website-form/index.ts` (`frame()`), `admin-applications/index.ts` + `admin-send-onboarding/index.ts` + `payment-complete/index.ts` (`shell()`) |
| Masterclass reminders | `supabase/functions/masterclass-reminder/index.ts` |

**Official logo:** `https://www.getassistara.com/assistara-logo.png` — the yellow
rounded-square "A" mark (absolute HTTPS, public). Use `LOGO_URL` from the shared
module (do not hardcode a copy). `assistara-logo.svg` is web-only — **Gmail does not
render SVG**, so use the PNG. It is the **only remote image allowed** in email HTML
(enforced by `scripts/email-branding.test.js`).

## 4. Permanent identity (keep on every email)

- **Header:** black `#171717`, padding `20px 32px`; **real logo** (42×42, original
  aspect) + white wordmark `Assistara` (`#fff`, 23px, bold). Do not add a second
  wordmark image — the wordmark is text next to the logo.
- **Container:** white card `#fff`, border `1px solid #e2dfd7`, `border-radius:24px`,
  `max-width:600px`, on a warm neutral page background `#f4f3ef`; generous spacing.
- **Colors:** Assistara yellow `#ffd51f`, black `#171717`/`#151515`, white `#fff`,
  warm neutrals (`#f4f3ef`, `#faf9f5`, `#ece9e2`, text `#4f4b45`, muted `#77716a`).
- **Typography:** `Arial, Helvetica, sans-serif` (email-safe). Body `16px`/`1.65`
  `#4f4b45`; headings `32px`. (Site uses DM Sans; **emails use Arial**.)
- **Buttons:** bold yellow `#ffd51f`, black `#151515` text, `border-radius:999px`,
  `padding:15px 21px`, `font-weight:700`. Always include a plain-text fallback URL.
- **Personalization:** friendly greeting with the recipient's first name.
- **Writing style:** warm, personal, exciting, concise. Natural emojis, especially
  💛. Never corporate, generic, or robotic.
- **Footer:** minimal and clean — `border-top:1px solid #ece9e2`, `12px` `#77716a`,
  with unsubscribe and any required legal/identity info.
- **Mobile:** fully responsive (table-based, `width="100%"`, `max-width:600px`).
- **Compatibility:** Gmail, Outlook, Apple Mail, mobile — inline CSS only, no remote
  images except the logo, no background images, web-safe fonts.

## 5. Reusable components (from `_shared/email-brand.ts`)

- `brandedEmail({ heading?, bodyHtml, cta?, afterHtml?, footerHtml?, showFallbackUrl?, countdownHtml? })`
  — the full document: header + logo + (heading) + (optional band) + body + button
  (+ fallback URL) + `afterHtml` + footer.
- `brandedText({ heading?, lines, cta?, afterLines?, footerLines? })` — plain-text
  mirror. **Always send both HTML and text.**
- `brandEsc(v)` — escape every dynamic value (name, URLs).
- `para(html)` — a branded body paragraph.
- `infoCard([{ label, value }])` — warm card for structured details (date, time,
  amount, reference).
- `banner(text, tone?)` — short announcement/eyebrow band (`yellow` or `dark`).
- `countdownBand({ big, label, meta? })` — **static** branded countdown band.

## 6. Flexible content (OPTIONAL — not part of the identity)

Use these only when appropriate; they are **not** required:

- Countdown banners / "30 minutes to go" / "starting soon" bands
- Event dates, times, timezones
- Masterclass-specific copy and livestream join buttons
- Announcement banners, info cards, extra CTAs
- A specific signature (e.g. "Xyra 💛") — only for emails actually sent by that
  person; other senders use their own name/sign-off.

**Countdown rule:** never use a live/JS/dynamic countdown **image** in email — Gmail
proxies and caches images, so it would be stale or show wrong/negative time. Use the
**static** `countdownBand(...)`. A real, updating countdown belongs on the **web
page only** (the livestream page runs `setInterval(tick, 1000)`). Never claim an
email countdown is "live" unless it genuinely updates reliably.

## 7. Transactional vs promotional

- **Transactional** (reminders, confirmations, receipts, onboarding): relates only
  to what the recipient registered for/bought. Allowed without marketing consent.
- **Promotional** (Academy sales, discounts, "apply now"): requires a recorded
  **marketing-consent** basis. **Registration alone is NOT marketing consent.** Check
  `masterclass_signups`/`contacts` for a consent field/table; if none exists, treat
  as **no consent** and do not send. Keep promotional campaigns separate.

## 8. Personalization & unsubscribe

- First name: `(signup.name || "there").split(/\s+/)[0]` → fallback `"there"`.
- Escape all dynamic values with `brandEsc`. Every link must be the recipient's own
  token link.
- Footer must include a working unsubscribe link: `${SITE}/unsubscribe?t=<token>`;
  eligibility always excludes `unsubscribed_at IS NOT NULL`.

## 9. Compatibility & responsive

- Table layout (`role="presentation"`), inline CSS only, no `<style>` blocks.
- `max-width:600px` card; mobile-safe outer padding `28px 12px`.
- No remote images except the official logo; no background images; web-safe fonts.
- Verify Gmail, Outlook, Apple Mail and mobile.

## 10. Preview & test

- **Guard tests:** `node --test scripts/email-branding.test.js` — must pass before
  deploy (includes: official logo only, absolute HTTPS, no recreated "A", fallback
  URLs, canonical senders).
- **Render preview:** bundle the template functions with `npx esbuild` (stub
  `Deno.env`), write `.html`, open it; also produce the plain-text version.
- **Single test send:** use the function's `*_test` actions with a `[TEST]` subject
  prefix and a `test:` idempotency key. Never trigger a bulk send while testing.
- **Deploy:** `npx supabase functions deploy <name> --no-verify-jwt`.

## 11. Reuse rules

1. Import `brandedEmail`/`brandedText` (+ optional components) — never paste HTML.
2. Route sending through `createEmailDelivery()` (Resend → Brevo → Sender.net, with
   quota + idempotency + logging). Do not call provider APIs directly.
3. One **unique, stable** idempotency key per campaign per recipient
   (e.g. `reminder30-2026-10-11:<signup_id>`). Never reuse a key across campaigns.
4. Log to `email_delivery_log` with an `email_type` naming the campaign.
5. Reconcile quotas (`syncQuotaInternal`) before bulk sends; never exceed real limits.

## 12. Worked examples (same identity, different content)

- **Masterclass reminder:** heading/body copy + `countdownBand` + yellow "JOIN"
  button + unsubscribe footer.
- **Academy acceptance:** heading "You're IN!" + body + `infoCard` (cohort/next
  steps) + yellow "Set up my account" button + footer.
- **Onboarding:** greeting + short steps + "Create my Academy account" button +
  fallback URL + footer.
- **General announcement:** `banner("NEW")` + heading + a couple of paragraphs +
  optional single CTA + footer.

Each keeps the black header + real logo + white card + yellow button + minimal
footer, but the copy, components and CTA are chosen per email.

## Campaign registry (current)

| Campaign | Action | Key | Template | Sender | Signature |
|----------|--------|-----|----------|--------|-----------|
| 24h reminder | `run` | `founding-masterclass-2026:<id>` | plain personal | Assistara Academy | Xyra Mendoza |
| Academy follow-up | `followup` | `academy-followup-2026-10-12:<id>` | plain personal | Xyra (approved) | Xyra 💛 |
| 30-min reminder | `reminder30` | `reminder30-2026-10-11:<id>` | branded (visual reference) | Assistara Academy | The Assistara Team 💛 |
| 7-min reminder | `reminder7` | `reminder7-2026-10-11:<id>` | branded | Assistara Academy | The Assistara Team 💛 |
