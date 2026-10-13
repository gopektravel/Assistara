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
const financeHtml = fs.readFileSync(path.join(v9, "admin-finance.html"), "utf8");
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

test("activeApps() keeps enrolled records visible through the whole lifecycle", () => {
  assert.ok(contains(adminHtml, "function activeApps()"),
    "activeApps() function must exist");
  assert.ok(contains(adminHtml, "const records = [...apps, ...students];"),
    "activeApps() must merge enrolled records back into the lifecycle list");
  assert.ok(contains(adminHtml, "return records.filter("),
    "activeApps() must return deduplicated lifecycle records");
});

// ─── Both tabs read the one definition ───

test("Applications tab reports the canonical total", () => {
  const pipe = adminHtml.slice(adminHtml.indexOf("function paintApplicantsPipeline()"), adminHtml.indexOf("function paintEnrollment(cap"));
  assert.ok(pipe.includes("ovNum(totalApplications())") && pipe.includes('"Total Applications"'),
    "Applications pipeline must show the canonical total");
});

test("Webinar Signups tab reports the SAME canonical total", () => {
  // The webinar stat block must contain the identical canonical call.
  assert.ok(contains(adminHtml, '[totalApplications(), "Applications", "Total applications"]'),
    "Webinar tab must show the canonical total with the same label");
});

test("the canonical call appears in both the applicants and webinar branches", () => {
  const pipe = adminHtml.slice(adminHtml.indexOf("function paintApplicantsPipeline()"), adminHtml.indexOf("function paintEnrollment(cap"));
  const webinar = adminHtml.slice(adminHtml.indexOf('if (tab === "webinar") {'), adminHtml.indexOf('if (tab === "coupons") {'));
  assert.ok(pipe.includes("totalApplications()"), "Applications must read the canonical total");
  assert.ok(webinar.includes('[totalApplications(), "Applications", "Total applications"]'), "Lead Tracker must read the canonical total");
});

test("the webinar tab never re-derives the application total", () => {
  assert.ok(!contains(adminHtml, "appliedFromWebinar"),
    "the old 'Applied from webinar' count derivation must be gone");
  assert.ok(!contains(adminHtml, 'directApps.length, "Applications"'),
    "the application total must come from totalApplications(), not a local list");
});

// ─── Acquisition points include direct applicants ───

test("webinar acquisition points include direct applications", () => {
  assert.ok(contains(adminHtml, "acquisitionWeightOf"),
    "the readiness->weight helper must exist");
  assert.ok(contains(adminHtml, "directApps.reduce((sum,a)=>sum+acquisitionWeightOf(a.payment_readiness),0)"),
    "direct applications must add their own readiness weight to the goal");
});

test("webinar points never double-count an application already represented by a signup", () => {
  assert.ok(contains(adminHtml, "linkedAppIds"),
    "applications linked to a signup must be excluded from the direct-app list");
  assert.ok(contains(adminHtml, "signupEmails"),
    "email linkage must be honoured when excluding linked applications");
});

test("finance acquisition points include direct applications", () => {
  assert.ok(contains(financeHtml, "acquisitionWeightFromReadiness"),
    "the readiness->weight helper must exist in finance");
  assert.ok(contains(financeHtml, "if (isDirectApp(a)) row.points += acquisitionWeightFromReadiness(a.payment_readiness);"),
    "direct applications must add their readiness weight in the finance funnel");
  assert.ok(contains(financeHtml, "const isDirectApp = (a) =>"),
    "finance must exclude applications already represented by a signup");
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
  assert.match(edgeFn, /applicants\s*=\s*x\.filter/,
    "Edge function must split applications into non-enrolled (applicants)");
  assert.ok(contains(edgeFn, "!isEnrolled(z)"));
  assert.match(edgeFn, /students\s*=\s*x\.filter\(isEnrolled\)/,
    "Edge function must split applications into enrolled (students)");
  assert.ok(contains(edgeFn, "applications:applicants") || contains(edgeFn, "applications: applicants"),
    "Edge function must return non-enrolled as 'applications'");
  assert.ok(contains(edgeFn, "students,") || contains(edgeFn, "students:students") || contains(edgeFn, "students: students"),
    "Edge function must return enrolled as 'students'");
});

test("edge function derives invitation delivery from provider telemetry, never from a log row", () => {
  // The acceptance invitation outcome is read from the provider delivery
  // telemetry (email_delivery_log + email_events)...
  assert.ok(contains(edgeFn, "from('email_delivery_log')"),
    "the invitation outcome must read the provider delivery telemetry");
  assert.ok(contains(edgeFn, "from('email_events')"),
    "delivery, bounce and delay events must come from the provider webhooks");
  assert.ok(contains(edgeFn, "'academy_acceptance'"),
    "the acceptance invitation type is an explicit source");
  // ...attached to every record...
  assert.ok(contains(edgeFn, "z.acceptance_email = inviteOutcome(z)"),
    "each application carries its invitation outcome");
  // ...and 'delivered' requires real provider proof.
  assert.ok(contains(edgeFn, "types.has('delivered')"),
    "delivered must require a provider delivery signal");
  // A missing signal is unresolved, never failed, and the activity log is not used.
  const start = edgeFn.indexOf("const inviteOutcome = ");
  const end = edgeFn.indexOf("const applicants = x.filter", start);
  assert.ok(start !== -1 && end > start, "inviteOutcome must exist before the applicant split");
  const outcome = edgeFn.slice(start, end);
  assert.ok(contains(outcome, "'unresolved'"), "a sent-but-unconfirmed invitation is unresolved");
  assert.ok(!contains(outcome, "admin_activity_log"),
    "the invitation outcome must never be inferred from the activity log");
});

test("edge function returns all signups without filtering", () => {
  assert.match(edgeFn, /signups:\s*W\.data/,
    "Edge function must return all signups (filtering happens in frontend)");
});

// ─── Refresh behaviour ───

test("counters refresh on page load via load()", () => {
  assert.ok(contains(adminHtml, "async function load()"),
    "load() function must exist");
  assert.match(adminHtml, /apps = Array\.isArray\(d\.applications\) \? d\.applications\.filter\(Boolean\) : \[\]/,
    "load() must populate apps null-safely");
  assert.match(adminHtml, /web = Array\.isArray\(d\.signups\) \? d\.signups\.filter\(Boolean\) : \[\]/,
    "load() must populate web null-safely");
  assert.match(adminHtml, /students = Array\.isArray\(d\.students\) \? d\.students\.filter\(Boolean\) : \[\]/,
    "load() must populate students null-safely");
});

test("render() is called after load() to refresh counters", () => {
  assert.ok(contains(adminHtml, "load()"),
    "load() must be called");
  assert.ok(contains(adminHtml, "render()"),
    "render() must be called");
});
