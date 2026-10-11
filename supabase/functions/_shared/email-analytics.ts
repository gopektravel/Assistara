// ----------------------------------------------------------------------------
// Email analytics — pure aggregation (SHARED, dependency-free, unit-testable).
//
// Turns the canonical rows (email_delivery_log + email_events +
// email_delivery_attempts) into the numbers the Command Center shows.
//
// Metric policy enforced here:
//   * ACCEPTANCE (log.status='sent') is reported separately from DELIVERY.
//   * delivered / bounced / complained / deferred / unique opens / unique clicks
//     are only ever shown when a provider actually reported them. They are never
//     inferred and never defaulted to zero when tracking is unavailable
//     (rate fields return null and the UI renders "Unavailable").
//   * Unique opens/clicks count distinct MESSAGES, so duplicate webhook
//     deliveries (already deduped upstream) and multiple opens cannot inflate.
// ----------------------------------------------------------------------------

export type LogStatus = "pending" | "sent" | "failed" | "unknown" | "expired" | "suppressed";

export interface LogRow {
  id: string;
  idempotency_key?: string | null;
  email_type: string;
  campaign_key?: string | null;
  recipient_email: string;
  recipient_id?: string | null;
  subject?: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  status: LogStatus;
  attempts?: number | null;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  first_opened_at?: string | null;
  first_clicked_at?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface EventRow {
  delivery_log_id?: string | null;
  campaign_key?: string | null;
  provider: string;
  provider_message_id?: string | null;
  event_type: string;
  recipient_email?: string | null;
  event_timestamp: string;
  reliability?: string | null;
}

export interface AttemptRow {
  delivery_log_id?: string | null;
  provider: string;
  attempt_number?: number | null;
  created_at: string;
}

export interface ProviderConfig {
  provider: string;
  is_enabled?: boolean;
  tracking_open?: boolean;
  tracking_click?: boolean;
  webhook_verified_at?: string | null;
  domain_verified?: boolean;
}

export interface Totals {
  messages: number;
  attempts: number;
  accepted: number;
  failed: number;
  unknown: number;
  expired: number;
  suppressed: number;
  pending: number;
}

export interface Measured {
  delivered: number;
  bounced: number;
  complained: number;
  deferred: number;
  uniqueOpens: number;
  uniqueClicks: number;
  unsubscribes: number;
  eventsReceived: number;
}

export interface Rates {
  deliveryRate: number | null;
  openRate: number | null;
  clickThroughRate: number | null;
  bounceRate: number | null;
}

export interface Availability {
  webhookReady: boolean;
  deliveryEvents: boolean;
  openTracking: boolean;
  clickTracking: boolean;
  unsubscribeEvents: boolean;
  providersReporting: string[];
}

export interface ProviderRow {
  provider: string;
  accepted: number;
  failed: number;
  unknown: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounced: number;
}

export interface SeriesPoint {
  day: string;
  accepted: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
}

export interface Overview {
  totals: Totals;
  measured: Measured;
  rates: Rates;
  availability: Availability;
  providers: ProviderRow[];
  series: SeriesPoint[];
}

const CAMPAIGN_TYPES = /^(masterclass_reminder|academy_followup|masterclass_)/;

export function classifyKind(emailType: string): "campaign" | "automated" {
  return CAMPAIGN_TYPES.test(String(emailType || "")) ? "campaign" : "automated";
}

export function campaignKeyOf(log: LogRow): string {
  const fromMeta = (log.metadata?.campaign as string | undefined) || undefined;
  return String(log.campaign_key || fromMeta || log.email_type || "unknown");
}

function eventMessageKey(ev: EventRow): string {
  if (ev.delivery_log_id) return `log:${ev.delivery_log_id}`;
  if (ev.provider_message_id) return `pmid:${ev.provider}:${ev.provider_message_id}`;
  return `rec:${ev.recipient_email || "?"}`;
}

function distinctCount(keys: Set<string>): number {
  return keys.size;
}

function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function emptyTotals(): Totals {
  return { messages: 0, attempts: 0, accepted: 0, failed: 0, unknown: 0, expired: 0, suppressed: 0, pending: 0 };
}

export function rate(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

export function summarize(
  input: {
    logs: LogRow[];
    events: EventRow[];
    attempts: AttemptRow[];
    configs: ProviderConfig[];
    from?: string;
    to?: string;
  },
): Overview {
  const { logs, events, attempts, configs } = input;
  const totals = emptyTotals();
  totals.attempts = attempts.length;
  totals.messages = logs.length;

  const uniq = {
    delivered: new Set<string>(),
    bounced: new Set<string>(),
    complained: new Set<string>(),
    deferred: new Set<string>(),
    opened: new Set<string>(),
    clicked: new Set<string>(),
    unsubscribed: new Set<string>(),
  };

  const provMap = new Map<string, ProviderRow>();
  const rowFor = (p: string): ProviderRow => {
    let r = provMap.get(p);
    if (!r) {
      r = { provider: p, accepted: 0, failed: 0, unknown: 0, delivered: 0, uniqueOpens: 0, uniqueClicks: 0, bounced: 0 };
      provMap.set(p, r);
    }
    return r;
  };

  const seriesMap = new Map<string, SeriesPoint>();
  const seriesFor = (day: string): SeriesPoint => {
    let s = seriesMap.get(day);
    if (!s) {
      s = { day, accepted: 0, delivered: 0, uniqueOpens: 0, uniqueClicks: 0 };
      seriesMap.set(day, s);
    }
    return s;
  };

  for (const log of logs) {
    switch (log.status) {
      case "sent":
        totals.accepted++;
        break;
      case "failed":
        totals.failed++;
        break;
      case "unknown":
        totals.unknown++;
        break;
      case "expired":
        totals.expired++;
        break;
      case "suppressed":
        totals.suppressed++;
        break;
      default:
        totals.pending++;
    }
    const p = String(log.provider || "unknown");
    if (log.provider) {
      const r = rowFor(p);
      if (log.status === "sent") r.accepted++;
      else if (log.status === "failed") r.failed++;
      else if (log.status === "unknown") r.unknown++;
    }
    const day = dayOf(log.sent_at || log.created_at);
    if (day && log.status === "sent") seriesFor(day).accepted++;
  }

  // Per-provider distinct measured sets (avoid double counting a message).
  const provMeasured = new Map<string, { delivered: Set<string>; opened: Set<string>; clicked: Set<string>; bounced: Set<string> }>();
  const pmFor = (p: string) => {
    let m = provMeasured.get(p);
    if (!m) {
      m = { delivered: new Set(), opened: new Set(), clicked: new Set(), bounced: new Set() };
      provMeasured.set(p, m);
    }
    return m;
  };

  for (const ev of events) {
    totals.messages = totals.messages; // events are not messages
    const p = String(ev.provider || "unknown");
    const key = eventMessageKey(ev);
    const day = dayOf(ev.event_timestamp);
    switch (ev.event_type) {
      case "delivered":
        uniq.delivered.add(key);
        pmFor(p).delivered.add(key);
        if (day) seriesFor(day).delivered++;
        break;
      case "bounced":
        uniq.bounced.add(key);
        pmFor(p).bounced.add(key);
        break;
      case "complained":
        uniq.complained.add(key);
        break;
      case "deferred":
        uniq.deferred.add(key);
        break;
      case "opened":
        uniq.opened.add(key);
        pmFor(p).opened.add(key);
        if (day) seriesFor(day).uniqueOpens++;
        break;
      case "clicked":
        uniq.clicked.add(key);
        pmFor(p).clicked.add(key);
        if (day) seriesFor(day).uniqueClicks++;
        break;
      case "unsubscribed":
        uniq.unsubscribed.add(String(ev.recipient_email || key));
        break;
      default:
        break;
    }
  }

  for (const [p, m] of provMeasured) {
    const r = rowFor(p);
    r.delivered = distinctCount(m.delivered);
    r.uniqueOpens = distinctCount(m.opened);
    r.uniqueClicks = distinctCount(m.clicked);
    r.bounced = distinctCount(m.bounced);
  }

  const measured: Measured = {
    delivered: distinctCount(uniq.delivered),
    bounced: distinctCount(uniq.bounced),
    complained: distinctCount(uniq.complained),
    deferred: distinctCount(uniq.deferred),
    uniqueOpens: distinctCount(uniq.opened),
    uniqueClicks: distinctCount(uniq.clicked),
    unsubscribes: distinctCount(uniq.unsubscribed),
    eventsReceived: events.length,
  };

  const enabled = configs.filter((c) => c.is_enabled !== false);
  const webhookReady = configs.some((c) => !!c.webhook_verified_at);
  const anyDeliveryEvent = ["delivered", "bounced", "deferred", "complained"].some((t) => events.some((e) => e.event_type === t));
  const anyOpenEvent = events.some((e) => e.event_type === "opened");
  const anyClickEvent = events.some((e) => e.event_type === "clicked");
  const anyUnsubEvent = events.some((e) => e.event_type === "unsubscribed");

  const availability: Availability = {
    webhookReady,
    deliveryEvents: webhookReady || anyDeliveryEvent,
    openTracking: anyOpenEvent || (webhookReady && enabled.some((c) => c.tracking_open)),
    clickTracking: anyClickEvent || (webhookReady && enabled.some((c) => c.tracking_click)),
    unsubscribeEvents: anyUnsubEvent,
    providersReporting: [...new Set(events.map((e) => String(e.provider)))].sort(),
  };

  const rates: Rates = {
    deliveryRate: availability.deliveryEvents ? rate(measured.delivered, totals.accepted) : null,
    // Open/click rates use successfully delivered messages as the denominator
    // (the only honest denominator). Null until delivery is measurable.
    openRate: measured.delivered > 0 ? rate(measured.uniqueOpens, measured.delivered) : null,
    clickThroughRate: measured.delivered > 0 ? rate(measured.uniqueClicks, measured.delivered) : null,
    bounceRate: availability.deliveryEvents ? rate(measured.bounced, totals.accepted) : null,
  };

  const providers = [...provMap.values()].sort((a, b) => b.accepted - a.accepted || a.provider.localeCompare(b.provider));
  const series = [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  return { totals, measured, rates, availability, providers, series };
}

export interface Campaign {
  key: string;
  name: string;
  emailType: string;
  subject: string | null;
  kind: "campaign" | "automated";
  firstSentAt: string | null;
  lastSentAt: string | null;
  recipients: number;
  totals: Totals;
  measured: Measured;
  providers: string[];
  hasRenderedSample: boolean;
}

export function summarizeCampaigns(
  input: {
    logs: LogRow[];
    events: EventRow[];
    attempts: AttemptRow[];
    renderedKeys?: Set<string> | string[];
  },
): Campaign[] {
  const rendered = new Set(input.renderedKeys || []);
  const groups = new Map<string, LogRow[]>();
  for (const log of input.logs) {
    const key = campaignKeyOf(log);
    const arr = groups.get(key);
    if (arr) arr.push(log);
    else groups.set(key, [log]);
  }

  const eventsById = new Map<string, EventRow[]>();
  for (const ev of input.events) {
    if (!ev.delivery_log_id) continue;
    const arr = eventsById.get(ev.delivery_log_id);
    if (arr) arr.push(ev);
    else eventsById.set(ev.delivery_log_id, [ev]);
  }
  const attemptsById = new Map<string, AttemptRow[]>();
  for (const a of input.attempts) {
    if (!a.delivery_log_id) continue;
    const arr = attemptsById.get(a.delivery_log_id);
    if (arr) arr.push(a);
    else attemptsById.set(a.delivery_log_id, [a]);
  }

  const out: Campaign[] = [];
  for (const [key, gLogs] of groups) {
    const ids = new Set(gLogs.map((l) => l.id));
    const gEvents = input.events.filter((e) => (e.delivery_log_id && ids.has(e.delivery_log_id)) || campaignKeyOf({ email_type: e.campaign_key || "" , id: "" , recipient_email: "", status: "sent", created_at: e.event_timestamp } as LogRow) === key);
    const gAttempts = input.attempts.filter((a) => a.delivery_log_id && ids.has(a.delivery_log_id));
    const summary = summarize({ logs: gLogs, events: gEvents, attempts: gAttempts, configs: [] });

    const sorted = [...gLogs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const subjectLog = [...gLogs].reverse().find((l) => l.subject);
    out.push({
      key,
      name: key,
      emailType: gLogs[0]?.email_type || key,
      subject: subjectLog?.subject || null,
      kind: classifyKind(gLogs[0]?.email_type || ""),
      firstSentAt: sorted[0]?.sent_at || sorted[0]?.created_at || null,
      lastSentAt: sorted[sorted.length - 1]?.sent_at || sorted[sorted.length - 1]?.created_at || null,
      recipients: new Set(gLogs.map((l) => String(l.recipient_email || "").toLowerCase())).size,
      totals: summary.totals,
      measured: summary.measured,
      providers: [...new Set(gLogs.map((l) => String(l.provider || "")).filter(Boolean))].sort(),
      hasRenderedSample: rendered.has(key),
    });
  }
  return out.sort((a, b) => String(b.lastSentAt || "").localeCompare(String(a.lastSentAt || "")));
}

export interface TimelineMessage extends LogRow {
  events: EventRow[];
  sendAttempts: AttemptRow[];
}

export function buildTimeline(input: { logs: LogRow[]; events: EventRow[]; attempts: AttemptRow[] }): TimelineMessage[] {
  const eventsById = new Map<string, EventRow[]>();
  for (const ev of input.events) {
    if (!ev.delivery_log_id) continue;
    const arr = eventsById.get(ev.delivery_log_id);
    if (arr) arr.push(ev);
    else eventsById.set(ev.delivery_log_id, [ev]);
  }
  const attemptsById = new Map<string, AttemptRow[]>();
  for (const a of input.attempts) {
    if (!a.delivery_log_id) continue;
    const arr = attemptsById.get(a.delivery_log_id);
    if (arr) arr.push(a);
    else attemptsById.set(a.delivery_log_id, [a]);
  }
  return [...input.logs]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((log) => ({
      ...log,
      events: (eventsById.get(log.id) || []).sort((a, b) => String(a.event_timestamp).localeCompare(String(b.event_timestamp))),
      sendAttempts: (attemptsById.get(log.id) || []).sort((a, b) => Number(a.attempt_number || 0) - Number(b.attempt_number || 0)),
    }));
}
