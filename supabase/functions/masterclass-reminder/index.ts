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
//  - Exactly-once per attendee is enforced by email_delivery_log(idempotency_key)
//    unique + provider Idempotency-Key.
//  - The reminder only includes people registered BEFORE the 24h mark; late
//    registrants keep the normal confirmation flow (no catch-up reminder).
//  - Unsubscribing requires a deliberate POST from a confirm page, so email
//    scanners that merely open the link do not opt anyone out.
//  - Emails NEVER send after the event deadline.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createEmailDelivery, EmailDeliveryOptions } from "../_shared/email-delivery.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("MASTERCLASS_CRON_SECRET") || "";
const ENABLED = Deno.env.get("MASTERCLASS_REMINDER_ENABLED") === "true";

const SITE = "https://www.getassistara.com";
const EVENT_KEY = "founding-masterclass-2026";
const SENDER_NAME = "Xyra from Assistara";
const SENDER_EMAIL = "xyra@getassistara.com";
const FROM = `${SENDER_NAME} <${SENDER_EMAIL}>`;
const REPLY = SENDER_EMAIL;
const ACADEMY_URL = `${SITE}/academy/apply`;
const INTAKE_LIMIT = 15;
const REMIND_HOURS = 24;
const GRACE_BEFORE_HOURS = 2;

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
  s.replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">").replaceAll('"', "&").replaceAll("'", "&#039;");
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
// Event + recipient data
// ----------------------------------------------------------------------------
async function eventRow() {
  const r = await api(`rest/v1/masterclass_events?event_key=eq.${encodeURIComponent(EVENT_KEY)}&select=event_key,title,scheduled_at,ended_at,status,live_destination_url&limit=1`);
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j[0] : null;
}

async function eligibleSignups(createdBeforeIso: string) {
  const r = await api(
    `rest/v1/masterclass_signups?status=in.(registered,purchased)&unsubscribed_at=is.null&created_at=lt.${encodeURIComponent(createdBeforeIso)}&select=id,name,email,attendee_token,status,created_at`
  );
  const j = await r.json().catch(() => []);
  if (!Array.isArray(j)) return [];
  return j.filter(
    (x: any) => validEmail(String(x.email || "")) && TOKEN_RE.test(String(x.attendee_token || ""))
  );
}

async function academyAppCount() {
  const r = await api("rest/v1/academy_applications?select=id");
  if (!r.ok) return null;
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j.length : null;
}

// ----------------------------------------------------------------------------
// Calendar helpers
// ----------------------------------------------------------------------------
const EVENT_DURATION_MINUTES = 90;

function utcBasic(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function calendarSpan(startIso: string) {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + EVENT_DURATION_MINUTES * 60 * 1000);
  return { startBasic: utcBasic(start.toISOString()), endBasic: utcBasic(end.toISOString()) };
}
function googleCalendarUrl(title: string, startIso: string, joinUrl: string) {
  const { startBasic, endBasic } = calendarSpan(startIso);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${startBasic}/${endBasic}`,
    details: `Join the free masterclass live here:\n${joinUrl}\n\nSave this email so you can easily find your link when it's time to join! 💛`,
    location: joinUrl,
    ctz: "Asia/Manila",
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
function icsEscape(v: string) {
  return v.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
function icsContent(title: string, startIso: string, joinUrl: string, uid: string) {
  const { startBasic, endBasic } = calendarSpan(startIso);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Assistara//Masterclass Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcBasic(new Date().toISOString())}`,
    `DTSTART:${startBasic}`,
    `DTEND:${endBasic}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape("Join the free masterclass live here: " + joinUrl)}`,
    `LOCATION:${icsEscape(joinUrl)}`,
    `URL:${joinUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------------------
// Approved copy -> email HTML
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
  calendarUrl: string;
  icsUrl: string;
}) {
  const { first, eventDate, eventTime, dayWord, joinUrl, apps, limit, unsubscribeUrl, calendarUrl, icsUrl } = opts;
  const count = typeof apps === "number" ? apps : 0;
  const remaining = Math.max(0, limit - count);
  const verified = typeof apps === "number";
  const spotsLine = verified
    ? `We&#8217;ve already received <b>${count} Academy applications!</b> We&#8217;re accepting just <b>${limit} students</b>, so if everyone gets accepted, that&#8217;s only <b>${remaining} spots left!</b> 🫣`
    : `We&#8217;re accepting just <b>${limit} students</b> in the Academy, and applications are reviewed in the order they come in. 🫣`;
  const joinAttr = escAttr(joinUrl);
  const unsubAttr = escAttr(unsubscribeUrl);
  const calAttr = escAttr(calendarUrl);
  const icsAttr = escAttr(icsUrl);
  const P = "margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323";
  const A = "color:#1155cc;text-decoration:underline";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your free masterclass reminder</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:32px 20px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
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
    <p style="${P}">Here&#8217;s your personal link to join us live:</p>
    <p style="${P}"><a href="${joinAttr}" style="${A};word-break:break-all">${esc(joinUrl)}</a></p>
    <p style="${P}">Save this email so you can easily find your link when it&#8217;s time to join! 💛</p>
    <p style="${P}"><a href="${calAttr}" style="${A}">📅 Add to Calendar</a></p>
    <p style="margin:-8px 0 18px;line-height:1.5;font-size:13px;color:#8a8a8a">On Apple or Outlook? <a href="${icsAttr}" style="color:#8a8a8a;text-decoration:underline">Download the calendar file (.ics)</a></p>
    <p style="${P}">Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️</p>
    <p style="${P}">Can&#8217;t wait to see you there! 💛</p>
    <p style="margin:26px 0 30px;line-height:1.55;font-size:16px;color:#232323"><b>Xyra Mendoza</b><br><span style="color:#6b6b6b">Co-founder, Assistara</span></p>
    <p style="margin:0 0 16px;line-height:1.62;font-size:15px;color:#232323"><b>P.S. 👀</b> ${spotsLine}</p>
    <p style="margin:0 0 16px;line-height:1.62;font-size:15px;color:#232323">Our team will start reviewing applications in the order they came in right after the livestream. If the Academy has been on your mind, send in your application before we go live. I&#8217;d hate for you to miss out! 💛</p>
    <p style="margin:0 0 34px;line-height:1.62;font-size:15px;color:#232323">Apply to the Academy: <a href="${ACADEMY_URL}" style="${A}">${ACADEMY_URL}</a></p>
    <p style="margin:0;line-height:1.6;font-size:12px;color:#8a8a8a">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="${unsubAttr}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderText(opts: {
  first: string;
  eventDate: string;
  eventTime: string;
  dayWord: string;
  joinUrl: string;
  apps: number | null;
  limit: number;
  unsubscribeUrl: string;
  calendarUrl: string;
  icsUrl: string;
}) {
  const { first, eventDate, eventTime, dayWord, joinUrl, apps, limit, unsubscribeUrl, calendarUrl, icsUrl } = opts;
  const count = typeof apps === "number" ? apps : 0;
  const remaining = Math.max(0, limit - count);
  const spots = typeof apps === "number"
    ? `P.S. ${count} Academy applications have already come in and the Academy accepts just ${limit} students - down to ${remaining} spots left!`
    : "";
  return [
    `Hey ${first}! 💛`,
    "Okay, I have to admit... I've been looking forward to tomorrow all week! ✨",
    `I'm Xyra, co-founder of Assistara, and ${dayWord} I'll be going live with the free masterclass you signed up for:`,
    "How to Land Your First Remote Client (as a Complete Beginner)",
    `And don't worry, I'm not going to tell you to just "learn some skills" and send 100 job applications. 😅`,
    "I've worked remotely with multiple international clients, earned in foreign currencies, and experienced firsthand what it's like to build opportunities beyond the traditional 9-to-5.",
    "I've seen what clients actually look for, what makes them trust someone enough to hire them, and why so many beginners struggle to get noticed.",
    "And if there's one thing that experience has taught me, it's this:",
    "Making money online doesn't have to be as complicated as people make it seem. 💛",
    "You don't need to have everything figured out. You need to know what services people are willing to pay for, where to find the right clients, and how to give them a reason to choose you.",
    `That's exactly what I want to show you ${dayWord}.`,
    [`📅 ${eventDate}`, `⏰ ${eventTime} Philippine Time`, "📍 Live on Assistara"].join("\n"),
    ["Here's your personal link to join us live:", joinUrl].join("\n"),
    "Save this email so you can easily find your link when it's time to join! 💛",
    ["Add to Calendar: " + calendarUrl, "Apple / Outlook (.ics): " + icsUrl].join("\n"),
    "Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️",
    "Can't wait to see you there! 💛",
    ["Xyra Mendoza", "Co-founder, Assistara"].join("\n"),
    spots,
    "Our team will start reviewing applications in the order they came in right after the livestream. If the Academy has been on your mind, send in your application before we go live. I'd hate for you to miss out! 💛",
    "Apply to the Academy: " + ACADEMY_URL,
    ["You're receiving this because you registered for the Assistara free masterclass.", "Unsubscribe: " + unsubscribeUrl].join("\n"),
  ]
    .filter((p) => p && p.length > 0)
    .join("\n\n");
}

// ----------------------------------------------------------------------------
// Date helpers
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
// The reminder send itself (shared by run + test)
// ----------------------------------------------------------------------------
async function sendReminder(
  signup: { id: string; name: string; email: string; attendee_token: string },
  extra?: { prefixSubject?: boolean; uniqueIdem?: string; forceProvider?: "resend" | "brevo" | "sender"; subjectOverride?: string }
) {
  const event = await eventRow();
  if (!event?.scheduled_at) throw Error("Event not scheduled");
  const apps = await academyAppCount();
  const token = signup.attendee_token;
  const joinUrl = `${SITE}/live?t=${encodeURIComponent(token)}`;
  const unsubUrl = `${SITE}/unsubscribe?t=${encodeURIComponent(token)}`;
  const title = event.title || "Assistara Free Masterclass";
  const calendarUrl = googleCalendarUrl(title, event.scheduled_at, joinUrl);
  const icsUrl = `${SITE}/masterclass.ics?action=calendar&t=${encodeURIComponent(token)}`;
  const first = (signup.name || "there").split(/\s+/)[0];
  const dateLabel = eventDateLabel(event.scheduled_at);
  const timeLabel = eventTimeLabel(event.scheduled_at);
  const dayWord = relativeDay(event.scheduled_at);
  const subject = `${first}, your first online paycheck starts with a plan! 💛`;
  const finalSubject = extra?.subjectOverride ? extra.subjectOverride : (extra?.prefixSubject ? `[TEST] ${subject}` : subject);
  const html = renderHtml({ first, eventDate: dateLabel, eventTime: timeLabel, dayWord, joinUrl, apps, limit: INTAKE_LIMIT, unsubscribeUrl: unsubUrl, calendarUrl, icsUrl });
  const text = renderText({ first, eventDate: dateLabel, eventTime: timeLabel, dayWord, joinUrl, apps, limit: INTAKE_LIMIT, unsubscribeUrl: unsubUrl, calendarUrl, icsUrl });
  
  const idem = extra?.uniqueIdem || `${EVENT_KEY}:${signup.id}`;
  const deadline = new Date(event.scheduled_at); // Hard deadline: event start time

  // Create delivery log entry (note: html/text are NOT stored here — only metadata)
  const deliveryLog = {
    idempotency_key: idem,
    email_type: "masterclass_reminder",
    recipient_email: signup.email,
    recipient_name: signup.name,
    subject: finalSubject,
    deadline: deadline.toISOString(),
    metadata: { signup_id: signup.id, event_key: EVENT_KEY },
    max_attempts: 3,
  };

  // Insert delivery log (idempotent: ignore a duplicate idempotency_key)
  const logRes = await api("rest/v1/email_delivery_log?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify([deliveryLog]),
  });
  if (!logRes.ok) {
    const t = await logRes.text().catch(() => "");
    console.error("email_delivery_log insert failed", logRes.status, t.slice(0, 300));
  }

  // Send via centralized delivery
  const delivery = await createEmailDelivery(`mc-reminder-${Date.now()}`);
  
  const result = await delivery.send({
    idempotencyKey: idem,
    emailType: "masterclass_reminder",
    to: signup.email,
    toName: signup.name,
    subject: finalSubject,
    html,
    text,
    replyTo: REPLY,
    deadline,
    maxAttempts: 3,
    metadata: { signup_id: signup.id, event_key: EVENT_KEY },
    forceProvider: extra?.forceProvider,
  });

  return { event, apps, joinUrl, unsubUrl, calendarUrl, icsUrl, subject: finalSubject, result, defaults: { date: dateLabel, time: timeLabel, dayWord }, academyUrl: ACADEMY_URL };
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
  const unknown: string[] = [];

  for (const s of eligible) {
    try {
      const result = await sendReminder(s);
      
      if (result.result.success) {
        sent.push(String(s.email));
      } else if (result.result.status === 'unknown') {
        unknown.push(String(s.email));
        // Log for reconciliation - don't auto-retry
      } else {
        failed.push(String(s.email));
      }
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      failed.push(String(s.email));
      console.error(`Failed to send reminder to ${s.email}:`, msg);
    }
  }

  return { ok: true, started: true, eligible: eligible.length, sent, skipped, failed, unknown };
}

async function handleTest(body: any) {
  if (clean(body.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) {
    return { ok: false, error: "Unauthorized" };
  }
  const email = clean(body.email, 254).toLowerCase();
  if (!validEmail(email)) return { ok: false, error: "Valid email required" };
  const name = clean(body.name, 200) || "there";
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
  let result;
  try {
    result = await sendReminder(signup, { prefixSubject: true, uniqueIdem: `test:${EVENT_KEY}:${signup.id}:${Date.now()}`, forceProvider: ["resend", "brevo", "sender"].includes(String(body.provider)) ? String(body.provider) as any : undefined, subjectOverride: clean(body.subject, 200) || undefined });
  } catch (e) {
    return { ok: false, testEmail: email, forcedProvider: body.provider || null, error: String(e instanceof Error ? e.message : e) };
  }
  return { ok: true, testEmail: email, forcedProvider: body.provider || null, ...result };
}

async function handleStats() {
  const event = await eventRow();
  const apps = await academyAppCount();
  const sr = await api("rest/v1/masterclass_signups?select=id,status&status=in.(registered,purchased)&unsubscribed_at=is.null");
  const su = await sr.json().catch(() => []);
  const rr = await api(`rest/v1/email_delivery_log?email_type=eq.masterclass_reminder&select=status`);
  const rm = await rr.json().catch(() => []);
  return {
    ok: true,
    event_key: EVENT_KEY,
    event: event ? { scheduled_at: event.scheduled_at, title: event.title } : null,
    academy_applications: apps,
    intake_limit: INTAKE_LIMIT,
    registered_attendees: Array.isArray(su) ? su.length : null,
    reminders_sent: Array.isArray(rm) ? rm.filter((r: any) => r.status === "sent").length : null,
    reminders_failed: Array.isArray(rm) ? rm.filter((r: any) => r.status === "failed").length : null,
    reminders_unknown: Array.isArray(rm) ? rm.filter((r: any) => r.status === "unknown").length : null,
    reminders_expired: Array.isArray(rm) ? rm.filter((r: any) => r.status === "expired").length : null,
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

async function emailStatus(body: any) {
  if (clean(body.cron_secret, 200) !== CRON_SECRET || !CRON_SECRET) return { ok: false, error: "Unauthorized" };
  const id = clean(body.id, 100);
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return { ok: false, error: "Valid message id required" };
  // We can't check Resend directly anymore without API key - use our log
  const r = await api(`rest/v1/email_delivery_log?provider_message_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const j = await r.json().catch(() => []);
  const d = j[0];
  if (!d) return { ok: false, error: "Message not found in delivery log" };
  return { ok: true, id, state: d.status, subject: d.subject, from: d.recipient_email, created_at: d.created_at, provider_status: 200 };
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

  if (req.method === "GET") {
    if (queryAction === "calendar") {
      const t = clean(params.get("t"), 64);
      if (!TOKEN_RE.test(t)) return out({ ok: false, error: "Valid token required" }, 400);
      const event = await eventRow();
      if (!event?.scheduled_at) return out({ ok: false, error: "Event not scheduled" }, 400);
      const joinUrl = `${SITE}/live?t=${encodeURIComponent(t)}`;
      const title = event.title || "Assistara Free Masterclass";
      const uid = `${EVENT_KEY}-${t}@getassistara.com`;
      const body = icsContent(title, event.scheduled_at, joinUrl, uid);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="assistara-masterclass.ics"',
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    if (queryAction === "unsubscribe" || token) return out({ ok: false, error: "Unsubscribe requires confirmation — open this link in a browser and click the confirm button.", status: "confirm_required" }, 400);
    return out({ ok: false, error: "Not found" }, 404);
  }

  if (req.method !== "POST") return out({ ok: false, error: "Method not allowed" }, 405);

  const ctype = (req.headers.get("content-type") || "").toLowerCase();

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