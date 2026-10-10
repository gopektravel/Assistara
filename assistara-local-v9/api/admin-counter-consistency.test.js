"use strict";

// admin-counter-consistency.test.js — guards against silent divergence of
// application counters across the admin dashboard.
//
// The Applications tab and Webinar Signups tab show different counts because
// they measure different things:
//   - Applications tab: non-enrolled application records (active applicant pool)
//   - Webinar tab: signups with application_id (webinar-to-application conversion)
//
// These tests ensure:
//   1. Both tabs use clear, distinct labels
//   2. The Webinar "Applied" count only counts signups linked to existing applications
//   3. The Webinar tab shows "Direct applications" for unlinked applications
//   4. The stat() function supports subtitles for metric definitions
//   5. The edge function returns the correct data shape

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const v9 = path.join(root, "assistara-local-v9");
const adminHtml = fs.readFileSync(path.join(v9, "admin.html"), "utf8");
const edgeFn = fs.readFileSync(path.join(root, "supabase", "functions", "admin-applications", "index.ts"), "utf8");

// Helper: check if a string exists in the source
function contains(src, str) {
  return src.includes(str);
}

// ─── Applications tab metric definition ───

test("Applications tab uses 'Active applications' label with 'Not yet enrolled' subtitle", () => {
  assert.ok(contains(adminHtml, '"Active applications", "Not yet enrolled"'),
    "Applications tab must clearly label the count as active (non-enrolled) applications");
});

test("Applications tab still filters out fully enrolled students", () => {
  assert.ok(contains(adminHtml, "function activeApps()"),
    "activeApps() function must exist");
  assert.ok(contains(adminHtml, 'x.status === "onboarded" && x.payment_status === "paid" && x.onboarding_completed_at && x.auth_user_id && !x.suspended_at'),
    "activeApps() must filter out fully enrolled students");
});

// ─── Webinar tab metric definition ───

test("Webinar tab uses 'Applied from webinar' label with clear subtitle", () => {
  assert.ok(contains(adminHtml, '"Applied from webinar", "Webinar registrants who applied"'),
    "Webinar tab must clearly label the count as webinar-sourced applications");
});

test("Webinar tab shows 'Direct applications' stat for unlinked applications", () => {
  assert.ok(contains(adminHtml, '"Direct applications", "Applied without webinar"'),
    "Webinar tab must show direct applications (without webinar signup)");
});

test("Webinar 'Applied from webinar' only counts signups linked to existing applications", () => {
  assert.ok(contains(adminHtml, "const allAppIds = new Set([...apps, ...students].map(x => String(x.id)))"),
    "Must build set of all application IDs (enrolled + non-enrolled)");
  assert.ok(contains(adminHtml, "const appliedFromWebinar = visibleWeb.filter(x => x.application_id && allAppIds.has(String(x.application_id)))"),
    "Must only count signups whose application_id points to an existing application");
});

test("Webinar tab builds linked application ID set for direct app calculation", () => {
  assert.ok(contains(adminHtml, "const linkedAppIds = new Set(visibleWeb.filter(x => x.application_id).map(x => String(x.application_id)))"),
    "Must build set of application IDs that have a linked signup");
  assert.ok(contains(adminHtml, "const directApps = apps.filter(x => !linkedAppIds.has(String(x.id)))"),
    "Direct applications must be non-enrolled apps without a linked signup");
});

// ─── stat() function supports subtitles ───

test("stat() function supports optional subtitle as third array element", () => {
  assert.ok(contains(adminHtml, "function stat(a)"),
    "stat() function must exist");
  assert.ok(contains(adminHtml, "${x[2] ? `<small>${x[2]}</small>` : \"\"}"),
    "stat() must render subtitle when provided");
});

test("stat small element has CSS styling", () => {
  assert.ok(contains(adminHtml, ".stat small"),
    "CSS must style the stat subtitle element");
});

// ─── Edge function data shape ───

test("edge function returns applications (non-enrolled) and students (enrolled) separately", () => {
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

// ─── Metric distinction is explicit ───

test("Applications tab and Webinar tab use different, clearly labeled metrics", () => {
  assert.ok(contains(adminHtml, '"Active applications", "Not yet enrolled"'),
    "Applications tab must use 'Active applications' label");
  assert.ok(contains(adminHtml, '"Applied from webinar", "Webinar registrants who applied"'),
    "Webinar tab must use 'Applied from webinar' label");
});

// ─── No hardcoded counts ───

test("no hardcoded application counts in admin.html", () => {
  const hardcodedPattern = /\b(12|13)\b\s*,\s*["']Applications["']/;
  assert.doesNotMatch(adminHtml, hardcodedPattern,
    "Must not hardcode application counts");
});

// ─── Refresh behavior ───

test("counters refresh on page load via load() function", () => {
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
