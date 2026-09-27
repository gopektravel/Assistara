# Academy server gate (local configuration)

The Vercel Functions in this directory fail closed unless these server-side
environment variables are set:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose it to browser code
- `ACADEMY_COOKIE_SECRET` — unique random secret, at least 32 characters
- `ACADEMY_ALLOWED_ORIGINS` — optional comma-separated exact-origin allowlist for trusted Vercel previews

The Academy cookie contains only an encrypted, short-lived Supabase access
token. Its expiry is capped by the signed Auth token expiry and renewed from
the existing browser Supabase session. Refresh tokens remain in the Supabase
client's existing storage and are not copied into the Academy cookie.

The Test Portal cookie contains an encrypted Admin token and is independently
validated using the Admin HMAC key and expiry. The verifier accepts only the
deployed two-segment unpadded-Base64URL `payload.signature` format:
HMAC-SHA256 is checked over the literal encoded payload segment, and
`u === "admin"` plus a future millisecond `exp` are required. It does not grant
learner access.

Local slide PDFs and existing Google Drive lesson PDFs are returned through the
learner gate. The Drive proxy serves only a PDF response from the existing file
ID; private/confirmation-page files fail closed. Existing Google Drive sharing
permissions are not changed by this code and must be reviewed before production.

Offline security tests:

```sh
node --test api/security.test.js
```
