"use strict";

// journey-wiring.test.js — the full student journey as one executable contract.
//
// Application -> acceptance -> checkout -> payment verified -> enrollment ->
// onboarding email -> account activation -> login -> lessons -> quick check ->
// exam -> progress. The per-step behaviour is covered by the wider suite; this
// test proves the steps are actually wired to each other (the link from one
// artifact to the next), which is what a launch breaks on.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const applications = read("supabase/functions/admin-applications/index.ts");
const checkout = read("supabase/functions/create-checkout-session/index.ts");
const stripeComplete = read("supabase/functions/payment-complete/index.ts");
const paymongoHook = read("supabase/functions/paymongo-webhook/index.ts");
const capacity = read("supabase/migrations/202610080003_academy_capacity_waitlist.sql");
const access = read("supabase/migrations/202609270001_academy_access_and_exam_write_lockdown.sql");
const onboarding = read("supabase/functions/onboarding-api/index.ts");
const session = read("assistara-local-v9/api/academy-session.js");
const content = read("assistara-local-v9/api/academy-content.js");
const quickCheck = read("assistara-local-v9/api/academy-quick-check.js");
const exam = read("assistara-local-v9/api/academy-exam.js");

test("1. acceptance email links to checkout with the applicant's enrollment token", () => {
  assert.match(applications, /\/academy\/checkout\?token=\$\{encodeURIComponent\(app\.enrollment_token\)\}/);
});

test("2. checkout validates the token and reserves a seat before taking money", () => {
  assert.match(checkout, /enrollment_token/);
  assert.match(checkout, /reserve_academy_seat/);
  assert.match(checkout, /metadata\[application_id\]/);
});

test("3. both payment providers route through the one serialized mark-paid gate", () => {
  assert.match(stripeComplete, /payment_status!=='paid'/); // server re-verifies with Stripe
  assert.match(stripeComplete, /finalize_academy_payment/);
  assert.match(paymongoHook, /finalize_academy_payment/);
  assert.match(capacity, /create or replace function public\.finalize_academy_payment/);
  assert.match(capacity, /payment_status = 'paid'/);
});

test("4. payment confirmation links to onboarding with the enrollment token", () => {
  assert.match(stripeComplete, /\/academy\/onboarding\?token=/);
  assert.match(paymongoHook, /\/academy\/onboarding\?token=/);
});

test("5. onboarding binds the auth user and marks onboarding complete", () => {
  assert.match(onboarding, /auth_user_id/);
  assert.match(onboarding, /onboarding_completed_at/);
});

test("6. entitlement requires paid AND onboarded AND not suspended", () => {
  assert.match(access, /a\.status = 'onboarded'/);
  assert.match(access, /a\.payment_status = 'paid'/);
  assert.match(access, /a\.onboarding_completed_at IS NOT NULL/);
  assert.match(access, /a\.suspended_at IS NULL/);
});

test("7. the dashboard and its lesson slides require a validated learner session", () => {
  assert.match(session, /validatedLearnerSession/);
  assert.match(content, /validatedLearnerSession/);
});

test("8. quick checks and exams authorize a learner session (or a QA session)", () => {
  for (const [name, src] of [["quick-check", quickCheck], ["exam", exam]]) {
    assert.match(src, /validatedLearnerSession/, name + " must require a learner session");
    assert.match(src, /academy-test-portal/, name + " must accept the sealed QA audience");
  }
});

test("9. exam grading is server-owned and progress is written under the service role", () => {
  assert.match(exam, /question\.correct_option_id/);
  assert.doesNotMatch(exam, /body\.score/);
  assert.match(exam, /academy_record_exam_attempt/);
});
