"use strict";

// First-party email tracking — verification suite.
//
// Part 1 executes the REAL shared module (_shared/email-tracking.ts, bundled with
// esbuild) to prove token signing/verification, link instrumentation and traffic
// classification behave correctly.
// Part 2 are source guards proving the migration is additive, the endpoint cannot
// open-redirect or leak PII, and the delivery hook is fail-open.
//
// Run with: node --test scripts/email-tracking.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase", "functions");
const BUILD_DIR = path.join(os.tmpdir(), "assistara-track-test");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function bundleOnce(entry, outName) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const out = path.join(BUILD_DIR, outName);
  const local = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  const bin = fs.existsSync(local) ? `"${local}"` : "npx esbuild";
  execSync(`${bin} "${entry}" --bundle --format=esm --platform=neutral --log-level=error --outfile="${out}"`, {
    cwd: ROOT,
    stdio: "pipe",
  });
  return out;
}

test("first-party tracking module (executed)", async (t) => {
  const modPath = bundleOnce(path.join(FUNCTIONS_DIR, "_shared", "email-tracking.ts"), "email-tracking.mjs");
  const T = await import(pathToFileURL(modPath).href);
  const SECRET = "test-tracking-secret";

  await t.test("open tokens are opaque, signed and tamper-proof", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    const token = await T.signOpenToken(SECRET, id);
    assert.ok(token.startsWith("o1."), "versioned token");
    assert.ok(!token.includes("@"), "no recipient email in the token");
    assert.equal(await T.verifyOpenToken(SECRET, token), id, "round trip");
    assert.equal(await T.verifyOpenToken("other-secret", token), null, "wrong secret rejected");
    assert.equal(await T.verifyOpenToken(SECRET, token + "x"), null, "tampered signature rejected");
    assert.equal(await T.verifyOpenToken(SECRET, "o1.not-a-tracking-id.aaaa"), null, "bad id rejected");
    assert.equal(await T.verifyOpenToken("", token), null, "unconfigured secret never verifies");
    assert.equal(T.isTrackingId(id), true);
    assert.equal(T.isTrackingId("nope"), false);
  });

  await t.test("click tokens bind the link index and never contain the destination", async () => {
    const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const token = await T.signClickToken(SECRET, id, 3);
    assert.deepEqual(await T.verifyClickToken(SECRET, token), { trackingId: id, linkIndex: 3 });
    const tampered = token.replace(/\.3\./, ".4.");
    assert.equal(await T.verifyClickToken(SECRET, tampered), null, "index cannot be swapped");
    assert.equal(await T.verifyClickToken("other", token), null);
    assert.ok(!/https?:|@/.test(token), "no URL or email embedded in a click token");
  });

  await t.test("only real, wrappable links are tracked", () => {
    const html =
      `<a href="https://www.getassistara.com/live?token=SECRETLIVETOKEN">Join</a>` +
      `<a href="/unsubscribe?t=1">Unsub</a>` +
      `<a href="#">Top</a>` +
      `<a href="mailto:hi@getassistara.com">Mail</a>` +
      `<a href="/relative">Rel</a>` +
      `<a href="https://instagram.com/assistara">IG</a>`;
    const links = T.planTrackableLinks(html, { baseUrl: "https://www.getassistara.com/t" });
    assert.deepEqual(links.map((l) => l.url), [
      "https://www.getassistara.com/live?token=SECRETLIVETOKEN",
      "https://instagram.com/assistara",
    ]);
    assert.deepEqual(links.map((l) => l.index), [0, 1]);
  });

  await t.test("instrumentation inserts one pixel, rewrites links, is idempotent", () => {
    const html = `<html><body><p>Hi</p><a href="https://example.com/join?u=42">Join</a></body></html>`;
    const clickUrls = new Map([[0, "https://t.example/c?t=c1.abc.0.sig"]]);
    const out = T.applyTracking(html, { openPixelUrl: "https://t.example/o?t=o1.abc.sig", clickUrls });

    assert.equal((out.match(/data-assistara-track="pixel"/g) || []).length, 1, "exactly one pixel");
    assert.ok(out.includes("https://t.example/o?t=o1.abc.sig"), "pixel points at the tracker");
    assert.ok(out.includes(`href="https://t.example/c?t=c1.abc.0.sig"`), "link rewritten");

    // The destination is preserved server-side, not in the URL the recipient sees.
    assert.ok(!out.includes("example.com/join?u=42"), "destination no longer in HTML");

    const again = T.applyTracking(out, { openPixelUrl: "https://t.example/o?t=o1.abc.sig", clickUrls });
    assert.equal(again, out, "second pass is a no-op");
  });

  await t.test("plain text is never instrumented and already-tracked links are skipped", () => {
    const text = "Join us: https://example.com/join";
    assert.deepEqual(T.planTrackableLinks(text), [], "no anchors => nothing to track");
    const pre = `<body><a href="https://www.getassistara.com/t/c?t=c1.aaa.0.sig">x</a></body>`;
    assert.deepEqual(
      T.planTrackableLinks(pre, { baseUrl: "https://www.getassistara.com/t" }),
      [],
      "our own tracking links are never re-wrapped",
    );
  });

  await t.test("scanner/prefetch traffic is classified, humans are not", () => {
    assert.equal(T.classifyUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537", {}).suspectedBot, false);
    assert.equal(T.classifyUserAgent("GoogleImageProxy", {}).suspectedBot, true);
    assert.equal(T.classifyUserAgent("", {}).suspectedBot, true, "missing UA is not human");
    assert.equal(T.classifyUserAgent("python-requests/2.31", {}).suspectedBot, true);
    assert.equal(
      T.classifyUserAgent("Mozilla/5.0 Chrome/120", { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }).suspectedBot,
      true,
      "non-navigate fetch metadata is a proxy",
    );
    assert.equal(T.classifyUserAgent("Mozilla/5.0 Chrome/120", { purpose: "prefetch" }).suspectedBot, true);
  });

  await t.test("open pixels are subresources, not scanner navigations", () => {
    // A real browser loading the pixel sends image/no-cors fetch metadata; that
    // must NOT be treated as a bot for an OPEN (only a click needs navigation).
    const imgMeta = { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" };
    assert.equal(T.classifyUserAgent("Mozilla/5.0 Chrome/120 Safari/537", imgMeta, "open").suspectedBot, false);
    assert.equal(T.classifyUserAgent("Mozilla/5.0 Chrome/120 Safari/537", imgMeta, "click").suspectedBot, true);
    // A proxy user agent is still flagged on an open.
    assert.equal(T.classifyUserAgent("GoogleImageProxy", imgMeta, "open").suspectedBot, true);
  });
});

test("first-party tracking source guards", async (t) => {
  const migration = read(path.join(ROOT, "supabase", "migrations", "202610120002_email_first_party_tracking.sql"));
  const endpoint = read(path.join(FUNCTIONS_DIR, "email-track", "index.ts"));
  const delivery = read(path.join(FUNCTIONS_DIR, "_shared", "email-delivery.ts"));
  const vercel = JSON.parse(read(path.join(ROOT, "assistara-local-v9", "vercel.json")));

  await t.test("migration is additive and keeps the webhook RPC compatible", () => {
    assert.match(migration, /add column if not exists tracking_id text/);
    assert.match(migration, /add column if not exists has_first_party_tracking boolean/);
    assert.match(migration, /create table if not exists public\.email_tracking_links/);
    assert.match(migration, /add column if not exists measurement text/);
    assert.match(migration, /add column if not exists suspected_bot boolean/);
    // Same 3-arg signature -> the deployed email-webhook keeps working.
    assert.match(migration, /create or replace function public\.email_apply_event\(\s*p_delivery_log_id uuid,\s*p_event_type text,\s*p_ts timestamptz default now\(\)\s*\)/);
    assert.match(migration, /create or replace function public\.email_apply_first_party_event/);
    assert.match(migration, /notify pgrst/);
    assert.ok(!/\bdrop\s+table\b/i.test(migration), "never drops tables");
    assert.ok(!/\bdrop\s+column\b/i.test(migration), "never drops columns");
  });

  await t.test("endpoint cannot open-redirect, leak PII, or be classified as a sender", () => {
    assert.match(endpoint, /verifyOpenToken/);
    assert.match(endpoint, /verifyClickToken/);
    assert.match(endpoint, /email_tracking_links/, "destination comes from the server-side map");
    assert.match(endpoint, /Response\.redirect\(FALLBACK/, "invalid tokens fall back, never open-redirect");
    assert.match(endpoint, /image\/gif/);
    assert.match(endpoint, /no-store/, "pixel is never cached");
    assert.ok(!/recipient_email=\$/.test(endpoint), "recipient email is never placed in the URL");
    assert.ok(!/searchParams\.get\("u"\)|searchParams\.get\("url"\)|searchParams\.get\("dest"\)/.test(endpoint), "no destination taken from the URL");
    assert.ok(!endpoint.includes("api.resend.com"), "not a sender");
    assert.ok(!endpoint.includes("api.brevo.com"), "not a sender");
    assert.ok(!endpoint.includes("_shared/email-delivery"), "not a sender");
    assert.match(endpoint, /_shared\/email-tracking/);
  });

  await t.test("delivery router injects provider-agnostically and fails open", () => {
    assert.match(delivery, /import\s*\{[\s\S]*?\}\s*from\s*'\.\/email-tracking\.ts'/);
    assert.match(delivery, /planTrackableLinks/);
    assert.match(delivery, /applyTracking/);
    assert.match(delivery, /instrumentTracking/);
    assert.match(delivery, /persistTracking/);
    assert.match(delivery, /email_tracking_links/, "link map persisted before send");
    assert.match(delivery, /TRACKING_SECRET/, "no secret => untouched email");
    assert.match(delivery, /TRACKING_BASE_URL/);
    assert.match(delivery, /sendViaProvider\(provider, outbound\)/, "the instrumented HTML is what is sent");
  });

  await t.test("a first-party domain route exists on the site", () => {
    assert.ok(vercel.routes.some((r) => r.src === "/t/o"), "open pixel route");
    assert.ok(vercel.routes.some((r) => r.src === "/t/c"), "click redirect route");
  });
});
