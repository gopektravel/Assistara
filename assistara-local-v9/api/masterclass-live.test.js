const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const site = path.join(root, "assistara-local-v9");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const academy = read("assistara-local-v9/academy.html");
const apply = read("assistara-local-v9/academy-apply.html");
const preview = read("assistara-local-v9/api/academy-preview.js");
const capacity = read("assistara-local-v9/api/academy-check-capacity.js");
const vercel = JSON.parse(read("assistara-local-v9/vercel.json"));

test("the Academy page keeps its original masterclass section and form", () => {
  assert.match(academy, /<section class="masterclass" id="free-masterclass">/);
  assert.match(academy, /<h2>How to Land Your First Remote Client<\/h2>/);
  assert.match(academy, /id="masterclassForm"/);
  assert.match(academy, /name="name"/);
  assert.match(academy, /name="email"/);
  assert.match(academy, /Save my free seat/);
});

test("scheduled state is unchanged; only wording/button change when live", () => {
  assert.match(academy, /const LEAD_DEFAULT='Join the free live masterclass\.'/);
  assert.match(academy, /BTN_DEFAULT='Save my free seat/);
  assert.match(academy, /BTN_LIVE='Join the Masterclass Now/);
  assert.match(academy, /LEAD_LIVE='The masterclass is happening right now/);
  assert.match(academy, /meta\.textContent='[^']*LIVE NOW'/);
  // the form is never hidden or removed by the controller
  const controller = academy.slice(academy.indexOf("masterclass-state-js"), academy.indexOf("</script>", academy.indexOf("masterclass-state-js")));
  assert.doesNotMatch(controller, /form\.style\.display\s*=\s*['"]none/);
  assert.doesNotMatch(controller, /removeChild\(form\)/);
});

test("ended state removes only the masterclass section and its sticky CTA", () => {
  assert.match(academy, /function removePromo\(\)/);
  assert.match(academy, /sticky\.parentNode\.removeChild\(sticky\)/);
  assert.match(academy, /section\.parentNode\.removeChild\(section\)/);
});

test("live registration redirects to /live only after ok:true, preserving tracking", () => {
  const guard = academy.indexOf("if(!response.ok||!result.ok)throw new Error");
  const successUi = academy.indexOf("success.classList.add('show')");
  const conv = academy.indexOf("window.gtag('event','conversion'");
  const redirect = academy.indexOf("if(window.__mcIsLive){location.href='/live'");
  assert.ok(guard >= 0 && successUi > guard && conv > successUi && redirect > conv, "order: guard -> success UI -> conversion -> live redirect");
  assert.match(academy, /tracking_token:window\.AssistaraAttribution/);
});

test("the authenticated QA preview forces states on the real pages", () => {
  assert.match(preview, /unseal\(cookieValue\(req, QA_COOKIE\)/);
  assert.match(preview, /saved\.aud !== "academy-test-portal"\) return deny\(res, "\/admin"\)/);
  assert.match(preview, /const MC_STATES = \["scheduled", "live", "ended"\]/);
  assert.match(preview, /const CAP_STATES = \["open", "one", "full"\]/);
  assert.match(preview, /__ASSISTARA_QA_PREVIEW__/);
  assert.match(preview, /readPage\(file\)/);
});

test("the public capacity probe is read-only and fails open", () => {
  assert.match(capacity, /rpc\/academy_capacity_overview/);
  assert.match(capacity, /full: !open/);
  assert.match(capacity, /ok: false, open: true, full: false/);
  // read-only: no writes, no charges
  assert.doesNotMatch(capacity, /\.(insert|update|delete|upsert)\s*\(/i);
  assert.doesNotMatch(capacity, /\bcharge\b/i);
});

test("the apply page switches to the waitlist when full, with no malformed markup", () => {
  assert.doesNotMatch(apply, /<section <section/);
  assert.doesNotMatch(apply, /<\/section>class=/);
  assert.match(apply, /<section id="soldoutSection"/);
  assert.match(apply, /<section class="form-card">/);
  assert.match(apply, /id="waitlistForm"/);
  assert.match(apply, /academy-check-capacity/);
  assert.match(apply, /__ASSISTARA_QA_CAPACITY__/);
});

test("vercel routes the capacity probe and the QA preview", () => {
  const routes = vercel.routes || [];
  assert.ok(routes.some((r) => r.src === "/academy-check-capacity" && r.dest === "/api/academy-check-capacity.js"));
  assert.ok(routes.some((r) => r.src === "/academy/preview" && r.dest === "/api/academy-preview.js"));
  const builds = vercel.builds || [];
  assert.ok(builds.some((b) => b.src === "api/academy-check-capacity.js"));
  assert.ok(builds.some((b) => b.src === "api/academy-preview.js"));
});
