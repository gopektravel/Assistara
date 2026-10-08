const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const fn = read("supabase/functions/join-academy-waitlist/index.ts");
const apply = read("assistara-local-v9/academy-apply.html");
const checkout = read("assistara-local-v9/academy-checkout.html");

test("waitlist endpoint validates the enrollment token path", () => {
  assert.match(fn, /const token = String\(b\.token/);
  assert.match(fn, /if \(!\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(token\)\)/);
  assert.match(fn, /eq\("enrollment_token", token\)/);
  assert.match(fn, /db\.rpc\("join_academy_waitlist", \{ p_application_id: applicationId, p_source: "checkout_cta" \}\)/);
});

test("waitlist endpoint accepts an email-only join with validation and dedupe", () => {
  assert.match(fn, /const email = String\(b\.email/);
  assert.match(fn, /EMAIL_RE\.test\(email\)/);
  assert.match(fn, /COHORTS\.has\(String\(b\.cohort_code/);
  assert.match(fn, /\.eq\("email", email\)/);
  assert.match(fn, /String\(insErr\.code\) === "23505"/);
  assert.match(fn, /\.insert\(\{ cohort_code: cohort, name, email, source: "checkout_cta", priority: 1, status: "waiting" \}\)/);
});

test("waitlist endpoint has bot protection and never exposes privileged operations", () => {
  assert.match(fn, /String\(b\.website \|\| ""\)\.trim\(\)/); // honeypot
  assert.doesNotMatch(fn, /admin_waitlist_list|admin_invite_next_waitlisted|exception_resolve/);
  assert.doesNotMatch(fn, /action === "list"|action === "invite"/);
});

test("apply page sends the email payload the endpoint expects (no token required)", () => {
  assert.match(apply, /join-academy-waitlist/);
  assert.match(apply, /cohort_code: 'founding-2026'/);
  assert.match(apply, /website: \(document\.getElementById\('wlWebsite'\)/);
  assert.doesNotMatch(apply, /academy_apply_soldout/);
  // honeypot field present and visually hidden
  assert.match(apply, /id="wlWebsite"/);
  assert.match(apply, /position:absolute;left:-9999px/);
});

test("checkout keeps the token-based waitlist path", () => {
  assert.match(checkout, /join-academy-waitlist/);
  assert.match(checkout, /body:JSON\.stringify\(\{token\}\)/);
});
