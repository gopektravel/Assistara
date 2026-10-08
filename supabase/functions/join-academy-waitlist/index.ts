import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const U = Deno.env.get("SUPABASE_URL")!, K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SITE = "https://www.getassistara.com";
const allowed = new Set(["https://getassistara.com", "https://www.getassistara.com", "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
const good = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const h = (o: string | null) => ({ "Content-Type": "application/json", "Access-Control-Allow-Origin": good(o) ? o! : SITE, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });

Deno.serve(async req => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h(o) });
  if (req.method !== "POST" || (o && !good(o))) return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: h(o) });
  let b: any = {}; try { b = await req.json() } catch {}
  const token = String(b.token || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response(JSON.stringify({ ok: false, error: "Invalid enrollment link" }), { status: 400, headers: h(o) });

  const db = createClient(U, K, { auth: { persistSession: false } });
  const { data: app } = await db.from("academy_applications").select("id,name,email").eq("enrollment_token", token).maybeSingle();
  if (!app) return new Response(JSON.stringify({ ok: false, error: "Enrollment invitation not found" }), { status: 404, headers: h(o) });

  const { data: joined, error } = await db.rpc("join_academy_waitlist", { p_application_id: app.id, p_source: "checkout_cta" });
  if (error || !joined?.ok) return new Response(JSON.stringify({ ok: false, error: error?.message || "Could not join the waitlist. Please try again." }), { status: 500, headers: h(o) });

  return new Response(JSON.stringify({
    ok: true, waitlist_id: joined.id, already: !!joined.already,
    position: joined.position, priority: joined.priority, status: joined.status, cohort_code: joined.cohort_code
  }), { status: 200, headers: h(o) });
});