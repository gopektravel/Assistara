import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": o && good(o) ? o : SITE,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const out = (body: any, status: number, h: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: h });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = cors(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST" || (origin && !good(origin)))
    return out({ ok: false, error: "Forbidden" }, 403, h);

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const token = String(body.token || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return out({ ok: false, error: "Invalid token" }, 400, h);

  const db = createClient(U, K, { auth: { persistSession: false } });

  // Verify the enrollment token belongs to an onboarded student
  const { data: app, error: ae } = await db
    .from("academy_applications")
    .select("id, auth_user_id, status, onboarding_completed_at")
    .eq("enrollment_token", token)
    .maybeSingle();

  if (ae) return out({ ok: false, error: "Enrollment lookup failed" }, 500, h);
  if (!app || app.status !== "onboarded" || !app.onboarding_completed_at)
    return out({ ok: false, error: "Onboarding not completed" }, 403, h);

  // Mark welcome as seen (idempotent - only sets if not already set)
  const { error: ue } = await db
    .from("academy_applications")
    .update({ welcome_seen_at: new Date().toISOString() })
    .eq("id", app.id)
    .is("welcome_seen_at", null); // only update if not already set

  if (ue) return out({ ok: false, error: "Could not mark welcome as seen" }, 500, h);

  return out({ ok: true, dashboard_url: `${SITE}/academy/dashboard` }, 200, h);
});