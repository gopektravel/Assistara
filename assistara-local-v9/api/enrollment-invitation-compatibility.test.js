const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const source = (name) => fs.readFileSync(
  path.join(root, "supabase", "functions", name, "index.ts"),
  "utf8",
);

const checkoutFunctions = [
  "enrollment-invitation",
  "apply-academy-promo",
  "create-checkout-session",
  "create-paymongo-qrph",
];

test("checkout functions only query columns deployed in production", () => {
  for (const name of checkoutFunctions) {
    assert.doesNotMatch(
      source(name),
      /assigned_promo_code_id/,
      `${name} must not depend on the unapplied offer-assignment migration`,
    );
  }
});

test("invitation lookup errors are not reported as inactive tokens", () => {
  const invitation = source("enrollment-invitation");
  assert.match(invitation, /error:\s*lookupError/);
  assert.match(invitation, /if \(lookupError\)/);
  assert.match(invitation, /status: 500/);
});

test("both payment initializers keep server-owned token and price checks", () => {
  for (const name of ["create-checkout-session", "create-paymongo-qrph"]) {
    const fn = source(name);
    assert.match(fn, /resolveEnrollmentApplication/);
    assert.match(fn, /checkout_amount_php/);
    assert.match(fn, /payment_status\s*===\s*"paid"/);
    assert.match(fn, /reserve_academy_seat/);
  }
});
