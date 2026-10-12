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
agent — MUST use **one shared persistent browser profile**. Never create a temporary,
isolated, incognito or per-session profile.

1. **Profile directory (single source of truth)**
   `%USERPROFILE%\.cache\opencode\playwright-profile` (on this machine:
   `C:\Users\jesse\.cache\opencode\playwright-profile`).

   It lives **outside** the Git repository on purpose and must never be committed, copied to
   the repository, reset, or deleted.

2. **Canonical configuration** — `%USERPROFILE%\.config\opencode\opencode.jsonc`, under the
   top-level `mcp` key (server names are keys **directly** under `mcp`; there is no `servers`
   wrapper). This is the one and only place the browser profile is declared:

   ```jsonc
   "mcp": {
     "playwright": {
       "type": "local",
       "command": [
         "npx",
         "@playwright/mcp@0.0.83",
         "--executable-path",
         "C:\\Users\\jesse\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
         "--user-data-dir",
         "C:\\Users\\jesse\\.cache\\opencode\\playwright-profile",
         "--headed"
       ]
     }
   }
   ```

   The explicit absolute `--user-data-dir` is what makes every session and every working
   directory reuse the same profile. Without it `@playwright/mcp` defaults to
   `%USERPROFILE%\AppData\Local\ms-playwright\mcp-{channel}-{sha256(cwd)[0:7]}`, which
   produces a **different profile per project**.

3. **Required rules for every session**
   - Reuse `C:\Users\jesse\.cache\opencode\playwright-profile`. Never point automation at a
     different, new, or per-session directory.
   - NEVER pass `--isolated` (it keeps the profile in memory and creates a throwaway profile).
   - NEVER use incognito/temporary profiles or `%TEMP%\playwright_chromiumdev_profile-*`.
   - NEVER delete, reset, clear or "clean" the profile directory.
   - Only ONE browser instance may hold the profile at a time. If it is already in use,
     reuse the running browser (`--cdp-endpoint`) instead of launching a competing instance.
   - NEVER copy cookies, sessions or credentials between profiles. Sign in again instead.
   - Never write credentials, cookies or tokens into source, config or documentation.

4. **Desktop app browser is not the persistent profile.** The `browser.*` tools in the
   OpenCode desktop app drive the app's own embedded Electron browser, which uses
   `%APPDATA%\ai.opencode.desktop` and keeps page storage **in memory** (its on-disk cookie
   store is not written). Logins there do not survive an app restart. Durable provider
   logins belong in the Playwright profile above.

5. **Verification** — the authentication health check:

   ```
   node scripts/browser-auth-health.mjs            # report, exit 0
   node scripts/browser-auth-health.mjs --strict   # exit 1 when a provider is signed out
   node scripts/browser-auth-health.mjs --json     # machine readable
   ```

   It is read-only: it loads each dashboard and reports the sign-in status. It never signs
   in, never signs out, never changes settings, never clears cookies or storage, and never
   prints credentials. Run it before provider-facing work, and after any OpenCode restart.


