import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// stripe-webhook
//
// Stripe card payments were previously fulfilled ONLY when the buyer's browser
// returned to /academy/payment-success and called payment-complete. If the tab
// was closed, the redirect failed, or an extension blocked the request, Stripe
// captured the money but the enrollment was never finalized: no paid status, no
// seat counted, no receipt, no onboarding email. There was no server-to-server
// safety net.
//
// This function is that safety net. It verifies the Stripe signature, then
// delegates to the SAME tested fulfillment path the success page uses
// (payment-complete), which re-verifies the Checkout Session with Stripe and is
// idempotent, so duplicate deliveries are harmless.
//
// Deployment notes (manual, owner action):
//   - Create a Stripe webhook endpoint for this function URL.
//   - Subscribe to checkout.session.completed and
//     checkout.session.async_payment_succeeded.
//   - Set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret.
//   - Deploy with JWT verification disabled (Stripe sends no Supabase JWT),
//     matching how payment-complete is already called from the browser.
// ---------------------------------------------------------------------------

const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const COMPLETE_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/payment-complete` : "";
const enc = new TextEncoder();

const json = (x: any, s = 200) =>
  new Response(JSON.stringify(x), { status: s, headers: { "Content-Type": "application/json" } });

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function verify(raw: string, header: string) {
  const parts: Record<string, string> = {};
  for (const item of header.split(",")) {
    const i = item.indexOf("=");
    if (i < 0) continue;
    parts[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  const t = parts.t || "";
  const v1 = (parts.v1 || "").toLowerCase();
  if (!/^\d+$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  if (!SECRET) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + raw)));
  return safeEqual(expected, v1);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  if (!SECRET) return json({ ok: false, error: "Webhook not configured" }, 503);

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  if (!(await verify(raw, signature))) return json({ ok: false, error: "Invalid signature" }, 401);

  let evt: any;
  try {
    evt = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const type = String(evt?.type || "");
  const obj = evt?.data?.object || {};
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(type)) {
    return json({ ok: true, ignored: true });
  }
  // Only Assistara Academy checkouts are fulfilled here.
  if (String(obj?.metadata?.source || "") !== "assistara_academy") return json({ ok: true, ignored: true });
  if (String(obj?.payment_status || "") !== "paid") return json({ ok: true, ignored: true });

  const sessionId = String(obj?.id || "");
  if (!/^cs_/.test(sessionId)) return json({ ok: false, error: "Missing session id" }, 400);
  if (!COMPLETE_URL) return json({ ok: false, error: "Fulfillment endpoint not configured" }, 503);

  // Reuse the tested, idempotent fulfillment path. payment-complete re-fetches
  // the session from Stripe, so a forged body cannot mark anything paid.
  try {
    const r = await fetch(COMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body?.ok) {
      // Non-2xx makes Stripe retry the event later.
      console.error("stripe_webhook_fulfillment_failed", sessionId, r.status, body?.error);
      return json({ ok: false, error: body?.error || "Fulfillment failed" }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("stripe_webhook_error", sessionId, e);
    return json({ ok: false, error: "Fulfillment error" }, 500);
  }
});
