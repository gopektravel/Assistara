// Masterclass reminder — one-shot 24h reminder email, sent "from Xyra".
//
// masterclass_events.scheduled_at is the single source of truth (same table the
// live page reads). One reminder per registered attendee, ~24h before start:
//   run         (cron)          send eligible reminders, once each, idempotently
//   test        (authorized)    send exactly ONE reminder to a given address
//   unsubscribe (GET/POST)      token-based opt-out, confirm page only
//   stats       (cron)          sanitized counts used for verification
//
// Safety:
//  - Production sends are gated behind MASTERCLASS_REMINDER_ENABLED=true AND the
//    cron secret. The kill switch ships "false" so nothing sends until approved.
//  - Exactly-once per attendee is enforced by masterclass_reminders(signup_id,
//    event_key) unique + the Resend Idempotency-Key.
//  - The reminder only includes people registered BEFORE the 24h mark; late
//    registrants keep the normal confirmation flow (no catch-up reminder).
//  - Unsubscribing requires a deliberate POST from a confirm page, so email
//    scanners that merely open the link do not opt anyone out.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const BREVO = Deno.env.get("BREVO_API_KEY") || "";
const CRON_SECRET = Deno.env.get("MASTERCLASS_CRON_SECRET") || "";
const ENABLED = Deno.env.get("MASTERCLASS_REMINDER_ENABLED") === "true";

const SITE = "https://www.getassistara.com";
const EVENT_KEY = "founding-masterclass-2026";
const SENDER_NAME = "Xyra Mendoza | Assistara";
const SENDER_EMAIL = "xyra@getassistara.com";
const FROM = `${SENDER_NAME} <${SENDER_EMAIL}>`;
const REPLY = SENDER_EMAIL;
const LOGO_URL = `${SITE}/assistara-logo.png`;
const ACADEMY_URL = `${SITE}/academy/apply`;
const INTAKE_LIMIT = 15;
const REMIND_HOURS = 24;
const GRACE_BEFORE_HOURS = 2; // the window opens 2h before the exact 24h mark

const origins = new Set([
  "https://getassistara.com",
  SITE,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);
const allowed = (o: string | null) => !!o && (origins.has(o) || o.endsWith(".vercel.app"));
const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": allowed(o) ? o! : SITE,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
});

const clean = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escAttr = (s: string) => esc(s).replaceAll("`", "&#096;");
const TOKEN_RE = /^[a-f0-9]{48}$/;

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${U}/${path}`, {
    ...init,
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return r;
}

// ----------------------------------------------------------------------------
// Event + recipient data (same tables the live page and registration use)
// ----------------------------------------------------------------------------
async function eventRow() {
  const r = await api(`rest/v1/masterclass_events?event_key=eq.${encodeURIComponent(EVENT_KEY)}&select=event_key,title,scheduled_at,ended_at,status,live_destination_url&limit=1`);
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j[0] : null;
}

async function eligibleSignups(createdBeforeIso: string) {
  // status: registered (the shape website-form writes) or purchased (paid the
  // Academy) are valid registrations; anything else (canceled/invalid) is skipped.
  const r = await api(
    `rest/v1/masterclass_signups?status=in.(registered,purchased)&unsubscribed_at=is.null&created_at=lt.${encodeURIComponent(createdBeforeIso)}&select=id,name,email,attendee_token,status,created_at`
  );
  const j = await r.json().catch(() => []);
  if (!Array.isArray(j)) return [];
  return j.filter(
    (x: any) => validEmail(String(x.email || "")) && TOKEN_RE.test(String(x.attendee_token || ""))
  );
}

async function claimReminder(signupId: string): Promise<"got" | "exists" | "error"> {
  try {
    const r = await api("rest/v1/masterclass_reminders?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ signup_id: signupId, event_key: EVENT_KEY, status: "sending", trigger: "cron" }),
    });
    if (r.ok) {
      const j = await r.json().catch(() => []);
      return Array.isArray(j) && j[0]?.id ? "got" : "error";
    }
    if (r.status === 409) return "exists"; // already claimed (unique guard)
    return "error";
  } catch {
    return "error";
  }
}

async function finishReminder(signupId: string, patch: Record<string, unknown>) {
  const r = await api(
    `rest/v1/masterclass_reminders?signup_id=eq.${encodeURIComponent(signupId)}&event_key=eq.${encodeURIComponent(EVENT_KEY)}`,
    { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }
  );
  const s = await api(
    `rest/v1/masterclass_signups?id=eq.${encodeURIComponent(signupId)}`,
    { method: "PATCH", body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }) }
  );
  if (!r.ok) console.error("reminder log update failed", r.status);
  if (!s.ok) console.error("signup reminder_sent_at update failed", s.status);
}

async function academyAppCount() {
  const r = await api("rest/v1/academy_applications?select=id");
  if (!r.ok) return null;
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j.length : null;
}

// ----------------------------------------------------------------------------
// Sender authorization self-check (Resend) — the domain must be verified
// ----------------------------------------------------------------------------
async function senderStatus() {
  if (!RESEND) return { provider: "resend", ok: false, detail: "RESEND_API_KEY missing" };
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${RESEND}` } });
    const j = await r.json().catch(() => ({}));
    const domains = Array.isArray(j.data) ? j.data : [];
    const hit = domains.find((d: any) => String(d.name || "").toLowerCase() === "getassistara.com");
    return {
      provider: "resend",
      ok: r.ok && !!hit && hit.status === "verified",
      status: hit?.status || "missing",
      detail: hit ? `domain ${hit.name} ${hit.status}` : `getassistara.com not found among ${domains.length} domains`,
    };
  } catch (e) {
    return { provider: "resend", ok: false, detail: String(e instanceof Error ? e.message : e) };
  }
}

// ----------------------------------------------------------------------------
// Email delivery: Resend primary, Brevo fallback on rate-limit (existing pattern)
// ----------------------------------------------------------------------------
async function mail(to: string, subject: string, html: string, text: string, idemKey: string, reply = REPLY) {
  const brevo = async () => {
    if (!BREVO) throw Error("BREVO_API_KEY missing");
    const x = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: to }],
        replyTo: { email: reply },
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!x.ok) throw Error("Brevo email failed " + x.status);
    return { provider: "brevo" as const, id: "" };
  };
  if (!RESEND) return brevo();
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND}`, "Idempotency-Key": idemKey },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: reply, subject, html, text }),
    });
  } catch (e) {
    throw e;
  }
  if (r.ok) {
    const j = await r.json().catch(() => ({}));
    return { provider: "resend" as const, id: String(j.id || "") };
  }
  const body = await r.text().catch(() => "");
  let name = "";
  try { name = JSON.parse(body)?.name || ""; } catch {}
  if (r.status !== 429) throw Error("Resend email failed " + r.status + (name ? " (" + name + ")" : ""));
  return brevo();
}

// ----------------------------------------------------------------------------
// Date helpers (Asia/Manila — the event's timezone, masterclass_events stores UTC)
// ----------------------------------------------------------------------------
const ph = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...opts });

function eventDateLabel(iso: string) {
  return ph({ weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}
function eventTimeLabel(iso: string) {
  return ph({ hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function relativeDay(iso: string) {
  const tz = "Asia/Manila";
  const fmt = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const ev = fmt(new Date(iso));
  const today = fmt(new Date());
  const next = fmt(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (ev === today) return "today";
  if (ev === next) return "tomorrow";
  return ph({ weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

// ----------------------------------------------------------------------------
// Approved copy -> email HTML (personal email: white, left aligned, one button)
// ----------------------------------------------------------------------------
function renderHtml(opts: {
  first: string;
  eventDate: string;
  eventTime: string;
  dayWord: string;
  joinUrl: string;
  apps: number | null;
  limit: number;
  unsubscribeUrl: string;
}) {
  const { first, eventDate, eventTime, dayWord, joinUrl, apps, limit, unsubscribeUrl } = opts;
  const count = typeof apps === "number" ? apps : 0;
  const remaining = Math.max(0, limit - count);
  const verified = typeof apps === "number";
  const spotsLine = verified
    ? `We&#8217;ve already received <b>${count} Academy applications!</b> We&#8217;re accepting just <b>${limit} students</b>, so if everyone gets accepted, that&#8217;s only <b>${remaining} spots left!</b> 🫣`
    : `We&#8217;re accepting just <b>${limit} students</b> in the Academy, and applications are reviewed in the order they come in. 🫣`;
  const joinAttr = escAttr(joinUrl);
  const unsubAttr = escAttr(unsubscribeUrl);
  const P = "margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your free masterclass reminder</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:36px 16px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 26px"><a href="${SITE}"><img src="${LOGO_URL}" width="118" height="118" alt="Assistara" style="display:block;width:118px;height:118px;border:0;outline:none;text-decoration:none"></a></td></tr>
  <tr><td style="font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:16px;line-height:1.62">
    <p style="${P}">Hey ${esc(first)}! 💛</p>
    <p style="${P}">Okay, I have to admit... I&#8217;ve been looking forward to <b>tomorrow</b> all week! ✨</p>
    <p style="${P}">I&#8217;m Xyra, co-founder of Assistara, and ${dayWord} I&#8217;ll be going live with the free masterclass you signed up for:</p>
    <p style="${P}"><b>How to Land Your First Remote Client (as a Complete Beginner)</b></p>
    <p style="${P}">And don&#8217;t worry, I&#8217;m not going to tell you to just &#8220;learn some skills&#8221; and send 100 job applications. 😅</p>
    <p style="${P}">I&#8217;ve worked remotely with <b>multiple international clients</b>, earned in foreign currencies, and experienced firsthand what it&#8217;s like to build opportunities beyond the traditional 9-to-5.</p>
    <p style="${P}">I&#8217;ve seen what clients actually look for, what makes them trust someone enough to hire them, and why so many beginners struggle to get noticed.</p>
    <p style="${P}">And if there&#8217;s one thing that experience has taught me, it&#8217;s this:</p>
    <p style="${P}"><b>Making money online doesn&#8217;t have to be as complicated as people make it seem.</b> 💛</p>
    <p style="${P}">You don&#8217;t need to have everything figured out. You need to know what services people are willing to pay for, where to find the right clients, and how to give them a reason to choose you.</p>
    <p style="${P}">That&#8217;s exactly what I want to show you ${dayWord}.</p>
    <p style="margin:0 0 20px;line-height:1.7;font-size:16px;color:#232323">
      📅 <b>${esc(eventDate)}</b><br>
      ⏰ <b>${esc(eventTime)} Philippine Time</b><br>
      📍 <b>Live on Assistara</b>
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr>
      <td style="border-radius:999px;background:#ffd51f"><a href="${joinAttr}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:15px 26px;border-radius:999px">JOIN THE FREE MASTERCLASS &#8594;</a></td>
    </tr></table>
    <p style="${P}">Button not working? No worries! You can also join using your personal link below:</p>
    <p style="margin:0 0 18px;line-height:1.5;font-size:13px;color:#6b6b6b"><a href="${joinAttr}" style="color:#6b6b6b;word-break:break-all">${esc(joinUrl)}</a></p>
    <p style="${P}">Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️</p>
    <p style="${P}">Can&#8217;t wait to see you there! 💛</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 30px"><tr><td style="border-top:1px solid #ececec;padding-top:22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#232323">
      <b>Xyra Mendoza</b><br><span style="color:#6b6b6b">Co-founder, Assistara</span>
    </td></tr></table>
    <p style="margin:0 0 16px;line-height:1.62;font-size:15px;color:#232323">
      <b>P.S. 👀</b> ${spotsLine}
    </p>
    <p style="margin:0 0 16px;line-height:1.62;font-size:15px;color:#232323">
      Our team will start reviewing applications in the order they came in right after the livestream. If the Academy has been on your mind, send in your application before we go live. I&#8217;d hate for you to miss out! 💛
    </p>
    <p style="margin:0 0 34px"><a href="${ACADEMY_URL}" style="color:#151515;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;text-decoration:underline">APPLY TO THE ACADEMY &#8594;</a></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0"><tr><td style="border-top:1px solid #f0f0f0;padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a">
      You&#8217;re receiving this because you registered for the Assistara free masterclass.<br>
      <a href="${unsubAttr}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a>
    </td></tr></table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderText(opts: { first: string; eventDate: string; eventTime: string; dayWord: string; joinUrl: string; apps: number | null; limit: number; unsubscribeUrl: string }) {
  const { first, eventDate, eventTime, dayWord, joinUrl, apps, limit, unsubscribeUrl } = opts;
  const count = typeof apps === "number" ? apps : 0;
  const remaining = Math.max(0, limit - count);
  const spots = typeof apps === "number" ? `P.S. ${count} Academy applications have already come in and the Academy accepts just ${limit} students - down to ${remaining} spots left!` : "";
  return [
    `Hey ${first}! 💛`,
    "",
    "Okay, I have to admit... I've been looking forward to tomorrow all week! ✨",
    "",
    `I'm Xyra, co-founder of Assistara, and ${dayWord} I'll be going live with the free masterclass you signed up for:`,
    "",
    "How to Land Your First Remote Client (as a Complete Beginner)",
    "",
    `And don't worry, I'm not going to tell you to just "learn some skills" and send 100 job applications. 😅`,
    "",
    "I've worked remotely with multiple international clients, earned in foreign currencies, and experienced firsthand what it's like to build opportunities beyond the traditional 9-to-5.",
    "",
    "I've seen what clients actually look for, what makes them trust someone enough to hire them, and why so many beginners struggle to get noticed.",
    "",
    "And if there's one thing that experience has taught me, it's this:",
    "",
    "Making money online doesn't have to be as complicated as people make it seem. 💛",
    "",
    "You don't need to have everything figured out. You need to know what services people are willing to pay for, where to find the right clients, and how to give them a reason to choose you.",
    "",
    `That's exactly what I want to show you ${dayWord}.`,
    "",
    `- ${eventDate}`,
    `- ${eventTime} Philippine Time`,
    "- Live on Assistara",
    "",
    `Join: ${joinUrl}`,
    "",
    "Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️",
    "",
    "Can't wait to see you there! 💛",
    "",
    "Xyra Mendoza",
    "Co-founder, Assistara",
    "",
    spots,
    "",
    "Our team will start reviewing applications in the order they came in right after the livestream. If the Academy has been on your mind, send in your application before we go live. I'd hate for you to miss out! 💛",
    `Apply to the Academy: ${ACADEMY_URL}`,
    "",
    "You're receiving this because you registered for the Assistara free masterclass.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// ----------------------------------------------------------------------------
// The reminder send itself (shared by run + test)
// ----------------------------------------------------------------------------
async function sendReminder(signup: { id: string; name: string; email: string; attendee_token: string }, extra?: { prefixSubject?: string }) {
  const event = await eventRow();
  if (!event?.scheduled_at) throw Error("Event not scheduled");
  const apps = await academyAppCount();
  const joinUrl = `${SITE}/live?t=${encodeURIComponent(signup.attendee_token)}`;
  const unsubUrl = `${SITE}/unsubscribe?t=${encodeURIComponent(signup.attendee_token)}`;
  const first = (signup.name || "there").split(/\s+/)[0];
  const dateLabel = eventDateLabel(event.scheduled_at);
  const timeLabel = eventTimeLabel(event.scheduled_at);
  const dayWord = relativeDay(event.scheduled_at);
  const subject = `${first}, your first online paycheck starts with a plan! 💛`;
  const finalSubject = extra?.prefixSubject ? `[TEST] ${subject}` : subject;
  const html = renderHtml({ first, eventDate: dateLabel, eventTime: timeLabel, dayWord, joinUrl, apps, limit: INTAKE_LIMIT, unsubscribeUrl: unsubUrl });
  const text = renderText({ first, eventDate: dateLabel, eventTime: timeLabel, dayWord, joinUrl, apps, limit: INTAKE_LIMIT, unsubscribeUrl: unsubUrl });
  const idem = `${EVENT_KEY}:${signup.id}`;
  const result = await mail(signup.email, finalSubject, html, text, idem);
  return { event, apps, joinUrl, unsubUrl, subject: finalSubject, result, defaults: { date: dateLabel, time: timeLabel, dayWord }, logo: LOGO_URL, academyUrl: ACADEMY_URL };
}

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------
async function handleRun(body: any) {
  if (clean(body.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) {
    return { ok: false, error: "Unauthorized" };
  }
  const event = await eventRow();
  if (!event?.scheduled_at) return { ok: false, error: "Event not scheduled" };
  const sched = Date.parse(event.scheduled_at);
  const now = Date.now();
  if (Number.isFinite(sched) && now >= sched) return { ok: true, skipped: "event started" };
  const target = sched - REMIND_HOURS * 36e5;
  const windowOpen = Number.isFinite(sched) && now >= target - GRACE_BEFORE_HOURS * 36e5;
  if (!windowOpen) return { ok: true, skipped: "window not yet open", started: false };

  if (!ENABLED) return { ok: true, disabled: "MASTERCLASS_REMINDER_ENABLED is false — production sending off", started: false };

  const eligible = await eligibleSignups(new Date(target).toISOString());
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  let resent = 0;
  for (const s of eligible) {
    const claim = await claimReminder(String(s.id));
    if (claim === "exists") { skipped.push(String(s.email)); continue; }
    if (claim === "error") { failed.push(String(s.email)); continue; }
    try {
      await sendReminder(s);
      await finishReminder(String(s.id), { status: "sent", provider: "resend", updated_at: new Date().toISOString() });
      sent.push(String(s.email));
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const retryable = /Resend email failed 5\d\d|Brevo email failed 5\d\d|fetch failed|network/i.test(msg);
      await finishReminder(String(s.id), { status: retryable ? "retryable" : "failed", error: msg.slice(0, 500), attempts: retryable ? 2 : 1 });
      failed.push(String(s.email));
    }
  }
  // Safe retry: only rows that failed hard (5xx), never ambiguous results.
  if (ENABLED) {
    const rr = await api(
      `rest/v1/masterclass_reminders?event_key=eq.${encodeURIComponent(EVENT_KEY)}&status=eq.retryable&select=signup_id,attempts`
    );
    const rows = await rr.json().catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (resent >= 3) break; // cap retries per run
      if (row?.attempts && row.attempts >= 3) continue;
      const su = await api(
        `rest/v1/masterclass_signups?id=eq.${encodeURIComponent(String(row.signup_id))}&select=id,name,email,attendee_token&limit=1`
      );
      const suj = await su.json().catch(() => []);
      const s = Array.isArray(suj) ? suj[0] : null;
      if (!s) continue;
      try {
        await sendReminder(s);
        await finishReminder(String(row.signup_id), { status: "sent", provider: "resend", attempts: (row.attempts || 1) + 1, error: null });
        resent++;
      } catch { /* leave retryable for the next run */ }
    }
  }
  return { ok: true, started: true, eligible: eligible.length, sent, skipped, failed, resent };
}

async function handleTest(body: any) {
  if (clean(body.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) {
    return { ok: false, error: "Unauthorized" };
  }
  const email = clean(body.email, 254).toLowerCase();
  if (!validEmail(email)) return { ok: false, error: "Valid email required" };
  const name = clean(body.name, 200) || "there";
  // Reuse an existing registration token when present; otherwise create a safe
  // test registration (no generic link, no exposure of other attendees).
  const ex = await api(`rest/v1/masterclass_signups?email=eq.${encodeURIComponent(email)}&select=id,name,email,attendee_token&limit=1`);
  const exj = await ex.json().catch(() => []);
  let signup = Array.isArray(exj) ? exj[0] : null;
  if (!signup || !TOKEN_RE.test(String(signup.attendee_token || ""))) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    const cr = await api("rest/v1/masterclass_signups?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: name === "there" ? null : name, email, source: "test_reminder", status: "registered", attendee_token: token }),
    });
    const crj = await cr.json().catch(() => []);
    if (!cr.ok || !Array.isArray(crj) || !crj[0]?.id) return { ok: false, error: "Could not create test registration", status: cr.status };
    signup = { id: crj[0].id, name, email, attendee_token: token };
  }
  const sender = await senderStatus();
  const result = await sendReminder(signup, { prefixSubject: true });
  return { ok: true, testEmail: email, sender, ...result };
}

async function handleStats() {
  const event = await eventRow();
  const apps = await academyAppCount();
  const sr = await api("rest/v1/masterclass_signups?select=id,status&status=in.(registered,purchased)&unsubscribed_at=is.null");
  const su = await sr.json().catch(() => []);
  const rr = await api(`rest/v1/masterclass_reminders?event_key=eq.${encodeURIComponent(EVENT_KEY)}&select=status`);
  const rm = await rr.json().catch(() => []);
  return {
    ok: true,
    event_key: EVENT_KEY,
    event: event ? { scheduled_at: event.scheduled_at, title: event.title } : null,
    academy_applications: apps,
    intake_limit: INTAKE_LIMIT,
    registered_attendees: Array.isArray(su) ? su.length : null,
    reminders_sent: Array.isArray(rm) ? rm.filter((r: any) => r.status === "sent").length : null,
    reminders_retryable: Array.isArray(rm) ? rm.filter((r: any) => r.status === "retryable").length : null,
    production_sending_enabled: ENABLED,
  };
}

async function handleUnsubscribePost(token: string) {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "Invalid token" };
  const r = await api(
    `rest/v1/masterclass_signups?attendee_token=eq.${encodeURIComponent(token)}&unsubscribed_at=is.null`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }) }
  );
  const j = await r.json().catch(() => []);
  if (!r.ok) return { ok: false, error: "Unsubscribe failed", status: r.status };
  if (!Array.isArray(j) || j.length === 0) return { ok: false, error: "No active registration matches this link", status: 404 };
  return { ok: true, unsubscribed: true };
}

// ----------------------------------------------------------------------------
// Read-only: confirm Resend's delivery state for a message id (no send involved).
async function emailStatus(body: any) {
  if (clean(body.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) return { ok: false, error: "Unauthorized" };
  const id = clean(body.id, 100);
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return { ok: false, error: "Valid message id required" };
  if (!RESEND) return { ok: false, error: "RESEND_API_KEY missing" };
  try {
    const r = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${RESEND}` } });
    const j = await r.json().catch(() => ({} as any));
    const d = j?.data ?? j ?? {};
    return { ok: r.ok, id, state: d?.state ?? d?.last_event ?? null, subject: d?.subject ?? null, from: d?.from ?? null, created_at: d?.created_at ?? null, provider_status: r.status };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

Deno.serve(async (req: Request) => {
  const o = req.headers.get("origin");
  const h = cors(o);
  const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

  const url = new URL(req.url);
  const params = url.searchParams;
  const token = clean(params.get("t"), 64);
  const queryAction = clean(params.get("action"), 50);

  // GET serves only the unsubscribe confirm page: /unsubscribe?t=...
  if (req.method === "GET") {
    if (queryAction === "unsubscribe" || token) return out({ ok: false, error: "Unsubscribe requires confirmation — open this link in a browser and click the confirm button.", status: "confirm_required" }, 400);
    return out({ ok: false, error: "Not found" }, 404);
  }
  if (req.method !== "POST") return out({ ok: false, error: "Method not allowed" }, 405);

  const ctype = (req.headers.get("content-type") || "").toLowerCase();

  // Non-JSON POST = the static confirm page submitting the token (form-encoded).
  if (!ctype.includes("application/json")) {
    let t = token;
    if (!t) {
      try {
        const fd = await req.formData();
        t = clean(String(fd.get("t") || ""), 64);
      } catch {}
    }
    if (queryAction !== "unsubscribe" && !t) return out({ ok: false, error: "Missing unsubscribe token" }, 400);
    return out(await handleUnsubscribePost(t));
  }

  // JSON API: cron/run, test, stats, and programmatic unsubscribe.
  let b: any = {};
  try { b = await req.json(); } catch {}
  const act = String(b.action || queryAction || "").trim().toLowerCase();

  if (act === "unsubscribe") return out(await handleUnsubscribePost(clean(b.t, 64) || token));
  if (act === "run") return out(await handleRun(b));
  if (act === "test") return out(await handleTest(b));
  if (act === "stats") {
    if (clean(b.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) return out({ ok: false, error: "Unauthorized" }, 401);
    return out(await handleStats());
  }
  if (act === "email_status") return out(await emailStatus(b));
  return out({ ok: false, error: "Unknown action" }, 400);
});
