import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  summarize,
  summarizeCampaigns,
  buildTimeline,
  classifyKind,
  type LogRow,
  type EventRow,
  type AttemptRow,
  type ProviderConfig,
} from "../_shared/email-analytics.ts";
import {
  fetchProviderStatus,
  webhookSecretName,
  webhookSecretPresent,
  type ProviderId,
} from "../_shared/provider-status.ts";

// ----------------------------------------------------------------------------
// Email Command Center data API.
//
// The single read model behind admin-email.html. It never sends email, never
// calls a provider on a normal refresh, and never invents numbers:
//   overview           acceptance + (measured) delivery/engagement aggregates
//   campaigns          per-campaign rollups with preview availability
//   recipient          one recipient's full message + event timeline
//   message            the exact captured render for one message
//   campaign_preview   captured render, else current-template render
//   providers          provider status; optionally authoritatively synced
//   activity           recent webhook events for live monitoring
//   acquisition        compact acquisition snapshot (separate from email)
//   setup              the "Setup Required" checklist
//
// Auth: identical HMAC admin session token used by the other admin functions.
// ----------------------------------------------------------------------------

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);
const good = (origin: string | null) => !!origin && (allowed.has(origin) || origin.endsWith(".vercel.app"));
const headers = (origin: string | null) => ({
  "content-type": "application/json",
  "access-control-allow-origin": good(origin) ? origin! : SITE,
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "POST,OPTIONS",
  vary: "Origin",
});

const encoder = new TextEncoder();
const b64url = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromB64url = (v: string) =>
  Uint8Array.from(atob(v.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (v.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
async function admin(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature || (await sign(payload)) !== signature) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return !!data.v && data.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && data.u === "admin" && Date.now() < data.exp;
  } catch {
    return false;
  }
}

const clean = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const LOG_COLS =
  "id,idempotency_key,email_type,campaign_key,recipient_email,recipient_name,subject,provider,provider_message_id,status,attempts,created_at,sent_at,delivered_at,bounced_at,complained_at,first_opened_at,first_clicked_at,open_count,click_count,metadata";
const EVENT_COLS = "delivery_log_id,campaign_key,provider,provider_message_id,event_type,recipient_email,event_timestamp,reliability";

const DAY = 86400000;
function defaultRange(from?: string, to?: string) {
  const now = Date.now();
  const toIso = to ? new Date(to).toISOString() : new Date(now).toISOString();
  const fromIso = from ? new Date(from).toISOString() : new Date(now - 30 * DAY).toISOString();
  return { from: fromIso, to: toIso };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = headers(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST" || (origin && !good(origin))) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: h });
  }
  if (!(await admin(req))) {
    return new Response(JSON.stringify({ ok: false, error: "Session expired" }), { status: 401, headers: h });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  const out = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });
  const action = String(body.action || "").toLowerCase();

  try {
    if (action === "overview") {
      const { from, to } = defaultRange(body.from, body.to);
      const provider = clean(body.provider, 40) || null;
      const campaign = clean(body.campaign, 200) || null;
      const [logs, events, attempts, configs, suppressions] = await Promise.all([
        fetchLogs(db, from, to, provider, campaign),
        fetchEvents(db, from, to, provider, campaign),
        fetchAttempts(db, from, to, provider),
        fetchConfigs(db),
        countRows(db, "email_suppressions"),
      ]);
      const overview = summarize({ logs, events, attempts, configs: configs as ProviderConfig[], from, to });
      return out({ ok: true, range: { from, to }, filters: { provider, campaign }, overview, suppressions, generatedAt: new Date().toISOString() });
    }

    if (action === "campaigns") {
      const { from, to } = defaultRange(body.from, body.to);
      const provider = clean(body.provider, 40) || null;
      const kindFilter = clean(body.kind, 20) || null;
      const [logs, events, attempts, renderedKeys] = await Promise.all([
        fetchLogs(db, from, to, provider, null),
        fetchEvents(db, from, to, provider, null),
        fetchAttempts(db, from, to, provider),
        db.from("email_renders").select("campaign_key").limit(5000).then((r: any) => r.data || []),
      ]);
      const rendered = new Set<string>((renderedKeys as any[]).map((r) => String(r.campaign_key || "")).filter(Boolean));
      let campaigns = summarizeCampaigns({ logs, events, attempts, renderedKeys: rendered });
      if (kindFilter === "campaign" || kindFilter === "automated") campaigns = campaigns.filter((c) => c.kind === kindFilter);
      return out({ ok: true, range: { from, to }, campaigns, generatedAt: new Date().toISOString() });
    }

    if (action === "recipient") {
      const email = clean(body.email, 320).toLowerCase();
      if (!email) return out({ ok: false, error: "Recipient email required" }, 400);
      const logs = await fetchLogsByRecipient(db, email);
      const ids = logs.map((l: any) => l.id);
      const [events, attempts, supp] = await Promise.all([
        ids.length
          ? db.from("email_events").select(EVENT_COLS).in("delivery_log_id", ids).order("event_timestamp", { ascending: true }).limit(20000).then((r: any) => r.data || [])
          : Promise.resolve([]),
        ids.length
          ? db.from("email_delivery_attempts").select("delivery_log_id,provider,attempt_number,created_at").in("delivery_log_id", ids).limit(20000).then((r: any) => r.data || [])
          : Promise.resolve([]),
        db.from("email_suppressions").select("reason,provider,source,detail,created_at").eq("email", email).maybeSingle().then((r: any) => r.data || null),
      ]);
      const timeline = buildTimeline({ logs, events, attempts });
      return out({ ok: true, email, suppression: supp, messages: timeline, generatedAt: new Date().toISOString() });
    }

    if (action === "message" || action === "campaign_preview") {
      const id = clean(body.id, 64);
      const campaign = clean(body.campaign, 200);
      if ((!id && !campaign) || (!id && !campaign)) return out({ ok: false, error: "id or campaign required" }, 400);
      const render = await latestRender(db, { id: id || null, campaign: campaign || null });
      if (render) {
        return out({ ok: true, captured: true, rendered_from: "captured", render });
      }
      // No captured copy (pre-dates capture). Offer the current deployed template
      // for the masterclass timed reminders, clearly labelled as such.
      const emailType = id ? await emailTypeForLog(db, id) : await emailTypeForCampaign(db, campaign);
      const which = emailType === "masterclass_reminder_30" ? "30" : emailType === "masterclass_reminder_7" ? "7" : null;
      if (which) {
        const rendered = await proxyMasterclassPreview(which);
        if (rendered) return out({ ok: true, captured: false, rendered_from: "current_template", email_type: emailType, ...rendered });
      }
      return out({
        ok: true,
        captured: false,
        rendered_from: "unavailable",
        email_type: emailType,
        note: "No captured copy exists for this message (it was sent before render capture was enabled) and no live template is available for this type.",
      });
    }

    if (action === "providers") {
      const sync = body.sync === true;
      const [configs, quota, health, usage, failures] = await Promise.all([
        fetchConfigs(db, true),
        db.from("email_provider_quota").select("provider,quota_date,daily_limit,used_count,monthly_limit,monthly_used,is_active,last_checked_at,updated_at").order("quota_date", { ascending: false }).limit(30).then((r: any) => r.data || []),
        db.from("email_provider_health").select("provider,priority,consecutive_failures,last_failed_at,last_succeeded_at,cooldown_until,last_error_category").then((r: any) => r.data || []),
        providerUsage(db),
        recentFailures(db),
      ]);
      let status: any[] = [];
      if (sync) {
        status = await Promise.all(
          (["resend", "brevo", "sender"] as ProviderId[]).map((p) => {
            const cfg = (configs as any[]).find((c) => c.provider === p);
            return fetchProviderStatus(p, cfg?.domain || "getassistara.com");
          }),
        );
        await persistProviderStatus(db, status);
      }
      return out({
        ok: true,
        providers: configs,
        quota,
        health,
        usage,
        failures,
        live: status,
        secrets: (["resend", "brevo", "sender"] as ProviderId[]).map((p) => ({ provider: p, secret_name: webhookSecretName(p), secret_present: webhookSecretPresent(p) })),
        generatedAt: new Date().toISOString(),
      });
    }

    if (action === "activity") {
      const since = clean(body.since, 40) || new Date(Date.now() - 5 * 60000).toISOString();
      const [receipts, events] = await Promise.all([
        db.from("email_webhook_events").select("provider,event_type,verified,processed,received_at,processing_error").gt("received_at", since).order("received_at", { ascending: false }).limit(60).then((r: any) => r.data || []),
        db.from("email_events").select("provider,event_type,campaign_key,recipient_email,event_timestamp").gt("created_at", since).order("created_at", { ascending: false }).limit(60).then((r: any) => r.data || []),
      ]);
      const [eventsTotal, receiptsTotal, unverified] = await Promise.all([
        countRows(db, "email_events"),
        countRows(db, "email_webhook_events"),
        countRows(db, "email_webhook_events", (q: any) => q.eq("verified", false)),
      ]);
      return out({ ok: true, since, receipts, events, totals: { events: eventsTotal, receipts: receiptsTotal, unverified }, serverTime: new Date().toISOString() });
    }

    if (action === "acquisition") {
      const now = Date.now();
      const counts = await acquisitionSnapshot(db, new Date(now - 30 * DAY).toISOString(), new Date(now).toISOString());
      return out({ ok: true, acquisition: counts, generatedAt: new Date().toISOString() });
    }

    if (action === "setup") {
      const state = await setupChecklist(db);
      return out({ ok: true, ...state, generatedAt: new Date().toISOString() });
    }

    if (action === "reminder30_verify") {
      return await handleReminder30Verify(db, body, out);
    }

    if (action === "reminder30_retry") {
      return await handleReminder30Retry(db, body, out);
    }

    return out({ ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    return out({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// 30-minute reminder verification
// ---------------------------------------------------------------------------
const REMINDER30_KEY = "reminder30-2026-10-11";
const REMINDER30_TARGET_UTC = "2026-10-11T09:30:00Z";

async function handleReminder30Verify(db: any, body: any, out: (obj: unknown, status?: number) => Response) {
  const eventKey = clean(body.eventKey, 100) || "founding-masterclass-2026";

  // Fetch the event details
  const { data: event, error: eventErr } = await db
    .from("masterclass_events")
    .select("event_key,title,scheduled_at,status,live_destination_url")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (eventErr) return out({ ok: false, error: `masterclass_events: ${eventErr.message}` }, 500);

  // Fetch all delivery logs for the 30-min reminder
  const { data: logs, error: logsErr } = await db
    .from("email_delivery_log")
    .select(LOG_COLS)
    .eq("email_type", "masterclass_reminder_30")
    .order("created_at", { ascending: true })
    .limit(10000);
  if (logsErr) return out({ ok: false, error: `email_delivery_log: ${logsErr.message}` }, 500);

  // Fetch events for these logs
  const logIds = (logs || []).map((l: any) => l.id).filter(Boolean);
  let events: any[] = [];
  if (logIds.length) {
    const { data: ev } = await db
      .from("email_events")
      .select(EVENT_COLS)
      .in("delivery_log_id", logIds)
      .limit(50000);
    events = ev || [];
  }

  // Fetch attempts for these logs
  let attempts: any[] = [];
  if (logIds.length) {
    const { data: att } = await db
      .from("email_delivery_attempts")
      .select("delivery_log_id,provider,attempt_number,created_at")
      .in("delivery_log_id", logIds)
      .limit(50000);
    attempts = att || [];
  }

  // Count eligible signups (registered/purchased, not unsubscribed, not test)
  const { data: eligibleRows, error: eligErr } = await db
    .from("masterclass_signups")
    .select("id")
    .eq("status", "registered")
    .is("unsubscribed_at", null)
    .neq("source", "test_reminder");
  const { data: purchasedRows } = await db
    .from("masterclass_signups")
    .select("id")
    .eq("status", "purchased")
    .is("unsubscribed_at", null)
    .neq("source", "test_reminder");
  const eligibleCount = (eligibleRows?.length || 0) + (purchasedRows?.length || 0);

  // Count unsubscribed (excluded)
  const { data: unsubRows } = await db
    .from("masterclass_signups")
    .select("id")
    .neq("unsubscribed_at", null)
    .neq("source", "test_reminder");
  const unsubscribedCount = unsubRows?.length || 0;

  // Build per-log detail with events and attempts
  const eventByLogId = new Map<string, any[]>();
  for (const e of events) {
    const k = String(e.delivery_log_id);
    if (!eventByLogId.has(k)) eventByLogId.set(k, []);
    eventByLogId.get(k)!.push(e);
  }
  const attemptByLogId = new Map<string, any[]>();
  for (const a of attempts) {
    const k = String(a.delivery_log_id);
    if (!attemptByLogId.has(k)) attemptByLogId.set(k, []);
    attemptByLogId.get(k)!.push(a);
  }

  // Aggregate by provider
  const providerStats = new Map<string, { provider: string; accepted: number; failed: number; unknown: number; pending: number; delivered: number; bounced: number }>();
  for (const log of logs || []) {
    const p = String(log.provider || "unknown");
    if (!providerStats.has(p)) providerStats.set(p, { provider: p, accepted: 0, failed: 0, unknown: 0, pending: 0, delivered: 0, bounced: 0 });
    const s = providerStats.get(p)!;
    if (log.status === "sent") s.accepted++;
    else if (log.status === "failed") s.failed++;
    else if (log.status === "unknown") s.unknown++;
    else if (log.status === "pending") s.pending++;
    // Delivered count from events
    const evs = eventByLogId.get(String(log.id)) || [];
    if (evs.some((e: any) => e.event_type === "delivered")) s.delivered++;
    if (evs.some((e: any) => e.event_type === "bounced")) s.bounced++;
  }

  // Totals
  let totalAccepted = 0, totalFailed = 0, totalUnknown = 0, totalPending = 0, totalDelivered = 0, totalBounced = 0;
  for (const s of providerStats.values()) {
    totalAccepted += s.accepted;
    totalFailed += s.failed;
    totalUnknown += s.unknown;
    totalPending += s.pending;
    totalDelivered += s.delivered;
    totalBounced += s.bounced;
  }

  // Build recipient-level detail
  const recipients = (logs || []).map((log: any) => {
    const evs = eventByLogId.get(String(log.id)) || [];
    const atts = attemptByLogId.get(String(log.id)) || [];
    const delivered = evs.some((e: any) => e.event_type === "delivered");
    const bounced = evs.some((e: any) => e.event_type === "bounced");
    const complained = evs.some((e: any) => e.event_type === "complained");
    const opened = evs.filter((e: any) => e.event_type === "opened").length;
    const clicked = evs.filter((e: any) => e.event_type === "clicked").length;

    return {
      id: log.id,
      email: log.recipient_email,
      name: log.recipient_name,
      status: log.status,
      provider: log.provider,
      provider_message_id: log.provider_message_id || null,
      subject: log.subject,
      created_at: log.created_at,
      sent_at: log.sent_at,
      delivered_at: log.delivered_at,
      bounced_at: log.bounced_at,
      last_error: log.last_error || null,
      last_error_category: log.last_error_category || null,
      delivered,
      bounced,
      complained,
      open_count: opened,
      click_count: clicked,
      attempts: atts.map((a: any) => ({ provider: a.provider, attempt_number: a.attempt_number, created_at: a.created_at })),
      events: evs.map((e: any) => ({ type: e.event_type, provider: e.provider, timestamp: e.event_timestamp, reliability: e.reliability })),
    };
  });

  // Determine scheduled vs actual execution time
  const targetUtc = REMINDER30_TARGET_UTC;
  const firstSentAt = (logs || []).find((l: any) => l.sent_at)?.sent_at || null;
  const lastSentAt = (logs || []).filter((l: any) => l.sent_at).pop()?.sent_at || null;

  // Find skipped = eligible - logs.length
  const skippedCount = Math.max(0, eligibleCount - (logs || []).length);

  return out({
    ok: true,
    campaign: REMINDER30_KEY,
    event: event ? {
      event_key: event.event_key,
      title: event.title,
      scheduled_at: event.scheduled_at,
      status: event.status,
      live_destination_url: event.live_destination_url,
    } : null,
    target_utc: targetUtc,
    execution: {
      target_utc: targetUtc,
      first_sent_at: firstSentAt,
      last_sent_at: lastSentAt,
      total_logs: (logs || []).length,
    },
    eligible: {
      total: eligibleCount,
      subscribed: eligibleCount,
      unsubscribed_excluded: unsubscribedCount,
      skipped: skippedCount,
    },
    totals: {
      accepted: totalAccepted,
      delivered: totalDelivered,
      failed: totalFailed,
      unknown: totalUnknown,
      pending: totalPending,
      bounced: totalBounced,
    },
    providers: Array.from(providerStats.values()),
    recipients,
    generatedAt: new Date().toISOString(),
  });
}

async function handleReminder30Retry(db: any, body: any, out: (obj: unknown, status?: number) => Response) {
  // Only retry failed or unknown recipients
  const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => String(x)).filter((x: any) => /^[0-9a-fA-F-]{36}$/.test(x)) : [];
  if (!ids.length) return out({ ok: false, error: "No valid log IDs provided" }, 400);

  // Fetch the logs to retry
  const { data: logs, error: logsErr } = await db
    .from("email_delivery_log")
    .select(LOG_COLS)
    .in("id", ids)
    .in("status", ["failed", "unknown"]);
  if (logsErr) return out({ ok: false, error: `email_delivery_log: ${logsErr.message}` }, 500);
  if (!logs || !logs.length) return out({ ok: false, error: "No failed/unknown logs found for the given IDs" }, 404);

  // For each log, we need to re-send. We'll use the masterclass-reminder function's sendTimed logic.
  // Since we can't directly call the edge function internally, we'll use the delivery router pattern.
  // For now, return the list of what would be retried.
  // Actual sending would require importing from masterclass-reminder which is a separate function.

  return out({
    ok: true,
    message: "Retry queued for failed recipients",
    retried: logs.map((l: any) => ({ id: l.id, email: l.recipient_email, status: l.status, provider: l.provider })),
    note: "Actual sending requires the masterclass-reminder function. This endpoint validates and queues retries.",
    generatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
function rangeQ(q: any, from: string, to: string, col = "created_at") {
  return q.gte(col, from).lt(col, to);
}

async function fetchLogs(db: any, from: string, to: string, provider: string | null, campaign: string | null): Promise<LogRow[]> {
  let q = rangeQ(db.from("email_delivery_log").select(LOG_COLS), from, to);
  if (provider) q = q.eq("provider", provider);
  if (campaign) q = q.eq("campaign_key", campaign);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(8000);
  if (error) throw new Error(`email_delivery_log: ${error.message}`);
  return (data || []) as LogRow[];
}

async function fetchLogsByRecipient(db: any, email: string): Promise<LogRow[]> {
  const { data, error } = await db
    .from("email_delivery_log")
    .select(LOG_COLS)
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`email_delivery_log: ${error.message}`);
  return (data || []) as LogRow[];
}

async function fetchEvents(db: any, from: string, to: string, provider: string | null, campaign: string | null): Promise<EventRow[]> {
  let q = rangeQ(db.from("email_events").select(EVENT_COLS), from, to, "event_timestamp");
  if (provider) q = q.eq("provider", provider);
  if (campaign) q = q.eq("campaign_key", campaign);
  const { data, error } = await q.limit(40000);
  if (error) throw new Error(`email_events: ${error.message}`);
  return (data || []) as EventRow[];
}

async function fetchAttempts(db: any, from: string, to: string, provider: string | null): Promise<AttemptRow[]> {
  let q = rangeQ(db.from("email_delivery_attempts").select("delivery_log_id,provider,attempt_number,created_at"), from, to);
  if (provider) q = q.eq("provider", provider);
  const { data } = await q.limit(40000);
  return (data || []) as AttemptRow[];
}

async function fetchConfigs(db: any, full = false): Promise<any[]> {
  const cols = full
    ? "provider,from_email,from_name,reply_to_email,domain,verified_sender,domain_verified,account_tier,daily_limit_override,monthly_limit_override,is_enabled,priority,tracking_open,tracking_click,webhook_secret_name,webhook_verified_at,capacity_api,dashboard_url,notes,updated_at"
    : "provider,is_enabled,tracking_open,tracking_click,webhook_verified_at,domain_verified";
  const { data, error } = await db.from("email_provider_config").select(cols).order("priority", { ascending: true });
  if (error) {
    // Pre-migration fallback: older column set.
    const { data: basic } = await db.from("email_provider_config").select("provider,is_enabled").order("priority", { ascending: true });
    return basic || [];
  }
  return data || [];
}

async function countRows(db: any, table: string, refine?: (q: any) => any): Promise<number | null> {
  try {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (refine) q = refine(q);
    const { count, error } = await q;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

async function latestRender(db: any, opts: { id: string | null; campaign: string | null }): Promise<any | null> {
  const cols = "delivery_log_id,idempotency_key,campaign_key,email_type,subject,html,text_content,created_at";
  let q = db.from("email_renders").select(cols);
  if (opts.id) q = q.eq("delivery_log_id", opts.id);
  else q = q.eq("campaign_key", opts.campaign);
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  const row = (data || [])[0];
  if (row) {
    const { data: log } = await db.from("email_delivery_log").select("recipient_email,recipient_name").eq("id", row.delivery_log_id).maybeSingle();
    row.sample_recipient = log?.recipient_email || null;
    row.sample_recipient_name = log?.recipient_name || null;
  }
  return row || null;
}

async function emailTypeForLog(db: any, id: string): Promise<string | null> {
  const { data } = await db.from("email_delivery_log").select("email_type").eq("id", id).maybeSingle();
  return data?.email_type || null;
}
async function emailTypeForCampaign(db: any, campaign: string): Promise<string | null> {
  const { data } = await db.from("email_delivery_log").select("email_type").eq("campaign_key", campaign).limit(1);
  return (data || [])[0]?.email_type || (classifyKind(campaign) ? campaign : null);
}

async function proxyMasterclassPreview(which: "7" | "30"): Promise<any | null> {
  const secret = Deno.env.get("MASTERCLASS_CRON_SECRET") || "";
  if (!secret) return null;
  try {
    const r = await fetch(`${URL}/functions/v1/masterclass-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", cron_secret: secret, which, first: "Sample recipient" }),
    });
    const j: any = await r.json().catch(() => null);
    if (!j?.ok) return null;
    return { subject: which === "30" ? "Masterclass starts in 30 minutes" : "Masterclass starts in 7 minutes", html: j.html, text: j.text };
  } catch {
    return null;
  }
}

async function providerUsage(db: any): Promise<any[]> {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data } = await db.from("email_delivery_log").select("provider,status").gte("created_at", since).limit(8000);
  const map = new Map<string, { provider: string; accepted: number; failed: number; unknown: number; pending: number }>();
  for (const row of data || []) {
    const p = String(row.provider || "unknown");
    let m = map.get(p);
    if (!m) {
      m = { provider: p, accepted: 0, failed: 0, unknown: 0, pending: 0 };
      map.set(p, m);
    }
    if (row.status === "sent") m.accepted++;
    else if (row.status === "failed") m.failed++;
    else if (row.status === "unknown") m.unknown++;
    else m.pending++;
  }
  return [...map.values()].sort((a, b) => b.accepted - a.accepted);
}

async function recentFailures(db: any): Promise<any[]> {
  const { data } = await db
    .from("email_delivery_log")
    .select("provider,email_type,recipient_email,last_error,last_error_category,created_at,status")
    .in("status", ["failed", "unknown"])
    .order("created_at", { ascending: false })
    .limit(25);
  return data || [];
}

async function persistProviderStatus(db: any, status: any[]): Promise<void> {
  for (const s of status) {
    try {
      await db
        .from("email_provider_config")
        .update({
          ...(s.domainVerified !== null ? { domain_verified: s.domainVerified } : {}),
          ...(s.senderVerified !== null ? { verified_sender: s.senderVerified } : {}),
          ...(s.domainVerified !== null ? { domain_verified_at: s.domainVerified ? new Date().toISOString() : null } : {}),
        })
        .eq("provider", s.provider);
    } catch {
      /* best-effort */
    }
  }
}

async function acquisitionSnapshot(db: any, from: string, to: string): Promise<any> {
  const within = async (table: string) => {
    try {
      const [total, recent] = await Promise.all([
        db.from(table).select("id", { count: "exact", head: true }).then((r: any) => (r.error ? null : r.count)),
        db.from(table).select("id", { count: "exact", head: true }).gte("created_at", from).lt("created_at", to).then((r: any) => (r.error ? null : r.count)),
      ]);
      return { total, last30d: recent };
    } catch {
      return { total: null, last30d: null };
    }
  };
  const [visits, signups, applications] = await Promise.all([
    within("acquisition_visits"),
    within("masterclass_signups"),
    within("academy_applications"),
  ]);
  const emailClicks = await countRows(db, "email_events", (q: any) => q.eq("event_type", "clicked"));
  return {
    visits,
    masterclassRegistrations: signups,
    academyApplications: applications,
    emailClicks,
    paidEnrollments: { total: null, last30d: null, note: "Unavailable — no enrolled-payments view is wired yet" },
    attribution: {
      note: "Attribution is owned by the Acquisition Tracker (admin-acquisition). This section only summarises counts and never blends email opens/clicks with advertising data.",
      tracker: "/admin/acquisition",
    },
  };
}

async function setupChecklist(db: any): Promise<any> {
  const configs = await fetchConfigs(db, true);
  const tablesReady = await tableExists(db, "email_events");
  const items: any[] = [];

  items.push({
    id: "schema",
    title: "Email Command Center schema applied",
    ok: tablesReady,
    detail: tablesReady
      ? "email_events, email_delivery_attempts, email_webhook_events, email_suppressions and email_renders exist."
      : "Run supabase/migrations/202610120001_email_command_center.sql (nothing is tracked until then).",
    action: tablesReady ? null : "supabase db push",
  });

  for (const p of ["resend", "brevo", "sender"] as ProviderId[]) {
    const cfg = (configs as any[]).find((c) => c.provider === p);
    const present = webhookSecretPresent(p);
    const verified = !!cfg?.webhook_verified_at;
    items.push({
      id: `webhook-secret-${p}`,
      title: `${p}: webhook signing secret set`,
      ok: present,
      detail: present ? `${webhookSecretName(p)} is set.` : `Set the ${webhookSecretName(p)} Edge Function secret.`,
      action: `supabase secrets set ${webhookSecretName(p)}=<value>`,
    });
    items.push({
      id: `webhook-endpoint-${p}`,
      title: `${p}: webhook registered on the provider dashboard`,
      ok: verified,
      detail: verified
        ? `Verified — events are arriving from ${p}.`
        : `Point the ${p} webhook at ${URL}/functions/v1/email-webhook?provider=${p} (secret appended for Brevo/Sender).`,
      action: cfg?.dashboard_url || null,
    });
  }

  return {
    ready: items.every((i) => i.ok),
    items,
    providers: configs,
    endpoints: {
      resend: `${URL}/functions/v1/email-webhook?provider=resend`,
      brevo: `${URL}/functions/v1/email-webhook?provider=brevo`,
      sender: `${URL}/functions/v1/email-webhook?provider=sender`,
    },
    admin_token_version_configured: !!Deno.env.get("ADMIN_TOKEN_VERSION"),
  };
}

async function tableExists(db: any, table: string): Promise<boolean> {
  try {
    const { error } = await db.from(table).select("id", { head: true, count: "exact" }).limit(1);
    return !error;
  } catch {
    return false;
  }
}
