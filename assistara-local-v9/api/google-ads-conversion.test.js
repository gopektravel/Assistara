"use strict";

// google-ads-conversion.test.js — the Masterclass Lead Form conversion
// (AW-341289722/iY7ICN6ehpUdEPrV3qIB).
//
// The Masterclass form has no thank-you page: it flips to a "check your email"
// success state in place. The rules this suite exists to prove:
//   1. Exactly ONE conversion call site exists in the whole site, with the
//      exact send_to Google gave us.
//   2. It sits inside the masterclass submit handler's success path: after the
//      response.ok && result.ok guard (registration persisted) and after the
//      success UI is shown, before the failure catch.
//   3. It is defensive: window.gtag is type-checked inside a try/catch, so a
//      blocked or failing gtag can never break the signup or its success state.
//   4. No redirect: the event carries only send_to - no event_callback, no
//      URL, no gtag_report_conversion helper.
//   5. It is NOT wired to the B2B lead form (index.html/app.js), and nothing
//      fires from page load at the code level.
//   6. No second global Google tag exists: no page inlines googletagmanager,
//      and /googletag.js is included at most once per page.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SEND_TO = "AW-341289722/iY7ICN6ehpUdEPrV3qIB";
const CONV_CALL = `gtag('event','conversion',{send_to:'${SEND_TO}'})`;
const HANDLER_CATCH = "catch(error){console.error('Masterclass signup failed:'";
const SUCCESS_GUARD = "if(!response.ok||!result.ok)throw";

const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const countIn = (haystack, needle) => haystack.split(needle).length - 1;

test("the conversion fires at exactly one call site, with the exact send_to", () => {
  const total = htmlFiles.reduce((n, f) => n + countIn(read(f), CONV_CALL), 0);
  assert.equal(total, 1, `expected exactly one conversion call site in the site, found ${total}`);
  const academy = read("academy.html");
  assert.ok(academy.includes(CONV_CALL),
    "the conversion call must live in the masterclass page (academy.html)");
  assert.equal(countIn(academy, SEND_TO), 1,
    "the send_to label must appear exactly once on the masterclass page");
});

test("the conversion sits on the success path: after the backend guard, after the success UI, before the failure catch", () => {
  const html = read("academy.html");
  const guardAt = html.indexOf(SUCCESS_GUARD);
  const uiAt = html.indexOf("success.classList.add('show')");
  const convAt = html.indexOf(CONV_CALL);
  const catchAt = html.indexOf(HANDLER_CATCH);
  assert.ok(guardAt > -1, "masterclass handler: success guard not found");
  assert.ok(uiAt > -1, "masterclass handler: success UI statement not found");
  assert.ok(convAt > -1, "masterclass handler: conversion call not found");
  assert.ok(catchAt > -1, "masterclass handler: failure catch not found");
  assert.ok(guardAt < convAt,
    "the conversion must fire only after response.ok && result.ok (registration persisted)");
  assert.ok(uiAt < convAt,
    "the conversion must fire after the success UI is shown, so tracking can never delay it");
  assert.ok(convAt < catchAt,
    "the conversion must stay inside the try block so failures never reach it");
  assert.equal(convAt > catchAt, false, "the conversion must not be reachable from the error path");
});

test("the conversion call is defensive: gtag type-checked and wrapped so signup can never break", () => {
  const html = read("academy.html");
  assert.match(html,
    /try\{if\(typeof window\.gtag==='function'\)window\.gtag\('event','conversion'/,
    "window.gtag must be type-checked inside a try/catch before firing");
  assert.ok(html.includes("catch(gtagConversionError){}"),
    "conversion errors must be swallowed so a tracking failure never surfaces in the UI");
});

test("no redirect: the event carries only send_to", () => {
  const html = read("academy.html");
  assert.match(html, /\{send_to:'AW-341289722\/iY7ICN6ehpUdEPrV3qIB'\}\)/,
    "the conversion event must contain only send_to - nothing else");
  assert.equal(html.includes("event_callback"), false,
    "no event_callback: the user stays on the page (no thank-you redirect)");
  assert.equal(html.includes("gtag_report_conversion"), false,
    "the Google helper with the redirect callback must not be used");
  assert.equal(/gtag\(\s*['"]event['"]\s*,\s*['"]conversion['"]\s*,\s*\{[^}]*url/.test(html), false,
    "no URL may be passed to the conversion event");
});

test("the conversion is wired only to the masterclass submit handler, not to load or other forms", () => {
  const html = read("academy.html");
  const submitAt = html.indexOf("form.addEventListener('submit'");
  const convAt = html.indexOf(CONV_CALL);
  assert.ok(submitAt > -1 && convAt > submitAt,
    "the conversion must live inside the masterclass form's submit listener");
  const appJs = read("app.js");
  assert.equal(/gtag\(/.test(appJs), false,
    "the B2B lead form in app.js must not fire Google Ads conversions");
  assert.equal(countIn(appJs, "conversion"), 0,
    "the B2B lead form must contain no conversion code");
});

test("no duplicate global tag: no page inlines gtag, and /googletag.js is included at most once per page", () => {
  for (const file of htmlFiles) {
    const html = read(file);
    assert.equal((html.match(/googletagmanager\.com/g) || []).length, 0,
      `${file} must not inline a second global Google tag`);
    assert.ok(countIn(html, "/googletag.js") <= 1,
      `${file} includes /googletag.js more than once`);
  }
  assert.equal(countIn(read("academy.html"), "/googletag.js"), 1,
    "the masterclass page must include the base tag exactly once");
  const tag = read("googletag.js");
  assert.equal(/send_to/.test(tag), false,
    "the conversion send_to must not live in the base tag file; it fires at the signup success point instead");
  assert.equal(/gtag\(\s*["']event["']/.test(tag), false,
    "the base tag file must stay event-free; it only loads and configures AW-341289722");
});
