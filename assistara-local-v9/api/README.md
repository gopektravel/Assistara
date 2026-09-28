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

The Test Portal cookie contains no Admin token. `/api/test-portal-session`
confirms the caller's Admin token with the `admin-api` Edge Function — the only
holder of the key that signs it — through its `session-check` action, which sits
directly behind the same `verifyToken()` gate as every other Admin action and
returns nothing. Only then is a short-lived QA session minted, sealed with
`ACADEMY_COOKIE_SECRET` and marked `aud: "academy-test-portal"`. Every later
QA request is authorized by unsealing that cookie, so the QA gate never needs a
second copy of the Admin signing key and a QA session can never be replayed as
an Admin credential. Before the confirmation is issued, the token must still be
the deployed two-segment unpadded-Base64URL `payload.signature` format with
`u === "admin"` and a future millisecond `exp`; anything else is refused without
a network call. The QA cookie does not grant learner access.

Local slide PDFs and existing Google Drive lesson PDFs are returned through the
learner gate. The Drive proxy serves only a PDF response from the existing file
ID; private/confirmation-page files fail closed. Existing Google Drive sharing
permissions are not changed by this code and must be reviewed before production.

Application Answers and Internal Notes are handled by the Supabase Edge Function
`admin-api`. Its actions use the existing `verifyToken()` check before any
Admin-only operation reaches the database. Browser code never receives the
Supabase service-role credential.

The Answers action reads only the canonical seven-field answer allowlist. Its
response includes the canonical `fields` schema and `applications` entries in
the form `{ id, answers, found }`; `answers` contains only those seven approved
fields, and missing requested applications are represented safely with
`found: false` and an empty `answers` object.

The Notes action has separate read and save operations for the private
`admin_notes` column only. Notes are private to Admin, and saving one cannot
change an application status, decision, payment, enrolment, or email behavior.

Offline security tests:

```sh
node --test api/security.test.js
node --test api/admin-application-answers.test.js
```
