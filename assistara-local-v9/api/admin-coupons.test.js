const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(root, "supabase", "functions", "admin-coupons", "index.ts"),
  "utf8",
);

test("coupon listing survives a missing optional analytics RPC", () => {
  assert.match(source, /const analytics = error \? \[\] : \(coupons \|\| \[\]\)/);
  assert.match(source, /const analyticsMap = new Map\(analytics\.map/);
  assert.match(source, /\.from\("academy_promo_codes"\)\s*\.select\("\*"\)/);
});

test("legacy amount_php rows are normalized without a database write", () => {
  assert.match(source, /function normalizeCoupon\(coupon: any, regularPricePhp: number\)/);
  assert.match(source, /Number\(coupon\.amount_php \|\| 0\) \* 100/);
  assert.match(source, /discount_type: "fixed_php"/);
  assert.match(source, /discount_value: Math\.max\(0, regularPricePhp - legacyFinalPriceCentavos\)/);
  assert.doesNotMatch(source, /normalizeCoupon[\s\S]{0,500}\.update\(/);
});

test("coupon Admin endpoint remains authenticated and production-CORS safe", () => {
  assert.match(source, /ADMIN_TOKEN_VERSION/);
  assert.match(source, /https:\/\/www\.getassistara\.com/);
  assert.match(source, /if \(req\.method === "OPTIONS"\) return new Response\(null, \{ status: 204/);
});
