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

// Visitor-history fixtures.
const LINK2 = { id: "link-2", token: "AAAA1111", channel: "Facebook", placement: "Xyra Story", label: null, destination: "academy", is_active: true };
const T0 = Date.parse("2026-10-01T10:00:00Z");
const at = (ms) => new Date(ms).toISOString();
const mkVisit = (id, visitorId, linkId, atMs, token) => ({ id, visitor_id: visitorId, acquisition_link_id: linkId, tracking_token: token, created_at: at(atMs) });

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

// P. Direct visit and tracking-token attribution both resolve (existing paths).
test("P. direct visit and tracking-token attribution both resolve", () => {
  const byVisit = resolver.resolve({ id: "x", acquisition_visit_id: VISIT.id }, { ...ctx, kind: "signup" });
  assert.equal(byVisit.path, "record_visit");
  assert.equal(byVisit.status, "Tracked");
  const byToken = resolver.resolve({ id: "x", tracking_token: LINK.token }, { ...ctx, kind: "signup" });
  assert.equal(byToken.path, "record_token");
  assert.equal(byToken.status, "Tracked");
});

// G. Prior visitor-history attribution.
test("G. a prior visitor-history visit attributes a signup with no direct visit", () => {
  const visitor = "vis-1";
  const prior = mkVisit("v1", visitor, LINK.id, T0 - 3600000, LINK.token);
  const signup = { id: "s-7", email: "g@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [prior], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, true);
  assert.equal(r.status, "Recovered");
  assert.equal(r.path, "visitor_recovered");
  assert.equal(r.display, "Other \u2192 GPT add");
  assert.equal(r.visit_id, "v1");
});

// H. Multiple same-campaign visits -> the latest eligible one wins.
test("H. multiple same-campaign visits resolve to the latest eligible visit", () => {
  const visitor = "vis-2";
  const older = mkVisit("vA", visitor, LINK.id, T0 - 7200000, LINK.token);
  const newer = mkVisit("vB", visitor, LINK.id, T0 - 60000, LINK.token);
  const signup = { id: "s-8", email: "h@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [older, newer], signups: [signup], kind: "signup" });
  assert.equal(r.status, "Recovered");
  assert.equal(r.visit_id, "vB");
});

// I. Visits after the signup are excluded.
test("I. a visit that happened AFTER the signup cannot attribute it", () => {
  const visitor = "vis-3";
  const after = mkVisit("vC", visitor, LINK.id, T0 + 3600000, LINK.token);
  const signup = { id: "s-9", email: "i@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [after], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, false);
  assert.equal(r.status, "Untracked");
});

// J. Visits older than the attribution window are stale and excluded.
test("J. a visit older than the attribution window is stale and excluded", () => {
  const visitor = "vis-4";
  const staleAt = T0 - (resolver.ATTRIBUTION_WINDOW_DAYS + 1) * 86400000;
  const stale = mkVisit("vD", visitor, LINK.id, staleAt, LINK.token);
  const signup = { id: "s-10", email: "j@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [stale], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, false);
  assert.equal(r.status, "Untracked");
});

// K. Competing campaigns are ambiguous and never guessed.
test("K. competing campaigns for one visitor are ambiguous and never assigned arbitrarily", () => {
  const visitor = "vis-5";
  const a = mkVisit("vE", visitor, LINK.id, T0 - 3600000, LINK.token);
  const b = mkVisit("vF", visitor, LINK2.id, T0 - 1800000, LINK2.token);
  const signup = { id: "s-11", email: "k@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK, LINK2], visits: [a, b], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, false);
  assert.equal(r.status, "Untracked");
});

// L. A visitor with no prior campaign visit stays direct; no campaign invented.
test("L. a visitor with no prior campaign visit is not given an invented campaign", () => {
  const visitor = "vis-6";
  const unlinked = { id: "vG", visitor_id: visitor, acquisition_link_id: null, created_at: at(T0 - 3600000) };
  const signup = { id: "s-12", email: "l@example.com", acquisition_visitor_id: visitor, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [unlinked], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, false);
  assert.equal(r.status, "Untracked");
});

// M. Missing visitor id cannot be recovered.
test("M. a signup with no visitor id cannot be recovered", () => {
  const signup = { id: "s-13", email: "m@example.com", acquisition_visitor_id: null, created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK], visits: [VISIT], signups: [signup], kind: "signup" });
  assert.equal(r.tracked, false);
});

// N. Existing reliable direct attribution is never overwritten.
test("N. an existing direct attribution is never replaced by visitor history", () => {
  const visitor = "vis-7";
  const other = mkVisit("vH", visitor, LINK2.id, T0 - 60000, LINK2.token);
  const own = mkVisit("vI", visitor, LINK.id, T0 - 3600000, LINK.token);
  const signup = { id: "s-14", email: "n@example.com", acquisition_visitor_id: visitor, acquisition_visit_id: "vI", created_at: at(T0) };
  const r = resolver.resolve(signup, { links: [LINK, LINK2], visits: [own, other], signups: [signup], kind: "signup" });
  assert.equal(r.path, "record_visit");
  assert.equal(r.display, "Other \u2192 GPT add");
});

// O. Every path carries its documented classification.
test("O. each attribution path carries its documented classification", () => {
  const direct = resolver.resolve({ id: "x", acquisition_visit_id: VISIT.id }, { ...ctx, kind: "signup" });
  assert.equal(direct.status, "Tracked");
  const token = resolver.resolve({ id: "x", tracking_token: LINK.token }, { ...ctx, kind: "signup" });
  assert.equal(token.status, "Tracked");
  const utm = resolver.resolve({ id: "x", utm_source: "google" }, { links: [], visits: [], kind: "signup" });
  assert.equal(utm.status, "UTM");
  const ref = resolver.resolve({ id: "x", acquisition_visit_id: "vRef" }, { links: [LINK], visits: [{ id: "vRef", referrer: "https://news.ycombinator.com/x" }], kind: "signup" });
  assert.equal(ref.status, "Direct");
  const none = resolver.resolve({ id: "x" }, { links: [], visits: [], kind: "signup" });
  assert.equal(none.status, "Untracked");
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
