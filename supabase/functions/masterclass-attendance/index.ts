import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Masterclass attendance tracking (join + heartbeat).
//
// Reliability guarantees:
//  - Every PostgREST lookup and PATCH response is checked.
//  - A write is only reported as ok:true after EXACTLY ONE signup row is updated.
//  - Failed writes return an error (the caller can retry).
//  - Writes are retried with bounded attempts on network errors / 5xx.
//  - Join recording is IDEMPOTENT: joined_at is set only when it is currently
//    null (conditional PATCH), and join_clicks is incremented at most once per
//    signup — so retries/concurrent joins never double-count.
//  - Attendance fields (joined_at, last_joined_at, join_clicks,
//    attendance_seconds) are preserved, so a joined attendee is excluded from
//    the 7-minute reminder.

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const origins = new Set(["https://getassistara.com", SITE, "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
const allowed = (o: string | null) => !!o && (origins.has(o) || o.endsWith(".vercel.app"));
const TOKEN_RE = /^[a-f0-9]{32,64}$/;

const AUTH = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bounded retry: retries on network error or 5xx; returns the first definitive
// response (2xx/4xx). Idempotent callers may safely re-run the request.
async function fetchRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, init);
      if (r.ok || r.status < 500) return r;
      last = r;
    } catch { /* network error -> retry */ }
    if (i < attempts - 1) await sleep(150 * (i + 1));
  }
  if (last) return last;
  throw new Error("network_failed");
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  const h = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowed(o) ? o! : SITE,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return out({ ok: false, error: "method_not_allowed" }, 405);

  let b: any = {};
  try { b = await req.json(); } catch { return out({ ok: false, error: "invalid_json" }, 400); }

  const token = String(b.token || "").trim();
  if (!TOKEN_RE.test(token)) return out({ ok: true, identified: false });

  try {
    // 1) Lookup (checked).
    const q = await fetchRetry(`${U}/rest/v1/masterclass_signups?attendee_token=eq.${encodeURIComponent(token)}&select=id,joined_at,last_joined_at,join_clicks,attendance_seconds&limit=1`, { headers: AUTH });
    if (!q.ok) return out({ ok: false, error: "lookup_failed", status: q.status }, 502);
    const rows = await q.json().catch(() => []);
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return out({ ok: true, identified: false });

    const now = new Date().toISOString();
    const kind = String(b.kind || "join");

    if (kind === "heartbeat") {
      const seconds = Math.min(120, Math.max(1, Number(b.seconds) || 30));
      // No retry here: an ambiguous re-apply would double-count seconds. The page
      // sends the next heartbeat shortly, so a miss is self-healing.
      const patch = await fetchRetry(`${U}/rest/v1/masterclass_signups?id=eq.${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { ...AUTH, Prefer: "return=representation" },
        body: JSON.stringify({ last_joined_at: now, attendance_seconds: Number(r.attendance_seconds || 0) + seconds }),
      }, 1);
      if (!patch.ok) return out({ ok: false, error: "write_failed", status: patch.status }, 502);
      const pr = await patch.json().catch(() => []);
      if (!Array.isArray(pr) || pr.length !== 1) return out({ ok: false, error: "write_not_confirmed", updated: Array.isArray(pr) ? pr.length : null }, 502);
      return out({ ok: true, identified: true });
    }

    // 2) join — idempotent first-join: only when joined_at is still null.
    if (!r.joined_at) {
      const patch = await fetchRetry(`${U}/rest/v1/masterclass_signups?id=eq.${encodeURIComponent(r.id)}&joined_at=is.null`, {
        method: "PATCH",
        headers: { ...AUTH, Prefer: "return=representation" },
        body: JSON.stringify({ joined_at: now, last_joined_at: now, join_clicks: Number(r.join_clicks || 0) + 1 }),
      });
      if (!patch.ok) return out({ ok: false, error: "write_failed", status: patch.status }, 502);
      const pr = await patch.json().catch(() => []);
      if (Array.isArray(pr) && pr.length === 1) return out({ ok: true, identified: true });
      // 0 rows -> a concurrent/earlier join already recorded it; fall through and
      // only refresh last_joined_at (no join_clicks increment) so retries cannot
      // double-count.
    }

    // 3) already joined (or lost the race): touch last_joined_at only.
    const patch2 = await fetchRetry(`${U}/rest/v1/masterclass_signups?id=eq.${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      headers: { ...AUTH, Prefer: "return=representation" },
      body: JSON.stringify({ last_joined_at: now }),
    });
    if (!patch2.ok) return out({ ok: false, error: "write_failed", status: patch2.status }, 502);
    const pr2 = await patch2.json().catch(() => []);
    if (!Array.isArray(pr2) || pr2.length !== 1) return out({ ok: false, error: "write_not_confirmed", updated: Array.isArray(pr2) ? pr2.length : null }, 502);
    return out({ ok: true, identified: true, rejoined: true });
  } catch (e) {
    return out({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});