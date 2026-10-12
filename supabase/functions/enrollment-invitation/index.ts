import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveEnrollmentApplication } from "../_shared/enrollment-token.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const LIMIT = 15;

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);
const good = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": good(o) ? o! : SITE,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  const h = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": good(o) ? o! : SITE,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST" || (o && !good(o))) return new Response(JSON.stringify({ ok: false }), { status: 403, headers: h });

  let b: any = {};
  try { b = await req.json() } catch {}
  const token = String(b.token || "").trim();
  const db = createClient(U, K, { auth: { persistSession: false } });
  const { data: a, error: lookupError, tokenKind } = await resolveEnrollmentApplication(db, token, "id,name,email,decision,status,payment_status,payment_method,promo_code,checkout_amount_php,paymongo_qr_expires_at,welcome_seen_at");
  if (lookupError) {
    console.error("enrollment_invitation_lookup_failed", lookupError.code || "unknown");
    return new Response(JSON.stringify({ ok: false, error: "Enrollment lookup is temporarily unavailable" }), { status: 500, headers: h });
  }
  if (tokenKind === "invalid") return new Response(JSON.stringify({ ok: false, error: "Invalid enrollment link" }), { status: 400, headers: h });
  if (!a || (a.decision !== "accepted" && a.status !== "accepted" && a.status !== "waitlisted")) return new Response(JSON.stringify({ ok: false, error: "Enrollment invitation is not active" }), { status: 404, headers: h });

  const { data: cohort } = await db.rpc("academy_cohort_status", { p_application_id: a.id });
  const full = a.payment_status !== "paid" && !!cohort?.full;
  if (full && a.status !== "waitlisted") {
    await db.from("academy_applications").update({ status: "waitlisted", waitlisted_at: new Date().toISOString() }).eq("id", a.id);
    await db.from("academy_waitlist").insert({ application_id: a.id, cohort_code: cohort?.cohort_code || "founding-2026", name: a.name, email: a.email, source: "auto", priority: 2, status: "waiting" }).onConflict("email, cohort_code").doNothing();
  }

  const amount_php = a.checkout_amount_php && a.checkout_amount_php > 0 ? a.checkout_amount_php : 6900;

  return new Response(JSON.stringify({
    ok: true,
    id: a.id,
    name: a.name,
    email: a.email,
    decision: a.decision,
    status: a.status,
    payment_status: a.payment_status,
    payment_method: a.payment_method,
    promo_code: a.promo_code,
    amount_php: amount_php,
    checkout_amount_php: amount_php,
    regular_amount_php: 6900,
    paymongo_qr_expires_at: a.paymongo_qr_expires_at,
    welcome_seen_at: a.welcome_seen_at,
    cohort_full: full,
    spots_left: cohort?.spots_left ?? 0,
  }), { status: 200, headers: h });
});
