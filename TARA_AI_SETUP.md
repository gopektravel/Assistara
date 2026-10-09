# Tara AI (analyze-opportunity) — runbook

Tara is the Client Finder coach. The browser calls the Supabase Edge Function
`analyze-opportunity`, which authenticates the caller, then asks an AI provider
for a structured JSON answer.

## Providers (verified live)

Configured priority order is read from `public.tara_provider_health`, defaulting to:

| Order | Provider  | Secret                | Model (default)          | Endpoint |
|-------|-----------|-----------------------|--------------------------|----------|
| 1     | Groq      | `GROQ_API_KEY`        | `openai/gpt-oss-20b`     | api.groq.com |
| 2     | Gemini    | `GEMINI_API_KEY`      | `gemini-3.8-flash`       | generativelanguage.googleapis.com |
| 3     | OpenRouter| `OPENROUTER_API_KEY`  | `openrouter/free`        | openrouter.ai |

Optional overrides: `GROQ_MODEL`, `GEMINI_MODEL`.

> Note: the provider is **Groq** (api.groq.com), not xAI "Grok". There is no
> `GROK_API_KEY` and none is required.

All three secrets already exist in the project. Model IDs were checked against the
live OpenRouter catalog and current Groq/Gemini docs.

## Authentication (do not weaken)

The function accepts either:

1. **Admin preview** — a body `{ admin_token, payload }`. The token is an
   HMAC-SHA256 token issued by `admin-api` (signed with the service-role key,
   `u:"admin"`, `v:ADMIN_TOKEN_VERSION`, 2h expiry).
2. **Learner** — a Supabase user JWT in the `Authorization: Bearer` header,
   validated with `auth.getUser()`.

If neither is valid the function returns `401 {"error":"Unauthorized"}` and
**never** falls back to a provider. Provider retries only happen for
provider-side failures (401/403/429/5xx/timeout/network).

## Fallback behaviour

- Per-provider timeout: 20s. Order is iterated once (deduplicated) — no infinite loops.
- On provider failure the function tries the next eligible provider within the same
  request and logs `tara_provider_fallback` (no secrets, no chat text).
- If every provider fails: `503` with a generic message. Raw provider errors are
  never returned to the browser.

## Self-healing provider prioritization

Order is persisted in `public.tara_provider_health` and updated after each request
(after the response is sent, via `EdgeRuntime.waitUntil`, best-effort):

- **Failure → bottom.** `tara_provider_failure(provider, category, retry_after)`
  increments `consecutive_failures`, sets `last_failed_at`, sets a persisted
  `cooldown_until`, and moves the provider to the bottom (`priority = max + 1`,
  then re-normalized to a dense 1..N).
- **Success → one step up.** `tara_provider_success(provider)` resets failures,
  clears the cooldown, sets `last_succeeded_at`, and swaps the provider with the
  one directly above it (gradual recovery).
- **Cooldown.** Temporary failures use exponential backoff (30s, 60s, 120s, … capped
  at 900s); a `Retry-After` header raises the cooldown when larger. Credential
  failures (`provider_auth`, HTTP 401/403) get a fixed 6h cooldown and are handled
  separately from temporary outages.
- **Eligibility.** Providers whose `cooldown_until` has not elapsed are skipped;
  once it elapses they are probed again. If every provider is cooling down (or the
  health table is unavailable/empty), the built-in default order is used so Tara
  still answers.
- **Concurrency.** Both RPCs take `pg_advisory_xact_lock(hashtext('tara_provider_health'))`
  so simultaneous requests cannot corrupt ordering.
- **Never for app auth.** Application/session authentication failures (401 from the
  auth gate) return before provider logic, so they never rotate providers.

## Deployment

```bash
cd "C:\Users\jesse\OneDrive\Documenten\Assistara Academy"
npx supabase functions deploy analyze-opportunity --project-ref jhmmwleejgidrxavzdlq --no-verify-jwt
```

Migrations applied directly (the repo has duplicate migration versions, so
`supabase db push` is not used):

- `202610090004_tara_provider_health_grants.sql` — service_role table grants.
- `202610090005_tara_provider_health_selfhealing.sql` — cooldown columns + RPCs.

Validate a migration before applying it by running the migration DDL plus
assertions inside a rolled-back transaction:

```bash
# combined = "begin;" + migration.sql + assertions.sql + "rollback;"
npx supabase db query --linked -f combined.sql
```

## Tests

```bash
deno test supabase/functions/analyze-opportunity/auth_test.ts \
          supabase/functions/analyze-opportunity/providers_test.ts \
          supabase/functions/analyze-opportunity/health_test.ts
```

## Diagnostics (server logs)

| Event | Meaning |
|-------|---------|
| `tara_auth_rejected` | No valid admin token and no valid user JWT. |
| `tara_provider_fallback` | A provider failed and the next one answered. |
| `tara_providers_exhausted` | All providers failed (includes status/category per provider). |
| `tara_invalid_json` | Provider answered but not with parseable JSON. |
| `tara_health_persist_failed` | Health RPC write failed (Tara still answered). |
| `tara_unhandled_error` | Unexpected error. |
