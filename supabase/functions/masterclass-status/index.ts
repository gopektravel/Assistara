// Masterclass event lifecycle — server-authoritative.
//
// The event schedule (masterclass_events.scheduled_at) is the single source of
// truth. Status is DERIVED on every read from the schedule and ended_at, so the
// event becomes `live` at its scheduled time with no scheduler, no admin action
// and no open browser tab, and stays `ended` forever once an admin ends it.
//
//   read  (public)  -> derived status + schedule (safe, no secrets)
//   end   (admin)   -> idempotent, HMAC-admin-token protected, records ended_at/ended_by
//
// Deployed with verify_jwt = false so the public site can read it; the admin
// `end` action is enforced in-function with the same token as every other
// Assistara admin API.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_VERSION = Deno.env.get("ADMIN_TOKEN_VERSION") || "";
const USER = "admin";
const DEFAULT_EVENT_KEY = "founding-masterclass-2026";

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);
const ok = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ok(o) ? o! : "https://www.getassistara.com",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const enc = new TextEncoder();
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
async function sign(p: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(K), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(p))));
}
async function adminAuth(t: string) {
  try {
    const [p, s] = t.split(".");
    if (!p || !s || (await sign(p)) !== s) return false;
    const raw = atob(p.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (p.length % 4)) % 4));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
    return !!d.v && d.v === TOKEN_VERSION && d.u === USER && Date.now() < d.exp;
  } catch {
    return false;
  }
}

type EventRow = {
  event_key: string;
  title: string | null;
  scheduled_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
  live_destination_url: string | null;
  updated_at: string | null;
};

// The one authority for event status.
function deriveStatus(row: EventRow, nowMs: number): "scheduled" | "live" | "ended" {
  if (row.ended_at) return "ended";
  const sched = row.scheduled_at ? Date.parse(row.scheduled_at) : NaN;
  if (Number.isFinite(sched) && nowMs >= sched) return "live";
  return "scheduled";
}

function shape(row: EventRow) {
  const now = Date.now();
  const status = deriveStatus(row, now);
  const schedMs = row.scheduled_at ? Date.parse(row.scheduled_at) : NaN;
  return {
    event_key: row.event_key,
    title: row.title,
    scheduled_at: row.scheduled_at,
    status,
    started_at: status !== "scheduled" && Number.isFinite(schedMs) ? new Date(schedMs).toISOString() : null,
    ended_at: row.ended_at || null,
    ended_by: row.ended_by || null,
    live_destination_url: row.live_destination_url || null,
    updated_at: row.updated_at || null,
  };
}

const SELECT = "event_key,title,scheduled_at,ended_at,ended_by,live_destination_url,updated_at";

Deno.serve(async (req: Request) => {
  const o = req.headers.get("origin"), h = cors(o);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });
  if (req.method !== "POST" || (o && !ok(o))) return out({ ok: false, error: "Forbidden" }, 403);

  let b: any = {};
  try { b = await req.json(); } catch {}
  const action = String(b.action || "read").trim().toLowerCase();
  const eventKey = String(b.event_key || DEFAULT_EVENT_KEY).slice(0, 120) || DEFAULT_EVENT_KEY;
  const db = createClient(U, K, { auth: { persistSession: false } });

  if (action === "read") {
    const { data, error } = await db.from("masterclass_events").select(SELECT).eq("event_key", eventKey).maybeSingle();
    if (error) return out({ ok: false, error: "Could not load event" }, 500);
    if (!data) return out({ ok: true, event: null });
    return out({ ok: true, event: shape(data as EventRow) });
  }

  if (action === "end") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await adminAuth(token))) return out({ ok: false, error: "Unauthorized" }, 401);

    const { data: row, error } = await db.from("masterclass_events").select(SELECT).eq("event_key", eventKey).maybeSingle();
    if (error) return out({ ok: false, error: "Could not load event" }, 500);
    if (!row) return out({ ok: false, error: "Event not found" }, 404);

    const current = shape(row as EventRow);
    // Idempotent: an ended event stays ended.
    if (current.status === "ended") {
      return out({ ok: true, changed: false, status: "ended", ended_at: current.ended_at });
    }
    // Only a live event can be ended; nothing to end before the scheduled start.
    if (current.status !== "live") {
      return out({ ok: false, error: "The masterclass has not started yet." }, 409);
    }

    const endedAt = new Date().toISOString();
    // Conditional update: the first admin to end wins; a concurrent second
    // admin matches zero rows and is treated as a no-op, never a double write.
    const { data: updated, error: updErr } = await db
      .from("masterclass_events")
      .update({ status: "ended", ended_at: endedAt, ended_by: USER, updated_at: endedAt })
      .eq("event_key", eventKey)
      .is("ended_at", null)
      .select(SELECT)
      .maybeSingle();
    if (updErr) return out({ ok: false, error: "Could not end the masterclass" }, 500);
    if (!updated) return out({ ok: true, changed: false, status: "ended" });

    try {
      await db.from("masterclass_status_log").insert({
        event_key: eventKey,
        from_status: "live",
        to_status: "ended",
        changed_by: USER,
        notes: "Admin ended the masterclass",
      });
    } catch { /* audit is best-effort */ }

    return out({ ok: true, changed: true, status: "ended", ended_at: endedAt });
  }

  return out({ ok: false, error: "Unknown action" }, 400);
});
