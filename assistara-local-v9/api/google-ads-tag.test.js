"use strict";

// google-ads-tag.test.js — the Google Ads base tag (AW-341289722).
//
// One file holds the base tag; every public page includes it exactly once from
// its <head>. The rules this suite exists to prove:
//   1. googletag.js exists and configures AW-341289722 exactly once.
//   2. The base tag fires NO conversion events (the Masterclass conversion is
//      configured later, in Google Ads, then added deliberately).
//   3. Every page that carries the OpenAI Ads pixel also carries the Google
//      Ads include - the "public pages" set stays in sync.
//   4. Each public page includes googletag.js exactly once, inside <head>.
//   5. The AW ID and gtag bootstrap live only in googletag.js - never inlined
//      into a page, so the ID cannot be changed in more than one place.
//   6. vercel.json builds and routes /googletag.js ahead of the catch-all.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TAG_ID = "AW-341289722";
const TAG_INCLUDE = '<script src="/googletag.js"></script>';
const PIXEL_INCLUDE = '<script src="/oaiq-pixel.js"></script>';

const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

// The public set is defined by the existing pixel convention: every page that
// ships the OpenAI Ads pixel must ship the Google Ads base tag too.
const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const publicPages = htmlFiles.filter((f) => read(f).includes(PIXEL_INCLUDE));

test("googletag.js exists and configures AW-341289722 exactly once", () => {
  const tag = read("googletag.js");
  const idCount = tag.split(TAG_ID).length - 1;
  assert.equal(idCount, 2,
    `the AW ID must appear exactly twice in googletag.js (loader URL + config), found ${idCount}`);
  assert.match(tag, /gtag\("config",id\)/, "the base tag must call gtag config");
  assert.match(tag, /gtag\("js",new Date\(\)\)/, "the base tag must stamp the visit time");
});

test("the base tag fires no conversion events", () => {
  const tag = read("googletag.js");
  assert.equal(/gtag\(\s*["']event["']/.test(tag), false,
    "the base tag must not fire events; conversions are added only after Google provides the ID/label");
  assert.equal(/["']conversion["']/.test(tag), false,
    "no conversion event may be sent from the base tag");
  assert.equal(/dataLayer\.push\(\s*\{\s*event\s*:/.test(tag), false,
    "no raw dataLayer conversion push either");
});

test("every pixel page carries the Google Ads include (public set stays in sync)", () => {
  assert.ok(publicPages.length >= 10, `expected the pixel to cover the public pages, found ${publicPages.length}`);
  for (const file of publicPages) {
    assert.ok(read(file).includes(TAG_INCLUDE),
      `${file} includes the OpenAI pixel but not the Google Ads base tag`);
  }
});

test("each public page includes googletag.js exactly once, inside <head>", () => {
  for (const file of publicPages) {
    const html = read(file);
    const count = html.split(TAG_INCLUDE).length - 1;
    assert.equal(count, 1, `${file} must include googletag.js exactly once, found ${count}`);
    const incAt = html.indexOf(TAG_INCLUDE);
    const headAt = html.indexOf("<head>");
    const headEnd = html.indexOf("</head>");
    assert.ok(headAt >= 0 && incAt > headAt && incAt < headEnd,
      `${file}: the Google Ads include must sit inside <head>`);
  }
});

test("the AW ID and gtag bootstrap never leak into a page", () => {
  for (const file of htmlFiles) {
    const html = read(file);
    assert.equal(html.includes(TAG_ID), false,
      `${file} must not inline the Google Ads ID; edit googletag.js instead`);
    assert.equal(html.includes("googletagmanager.com"), false,
      `${file} must not inline the gtag loader URL`);
    assert.equal(/function\s+gtag\s*\(/.test(html), false,
      `${file} must not inline the gtag bootstrap function`);
  }
});

test("DEPLOY: vercel.json builds and routes /googletag.js ahead of the catch-all", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const srcs = (vercel.builds || []).map((b) => b.src);
  const routes = (vercel.routes || []).map((r) => r.src);
  assert.ok(srcs.includes("googletag.js"), "no build entry for googletag.js");
  assert.ok(routes.includes("/googletag.js"), "no route for /googletag.js");
  assert.ok(routes.indexOf("/googletag.js") < routes.indexOf("/(.*)"),
    "the googletag.js route is shadowed by the catch-all");
});
