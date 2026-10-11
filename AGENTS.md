# Assistara source-of-truth rule

All Assistara website work must be made only in `assistara-local-v9/`.

Do not create, restore, or edit a separate website, `vercel.json`, Admin page, Academy page, or static assets at the repository root. The Vercel Root Directory is `assistara-local-v9`.

## Assistara font rule (PERMANENT — NON-NEGOTIABLE)

**Manrope is the ONLY official font for all Assistara websites and Admin interfaces.** This rule is permanent and applies to every current and future OpenCode session.

1. **Enforce in all instructions**: `AGENTS.md`, design-system docs, brand guidelines, and any project instructions must specify Manrope exclusively. Remove any conflicting DM Sans, Inter, Arial or other font-family declarations.
2. **Canonical configuration**: Use one shared Manrope font configuration across the project. The canonical setup is:
   - Google Fonts: `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap`
   - CSS custom property: `--font-family: "Manrope", sans-serif;`
   - Lock file: `/manrope-lock.css` (preloaded in all Admin pages)
3. **Remove conflicting fonts**: Eliminate all `font-family` declarations that reference DM Sans, Inter, Arial or any non-Manrope font — including legacy styles, inline styles, `!important` rules and Shadow DOM overrides.
4. **Render everywhere**: All headings, body text, buttons, inputs, tables, charts, modals, navigation and embedded tools must actually render in Manrope. Verify computed styles AND actual rendered font faces in the browser.
5. **Automated tests**: Tests must FAIL if another font is introduced or Manrope fails to load. Do not remove or weaken these font checks to make tests pass.
6. **Release QA**: Include a browser-based rendered-font check in release QA. Verify the actual font face, not just CSS declarations. Any deployment that fails Manrope verification MUST be blocked.
7. **Future sessions**: Every future OpenCode session must follow this rule through `AGENTS.md`. No exceptions.

# Assistara email rule

For ANY Assistara email work — creating, editing, rendering, previewing, testing or sending transactional or promotional emails (masterclass reminders, registration confirmations, Academy emails, payment receipts) — **load the `assistara-email-branding` skill first** and follow it.

- Reuse the canonical branded shell via `supabase/functions/_shared/email-brand.ts` (`brandedEmail` / `brandedText`). Never invent a new design or paste shell HTML.
- Route all sending through `supabase/functions/_shared/email-delivery.ts` (`createEmailDelivery`): Resend → Brevo → Sender.net, with quota reconciliation, idempotency and delivery logging.
- Emails must not load remote images; use the email-safe brand mark. `node --test scripts/email-branding.test.js` must pass before deploy.
- Masterclass registration is **not** marketing consent. Promotional emails require a recorded consent basis; when none exists, do not send.

