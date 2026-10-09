"use strict";

// application-dedupe.test.js — guards the accidental-duplicate-application fix.
//
// website-form used to always INSERT a new academy_applications row, so a
// double click / refresh-and-resend produced two applicants, two confirmation
// emails and two Admin cards. The fix folds a repeat submit within 24h for the
// same email onto the existing UNREVIEWED application, and never touches a paid,
// onboarded or already-decided row, so legitimate re-applications still work.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const form = fs.readFileSync(path.join(root, "supabase", "functions", "website-form", "index.ts"), "utf8");
const apply = fs.readFileSync(path.join(root, "assistara-local-v9", "academy-apply.html"), "utf8");

test("repeat submits fold onto an existing unreviewed application", () => {
  assert.match(form, /async function recentApplication\(/, "dedupe helper must exist");
  assert.match(form, /decision=is\.null/, "only undecided applications are deduped");
  assert.match(form, /payment_status=neq\.paid/, "paid applications are never deduped");
  assert.match(form, /created_at=gte\./, "dedupe is bounded by a time window");
  assert.match(form, /const priorApplication=await recentApplication\(email\)/);
  assert.match(form, /if\(priorApplication\)\{await updateApplication\(priorApplication,applicationRow\);id=priorApplication\}else\{id=await insert\('academy_applications',applicationRow\)\}/,
    "an existing row is updated; only a genuinely new applicant is inserted");
});

test("the dedupe update never changes status, decision or payment fields", () => {
  const start = form.indexOf("const applicationRow=");
  const body = form.slice(start, form.indexOf(";const priorApplication", start));
  assert.ok(body.length > 0, "applicationRow definition must exist");
  assert.doesNotMatch(body, /status:/, "must not change application status");
  assert.doesNotMatch(body, /decision:/, "must not change the decision");
  assert.doesNotMatch(body, /payment_status:/, "must not change payment state");
});

test("the apply page prevents an accidental in-tab resubmit", () => {
  assert.match(apply, /sessionStorage\.setItem\('assistara_application_submitted','1'\)/);
  assert.match(apply, /sessionStorage\.getItem\('assistara_application_submitted'\)==='1'/);
});
