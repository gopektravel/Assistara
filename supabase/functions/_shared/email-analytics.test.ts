import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { summarize } from "./email-analytics.ts";

// Minimal row factories matching the real LogRow/EventRow types exactly.
function log(id: string, provider: string, status: "sent" | "failed" = "sent") {
  return {
    id, idempotency_key: null, email_type: "test", campaign_key: null,
    recipient_email: `${id}@example.com`, recipient_id: null, subject: null,
    provider, provider_message_id: null, status, attempts: 1,
    created_at: "2026-01-01T00:00:00Z", sent_at: "2026-01-01T00:00:00Z",
    delivered_at: null, bounced_at: null, complained_at: null,
    first_opened_at: null, first_clicked_at: null, open_count: null, click_count: null,
    metadata: null,
  };
}

function ev(id: string, provider: string, type: string) {
  return {
    delivery_log_id: id, campaign_key: null, provider, provider_message_id: null,
    event_type: type, recipient_email: `${id}@example.com`,
    event_timestamp: "2026-01-01T00:01:00Z", reliability: null,
  };
}

function cfg(provider: string, opts: { open?: boolean; click?: boolean; webhook?: boolean } = {}) {
  return {
    provider, is_enabled: true, tracking_open: opts.open ?? true,
    tracking_click: opts.click ?? true,
    webhook_verified_at: opts.webhook ? "2026-01-01T00:00:00Z" : null,
    domain_verified: true,
  };
}

// Full coverage: all providers have tracking — estimated rate equals raw rate
Deno.test("full coverage: estimated rate equals raw rate", () => {
  const s = summarize({
    logs: [log("a", "Brevo"), log("b", "Brevo")],
    events: [ev("a", "Brevo", "delivered"), ev("b", "Brevo", "delivered"), ev("a", "Brevo", "opened"), ev("b", "Brevo", "clicked")],
    attempts: [],
    configs: [cfg("Brevo")],
  });
  assertEquals(s.rates.estimatedOpenRate, 0.5);
  assertEquals(s.rates.estimatedClickRate, 0.5);
  assertEquals(s.rates.openCoverage, 1);
  assertEquals(s.rates.clickCoverage, 1);
  assertEquals(s.availability.openCoverageFull, true);
  assertEquals(s.availability.clickCoverageFull, true);
});

// Partial coverage: only one provider has tracking — estimated rate uses only measurable
Deno.test("partial coverage: estimated rate uses only tracking-enabled providers", () => {
  const s = summarize({
    logs: [log("a", "Brevo"), log("b", "Sender")],
    events: [ev("a", "Brevo", "delivered"), ev("b", "Sender", "delivered"), ev("a", "Brevo", "opened")],
    attempts: [],
    configs: [cfg("Brevo"), cfg("Sender", { open: false, click: false })],
  });
  assertEquals(s.rates.openRate, 0.5);
  assertEquals(s.rates.estimatedOpenRate, 1.0);
  assertEquals(s.rates.openCoverage, 0.5);
  assertEquals(s.availability.openCoverageFull, false);
});

// Zero coverage: no provider has tracking — estimated rate is null
Deno.test("zero coverage: estimated rate is null when no provider has tracking", () => {
  const s = summarize({
    logs: [log("a", "Brevo")],
    events: [ev("a", "Brevo", "delivered")],
    attempts: [],
    configs: [cfg("Brevo", { open: false, click: false })],
  });
  assertEquals(s.rates.estimatedOpenRate, null);
  assertEquals(s.rates.estimatedClickRate, null);
  assertEquals(s.rates.openCoverage, 0);
  assertEquals(s.availability.openCoverageFull, false);
});

// Duplicate events: same message opened twice counts once
Deno.test("duplicate events: same message opened twice counts once", () => {
  const s = summarize({
    logs: [log("a", "Brevo")],
    events: [ev("a", "Brevo", "delivered"), ev("a", "Brevo", "opened"), ev("a", "Brevo", "opened")],
    attempts: [],
    configs: [cfg("Brevo")],
  });
  assertEquals(s.measured.uniqueOpens, 1);
  assertEquals(s.rates.estimatedOpenRate, 1.0);
});
