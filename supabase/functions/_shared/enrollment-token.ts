const CAMPAIGN = "academy-enrollment-link-fixed-20261012";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signature(applicationId: string): Promise<string> {
  const secret = Deno.env.get("ENROLLMENT_TOKEN_SIGNING_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("Enrollment token signing is unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, enc.encode(`${CAMPAIGN}:${applicationId}`));
  return b64url(new Uint8Array(signed));
}

export async function createReplacementEnrollmentToken(applicationId: string): Promise<string> {
  if (!UUID_RE.test(applicationId)) throw new Error("Invalid application ID");
  return `r1.${applicationId}.${await signature(applicationId)}`;
}

async function replacementApplicationId(token: string): Promise<string | null> {
  const match = /^r1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(token);
  if (!match || !UUID_RE.test(match[1])) return null;
  const expected = await signature(match[1]);
  if (expected.length !== match[2].length) return null;
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ match[2].charCodeAt(i);
  return different === 0 ? match[1] : null;
}

export async function resolveEnrollmentApplication(
  db: any,
  tokenValue: unknown,
  columns: string,
): Promise<{ data: any; error: any; tokenKind: "original" | "replacement" | "invalid" }> {
  const token = String(tokenValue || "").trim();
  if (!token || token.length > 160) return { data: null, error: null, tokenKind: "invalid" };
  if (UUID_RE.test(token)) {
    const result = await db.from("academy_applications").select(columns).eq("enrollment_token", token).maybeSingle();
    return { ...result, tokenKind: "original" };
  }
  const applicationId = await replacementApplicationId(token);
  if (!applicationId) return { data: null, error: null, tokenKind: "invalid" };
  const result = await db.from("academy_applications").select(columns).eq("id", applicationId).maybeSingle();
  return { ...result, tokenKind: "replacement" };
}

export const enrollmentReplacementCampaign = CAMPAIGN;
