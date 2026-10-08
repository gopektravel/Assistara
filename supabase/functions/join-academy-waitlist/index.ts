import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public priority-waitlist join. Two paths, both non-privileged (join only —
// listing/inviting/resolving waitlisted applicants stays behind the admin
// token on admin-academy-capacity):
//   1. token  -> an accepted applicant's private enrollment token (checkout).
//   2. email  -> a visitor on the full-cohort apply page with no token yet.
// Every path validates its input, and duplicates collapse onto the unique
// (email, cohort_code) row so nobody can take two positions.
const U = Deno.env.get("SUPABASE_URL")!, K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SITE = "https://www.getassistara.com";
const allowed = new Set(["https://getassistara.com", "https://www.getassistara.com", "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
const good = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const h = (o: string | null) => ({ "Content-Type": "application/json", "Access-Control-Allow-Origin": good(o) ? o! : SITE, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const COHORTS = new Set(["founding-2026"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async req => {
  const o = req.headers.get("origin");
  const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h(o) });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h(o) });
  if (req.method !== "POST" || (o && !good(o))) return out({ ok: false, error: "Forbidden" }, 403);

  let b: any = {}; try { b = await req.json() } catch {}

  // Honeypot: a hidden field a real visitor never fills. Silently accept bots
  // (no row written) so scripts get no signal.
  if (String(b.website || "").trim()) return out({ ok: true, already: false });

  const db = createClient(U, K, { auth: { persistSession: false } });
  const joinByApplication = async (applicationId: string) => {
    const { data: joined, error } = await db.rpc("join_academy_waitlist", { p_application_id: applicationId, p_source: "checkout_cta" });
    if (error || !joined?.ok) return out({ ok: false, error: "Could not join the waitlist. Please try again." }, 500);
    return out({ ok: true, waitlist_id: joined.id, already: !!joined.already, position: joined.position, priority: joined.priority, status: joined.status, cohort_code: joined.cohort_code });
  };

  // Path 1 — accepted applicant with a private enrollment token.
  const token = String(b.token || "").trim();
  if (token) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return out({ ok: false, error: "Invalid enrollment link" }, 400);
    const { data: app } = await db.from("academy_applications").select("id").eq("enrollment_token", token).maybeSingle();
    if (!app) return out({ ok: false, error: "Enrollment invitation not found" }, 404);
    return await joinByApplication(app.id);
  }

  // Path 2 — visitor without a token (full-cohort apply page).
  const email = String(b.email || "").trim().toLowerCase();
  const name = String(b.name || "").trim().slice(0, 120);
  const cohort = COHORTS.has(String(b.cohort_code || "")) ? String(b.cohort_code) : "founding-2026";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return out({ ok: false, error: "A valid email is required" }, 400);

  // Link to an existing application when the email matches, so the admin sees
  // the applicant rather than a bare row.
  const { data: app } = await db.from("academy_applications").select("id").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (app?.id) return await joinByApplication(app.id);

  // Standalone join (no application yet). Dedupe on the unique (email, cohort).
  const { data: existing } = await db.from("academy_waitlist").select("id,position,priority,status").eq("email", email).eq("cohort_code", cohort).maybeSingle();
  if (existing) return out({ ok: true, waitlist_id: existing.id, already: true, position: existing.position, priority: existing.priority, status: existing.status, cohort_code: cohort });

  const { data: inserted, error: insErr } = await db
    .from("academy_waitlist")
    .insert({ cohort_code: cohort, name, email, source: "checkout_cta", priority: 1, status: "waiting" })
    .select("id,position,priority,status")
    .single();
  if (insErr) {
    // Unique (email, cohort_code) violation => a concurrent join won the race.
    if (String(insErr.code) === "23505") return out({ ok: true, already: true });
    return out({ ok: false, error: "Could not join the waitlist. Please try again." }, 500);
  }
  return out({ ok: true, waitlist_id: inserted.id, already: false, position: inserted.position, priority: inserted.priority, status: inserted.status, cohort_code: cohort });
});
