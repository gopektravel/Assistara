"use strict";

// stripe-webhook.test.js — guards the server-to-server safety net for Stripe
// card payments.
//
// Before this function existed, a Stripe payment was only finalized when the
// buyer's browser reached /academy/payment-success and called payment-complete.
// A closed tab or blocked redirect meant money captured with no enrollment.
// This suite asserts the webhook exists, verifies signatures, only acts on
// Assistara Academy checkouts, and delegates to the tested payment-complete
// path instead of duplicating fulfillment logic.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "supabase", "functions", "stripe-webhook", "index.ts"), "utf8");

test("stripe webhook verifies the Stripe signature before acting", () => {
  assert.match(src, /stripe-signature/, "must read the stripe-signature header");
  assert.match(src, /STRIPE_WEBHOOK_SECRET/, "must use the endpoint signing secret");
  assert.match(src, /HMAC/, "must verify with HMAC-SHA256");
  assert.match(src, /Math\.abs\(Date\.now\(\)\s*\/\s*1000\s*-\s*Number\(t\)\)\s*>\s*300/,
    "must reject stale signatures (timestamp tolerance)");
  assert.match(src, /safeEqual/, "must compare signatures in constant time");
});

test("stripe webhook only fulfills paid Assistara Academy checkouts", () => {
  assert.match(src, /checkout\.session\.completed/);
  assert.match(src, /checkout\.session\.async_payment_succeeded/);
  assert.match(src, /metadata\?\.source.*assistara_academy|metadata\.source.*assistara_academy/,
    "must check the checkout metadata source");
  assert.match(src, /payment_status.*paid/, "must require payment_status paid");
});

test("stripe webhook reuses payment-complete and lets Stripe retry on failure", () => {
  assert.match(src, /functions\/v1\/payment-complete/,
    "must delegate to the tested, idempotent payment-complete path");
  assert.match(src, /session_id:\s*sessionId/, "must pass the checkout session id through");
  assert.match(src, /status:\s*500\)|,\s*500\)/, "must return 500 so Stripe retries failed fulfillment");
});

test("stripe webhook does not itself write payment or enrollment state", () => {
  // Fulfillment stays in one audited place; this function must not grow its own
  // database writes that could bypass the capacity RPC.
  assert.doesNotMatch(src, /finalize_academy_payment/, "must not call the capacity RPC directly");
  assert.doesNotMatch(src, /academy_applications/, "must not touch the applications table directly");
});
