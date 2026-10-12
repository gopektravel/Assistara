import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveEnrollmentApplication } from "../_shared/enrollment-token.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const good = (o: string | null) => !o || allowed.has(o) || o.endsWith(".vercel.app");

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  const h = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": o && good(o) ? o : SITE,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const out = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });
  if (req.method !== "POST" || !good(o)) return out({ ok: false, error: "Forbidden" }, 403);

  let b: any = {};
  try { b = await req.json() } catch {}
  const token = String(b.token || "").trim();
  const code = String(b.code || "").trim().toUpperCase();
  if (!token || !code) return out({ ok: false, error: "Enter a valid promo code." }, 400);

  const db = createClient(U, K, { auth: { persistSession: false } });

  const { data: a, error: ae, tokenKind } = await resolveEnrollmentApplication(db, token, "id,decision,status,payment_status,email,promo_code,checkout_amount_php");
  if (ae) return out({ ok: false, error: "Enrollment lookup failed." }, 500);
  if (tokenKind === "invalid") return out({ ok: false, error: "Enter a valid promo code." }, 400);
  if (!a || (a.decision !== "accepted" && a.status !== "accepted")) return out({ ok: false, error: "Enrollment invitation is not active." }, 403);

  const { data: p, error: pe } = await db
    .from("academy_promo_codes")
    .select("id, code, amount_php, discount_type, discount_value, starts_at, expires_at, active, max_redemptions, max_redemptions_per_customer")
    .eq("code", code)
    .maybeSingle();
  if (pe) return out({ ok: false, error: "Promo lookup failed." }, 500);

  const now = Date.now();
  if (!p || !p.active || (p.starts_at && new Date(p.starts_at).getTime() > now) || (p.expires_at && new Date(p.expires_at).getTime() <= now)) {
    return out({ ok: false, error: "This promo code is invalid or has expired." }, 400);
  }

  // Check global redemption limit
  if (p.max_redemptions !== null && p.max_redemptions !== undefined) {
    const { count: existingRedemptions, error: re } = await db
      .from("academy_coupon_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("coupon_id", p.id)
      .eq("status", "confirmed");
    if (re) return out({ ok: false, error: "Redemption limit check failed." }, 500);
    if ((existingRedemptions || 0) >= p.max_redemptions) {
      return out({ ok: false, error: "Coupon redemption limit reached." }, 400);
    }
  }

  // Check per-customer redemption limit
  if (p.max_redemptions_per_customer !== null && p.max_redemptions_per_customer !== undefined) {
    const { count: customerRedemptions, error: cre } = await db
      .from("academy_coupon_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("coupon_id", p.id)
      .eq("customer_email", a.email)
      .eq("status", "confirmed");
    if (cre) return out({ ok: false, error: "Redemption limit check failed." }, 500);
    if ((customerRedemptions || 0) >= p.max_redemptions_per_customer) {
      return out({ ok: false, error: "You have already used this coupon the maximum number of times." }, 400);
    }
  }

  // Update application with promo code and discounted amount
  const { error: ue } = await db
    .from("academy_applications")
    .update({ promo_code: p.code, checkout_amount_php: p.amount_php })
    .eq("id", a.id);
  if (ue) return out({ ok: false, error: "Promo could not be saved." }, 500);

  return out({ ok: true, code: p.code, amount_php: p.amount_php, regular_amount_php:6900, expires_at: p.expires_at });
});
