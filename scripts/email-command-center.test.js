"use strict";

// Email Command Center — verification suite.
//
// Two layers:
//   1. EXECUTED unit tests of the shared tracking logic. The TypeScript modules
//      are bundled with esbuild (stripping types only) and imported so the real
//      functions run: webhook signature verification, payload normalisation,
//      dedup keys and the analytics metric policy.
//   2. SOURCE GUARDS asserting the security and correctness invariants that must
//      hold in the Edge Functions and the migration (a webhook can never trust an
//      unsigned payload; the API is admin-gated; events are deduplicated).
//
// Run with: node --test scripts/email-command-center.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase", "functions");
const BUILD_DIR = path.join(os.tmpdir(), "assistara-ecc-test");

function bundleOnce(entry, outName) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const out = path.join(BUILD_DIR, outName);
  const local = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  const bin = fs.existsSync(local) ? `"${local}"` : "npx esbuild";
  const cmd = `${bin} "${entry}" --bundle --format=esm --platform=neutral --log-level=error --outfile="${out}"`;
  execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  return out;
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// Part 1 — executed unit tests
// ---------------------------------------------------------------------------
test("provider tracking logic (executed)", async (t) => {
  const eventsPath = bundleOnce(path.join(FUNCTIONS_DIR, "_shared", "email-events.ts"), "email-events.mjs");
  const analyticsPath = bundleOnce(path.join(FUNCTIONS_DIR, "_shared", "email-analytics.ts"), "email-analytics.mjs");
  const E = await import(pathToFileURL(eventsPath).href);
  const A = await import(pathToFileURL(analyticsPath).href);

  await t.test("Resend (Svix) signatures are required and verified", async () => {
    const keyBytes = crypto.randomBytes(24);
    const secret = "whsec_" + keyBytes.toString("base64");
    const id = "msg_" + crypto.randomBytes(6).toString("hex");
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
    const sig = crypto.createHmac("sha256", keyBytes).update(`${id}.${ts}.${body}`).digest("base64");
    const headers = { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` };

    assert.equal(await E.verifyResendSignature(body, headers, secret), true, "valid signature accepted");
    assert.equal(await E.verifyResendSignature(body + "x", headers, secret), false, "tampered body rejected");
    assert.equal(await E.verifyResendSignature(body, { ...headers, "svix-signature": `v1,AAAA` }, secret), false, "bad signature rejected");
    assert.equal(await E.verifyResendSignature(body, headers, ""), false, "missing secret rejected");
    assert.equal(
      await E.verifyResendSignature(body, { "svix-id": id, "svix-timestamp": String(Math.floor(Date.now() / 1000) - 9999), "svix-signature": `v1,${sig}` }, secret),
      false,
      "stale timestamp rejected",
    );
  });

  await t.test("shared-secret providers reject a missing/wrong secret", () => {
    assert.equal(E.verifySharedSecret("s3", "s3"), true);
    assert.equal(E.verifySharedSecret("s3", "nope"), false);
    assert.equal(E.verifySharedSecret(null, "s3"), false);
    assert.equal(E.verifySharedSecret("s3", ""), false, "unconfigured secret never verifies");
  });

  await t.test("verifyWebhook routes by provider without leaking secrets", async () => {
    const body = JSON.stringify({ event: "delivered" });
    assert.equal(await E.verifyWebhook("brevo", body, {}, { brevo: "tok" }, { secret: "tok" }), true);
    assert.equal(await E.verifyWebhook("brevo", body, {}, {}, { secret: "tok" }), false, "missing configured secret");
    assert.equal(await E.verifyWebhook("sender", body, { "x-sender-token": "abc" }, { sender: "abc" }), true);
    assert.equal(await E.verifyWebhook("sender", body, { "x-sender-token": "zzz" }, { sender: "abc" }), false);
  });

  await t.test("Resend payloads normalise to canonical events", () => {
    const delivered = E.normalizeProviderEvent("resend", {
      type: "email.delivered",
      created_at: "2026-10-11T09:30:05.000Z",
      data: { email_id: "re_123", to: ["Person@Example.com"] },
    });
    assert.equal(delivered.eventType, "delivered");
    assert.equal(delivered.providerMessageId, "re_123");
    assert.equal(delivered.recipientEmail, "person@example.com");
    assert.equal(delivered.eventTimestamp, "2026-10-11T09:30:05.000Z");
    assert.equal(delivered.suppressionReason, null);

    assert.equal(E.normalizeProviderEvent("resend", { type: "email.opened", data: { email_id: "x" } }).eventType, "opened");
    assert.equal(E.normalizeProviderEvent("resend", { type: "email.clicked", data: { email_id: "x" } }).eventType, "clicked");
    assert.equal(E.normalizeProviderEvent("resend", { type: "email.bounced", data: { email_id: "x", bounce: { type: "Permanent" } } }).suppressionReason, "bounce");
    assert.equal(E.normalizeProviderEvent("resend", { type: "email.bounced", data: { email_id: "x", bounce: { type: "Transient" } } }).suppressionReason, null, "soft bounce never suppresses");
    assert.equal(E.normalizeProviderEvent("resend", { type: "email.complained", data: { email_id: "x" } }).suppressionReason, "complaint");
    assert.equal(E.normalizeProviderEvent("resend", { type: "email.delivery_delayed", data: { email_id: "x" } }).eventType, "deferred");
    assert.equal(E.normalizeProviderEvent("resend", { type: "unknown.thing", data: {} }), null);
  });

  await t.test("Brevo and Sender payloads normalise", () => {
    assert.equal(E.normalizeProviderEvent("brevo", { event: "delivered", email: "A@b.com", "message-id": "m1", ts: 1770000000 }).eventType, "delivered");
    assert.equal(E.normalizeProviderEvent("brevo", { event: "click", email: "a@b.com", "message-id": "m1" }).eventType, "clicked");
    assert.equal(E.normalizeProviderEvent("brevo", { event: "spam", email: "a@b.com" }).suppressionReason, "complaint");
    assert.equal(E.normalizeProviderEvent("brevo", { event: "unsubscribed", email: "a@b.com" }).suppressionReason, "unsubscribe");
    assert.equal(E.normalizeProviderEvent("brevo", { event: "soft_bounce", email: "a@b.com" }).eventType, "deferred");
    assert.equal(E.normalizeProviderEvent("sender", { event: "open", email: "a@b.com", message_id: "s1" }).eventType, "opened");
    assert.equal(E.normalizeProviderEvent("sender", { event: "bounce", email: "a@b.com", message_id: "s1" }).eventType, "bounced");
  });

  await t.test("dedup keys are stable for retries and distinct for distinct events", () => {
    const payload = { type: "email.opened", created_at: "2026-10-11T09:31:00.000Z", data: { email_id: "re_9" } };
    const a = E.normalizeProviderEvent("resend", payload);
    const b = E.normalizeProviderEvent("resend", payload);
    assert.equal(a.dedupKey, b.dedupKey, "provider retry produces the same key");

    // Resend varies by svix delivery id, which the handler attaches.
    const d1 = E.withDeliveryId(a, "svix-1");
    const d2 = E.withDeliveryId(b, "svix-1");
    const d3 = E.withDeliveryId(b, "svix-2");
    assert.equal(d1.dedupKey, d2.dedupKey, "duplicate svix delivery dedups");
    assert.notEqual(d1.dedupKey, d3.dedupKey, "a genuinely new event is not deduped");

    const later = E.normalizeProviderEvent("resend", { type: "email.opened", created_at: "2026-10-11T10:00:00.000Z", data: { email_id: "re_9" } });
    assert.notEqual(a.dedupKey, later.dedupKey, "a later open has its own key");
  });

  const configs = [{ provider: "resend", is_enabled: true, tracking_open: false, tracking_click: false, webhook_verified_at: null, domain_verified: true }];

  await t.test("overview: acceptance is exact, unmeasured metrics are unavailable (never zero)", () => {
    const logs = [
      { id: "l1", email_type: "masterclass_reminder", campaign_key: "c", recipient_email: "a@x.com", provider: "resend", status: "sent", created_at: "2026-10-11T09:30:00Z", sent_at: "2026-10-11T09:30:00Z", metadata: {} },
      { id: "l2", email_type: "masterclass_reminder", campaign_key: "c", recipient_email: "b@x.com", provider: "resend", status: "failed", created_at: "2026-10-11T09:30:00Z", metadata: {} },
      { id: "l3", email_type: "masterclass_reminder", campaign_key: "c", recipient_email: "c@x.com", provider: "brevo", status: "unknown", created_at: "2026-10-11T09:30:00Z", metadata: {} },
    ];
    const o = A.summarize({ logs, events: [], attempts: [{ delivery_log_id: "l1" }, { delivery_log_id: "l2" }, { delivery_log_id: "l3" }], configs });
    assert.equal(o.totals.messages, 3);
    assert.equal(o.totals.accepted, 1);
    assert.equal(o.totals.failed, 1);
    assert.equal(o.totals.unknown, 1);
    assert.equal(o.totals.attempts, 3);
    assert.equal(o.availability.deliveryEvents, false, "no webhook / no events => delivery unavailable");
    assert.equal(o.rates.deliveryRate, null, "unavailable rate must be null, never 0");
    assert.equal(o.rates.openRate, null);
    assert.equal(o.rates.clickThroughRate, null);
    assert.equal(o.rates.bounceRate, null);
    assert.equal(A.rate(0, 0), null, "no denominator => null");
  });

  await t.test("overview: unique opens/clicks count messages, not raw events", () => {
    const logs = [
      { id: "l1", email_type: "masterclass_reminder", campaign_key: "c", recipient_email: "a@x.com", provider: "resend", status: "sent", created_at: "2026-10-11T09:30:00Z", sent_at: "2026-10-11T09:30:00Z", metadata: {} },
      { id: "l2", email_type: "masterclass_reminder", campaign_key: "c", recipient_email: "b@x.com", provider: "resend", status: "sent", created_at: "2026-10-11T09:30:00Z", sent_at: "2026-10-11T09:30:00Z", metadata: {} },
    ];
    const events = [
      { delivery_log_id: "l1", provider: "resend", event_type: "delivered", event_timestamp: "2026-10-11T09:30:05Z" },
      { delivery_log_id: "l2", provider: "resend", event_type: "delivered", event_timestamp: "2026-10-11T09:30:06Z" },
      { delivery_log_id: "l1", provider: "resend", event_type: "opened", event_timestamp: "2026-10-11T09:31:00Z" },
      { delivery_log_id: "l1", provider: "resend", event_type: "opened", event_timestamp: "2026-10-11T09:32:00Z" },
      { delivery_log_id: "l1", provider: "resend", event_type: "clicked", event_timestamp: "2026-10-11T09:33:00Z" },
      { delivery_log_id: "l2", provider: "resend", event_type: "bounced", event_timestamp: "2026-10-11T09:35:00Z" },
    ];
    const o = A.summarize({ logs, events, attempts: [], configs });
    assert.equal(o.measured.delivered, 2);
    assert.equal(o.measured.uniqueOpens, 1, "two opens on one message = one unique open");
    assert.equal(o.measured.uniqueClicks, 1);
    assert.equal(o.measured.bounced, 1);
    assert.equal(o.availability.deliveryEvents, true);
    assert.equal(o.availability.openTracking, true);
    assert.equal(o.rates.openRate, 0.5, "one unique open / two delivered");
    assert.equal(o.measured.eventsReceived, 6, "raw event count is preserved separately");
  });

  await t.test("overview: events without a delivery_log_id still dedup by provider message id (fallback safety)", () => {
    const events = [
      { delivery_log_id: null, provider: "brevo", provider_message_id: "m1", event_type: "delivered", event_timestamp: "2026-10-11T09:30:05Z" },
      { delivery_log_id: null, provider: "brevo", provider_message_id: "m1", event_type: "opened", event_timestamp: "2026-10-11T09:31:00Z" },
      { delivery_log_id: null, provider: "brevo", provider_message_id: "m1", event_type: "opened", event_timestamp: "2026-10-11T09:32:00Z" },
    ];
    const o = A.summarize({ logs: [], events, attempts: [], configs: [] });
    assert.equal(o.measured.delivered, 1);
    assert.equal(o.measured.uniqueOpens, 1);
  });

  await t.test("campaigns group by key and classify kind", () => {
    const logs = [
      { id: "l1", email_type: "masterclass_reminder", campaign_key: "masterclass_reminder", recipient_email: "a@x.com", provider: "resend", status: "sent", subject: "Starts soon", created_at: "2026-10-11T09:30:00Z", sent_at: "2026-10-11T09:30:00Z", metadata: {} },
      { id: "l2", email_type: "masterclass_reminder", campaign_key: "masterclass_reminder", recipient_email: "b@x.com", provider: "brevo", status: "sent", subject: "Starts soon", created_at: "2026-10-11T09:30:01Z", sent_at: "2026-10-11T09:30:01Z", metadata: {} },
      { id: "l3", email_type: "payment_receipt", recipient_email: "c@x.com", provider: "sender", status: "sent", subject: "Receipt", created_at: "2026-10-10T09:30:00Z", sent_at: "2026-10-10T09:30:00Z", metadata: {} },
    ];
    const events = [{ delivery_log_id: "l1", provider: "resend", event_type: "delivered", event_timestamp: "2026-10-11T09:30:05Z" }];
    const camps = A.summarizeCampaigns({ logs, events, attempts: [], renderedKeys: ["masterclass_reminder"] });
    const mc = camps.find((c) => c.key === "masterclass_reminder");
    const receipt = camps.find((c) => c.key === "payment_receipt");
    assert.equal(mc.kind, "campaign");
    assert.equal(mc.recipients, 2, "distinct recipients");
    assert.equal(mc.providers.length, 2);
    assert.equal(mc.hasRenderedSample, true);
    assert.equal(receipt.kind, "automated");
    assert.equal(receipt.measured.delivered, 0);
  });

  await t.test("timeline orders a recipient's messages and attaches events/attempts", () => {
    const logs = [
      { id: "old", email_type: "confirmation", recipient_email: "a@x.com", provider: "resend", status: "sent", created_at: "2026-10-01T00:00:00Z", metadata: {} },
      { id: "new", email_type: "masterclass_reminder_7", recipient_email: "a@x.com", provider: "brevo", status: "sent", created_at: "2026-10-11T00:00:00Z", metadata: {} },
    ];
    const tl = A.buildTimeline({
      logs,
      events: [{ delivery_log_id: "new", provider: "brevo", event_type: "delivered", event_timestamp: "2026-10-11T00:01:00Z" }],
      attempts: [{ delivery_log_id: "new", provider: "resend", attempt_number: 1, created_at: "2026-10-11T00:00:30Z" }, { delivery_log_id: "new", provider: "brevo", attempt_number: 2, created_at: "2026-10-11T00:00:40Z" }],
    });
    assert.equal(tl[0].id, "new", "newest first");
    assert.equal(tl[0].events.length, 1);
    assert.deepEqual(tl[0].sendAttempts.map((a) => a.attempt_number), [1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — source guards
// ---------------------------------------------------------------------------
test("source guards", async (t) => {
  const migration = read(path.join(ROOT, "supabase", "migrations", "202610120001_email_command_center.sql"));
  const webhook = read(path.join(FUNCTIONS_DIR, "email-webhook", "index.ts"));
  const adminEmail = read(path.join(FUNCTIONS_DIR, "admin-email", "index.ts"));
  const delivery = read(path.join(FUNCTIONS_DIR, "_shared", "email-delivery.ts"));
  const adminHtml = read(path.join(ROOT, "assistara-local-v9", "admin.html"));
  const vercel = JSON.parse(read(path.join(ROOT, "assistara-local-v9", "vercel.json")));

  await t.test("migration is additive, deduplicated and applies events atomically", () => {
    assert.match(migration, /create table if not exists public\.email_events/);
    assert.match(migration, /dedup_key text not null unique/, "events are uniquely deduplicated");
    assert.match(migration, /create table if not exists public\.email_delivery_attempts/);
    assert.match(migration, /create table if not exists public\.email_suppressions/);
    assert.match(migration, /create table if not exists public\.email_renders/);
    assert.match(migration, /create or replace function public\.email_apply_event/);
    assert.match(migration, /notify pgrst/);
    assert.ok(!/\bdrop\s+table\b/i.test(migration), "never drops existing tables");
    assert.ok(!/\bdrop\s+column\b/i.test(migration), "never drops existing columns");
    assert.match(migration, /add column if not exists campaign_key text/);
  });

  await t.test("webhook rejects unverified payloads and cannot be classified as a sender", () => {
    assert.match(webhook, /verifyWebhook/);
    assert.match(webhook, /error: "unverified"/, "records and rejects unverified payloads");
    assert.match(webhook, /,\s*401\)/, "returns 401 for unverified payloads");
    assert.match(webhook, /RESEND_WEBHOOK_SECRET/);
    assert.match(webhook, /BREVO_WEBHOOK_SECRET/);
    assert.match(webhook, /SENDER_WEBHOOK_SECRET/);
    // Registered receipt before processing -> idempotent.
    assert.match(webhook, /email_webhook_events/);
    assert.match(webhook, /resolution=ignore-duplicates/);
    // Must not contain any provider SEND endpoint (would break the sender inventory).
    assert.ok(!webhook.includes("api.resend.com"));
    assert.ok(!webhook.includes("api.brevo.com"));
    assert.ok(!webhook.includes("api.sender.net"));
    assert.ok(!webhook.includes("_shared/email-delivery"));
  });

  await t.test("an unverified receipt can never block a later verified event", () => {
    assert.match(webhook, /unverified:\$\{provider\}:\$\{rawHash\}/, "unverified receipts use a distinct key space");
    assert.match(webhook, /const receiptKey = verified \? eventKey :/, "receipt key depends on verification");
    assert.match(webhook, /dedup_key=eq\.\$\{encodeURIComponent\(receiptKey\)\}/, "processing marks the receipt key");
  });

  await t.test("admin-email is admin-gated and does not send or reach send endpoints", () => {
    assert.match(adminEmail, /ADMIN_TOKEN_VERSION/, "verifies the admin session token");
    assert.match(adminEmail, /crypto\.subtle\.sign/, "HMAC admin signature check");
    assert.match(adminEmail, /Session expired/);
    assert.ok(!adminEmail.includes("api.resend.com"), "no direct provider send/management endpoint text");
    assert.ok(!adminEmail.includes("_shared/email-delivery"));
    assert.match(adminEmail, /email_renders/, "serves captured previews");
  });

  await t.test("delivery module records attempts, captures renders and honours suppression", () => {
    assert.match(delivery, /campaignKey\?: string/);
    assert.match(delivery, /recipientId\?: string/);
    assert.match(delivery, /private async isSuppressed/);
    assert.match(delivery, /private async captureRender/);
    assert.match(delivery, /private async recordAttempt/);
    assert.match(delivery, /email_delivery_attempts/);
    assert.match(delivery, /email_renders/);
    assert.match(delivery, /status: 'suppressed'/);
  });

  await t.test("admin shell and routing expose the Email Command Center", () => {
    assert.match(adminHtml, /data-tool="email"/);
    assert.match(adminHtml, /email: \{ path: "\/admin\/email", src: "\/admin-email\.html" \}/);
    assert.ok(vercel.builds.some((b) => b.src === "admin-email.html"), "page is built");
    assert.ok(vercel.routes.some((r) => r.src === "/admin/email" && r.dest === "/admin.html"), "client route resolves");
    assert.ok(vercel.routes.some((r) => r.src === "/admin-email.html"), "direct page route resolves");
  });

  await t.test("the command center UI never rewrites links and labels unavailable data", () => {
    const page = read(path.join(ROOT, "assistara-local-v9", "admin-email.html"));
    assert.match(page, /Manrope/, "uses the admin dashboard brand font");
    assert.match(page, /Unavailable/);
    assert.ok(!/onclick\s*=/.test(page), "no inline handlers");
    assert.ok(!/document\.write/.test(page));
  });
});
