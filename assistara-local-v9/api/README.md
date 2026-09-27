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

`/api/admin-application-answers` returns the answers an applicant submitted on
the Academy application form, for the applications whose ids are posted to it.
`public.academy_applications` has no anon or authenticated grant, so the row is
read here with the service role and only after the caller's Admin token has been
verified with the same HMAC check described above. A request with no valid Admin
token, a disallowed `Origin`, an unsupported method, or an unusable id is refused
before the database is contacted, and the response is always `no-store`. The
function never widens a grant or an RLS policy and never returns the service key.

`api/_academy-application-fields.js` is the single source of truth for the
applicant-facing questions: their order, their wording, and the exact label for
any choice the form stores as a machine token. It is sent to the Admin page with
the answers, so the wording is defined once and cannot drift from the form.

The list is a closed allowlist of the seven questions the applicant actually
answers. The row is read with `select=*` and then projected through that
allowlist, so only the questions are returned. Ids, timestamps, acquisition and
tracking metadata, internal status, internal notes, and any column added to the
table later are discarded server-side and never reach the browser. Adding a
question to the form therefore means deliberately adding it to that file.

Offline security tests:

```sh
node --test api/security.test.js
node --test api/admin-application-answers.test.js
```
