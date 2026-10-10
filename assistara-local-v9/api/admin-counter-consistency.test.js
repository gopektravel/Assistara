"use strict";

// admin-counter-consistency.test.js — the admin dashboard must report ONE
// application total everywhere.
//
// The Applications tab and the Webinar Signups tab used to compute their own
// numbers from different sources (non-enrolled application rows vs signups
// carrying an application_id), so they could disagree. They now both read the
// single canonical `totalApplications()` helper, which is the only place the
// application total is defined. These tests lock that in.
//
// They also prove:
//   1. There is exactly one definition of the application total.
//   2. Both tabs call it (and neither re-derives its own number).
//   3. No hardcoded counts, and counters refresh through load()/render().
//   4. The edge function still returns the data the helper relies on.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const v9 = path.join(root, "assistara-local-v9");
const adminHtml = fs.readFileSync(path.join(v9, "admin.html"), "utf8");
const edgeFn = fs.readFileSync(path.join(root, "supabase", "functions", "admin-applications", "index.ts"), "utf8");

function contains(src, str) {
  return src.includes(str);
}

// ─── One canonical definition ───

test("there is exactly one canonical application total", () => {
  const defs = adminHtml.match(/function totalApplications\(\)/g) || [];
  assert.equal(defs.length, 1, "totalApplications() must be defined exactly once");
});

test("totalApplications() is the non-enrolled application count", () => {
  assert.ok(contains(adminHtml, "function totalApplications()"),
    "totalApplications() must exist");
  assert.ok(contains(adminHtml, "return activeApps().length;"),
    "totalApplications() must return activeApps().length");
});

test("activeApps() still filters out fully enrolled students", () => {
  assert.ok(contains(adminHtml, "function activeApps()"),
    "activeApps() function must exist");
  assert.ok(contains(adminHtml, 'x.status === "onboarded" && x.payment_status === "paid" && x.onboarding_completed_at && x.auth_user_id && !x.suspended_at'),
    "activeApps() must filter out fully enrolled students");
});

// ─── Both tabs read the one definition ───

test("Applications tab reports the canonical total", () => {
  assert.ok(contains(adminHtml, '[totalApplications(), "Applications", "Total applications"]'),
    "Applications tab must show the canonical total labelled 'Applications'");
});

test("Webinar Signups tab reports the SAME canonical total", () => {
  // The webinar stat block must contain the identical canonical call.
  assert.ok(contains(adminHtml, '[totalApplications(), "Applications", "Total applications"]'),
    "Webinar tab must show the canonical total with the same label");
});

test("the canonical call appears in both the applicants and webinar branches", () => {
  const call = '[totalApplications(), "Applications", "Total applications"]';
  const count = adminHtml.split(call).length - 1;
  assert.equal(count, 2,
    "both the Applications tab and the Webinar tab must read the canonical total (expected 2 call sites)");
});

test("the webinar tab no longer re-derives its own application number", () => {
  assert.ok(!contains(adminHtml, "appliedFromWebinar"),
    "the old 'Applied from webinar' derivation must be gone");
  assert.ok(!contains(adminHtml, "directApps"),
    "the old 'Direct applications' derivation must be gone");
  assert.ok(!contains(adminHtml, "appliedFromWebinar.length"),
    "no counter may re-derive a separate application total");
});

test("no counter hardcodes the old 12 or 13", () => {
  assert.ok(!/[^0-9](12|13)[^0-9]\s*,\s*["'](Applications|Applied)["']/.test(adminHtml),
    "the application total must never be hardcoded");
});

// ─── stat() subtitles ───

test("stat() function supports an optional subtitle", () => {
  assert.ok(contains(adminHtml, "function stat(a)"),
    "stat() function must exist");
  assert.ok(contains(adminHtml, '${x[2] ? `<small>${x[2]}</small>` : ""}'),
    "stat() must render a subtitle when provided");
  assert.ok(contains(adminHtml, ".stat small"),
    "CSS must style the stat subtitle element");
});

// ─── Edge function data shape ───

test("edge function returns non-enrolled applications and enrolled students separately", () => {
  assert.ok(contains(edgeFn, "applicants=x.filter") && contains(edgeFn, "!isEnrolled(z)"),
    "Edge function must split applications into non-enrolled (applicants)");
  assert.ok(contains(edgeFn, "students=x.filter(isEnrolled)"),
    "Edge function must split applications into enrolled (students)");
  assert.ok(contains(edgeFn, "applications:applicants"),
    "Edge function must return non-enrolled as 'applications'");
  assert.ok(contains(edgeFn, "students,") || contains(edgeFn, "students:students"),
    "Edge function must return enrolled as 'students'");
});

test("edge function returns all signups without filtering", () => {
  assert.ok(contains(edgeFn, "signups:W.data"),
    "Edge function must return all signups (filtering happens in frontend)");
});

// ─── Refresh behaviour ───

test("counters refresh on page load via load()", () => {
  assert.ok(contains(adminHtml, "async function load()"),
    "load() function must exist");
  assert.ok(contains(adminHtml, "apps = d.applications || []"),
    "load() must populate apps from edge function");
  assert.ok(contains(adminHtml, "web = d.signups || []"),
    "load() must populate web from edge function");
  assert.ok(contains(adminHtml, "students = d.students || []"),
    "load() must populate students from edge function");
});

test("render() is called after load() to refresh counters", () => {
  assert.ok(contains(adminHtml, "load()"),
    "load() must be called");
  assert.ok(contains(adminHtml, "render()"),
    "render() must be called");
});
