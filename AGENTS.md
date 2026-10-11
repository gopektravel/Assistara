# Assistara source-of-truth rule

All Assistara website work must be made only in `assistara-local-v9/`.

Do not create, restore, or edit a separate website, `vercel.json`, Admin page, Academy page, or static assets at the repository root. The Vercel Root Directory is `assistara-local-v9`.

## Assistara font rule (PERMANENT — NON-NEGOTIABLE)

**Manrope is the ONLY official font for all Assistara websites and Admin interfaces.** This rule is permanent and applies to every current and future OpenCode session.

- Use the canonical `/manrope-lock.css` configuration and `--font-family: "Manrope", sans-serif`.
- Remove conflicting DM Sans, Inter, Arial, system-font and other intentional font-family declarations, including legacy and Shadow DOM overrides.
- All headings, body text, controls, tables, charts, modals, navigation and embedded tools must actually render in Manrope.
- Automated font tests and browser rendered-font QA are mandatory. Do not weaken font checks. A deployment that fails Manrope verification must be blocked.

# Assistara email rule

For ANY Assistara email work — creating, editing, rendering, previewing, testing or sending transactional or promotional emails (masterclass reminders, registration confirmations, Academy emails, payment receipts) — **load the `assistara-email-branding` skill first** and follow it.

- Reuse the canonical branded shell via `supabase/functions/_shared/email-brand.ts` (`brandedEmail` / `brandedText`). Never invent a new design or paste shell HTML.
- Route all sending through `supabase/functions/_shared/email-delivery.ts` (`createEmailDelivery`): Resend → Brevo → Sender.net, with quota reconciliation, idempotency and delivery logging.
- Emails must not load remote images; use the email-safe brand mark. `node --test scripts/email-branding.test.js` must pass before deploy.
- Masterclass registration is **not** marketing consent. Promotional emails require a recorded consent basis; when none exists, do not send.

