// Admin HMAC token verification for the analyze-opportunity Edge Function.
//
// The token format and signing key match the Admin API issuer
// (supabase/functions/admin-api): base64url(payload) "." base64url(HMAC-SHA256).
// Kept dependency-free so it can be unit tested without Supabase wiring.

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromB64url(s: string): Uint8Array {
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("/", "_") + "=".repeat((4 - s.length % 4) % 4)),
    (c) => c.charCodeAt(0),
  );
}

export async function signHmac(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload))));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyAdminOptions {
  key: string;
  username: string;
  /** Current ADMIN_TOKEN_VERSION. When empty, version is not enforced. */
  version: string;
  now?: number;
}

export interface AdminClaims {
  u?: string;
  v?: string;
  exp?: number;
}

/** Issue a token. Used by tests and mirrors the Admin API issuer. */
export async function issueAdminToken(
  claims: AdminClaims,
  key: string,
): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return `${payload}.${await signHmac(payload, key)}`;
}

/** Verify a token: signature, admin user, token version (when configured), expiry. */
export async function verifyAdminToken(
  token: string,
  opts: VerifyAdminOptions,
): Promise<boolean> {
  try {
    if (!token || !opts.key) return false;
    const [p, s] = token.split(".");
    if (!p || !s || !safeEqual(await signHmac(p, opts.key), s)) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(p))) as AdminClaims;
    const versionOk = !opts.version || data.v === opts.version;
    return data.u === opts.username && versionOk && (opts.now ?? Date.now()) < (data.exp ?? 0);
  } catch {
    return false;
  }
}
