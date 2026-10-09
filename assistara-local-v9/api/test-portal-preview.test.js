"use strict";

// test-portal-preview.test.js — REGRESSION for the Admin Test Student Portal
// bouncing back to /admin.
//
// THE EXACT FAILURE
//   Admin sessions are restored from localStorage (admin.html adminSession.read()
//   reads localStorage first, then sessionStorage). The Test Portal dashboard
//   gate, however, only checked sessionStorage:
//
//       if(preview){if(!sessionStorage.getItem("assistara_admin_token")){
//         location.replace("/admin");return } ... }
//
//   sessionStorage is per-tab and cleared when the browser/tab closes. So an
//   Admin who logged in earlier, closed the browser, and later reopened /admin
//   had a valid localStorage session and a valid QA cookie (the server-side gate
//   had already confirmed the Admin token and minted the cookie) — yet the
//   client-side gate bounced them to /admin. Opening /academy/test-portal in a
//   fresh tab failed the same way. Every other Admin surface (client-finder.html,
//   admin-finance.html, admin-acquisition.html) already accepts either store.
//
// WHAT THIS SUITE DOES
//   Runs the REAL, unmodified inline dashboard script in the stub DOM at
//   /academy/test-portal and asserts the gate accepts the same token stores the
//   rest of Admin uses, while still refusing a caller with no Admin token.
//
// Run: node --test assistara-local-v9/api/test-portal-preview.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createWindow, parseInto } = require("./_qc-dom.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const html = fs.readFileSync(DASHBOARD, "utf8");
const inlineScript = () => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];

function runPreview({ local, session }) {
  const window = createWindow({ pathname: "/academy/test-portal" });
  const { document } = window;

  const bodyHtml = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "");
  parseInto(document.body, bodyHtml);

  if (local) window.localStorage.setItem("assistara_admin_token", local);
  if (session) window.sessionStorage.setItem("assistara_admin_token", session);

  const redirects = [];
  window.location.replace = (url) => { redirects.push(String(url)); };

  const errors = [];
  window.console = Object.assign(Object.create(console), {
    error: (...a) => errors.push(a.map(String).join(" ")),
    warn: () => {}, log: () => {}, info: () => {}, debug: () => {},
  });
  window.supabase = undefined;
  window.fetch = async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" });

  const sandbox = vm.createContext(window);
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.queueMicrotask = queueMicrotask;
  sandbox.fetch = window.fetch;
  sandbox.structuredClone = structuredClone;

  try {
    vm.runInContext(inlineScript(), sandbox, { filename: "academy-dashboard.inline.uninstrumented.js" });
  } catch (e) {
    return { document, redirects, errors, threw: e };
  }
  return { document, redirects, errors, threw: null };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 250));

test("preview boots with an Admin token restored from localStorage (browser reopened)", async () => {
  const run = runPreview({ local: "restored-admin-token" });
  assert.equal(run.threw, null, "inline script must not throw: " + (run.threw && run.threw.message));
  await settle();

  assert.deepEqual(run.redirects, [],
    "a restored localStorage Admin session must not bounce the Test Portal to /admin");
  assert.equal(run.document.getElementById("app").hidden, false,
    "the Test Portal must become visible for a restored Admin session");
});

test("preview boots with an Admin token in sessionStorage (same-tab login)", async () => {
  const run = runPreview({ session: "same-tab-admin-token" });
  await settle();
  assert.deepEqual(run.redirects, [],
    "a same-tab sessionStorage Admin session must keep working");
  assert.equal(run.document.getElementById("app").hidden, false,
    "the Test Portal must become visible for a same-tab Admin session");
});

test("preview still refuses a caller with no Admin token anywhere", async () => {
  const run = runPreview({});
  await settle();
  assert.ok(run.redirects.includes("/admin"),
    "without any Admin token the Test Portal must redirect to /admin; got " + JSON.stringify(run.redirects));
});
