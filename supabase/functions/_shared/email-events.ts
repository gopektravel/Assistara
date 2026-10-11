// ----------------------------------------------------------------------------
// Canonical provider event ingestion (SHARED, dependency-free, unit-testable).
//
// Responsibilities:
//   * Verify that an inbound provider webhook is authentic (signed with a real
//     secret) — unsigned/unverifiable payloads are rejected, never trusted.
//   * Normalize Resend / Brevo / Sender webhook payloads into ONE canonical
//     event shape stored in public.email_events.
//   * Produce a stable, collision-resistant dedup key so a provider retry of the
//     same event can never inflate counts.
//
// This module performs no I/O and reads no secrets, so it can be executed
// directly by the Node test suite (bundled with esbuild).
// ----------------------------------------------------------------------------

export type EmailProvider = "resend" | "brevo" | "sender";

export type CanonicalEventType =
  | "queued"
  | "accepted"
  | "delivered"
  | "deferred"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "unsubscribed"
  | "failed";

export interface NormalizedEvent {
  provider: EmailProvider;
  eventType: CanonicalEventType;
  providerMessageId: string | null;
  recipientEmail: string | null;
  providerEventId: string | null;
  eventTimestamp: string; // ISO 8601
  dedupKey: string;
  reliability: "measured";
  source: "provider_webhook";
  rawType: string;
  suppressionReason: "unsubscribe" | "bounce" | "complaint" | null;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Small crypto helpers
// ---------------------------------------------------------------------------
const enc = new TextEncoder();

function b64ToBytes(value: string): Uint8Array {
  let s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function hmacSha256Base64(secret: string, content: string): Promise<string> {
  return hmacSha256Base64Bytes(enc.encode(secret), content);
}

async function hmacSha256Base64Bytes(keyBytes: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(content));
  return bytesToB64(new Uint8Array(sig));
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

// Resend uses Svix. Secret looks like "whsec_<base64>"; the HMAC key is the raw
// base64 bytes. Signed content is "<svix-id>.<svix-timestamp>.<body>".
export async function verifyResendSignature(
  body: string,
  headers: Record<string, string>,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!secret) return false;
  const id = headers["svix-id"] || headers["svix_id"];
  const ts = headers["svix-timestamp"] || headers["svix_timestamp"];
  const sigHeader = headers["svix-signature"] || headers["svix_signature"];
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > toleranceSeconds) return false;

  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  // Svix key material is the base64-DECODED bytes of the secret (not its text);
  // decoding lossy binary as UTF-8 would corrupt the key, so use the raw bytes.
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    keyBytes = enc.encode(raw);
  }
  const expected = await hmacSha256Base64Bytes(keyBytes, `${id}.${ts}.${body}`);

  // Header can contain several space-separated "version,signature" pairs.
  return sigHeader
    .split(" ")
    .map((part) => part.split(",")[1] || part)
    .some((candidate) => timingSafeEqual(candidate.trim(), expected));
}

// Brevo and Sender do not sign payloads; they let you append a shared token to
// the webhook URL (and/or send a custom header). A configured secret is
// mandatory, so an unverified endpoint can never mark events as trusted.
export function verifySharedSecret(provided: string | null | undefined, secret: string): boolean {
  if (!secret) return false;
  if (!provided) return false;
  return timingSafeEqual(String(provided), secret);
}

export async function verifyWebhook(
  provider: EmailProvider,
  body: string,
  headers: Record<string, string>,
  secrets: { resend?: string; brevo?: string; sender?: string },
  query: Record<string, string> = {},
): Promise<boolean> {
  if (provider === "resend") return verifyResendSignature(body, headers, secrets.resend || "");
  const provided =
    query.secret ||
    query.token ||
    headers["x-webhook-secret"] ||
    headers["x-brevo-token"] ||
    headers["x-sender-token"] ||
    null;
  if (provider === "brevo") return verifySharedSecret(provided, secrets.brevo || "");
  return verifySharedSecret(provided, secrets.sender || "");
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
const MAPS: Record<EmailProvider, Record<string, CanonicalEventType>> = {
  resend: {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "deferred",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.failed": "failed",
    "email.scheduled": "queued",
  },
  brevo: {
    request: "queued",
    delivered: "delivered",
    opened: "opened",
    unique_opened: "opened",
    click: "clicked",
    hard_bounce: "bounced",
    soft_bounce: "deferred",
    bounce: "bounced",
    deferred: "deferred",
    spam: "complained",
    complaint: "complained",
    unsubscribed: "unsubscribed",
    blocked: "failed",
    error: "failed",
    invalid_email: "bounced",
  },
  sender: {
    send: "accepted",
    sent: "accepted",
    accepted: "accepted",
    delivered: "delivered",
    open: "opened",
    opened: "opened",
    unique_open: "opened",
    click: "clicked",
    clicked: "clicked",
    bounce: "bounced",
    hard_bounce: "bounced",
    soft_bounce: "deferred",
    spam: "complained",
    complaint: "complained",
    unsubscribe: "unsubscribed",
    unsubscribed: "unsubscribed",
    error: "failed",
    failed: "failed",
  },
};

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickRawType(provider: EmailProvider, payload: any): string {
  if (provider === "resend") return String(payload?.type || "");
  return String(payload?.event ?? payload?.type ?? payload?.event_type ?? payload?.kind ?? "");
}

function pickMessageId(provider: EmailProvider, payload: any): string | null {
  const d = payload?.data ?? payload;
  return pickString(
    d?.email_id,
    d?.message_id,
    d?.messageId,
    d?.["message-id"],
    payload?.email_id,
    payload?.message_id,
    payload?.messageId,
    payload?.["message-id"],
  );
}

function pickRecipient(provider: EmailProvider, payload: any): string | null {
  const d = payload?.data ?? payload;
  const to = d?.to ?? payload?.to ?? d?.email ?? payload?.email;
  if (Array.isArray(to)) return to.length ? String(to[0]).trim().toLowerCase() : null;
  return to ? String(to).trim().toLowerCase() : null;
}

function parseTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: seconds vs milliseconds.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function pickTimestamp(provider: EmailProvider, payload: any): string {
  const d = payload?.data ?? payload;
  return parseTimestamp(
    d?.created_at ?? payload?.created_at ?? d?.ts ?? payload?.ts ?? d?.timestamp ?? payload?.timestamp ?? payload?.date,
  );
}

function suppressionFor(
  provider: EmailProvider,
  eventType: CanonicalEventType,
  rawType: string,
  payload: any,
): NormalizedEvent["suppressionReason"] {
  if (eventType === "unsubscribed") return "unsubscribe";
  if (eventType === "complained") return "complaint";
  if (eventType === "bounced") {
    const d = payload?.data ?? payload;
    const detail = `${rawType} ${d?.bounce?.type ?? ""} ${d?.bounce_type ?? ""} ${d?.reason ?? ""}`.toLowerCase();
    // Only permanent/hard bounces suppress future sending. Transient/soft
    // bounces are retried by the provider and must never suppress.
    if (/hard|permanent|invalid|reject|blocked|suppress/.test(detail)) return "bounce";
    if (provider === "brevo" && /invalid_email/.test(rawType.toLowerCase())) return "bounce";
    return null;
  }
  return null;
}

export function normalizeProviderEvent(provider: EmailProvider, payload: any): NormalizedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const rawType = pickRawType(provider, payload);
  if (!rawType) return null;
  const eventType = MAPS[provider]?.[rawType.toLowerCase()];
  if (!eventType) return null;

  const providerMessageId = pickMessageId(provider, payload);
  const recipientEmail = pickRecipient(provider, payload);
  const eventTimestamp = pickTimestamp(provider, payload);
  const explicitId = pickString(payload?.id, payload?.event_id, payload?.["event-id"], (payload?.data ?? {}).email_id ? null : null);

  const providerEventId = provider === "resend" ? explicitId : explicitId;
  const dedupKey = providerEventId
    ? `${provider}:id:${providerEventId}`
    : `${provider}:h:${providerMessageId || "?"}|${eventType}|${eventTimestamp}|${recipientEmail || "?"}`;

  return {
    provider,
    eventType,
    providerMessageId,
    recipientEmail,
    providerEventId,
    eventTimestamp,
    dedupKey,
    reliability: "measured",
    source: "provider_webhook",
    rawType,
    suppressionReason: suppressionFor(provider, eventType, rawType, payload),
    payload,
  };
}

// Resend's webhook body has no top-level id per event, but Svix delivers a unique
// svix-id header per delivery. The webhook handler passes it in so retries dedup.
export function withDeliveryId(event: NormalizedEvent, deliveryId: string | null): NormalizedEvent {
  if (!deliveryId || event.provider !== "resend") return event;
  return {
    ...event,
    providerEventId: deliveryId,
    dedupKey: `${event.provider}:id:${deliveryId}`,
  };
}
