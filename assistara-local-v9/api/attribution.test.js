"use strict";

// attribution.test.js — the canonical attribution resolver.
//
// One resolver decides whether an Academy application is tracked and what its
// real source is. The rules this suite exists to prove:
//   1. A valid acquisition-link visit is ALWAYS tracked, even when every UTM
//      field is NULL.
//   2. Attribution survives signup -> application through the linked
//      masterclass signup when the application itself has no direct visit.
//   3. UTM attribution is a real fallback when no acquisition link exists.
//   4. Untracked is shown ONLY when nothing reliable exists anywhere.
//   5. Every admin page consumes this one resolver - no page invents its own.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resolver = require("../attribution.js");

const LINK = {
  id: "57e588ed-d4f0-4b3a-997a-2eb817149ac4",
  token: "E77706B8",
  channel: "Other",
  placement: "GPT add",
  label: null,
  destination: "academy",
  is_active: true,
};
const VISIT = {
  id: "593d94e1-5939-44e0-8c20-7a348aed6b0b",
  acquisition_link_id: LINK.id,
  tracking_token: LINK.token,
  referrer: "https://chat.openai.com/",
  landing_path: "/a/E77706B8",
};
const ctx = { links: [LINK], visits: [VISIT], signups: [] };

// A. Direct acquisition visit + link, UTMs all NULL.
test("A. application with a direct acquisition visit is TRACKED even with NULL UTMs", () => {
  const app = {
    id: "app-1", email: "a@example.com",
    acquisition_visit_id: VISIT.id, tracking_token: LINK.token,
    utm_source: null, utm_medium: null, utm_campaign: null,
  };
  const r = resolver.resolve(app, { ...ctx, kind: "application" });
  assert.equal(r.tracked, true);
  assert.equal(r.path, "record_visit");
  assert.equal(r.channel, "Other");
  assert.equal(r.placement, "GPT add");
  assert.notEqual(r.display, "Untracked");
});

// B. No direct visit, but the linked masterclass signup has one.
test("B. application with no direct visit inherits the linked signup's visit", () => {
  const signup = { id: "s-1", email: "b@example.com", acquisition_visit_id: VISIT.id, tracking_token: LINK.token, utm_source: null };
  const app = { id: "app-2", email: "b@example.com", masterclass_signup_id: "s-1", acquisition_visit_id: null, tracking_token: null };
  const r = resolver.resolve(app, { ...ctx, signups: [signup], kind: "application" });
  assert.equal(r.tracked, true);
  assert.equal(r.path, "signup_visit");
  assert.equal(r.display, "Other \u2192 GPT add");
});

// C. UTM exists but there is no acquisition link.
test("C. UTM attribution is TRACKED when no acquisition link exists", () => {
  const signup = { id: "s-2", email: "c@example.com", acquisition_visit_id: null, tracking_token: null, utm_source: "google", utm_medium: "cpc", utm_campaign: "launch" };
  const app = { id: "app-3", email: "c@example.com", masterclass_signup_id: "s-2" };
  const r = resolver.resolve(app, { links: [], visits: [], signups: [signup], kind: "application" });
  assert.equal(r.tracked, true);
  assert.equal(r.path, "utm");
  assert.equal(r.utm.source, "google");
  assert.match(r.display, /google/);
});

// D. Nothing anywhere -> Untracked.
test("D. application with no attribution anywhere is UNTRACKED", () => {
  const signup = { id: "s-3", email: "d@example.com", acquisition_visit_id: null, tracking_token: null, utm_source: null };
  const app = { id: "app-4", email: "d@example.com", masterclass_signup_id: "s-3", acquisition_visit_id: null, tracking_token: null };
  const r = resolver.resolve(app, { links: [LINK], visits: [VISIT], signups: [signup], kind: "application" });
  assert.equal(r.tracked, false);
  assert.equal(r.path, "untracked");
  assert.equal(r.display, "Untracked");
});

// E. The exact production shape: Other / "GPT add" / NULL UTMs.
test("E. link Other + 'GPT add' with NULL UTMs never displays Unknown", () => {
  const app = { id: "app-5", email: "e@example.com", acquisition_visit_id: VISIT.id, tracking_token: LINK.token };
  const r = resolver.resolve(app, { ...ctx, kind: "application" });
  assert.equal(r.tracked, true);
  assert.equal(r.short, "GPT add");
  assert.equal(r.display, "Other \u2192 GPT add");
  assert.doesNotMatch(r.display, /unknown|untracked/i);
});

// F. Attribution survives signup -> application.
test("F. attribution survives the masterclass signup -> Academy application handoff", () => {
  const signup = { id: "s-6", email: "f@example.com", acquisition_visit_id: VISIT.id, tracking_token: LINK.token };
  const app = { id: "app-6", email: "f@example.com", masterclass_signup_id: "s-6" };
  const resolvedForSignup = resolver.resolve(signup, { ...ctx, signups: [signup], kind: "signup" });
  const resolvedForApp = resolver.resolve(app, { ...ctx, signups: [signup], kind: "application" });
  assert.equal(resolvedForSignup.tracked, true);
  assert.equal(resolvedForApp.tracked, true);
  assert.equal(resolvedForSignup.display, resolvedForApp.display);
  assert.equal(resolvedForApp.display, "Other \u2192 GPT add");
});

// Architectural guard: the admin pages consume the one shared resolver.
test("every admin surface loads the shared resolver instead of inventing one", () => {
  const v9 = path.resolve(__dirname, "..");
  for (const page of ["admin.html", "admin-finance.html"]) {
    const html = fs.readFileSync(path.join(v9, page), "utf8");
    assert.match(html, /<script[^>]+src="\/attribution\.js"/, `${page} must load the shared resolver`);
    assert.match(html, /AssistaraAttribution\.resolve\(/, `${page} must call the shared resolver`);
  }
});
