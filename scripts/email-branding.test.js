"use strict";

// Guard: every Assistara transactional email must render its brand from
// email-safe HTML/CSS only. No remote logo, no SVG email image, no data URI.
//
// Run with: node --test scripts/email-branding.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase", "functions");

function functionSources() {
  if (!fs.existsSync(FUNCTIONS_DIR)) return [];
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(FUNCTIONS_DIR, entry.name, "index.ts"),
    }))
    .filter((fn) => fs.existsSync(fn.path))
    .map((fn) => ({ ...fn, code: fs.readFileSync(fn.path, "utf8") }));
}

const SOURCES = functionSources();
// Anything that talks to Resend is, by definition, constructing an outgoing email.
const EMAIL_SOURCES = SOURCES.filter((fn) => fn.code.includes("api.resend.com"));

test("the audit can see the email-sending Edge Functions", () => {
  assert.ok(EMAIL_SOURCES.length >= 8, `expected the Resend senders, found ${EMAIL_SOURCES.length}`);
});

test("no Edge Function references an external Assistara logo asset", () => {
  for (const fn of SOURCES) {
    assert.ok(!/assistara-logo/i.test(fn.code), `${fn.name} references assistara-logo`);
    assert.ok(!/assistara-icon/i.test(fn.code), `${fn.name} references assistara-icon`);
  }
});

test("email HTML never loads an image over the network", () => {
  for (const fn of EMAIL_SOURCES) {
    const remoteImages = [...fn.code.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)]
      .map((match) => match[1])
      .filter((src) => /^https?:/i.test(src));
    assert.deepEqual(remoteImages, [], `${fn.name} loads a remote image in email HTML`);

    const dataUris = [...fn.code.matchAll(/<img\b[^>]*\bsrc=["']?data:/gi)];
    assert.equal(dataUris.length, 0, `${fn.name} uses a data URI image`);
  }
});

test("every email shell carries the email-safe brand mark", () => {
  for (const fn of EMAIL_SOURCES) {
    assert.match(
      fn.code,
      /background:\s*#ffd51f\s*;\s*border-radius:\s*12px/i,
      `${fn.name} is missing the yellow Assistara brand mark`
    );
    assert.match(fn.code, /font-weight:\s*900/i, `${fn.name} is missing the bold brand-mark glyph`);
  }
});

test("no email SVG dependency", () => {
  for (const fn of EMAIL_SOURCES) {
    assert.ok(!/<img\b[^>]*\.svg/i.test(fn.code), `${fn.name} uses an SVG image in email HTML`);
  }
});

test("GCash QR stays an inline (CID) attachment, not a hosted logo", () => {
  const gcash = EMAIL_SOURCES.find((fn) => fn.name === "admin-gcash-payment");
  assert.ok(gcash, "admin-gcash-payment should be an email sender");
  assert.match(gcash.code, /src="cid:gcash-qr"/, "GCash QR must remain an inline CID image");
});

test("preserved copy is intact in admin-applications", () => {
  const fn = EMAIL_SOURCES.find((entry) => entry.name === "admin-applications");
  assert.ok(fn, "admin-applications should be an email sender");
  assert.ok(fn.code.includes("But fear not! You're on our waitlist!"), "waitlist headline missing");
  assert.ok(
    fn.code.includes("Good things are worth the wait, and we hope you're one of them!"),
    "waitlist P.S. missing"
  );
  assert.ok(fn.code.includes("You're IN!"), "acceptance subject missing");
  assert.ok(
    fn.code.includes("Only ${LIMIT} paid spots available!"),
    "acceptance scarcity callout missing"
  );
  assert.ok(
    fn.code.includes("Acceptance does not guarantee a seat."),
    "acceptance scarcity disclaimer missing"
  );
});

test("acceptance scarcity copy stays out of unrelated shells", () => {
  for (const fn of EMAIL_SOURCES) {
    if (fn.name === "admin-applications") continue;
    assert.ok(
      !fn.code.includes("Acceptance does not guarantee a seat."),
      `${fn.name} leaks the acceptance scarcity disclaimer`
    );
  }
});

test("critical CTAs keep a visible fallback URL", () => {
  const expectations = {
    "admin-applications": /word-break:break-all">\$\{cta\.href\}/,
    "website-form": /word-break:break-all">\$\{button\.href\}/,
    "admin-send-onboarding": /word-break:break-all">\$\{url\}/,
    "payment-complete": /word-break:break-all">\$\{cta\.href\}/,
    "paymongo-webhook": /word-break:break-all">\$\{cta\.href\}/,
    "admin-api": /word-break:break-all/,
  };
  for (const [name, pattern] of Object.entries(expectations)) {
    const fn = EMAIL_SOURCES.find((entry) => entry.name === name);
    assert.ok(fn, `${name} should be an email sender`);
    assert.match(fn.code, pattern, `${name} lost its plain-text fallback CTA URL`);
  }
});

test("legacy Google Apps Script notifications use the same brand mark", () => {
  const gasPath = path.join(ROOT, "google-apps-script.gs");
  assert.ok(fs.existsSync(gasPath), "google-apps-script.gs missing");
  const gas = fs.readFileSync(gasPath, "utf8");
  assert.ok(!/assistara-logo|assistara-icon/i.test(gas), "Apps Script references an external logo");
  assert.match(gas, /background:#FFD51F;border-radius:12px/i, "Apps Script brand mark missing");
  assert.ok(gas.includes("BRAND_HEADER"), "Apps Script brand header constant missing");
});
