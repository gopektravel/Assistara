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

# Assistara browser automation rule

All Assistara browser automation — in every current and future OpenCode session, for every
agent — MUST use **the browser integrated into the OpenCode desktop interface** (the
`browser.*` tools, one shared in-app context). Do **not** launch external Chrome, Edge or
Chromium windows, and do **not** start a Playwright/MCP browser, for Assistara work.

1. **Preferred browser (single source of truth)**

   The **OpenCode integrated browser**, driven exclusively by the `browser.*` tools. It runs
   inside the desktop app and uses the app's own profile at `%APPDATA%\ai.opencode.desktop`.
   It is the **only** approved browser for Assistara dashboards (Resend, Brevo, Supabase,
   Sender.net) and for the Assistara Admin UI (Command Center, Template Studio).

   A human may sign in to the Assistara Admin UI directly in this browser; that session is
   stored client-side and is reused by the agent. Never ask for or accept a password in chat.

2. **Never launch external browser windows**

   - No `npx @playwright/mcp … --headed`, no `--user-data-dir` Playwright launches, no
     external Chromium remote-debugging windows.
   - No `--isolated`, no incognito/temporary profiles, no `%TEMP%\playwright_chromiumdev_profile-*`.
   - Rationale: external windows previously broke provider OAuth (Google) and produced a
     different profile per working directory. Provider logins belong in the integrated browser.

3. **One browser, one profile**

   - Only ONE browser instance may hold the profile at a time; reuse the running integrated
     browser instead of launching a competing instance.
   - Never create, reset, clear or "clean" a profile directory, and never delete cookies or
     storage as a diagnostic.
   - Never copy cookies, sessions or credentials between profiles or machines. Sign in again
     instead.
   - Never write credentials, cookies or tokens into source, config or documentation.

4. **Session persistence (what to expect)**

   - The integrated browser keeps page **localStorage** on disk for the running app, so
     localStorage-backed sessions — Supabase dashboard and the Assistara Admin session
     (`assistara_admin_token`, 2-hour server-side expiry) — survive page reloads and tab
     close/reopen.
   - Its Chromium **cookie** store is flushed lazily, so cookie-backed provider logins
     (Resend, Brevo) may need re-authentication after an app restart. Do not make restarting an
     authenticated browser a routine step; if a login is lost, sign in again in the integrated
     browser — never by copying session data.

5. **Deprecated — do not use**

   `scripts/browser-login.mjs`, `scripts/browser-auth-health.mjs` and the profile at
   `%USERPROFILE%\.cache\opencode\playwright-profile` are **retired**: they drive an external
   Playwright window. Do not run them for Assistara work. (Kept in the repo only for historical
   reference; safe to delete.)

6. **Verification**

   Run the authentication health check by loading each dashboard in the integrated browser and
   reading its sign-in state from the page. A health check never signs in, never signs out,
   never changes settings, never clears cookies or storage, and never prints credentials.


