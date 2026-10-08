import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Admin cohort-capacity panel backend.
// Mirrors the admin-applications auth (HMAC-signed Bearer token over the
// service-role key), actions:
//   overview        -> academy_capacity_overview()   (capacity/paid/reservations/waitlist/exceptions)
//   waitlist        -> admin_waitlist_list()
//   invite_next     -> admin_invite_next_waitlisted() + invite email (Resend) + notification history
//   exceptions      -> open + resolved payment exceptions
//   exception_resolve -> mark an exception refunded/voided/manual_enrollment/ignored
// No action here can enroll an applicant automatically: inviting returns them
// to the standard 'accepted' state so the checkout flow re-verifies a seat.

const U = Deno.env.get("SUPABASE_URL")!, K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, R = Deno.env.get("RESEND_API_KEY") || "", SITE = "https://www.getassistara.com", USER = "admin";
const allowed = new Set(["https://getassistara.com", "https://www.getassistara.com", "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
const ok = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const esc = (s: any) => String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function sign(p: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(K), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(p))));
}
async function auth(t: string) {
  try {
    const [p, s] = t.split(".");
    if (!p || !s || await sign(p) !== s) return false;
    const raw = atob(p.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - p.length % 4) % 4));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    return !!d.v && d.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && d.u === USER && Date.now() < d.exp;
  } catch { return false }
}
async function mail(to: string, subject: string, html: string) {
  if (!R) return false;
  return (await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${R}` }, body: JSON.stringify({ from: "Assistara <forms@getassistara.com>", to: [to], reply_to: "academy@getassistara.com", subject, html }) })).ok;
}
function shell(title: string, body: string, cta?: { label: string, href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#151515"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 8px"><h1>${title}</h1></td></tr><tr><td style="padding:12px 32px 26px;font-size:16px;line-height:1.65">${body}</td></tr>${cta ? `<tr><td style="padding:0 32px 32px"><a href="${cta.href}" target="_blank" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:12px">${cta.label}</a><p style="margin:18px 0 6px;color:#77716a;font-size:12px;line-height:1.5">Button not working? Copy and paste this link into your browser:</p><a href="${cta.href}" target="_blank" style="color:#5b574f;font-size:12px;line-height:1.5;word-break:break-all">${cta.href}</a></td></tr>` : ""}</table></td></tr></table></body></html>`;
}

Deno.serve(async req => {
  const o = req.headers.get("origin"), h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": ok(o) ? o! : SITE, "Access-Control-Allow-Headers": "content-type,authorization", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const out = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });
  if (req.method !== "POST" || (o && !ok(o))) return out({ ok: false, error: "Forbidden" }, 403);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!await auth(t)) return out({ ok: false, error: "Session expired" }, 401);

  let b: any = {}; try { b = await req.json() } catch {}
  const action = String(b.action || ""), cohort = String(b.cohort_code || "founding-2026").slice(0, 120);
  const db = createClient(U, K, { auth: { persistSession: false } });

  if (action === "overview") {
    const { data, error } = await db.rpc("academy_capacity_overview", { p_cohort_code: cohort });
    if (error) return out({ ok: false, error: error.message }, 500);
    return out(data || { ok: false, error: "No capacity data" });
  }
  if (action === "waitlist") {
    const { data, error } = await db.rpc("admin_waitlist_list", { p_cohort_code: cohort });
    if (error) return out({ ok: false, error: error.message }, 500);
    return out(data || { ok: true, rows: [] });
  }
  if (action === "invite_next") {
    const { data, error } = await db.rpc("admin_invite_next_waitlisted", { p_cohort_code: cohort });
    if (error) return out({ ok: false, error: error.message }, 500);
    if (!data?.ok) return out(data, 409);
    const token = String(data.enrollment_token || "");
    const url = `${SITE}/academy/checkout?token=${encodeURIComponent(token)}`;
    const first = esc((data.name || "there").split(/\s+/)[0]);
    let emailSent = false, emailError = "";
    if (data.application_id && token) {
      const html = shell("A seat just opened in the Academy cohort 🎉", `<p>Hi ${first},</p><p>Good news — a spot just opened up in the Assistara Academy founding cohort, and you're next on the priority waitlist.</p><p>Your invite is time-sensitive: seats are confirmed in payment order.</p><p><strong>This link is private — please don't share it.</strong></p>`, { label: "Secure my spot →", href: url });
      emailSent = await mail(data.email, `A seat just opened in the Academy cohort 🎉 | Assistara Academy`, html);
      if (!emailSent) emailError = "resend_failed";
    }
    await db.from("academy_waitlist_notifications").insert({ waitlist_id: data.waitlist_id, channel: "email", template: "invite", status: emailSent ? "sent" : "failed", error: emailError || null }).select("id").maybeSingle();
    await db.from("admin_activity_log").insert({ entity_type: "waitlist", entity_id: data.waitlist_id, action: "waitlist_invite_email", details: { email_sent: emailSent, error: emailError || null } });
    return out({ ...data, enrollment_url: url, email_sent: emailSent });
  }
  if (action === "exceptions") {
    const { data, error } = await db.from("academy_payment_exceptions").select("id,application_id,cohort_code,amount_php,currency,payment_provider,provider_reference,payment_intent_id,reason,resolved,resolution,notes,created_at,resolved_at,resolved_by").order("created_at", { ascending: false }).limit(200);
    if (error) return out({ ok: false, error: error.message }, 500);
    const ids = [...new Set((data || []).map((e: any) => e.application_id).filter(Boolean))];
    let apps: any[] = [];
    if (ids.length) {
      const { data: aps } = await db.from("academy_applications").select("id,name,email,payment_status").in("id", ids);
      apps = aps || [];
    }
    const byId = new Map(apps.map((a: any) => [String(a.id), a]));
    return out({ ok: true, rows: (data || []).map((e: any) => ({ ...e, applicant: e.application_id ? byId.get(String(e.application_id)) || null : null })) });
  }
  if (action === "exception_resolve") {
    const id = String(b.id || ""), resolution = String(b.resolution || ""), notes = String(b.notes || "").slice(0, 2000);
    if (!id) return out({ ok: false, error: "An exception id is required" }, 400);
    if (!["refunded", "voided", "manual_enrollment", "ignored"].includes(resolution)) return out({ ok: false, error: "A valid resolution is required" }, 400);
    const { error } = await db.from("academy_payment_exceptions").update({ resolved: true, resolution, notes: notes || null, resolved_at: new Date().toISOString(), resolved_by: "admin" }).eq("id", id);
    if (error) return out({ ok: false, error: error.message }, 500);
    await db.from("admin_activity_log").insert({ entity_type: "payment_exception", entity_id: id, action: "payment_exception_resolved", details: { resolution, notes: notes || null } });
    return out({ ok: true });
  }
  return out({ ok: false, error: "Unknown action" }, 400);
});