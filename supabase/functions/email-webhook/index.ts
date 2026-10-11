import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  normalizeProviderEvent,
  withDeliveryId,
  verifyWebhook,
  type EmailProvider,
} from "../_shared/email-events.ts";

// ----------------------------------------------------------------------------
// Inbound email provider webhook receiver (Resend / Brevo / Sender).
//
// Security & correctness:
//   * A configured signing secret is REQUIRED. Payloads that fail verification
//     are recorded (verified=false) and rejected with 401 — never processed.
//   * Every receipt is deduplicated by a stable dedup_key, so a provider retry
//     (or a duplicate Svix delivery) is acknowledged with 200 and ignored.
//   * Events are written to the canonical email_events store and folded into the
//     logical message via the email_apply_event RPC. Fallback providers cannot
//     double-count because each message is bound to exactly one provider message
//     id.
//
// This function must never be classified as an outbound sender, so it imports
// only _shared/email-events and does not reference any provider send endpoint.
// ----------------------------------------------------------------------------

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROVIDERS: EmailProvider[] = ["resend", "brevo", "sender"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function lowerHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function resolveProvider(req: Request, url: URL, body: any): EmailProvider | null {
  const seg = url.pathname.split("/").filter(Boolean).pop();
  const candidates = [
    url.searchParams.get("provider"),
    seg,
    body?.provider,
    body?.source,
  ];
  for (const c of candidates) {
    const v = String(c || "").toLowerCase();
    if ((PROVIDERS as string[]).includes(v)) return v as EmailProvider;
  }
  // Infer from payload shape as a last resort.
  if (typeof body?.type === "string" && body.type.startsWith("email.")) return "resend";
  if (typeof body?.event === "string" && /bounce|spam|click|open/.test(body.event)) return null;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const raw = await req.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const provider = resolveProvider(req, url, body);
  if (!provider) return json({ ok: false, error: "unknown_provider" }, 400);

  const headers = lowerHeaders(req);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const verified = await verifyWebhook(
    provider,
    raw,
    headers,
    {
      resend: Deno.env.get("RESEND_WEBHOOK_SECRET") || "",
      brevo: Deno.env.get("BREVO_WEBHOOK_SECRET") || "",
      sender: Deno.env.get("SENDER_WEBHOOK_SECRET") || "",
    },
    query,
  );

  let event = normalizeProviderEvent(provider, body);
  if (event && provider === "resend") event = withDeliveryId(event, headers["svix-id"] || null);

  const rawHash = await sha256(raw);
  const eventKey = event?.dedupKey || `${provider}:raw:${rawHash}`;
  // A payload that fails verification is still recorded (verified=false) so the
  // Command Center can show "webhook not receiving / secret missing". But its
  // receipt key must NEVER collide with a genuine event key, otherwise that
  // rejected receipt would suppress the real event once the secret is later
  // configured and the provider retries it.
  const receiptKey = verified ? eventKey : `unverified:${provider}:${rawHash}`;

  // Idempotency gate. Insert the receipt first; a duplicate short-circuits.
  const receiptRes = await rest("email_webhook_events?on_conflict=dedup_key&select=id", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify([
      {
        provider,
        provider_event_id: event?.providerEventId || null,
        dedup_key: receiptKey,
        event_type: event?.eventType || null,
        verified,
        payload: body,
      },
    ]),
  });
  const receiptRows = await receiptRes.json().catch(() => []);
  const duplicate = Array.isArray(receiptRows) && receiptRows.length === 0;

  if (!verified) {
    return json({ ok: false, error: "unverified", provider, secret_missing: !secretFor(provider) }, 401);
  }
  if (duplicate) return json({ ok: true, duplicate: true, provider, event_type: event?.eventType || null });
  if (!event) return json({ ok: false, error: "unrecognized_event", provider, raw_type: body?.type ?? body?.event ?? null }, 400);

  // Resolve the logical message by provider message id.
  let delivery: any = null;
  if (event.providerMessageId) {
    const r = await rest(
      `email_delivery_log?provider=eq.${provider}&provider_message_id=eq.${encodeURIComponent(event.providerMessageId)}&select=id,campaign_key,email_type,recipient_email&order=created_at.desc&limit=1`,
    );
    const rows = await r.json().catch(() => []);
    delivery = Array.isArray(rows) ? rows[0] : null;
  }

  const eventRow = {
    delivery_log_id: delivery?.id || null,
    idempotency_key: null,
    campaign_key: delivery?.campaign_key || null,
    email_type: delivery?.email_type || null,
    recipient_email: event.recipientEmail || delivery?.recipient_email || null,
    provider,
    provider_message_id: event.providerMessageId,
    event_type: event.eventType,
    event_timestamp: event.eventTimestamp,
    source: event.source,
    reliability: event.reliability,
    provider_event_id: event.providerEventId,
    dedup_key: event.dedupKey,
    payload: event.payload,
  };

  const evRes = await rest("email_events?on_conflict=dedup_key&select=id", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify([eventRow]),
  });
  const evRows = await evRes.json().catch(() => []);
  const eventDuplicate = Array.isArray(evRows) && evRows.length === 0;

  if (!eventDuplicate && delivery?.id) {
    await rest("rpc/email_apply_event", {
      method: "POST",
      body: JSON.stringify({ p_delivery_log_id: delivery.id, p_event_type: event.eventType, p_ts: event.eventTimestamp }),
    });
  }

  if (event.suppressionReason) {
    const email = event.recipientEmail || delivery?.recipient_email || null;
    if (email) {
      await rest("email_suppressions?on_conflict=email", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([
          {
            email: String(email).toLowerCase(),
            reason: event.suppressionReason,
            provider,
            source: "webhook",
            detail: event.rawType,
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    }
  }

  await rest(`email_webhook_events?dedup_key=eq.${encodeURIComponent(receiptKey)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ processed: true }),
  });

  return json({ ok: true, provider, event_type: event.eventType, matched_message: !!delivery?.id });
});

function secretFor(provider: EmailProvider): boolean {
  const name =
    provider === "resend" ? "RESEND_WEBHOOK_SECRET" : provider === "brevo" ? "BREVO_WEBHOOK_SECRET" : "SENDER_WEBHOOK_SECRET";
  return !!Deno.env.get(name);
}

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
