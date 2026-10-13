/*
 * READ-ONLY audit: the Academy "invitation delivery issue" indicator.
 *
 * Mirror of assistara-local-v9/admin.html:
 *   accepted  = activeApps().filter(x => currentDecision(x) === "accepted")
 *   delivered = accepted.filter(x => appAcceptanceEmail(x).delivered)
 *   indicator = accepted.length - delivered.length
 * where appAcceptanceEmail(x).delivered =
 *   latest activity event with action "decision_email_sent" and details.decision "accepted"
 *   exists AND latest.details.email_sent !== false
 *
 * Credentials are read at runtime from the repository's existing verification
 * script and are never printed. Read-only: admin-api login + admin-applications list.
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1";
const ORIGIN = "https://www.getassistara.com";

function loadCreds() {
  const src = fs.readFileSync(path.join(__dirname, "_verify_send.cjs"), "utf8");
  const pick = (key) => {
    const m = src.match(new RegExp(key + "\\s*:\\s*'([^']+)'|" + key + '\\s*:\\s*"([^"]+)"'));
    return m ? (m[1] || m[2]) : null;
  };
  const u = pick("username"), p = pick("password");
  if (!u || !p) throw new Error("credentials not found");
  return { u, p };
}

async function call(fn, body, token) {
  const r = await fetch(BASE + "/" + fn, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json", Origin: ORIGIN }, token ? { Authorization: "Bearer " + token } : {}),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try { return { status: r.status, data: JSON.parse(t) }; } catch { return { status: r.status, data: String(t).slice(0, 200) }; }
}

const D = (x) => String((x && x.decision) || "").trim().toLowerCase();
const S = (x) => String((x && x.status) || "").trim().toLowerCase();
const currentDecision = (x) => (D(x) === "accepted" || D(x) === "declined" ? D(x) : (S(x) === "accepted" || S(x) === "declined" ? S(x) : ""));

(async () => {
  const { u, p } = loadCreds();
  const login = await call("admin-api", { action: "login", username: u, password: p });
  const T = login.data && login.data.token;
  if (!T) { console.log(JSON.stringify({ ok: false, stage: "login", status: login.status }, null, 1)); process.exit(2); }

  const res = await call("admin-applications", { action: "list" }, T);
  const d = res.data || {};
  const apps = Array.isArray(d.applications) ? d.applications : [];
  const students = Array.isArray(d.students) ? d.students : [];
  const feed = Array.isArray(d.activity) ? d.activity : [];
  const all = apps.concat(students);

  const out = {
    ok: true,
    httpStatus: res.status,
    counts: { applications: apps.length, students: students.length, activityFeed: feed.length, feedTruncated: feed.length >= 1000 },
    sampleAppKeys: all[0] ? Object.keys(all[0]).sort() : [],
    hasPerAppActivity: all.some((x) => Array.isArray(x && x.activity)),
  };

  // group the top-level activity feed by entity (fallback if rows carry no .activity)
  const byEntity = new Map();
  for (const row of feed) {
    const k = String((row && row.entity_id) || "");
    if (!k) continue;
    if (!byEntity.has(k)) byEntity.set(k, []);
    byEntity.get(k).push(row);
  }
  const feedOrderedDesc = feed.every((row, i) => i === 0 || String(feed[i - 1].created_at) >= String(row.created_at));
  out.feedOrderedDesc = feedOrderedDesc;

  const accepted = all.filter((x) => currentDecision(x) === "accepted");
  const detailsOf = (x) => {
    const list = Array.isArray(x && x.activity) ? x.activity : (byEntity.get(String(x.id)) || []);
    return list.filter((e) => e && e.action === "decision_email_sent" && String((e.details || {}).decision || "").toLowerCase() === "accepted");
  };
  const isDelivered = (x) => { const a = detailsOf(x); return a.length > 0 && a[0].details && a[0].details.email_sent !== false; };

  const noEvent = [], failed = [], okRows = [];
  for (const x of accepted) {
    const a = detailsOf(x);
    if (!a.length) noEvent.push(x);
    else if (a[0].details && a[0].details.email_sent === false) failed.push({ x, a });
    else okRows.push({ x, a });
  }

  out.indicator = { accepted: accepted.length, delivered: okRows.length, indicator: accepted.length - okRows.length };
  out.breakdown = { noDecisionEmailEvent: noEvent.length, lastEventEmailSentFalse: failed.length, delivered: okRows.length };

  const row = (x, extra) => Object.assign({
    email: x.email || null, name: x.name || null, id: x.id || null,
    decision: D(x) || null, status: S(x) || null, payment_status: x.payment_status || null,
    created_at: x.created_at || null,
  }, extra || {});

  out.listResponseKeys = Object.keys(d).sort();
  out.activityFieldType = Object.prototype.hasOwnProperty.call(d, "activity") ? (Array.isArray(d.activity) ? "array(" + d.activity.length + ")" : typeof d.activity) : "MISSING";

  // Cross-check 1: the acceptance campaign in the provider email telemetry.
  const acc = await call("admin-email", { action: "overview", campaign: "academy_decisions" }, T);
  const ao = acc.data && acc.data.overview;
  out.acceptanceCampaign = ao
    ? { status: acc.status, totals: ao.totals, measured: ao.measured, rates: ao.rates, providers: ao.providers }
    : { status: acc.status, raw: acc.data };

  // Cross-check 2: real provider timelines for the first few flagged recipients.
  out.recipientTimelines = [];
  for (const x of noEvent.slice(0, 3)) {
    const rr = await call("admin-email", { action: "recipient", email: String(x.email || "") }, T);
    const msgs = (rr.data && rr.data.messages) || [];
    out.recipientTimelines.push({
      email: x.email,
      status: rr.status,
      messages: msgs.slice(0, 4).map((m) => ({
        email_type: m.email_type, provider: m.provider, provider_message_id: m.provider_message_id,
        status: m.status, created_at: m.created_at, sent_at: m.sent_at, delivered_at: m.delivered_at,
        bounced_at: m.bounced_at, attempts: m.attempts,
        events: (m.events || []).map((e) => ({ event_type: e.event_type, event_timestamp: e.event_timestamp, provider: e.provider, reliability: e.reliability })),
      })),
    });
  }

  out.noEventSample = noEvent.slice(0, 30).map((x) => row(x, { events: 0 }));

  out.failedSample = failed.slice(0, 30).map(({ x, a }) => row(x, {
    events: a.length,
    latest: { created_at: a[0].created_at, email_sent: a[0].details && a[0].details.email_sent, provider: a[0].details && a[0].details.provider, template_key: a[0].details && a[0].details.template_key },
    allEvents: a.map((e) => ({ created_at: e.created_at, email_sent: e.details && e.details.email_sent, provider: e.details && e.details.provider })),
  }));

  // Retried-later-successfully detection: latest (by time) says true but the first
  // element in the feed order says false (or vice versa).
  out.orderMismatches = accepted.map((x) => {
    const a = detailsOf(x);
    if (a.length < 2) return null;
    const byTime = a.slice().sort((m, n) => String(n.created_at).localeCompare(String(m.created_at)))[0];
    const first = a[0];
    if (String(byTime.created_at) === String(first.created_at)) return null;
    return { email: x.email || null, firstElement: { created_at: first.created_at, email_sent: first.details && first.details.email_sent }, newestByTime: { created_at: byTime.created_at, email_sent: byTime.details && byTime.details.email_sent } };
  }).filter(Boolean);

  // ── AFTER: the fixed metric, derived exactly as the fixed code does ──
  // The fixed admin-applications list reads email_delivery_log (invitation
  // types) + email_events and attaches acceptance_email.state per record:
  //   delivered   any invitation message with delivered_at or a 'delivered' event
  //   bounced     bounced_at or a 'bounced' event (and none delivered)
  //   failed      status 'failed' or a 'failed' event (and none delivered)
  //   deferred    a 'deferred' event, no delivery yet
  //   unresolved  an invitation was recorded but has no delivery confirmation
  //   not_issued  no invitation message recorded for this applicant
  const INVITE_TYPES = ["academy_acceptance", "academy_enrollment_link_fixed"];
  const perRecipient = [];
  const tally = { delivered: 0, bounced: 0, failed: 0, deferred: 0, unresolved: 0, not_issued: 0 };
  for (const x of accepted) {
    const email = String(x.email || "").trim().toLowerCase();
    const rr = await call("admin-email", { action: "recipient", email }, T);
    const msgs = ((rr.data && rr.data.messages) || []).filter((m) => INVITE_TYPES.includes(String(m.email_type || "")));
    const agg = { delivered: false, bounced: false, failed: false, deferred: false, messages: msgs.length, provider: null, provider_message_id: null, status: null, email_type: null, sent_at: null, delivered_at: null, bounced_at: null, events: [] };
    for (const m of msgs) {
      const ev = new Set((m.events || []).map((e) => String(e.event_type || "")));
      for (const t of ev) if (!agg.events.includes(t)) agg.events.push(t);
      if (m.delivered_at || ev.has("delivered")) agg.delivered = true;
      if (m.bounced_at || ev.has("bounced")) agg.bounced = true;
      if (String(m.status || "") === "failed" || ev.has("failed")) agg.failed = true;
      if (ev.has("deferred")) agg.deferred = true;
      if (!agg.provider_message_id && m.provider_message_id) {
        agg.provider = m.provider || null;
        agg.provider_message_id = m.provider_message_id || null;
        agg.status = m.status || null;
        agg.email_type = m.email_type || null;
        agg.sent_at = m.sent_at || null;
        agg.delivered_at = m.delivered_at || null;
        agg.bounced_at = m.bounced_at || null;
      }
    }
    const state = agg.delivered ? "delivered" : agg.bounced ? "bounced" : agg.failed ? "failed" : agg.deferred ? "deferred" : (agg.messages ? "unresolved" : "not_issued");
    tally[state] += 1;
    perRecipient.push({
      email, name: x.name || null, state, invited_messages: agg.messages,
      provider: agg.provider, provider_message_id: agg.provider_message_id,
      status: agg.status, sent_at: agg.sent_at, delivered_at: agg.delivered_at, bounced_at: agg.bounced_at,
      eventTypes: agg.events.join(","),
    });
  }
  const failedCount = tally.bounced + tally.failed;
  out.afterFix = {
    accepted: accepted.length,
    delivered: tally.delivered,
    permanentlyFailed: tally.bounced + tally.failed,
    temporarilyDelayed: tally.deferred,
    unconfirmed: tally.unresolved,
    notIssued: tally.not_issued,
    states: tally,
    indicators: { "invitation delivery failure": tally.bounced + tally.failed, "unconfirmed invitation": tally.unresolved + tally.not_issued, "temporary invitation delay": tally.deferred },
    tileSub: tally.delivered + " invitations delivered",
    note: "mirrors the fixed admin-applications derivation, read through the authorized admin-email recipient action",
  };
  out.perRecipient = perRecipient;

  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.log(JSON.stringify({ ok: false, stage: "exception", error: String((e && e.message) || e).slice(0, 300) }, null, 1)); process.exit(1); });
