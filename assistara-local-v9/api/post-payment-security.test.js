"use strict";

// Static regression tests for the two launch-critical post-payment fixes.
//
// These are source-level assertions because the target files are Deno Edge
// Functions and the local environment does not include Deno. The tests verify
// that the required guards are present in the exact production-restored source
// and are ordered correctly (i.e. the guard executes before any mutating call).

const assert = require("node:assert");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..", "supabase", "functions");

function source(name) {
  return fs.readFileSync(path.join(ROOT, name, "index.ts"), "utf8");
}

function indexOf(src, pattern) {
  const idx = src.indexOf(pattern);
  if (idx < 0) throw new Error(`Expected pattern not found: ${pattern}`);
  return idx;
}

/* ------------------------------------------------------------------ *
 * 1. onboarding-api: one-time onboarding enforcement                 *
 * ------------------------------------------------------------------ */

test("onboarding-api requires payment_status=paid before any action", () => {
  const src = source("onboarding-api");
  const paidCheck = indexOf(src, "app.payment_status!==\"paid\"");
  const actionLoad = indexOf(src, 'action==="load"');
  assert.ok(paidCheck < actionLoad, "paid check must precede action handling");
});

test("onboarding-api load returns completed flag", () => {
  const src = source("onboarding-api");
  assert.match(src, /completed:!!app\.onboarding_completed_at/);
});

test("onboarding-api save rejects already-completed onboarding with 409", () => {
  const src = source("onboarding-api");
  const guard = "if(app.onboarding_completed_at)return out({ok:false,error:\"This onboarding link has already been used. Log in to continue.\"},409,h);";
  assert.ok(src.includes(guard), "server-side completed guard must be present");
});

const ONBOARDING_COMPLETED_GUARD = "if(app.onboarding_completed_at)return out({ok:false,error:\"This onboarding link has already been used. Log in to continue.\"},409,h);";

test("onboarding-api completed guard precedes password handling", () => {
  const src = source("onboarding-api");
  const guard = indexOf(src, ONBOARDING_COMPLETED_GUARD);
  const password = indexOf(src, 'typeof b.password==="string"');
  assert.ok(guard < password, "completed guard must precede password use");
});

test("onboarding-api completed guard precedes Auth user lookup/creation/update", () => {
  const src = source("onboarding-api");
  const guard = indexOf(src, ONBOARDING_COMPLETED_GUARD);
  const findUser = indexOf(src, "await findUser(admin,app.email)");
  const createUser = indexOf(src, "await admin.auth.admin.createUser");
  const updateUser = indexOf(src, "await admin.auth.admin.updateUserById");
  assert.ok(guard < findUser, "completed guard must precede findUser call");
  assert.ok(guard < createUser, "completed guard must precede createUser call");
  assert.ok(guard < updateUser, "completed guard must precede updateUserById call");
});

test("onboarding-api completed guard precedes application mutation", () => {
  const src = source("onboarding-api");
  const guard = indexOf(src, ONBOARDING_COMPLETED_GUARD);
  const appUpdate = indexOf(src, "admin.from(\"academy_applications\").update");
  assert.ok(guard < appUpdate, "completed guard must precede application update");
});

/* ------------------------------------------------------------------ *
 * 2. payment-complete: payment persistence verification              *
 *    Payment persistence goes through the serialized, service-role-  *
 *    only finalize_academy_payment() RPC, which is the single mark-  *
 *    paid gate (capacity-checked, idempotent). The RPC result is the *
 *    persistence proof, checked before any email/success.            *
 * ------------------------------------------------------------------ */

test("payment-complete finalizes payment through the serialized capacity RPC", () => {
  const src = source("payment-complete");
  assert.match(src, /db\.rpc\('finalize_academy_payment'/);
  assert.match(src, /finalize_academy_payment',\{p_application_id:id,p_amount:amount,p_currency:currency,p_payment_method:'card',p_provider:'stripe'/);
});

test("payment-complete captures the RPC result and checks it", () => {
  const src = source("payment-complete");
  assert.match(src, /\{data:finalized,error:finalizeError\}=await db\.rpc\('finalize_academy_payment'/);
  assert.match(src, /if\(finalizeError\)return out\(\{ok:false/);
  assert.match(src, /if\(!finalized\?\.ok\)/);
});

test("payment-complete persistence check precedes masterclass update", () => {
  const src = source("payment-complete");
  const persistenceCheck = indexOf(src, "if(!finalized?.ok)");
  const masterclass = indexOf(src, "masterclass_signups");
  assert.ok(persistenceCheck < masterclass, "persistence check must precede masterclass update");
});

test("payment-complete persistence check precedes onboarding email", () => {
  const src = source("payment-complete");
  const persistenceCheck = indexOf(src, "if(!finalized?.ok)");
  const emailSend = indexOf(src, "send(app.email");
  assert.ok(persistenceCheck < emailSend, "persistence check must precede email send");
});

test("payment-complete persistence failure returns controlled error without ok:true", () => {
  const src = source("payment-complete");
  const failure = src.slice(indexOf(src, "if(finalizeError)"), indexOf(src, "const paidAt="));
  assert.match(failure, /return out\(\{ok:false/);
  assert.match(failure, /ok:false,exception:true/);
  assert.doesNotMatch(failure, /ok:true/);
});

test("payment-complete keeps Stripe verification before persistence", () => {
  const src = source("payment-complete");
  const stripeVerify = indexOf(src, "s.payment_status!=='paid'");
  const sourceCheck = indexOf(src, "s.metadata?.source!=='assistara_academy'");
  const persistence = indexOf(src, "if(!finalized?.ok)");
  assert.ok(stripeVerify < persistence, "Stripe payment_status check must precede DB persistence check");
  assert.ok(sourceCheck < persistence, "Stripe source check must precede DB persistence check");
});
