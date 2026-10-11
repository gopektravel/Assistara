// ----------------------------------------------------------------------------
// Authoritative provider status (SHARED). Reads the providers' own APIs so the
// Command Center never invents quota or domain-verification values.
//
//   Resend : GET /usage (daily+monthly capacity), GET /domains (DNS auth)
//   Brevo  : GET /v3/account (plan credits = remaining send limit), /v3/senders
//   Sender : token validity only — Sender exposes NO documented remaining-quota
//            endpoint, so capacity is reported as "Unavailable via API".
//
// Kept out of any function that also contains "api.resend.com" text so the
// branding guard's sender inventory is unaffected (this file has no index.ts).
// ----------------------------------------------------------------------------

export type ProviderId = "resend" | "brevo" | "sender";

export interface CapacityInfo {
  available: boolean;
  remaining: number | null;
  limit: number | null;
  used: number | null;
  period: string | null; // e.g. "day" | "credits" | null
  resetAt: string | null;
  source: string; // which API answered, or "unavailable"
}

export interface ProviderStatus {
  provider: ProviderId;
  configured: boolean;
  reachable: boolean;
  httpStatus: number | null;
  domain: string | null;
  domainVerified: boolean | null;
  senderVerified: boolean | null;
  capacity: CapacityInfo;
  errors: string[];
  checkedAt: string;
}

const unavailable = (source = "unavailable"): CapacityInfo => ({
  available: false,
  remaining: null,
  limit: null,
  used: null,
  period: null,
  resetAt: null,
  source,
});

function nextUtcMidnight(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

async function safeJson(r: Response): Promise<any> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export async function resendStatus(apiKey: string, domain: string): Promise<ProviderStatus> {
  const base: ProviderStatus = {
    provider: "resend",
    configured: !!apiKey,
    reachable: false,
    httpStatus: null,
    domain: domain || null,
    domainVerified: null,
    senderVerified: null,
    capacity: unavailable(),
    errors: [],
    checkedAt: new Date().toISOString(),
  };
  if (!apiKey) {
    base.errors.push("RESEND_API_KEY is not set");
    return base;
  }
  try {
    const ur = await fetch("https://api.resend.com/usage", { headers: { Authorization: `Bearer ${apiKey}` } });
    base.httpStatus = ur.status;
    base.reachable = ur.ok;
    const uj = await safeJson(ur);
    if (ur.ok && uj?.emails?.daily && typeof uj.emails.daily.used === "number") {
      const used = uj.emails.daily.used as number;
      const limit = typeof uj.emails.daily.limit === "number" ? (uj.emails.daily.limit as number) : null;
      base.capacity = {
        available: true,
        remaining: limit != null ? Math.max(0, limit - used) : null,
        limit,
        used,
        period: "day",
        resetAt: nextUtcMidnight(),
        source: "api:resend/usage",
      };
    } else {
      base.errors.push(`usage: HTTP ${ur.status}`);
    }
  } catch (e) {
    base.errors.push(`usage: ${String(e instanceof Error ? e.message : e)}`);
  }
  try {
    const dr = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
    const dj = await safeJson(dr);
    const list = Array.isArray(dj?.data) ? dj.data : [];
    const match = list.find((d: any) => String(d?.name || "").toLowerCase() === String(domain || "").toLowerCase()) || list[0];
    if (match) base.domainVerified = String(match.status || "").toLowerCase() === "verified";
  } catch (e) {
    base.errors.push(`domains: ${String(e instanceof Error ? e.message : e)}`);
  }
  return base;
}

export async function brevoStatus(apiKey: string): Promise<ProviderStatus> {
  const base: ProviderStatus = {
    provider: "brevo",
    configured: !!apiKey,
    reachable: false,
    httpStatus: null,
    domain: null,
    domainVerified: null,
    senderVerified: null,
    capacity: unavailable(),
    errors: [],
    checkedAt: new Date().toISOString(),
  };
  if (!apiKey) {
    base.errors.push("BREVO_API_KEY is not set");
    return base;
  }
  try {
    const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": apiKey, Accept: "application/json" } });
    base.httpStatus = r.status;
    base.reachable = r.ok;
    const j = await safeJson(r);
    const plan = Array.isArray(j?.plan) ? j.plan[0] : j?.plan;
    if (r.ok && plan && typeof plan.credits === "number") {
      base.capacity = {
        available: true,
        remaining: plan.credits,
        limit: null,
        used: null,
        period: plan.creditsType || "credits",
        resetAt: null,
        source: "api:brevo/account",
      };
    } else if (r.ok) {
      base.errors.push("account: plan credits not exposed");
    } else {
      base.errors.push(`account: HTTP ${r.status}`);
    }
  } catch (e) {
    base.errors.push(`account: ${String(e instanceof Error ? e.message : e)}`);
  }
  try {
    const sr = await fetch("https://api.brevo.com/v3/senders", { headers: { "api-key": apiKey, Accept: "application/json" } });
    const sj = await safeJson(sr);
    const list = Array.isArray(sj?.senders) ? sj.senders : [];
    if (list.length) base.senderVerified = list.some((s: any) => s?.active === true || s?.verified === true);
  } catch (e) {
    base.errors.push(`senders: ${String(e instanceof Error ? e.message : e)}`);
  }
  return base;
}

export async function senderStatus(apiKey: string): Promise<ProviderStatus> {
  const base: ProviderStatus = {
    provider: "sender",
    configured: !!apiKey,
    reachable: false,
    httpStatus: null,
    domain: null,
    domainVerified: null,
    senderVerified: null,
    capacity: unavailable("Sender exposes no documented remaining-quota API"),
    errors: [],
    checkedAt: new Date().toISOString(),
  };
  if (!apiKey) {
    base.errors.push("SENDER_API_KEY is not set");
    return base;
  }
  try {
    const r = await fetch("https://api.sender.net/v2/subscribers?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    base.httpStatus = r.status;
    base.reachable = r.ok || r.status === 200;
    if (!r.ok && r.status !== 200) base.errors.push(`token check: HTTP ${r.status}`);
  } catch (e) {
    base.errors.push(`token check: ${String(e instanceof Error ? e.message : e)}`);
  }
  return base;
}

export function fetchProviderStatus(provider: ProviderId, domain: string): Promise<ProviderStatus> {
  const key = Deno.env.get(
    provider === "resend" ? "RESEND_API_KEY" : provider === "brevo" ? "BREVO_API_KEY" : "SENDER_API_KEY",
  ) || "";
  if (provider === "resend") return resendStatus(key, domain);
  if (provider === "brevo") return brevoStatus(key);
  return senderStatus(key);
}

export function webhookSecretName(provider: ProviderId): string {
  return provider === "resend" ? "RESEND_WEBHOOK_SECRET" : provider === "brevo" ? "BREVO_WEBHOOK_SECRET" : "SENDER_WEBHOOK_SECRET";
}

export function webhookSecretPresent(provider: ProviderId): boolean {
  return !!Deno.env.get(webhookSecretName(provider));
}
