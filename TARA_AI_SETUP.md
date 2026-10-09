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
- On provider failure the function tries the next provider and logs
  `tara_provider_fallback` with provider/status/category (no secrets, no chat text).
- If every provider fails: `503` with a generic message. Raw provider errors are
  never returned to the browser.

## Deployment

```bash
cd "C:\Users\jesse\OneDrive\Documenten\Assistara Academy"
npx supabase functions deploy analyze-opportunity --project-ref jhmmwleejgidrxavzdlq
```

Apply the grant migration once (required for the configurable chain to work):

```bash
npx supabase db push   # applies 202610090004_tara_provider_health_grants.sql
```

## Tests

```bash
deno test supabase/functions/analyze-opportunity/auth_test.ts \
          supabase/functions/analyze-opportunity/providers_test.ts
```

## Diagnostics (server logs)

| Event | Meaning |
|-------|---------|
| `tara_auth_rejected` | No valid admin token and no valid user JWT. |
| `tara_provider_fallback` | A provider failed and the next one answered. |
| `tara_providers_exhausted` | All providers failed (includes status/category per provider). |
| `tara_invalid_json` | Provider answered but not with parseable JSON. |
| `tara_unhandled_error` | Unexpected error. |
