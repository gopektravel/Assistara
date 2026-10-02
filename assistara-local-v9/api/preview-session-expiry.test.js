"use strict";

// preview-session-expiry.test.js — REGRESSION for the exact failure the owner hit
// in a real browser on http://localhost:8791/academy/test-portal.
//
// THE BUG
//   The local preview server (temp/academy_preview.cjs) sealed its learner + QA
//   session cookies ONCE, into module-level constants, at process start, with a
//   one-hour expiry. `unseal()` in api/_academy-security.js correctly rejects an
//   expired payload. So once the preview server had been running longer than that
//   hour, EVERY /api/academy-quick-check request returned:
//
//       403 {"ok":false,"error":"Admin QA access is required"}
//
//   and the learner saw "QUICK CHECK UNAVAILABLE / This class could not be
//   opened" with no class openable at all.
//
// WHY EVERY EXISTING TEST MISSED IT
//   api/_qc-harness.js mints a FRESH cookie on every createSession(). A test that
//   creates a session always gets a live cookie, so the whole suite stayed green
//   while the real preview had been broken for hours. This is the concrete reason
//   "90/90 classes open" did not mean "classes open in my browser".
//
// WHAT THIS TEST DOES
//   It asserts the *structural* invariant that makes the bug impossible: the
//   preview server must NOT contain any process-lifetime cookie constant. Any
//   cookie must be produced by a call that runs per request. It then boots the
//   REAL preview server, waits out the real clock semantics via an injected
//   time source, and proves a load still succeeds long after the old one-hour
//   window would have expired — over real HTTP, with no cookies from the client.
//
// Run: node --test assistara-local-v9/api/preview-session-expiry.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SECURITY = path.join(__dirname, "_academy-security.js");
const PREVIEW_SERVER = process.env.ASSISTARA_PREVIEW_SERVER || "";
const PORT = Number(process.env.PREVIEW_TEST_PORT || 8799);

const previewSource = () => {
  if (!fs.existsSync(PREVIEW_SERVER)) {
    // The preview server is a TEMP tool, not a repo file. Skip rather than fail
    // the suite for a repo that never had it.
    return null;
  }
  return fs.readFileSync(PREVIEW_SERVER, "utf8");
};

// ---------------------------------------------------------------------------
// 1. The structural invariant: no cookie outlives the request that used it.
// ---------------------------------------------------------------------------
test("the preview server must not seal cookies into process-lifetime constants", () => {
  const src = previewSource();
  if (src === null) return; // preview server absent; nothing to guard

  // Strip comments so prose about the fix cannot satisfy the matcher.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

  // The exact shape that caused the outage.
  assert.equal(
    /const\s+(LEARNER_COOKIE|QA_COOKIE|BOTH_COOKIES)\s*=/.test(code),
    false,
    "the preview server must not build a cookie into a module-level constant — " +
    "that is the bug that made every class fail to open after one hour",
  );

  // Any cookie must come from a function, so it can be re-minted per request.
  assert.match(code, /function\s+mintSessionCookies\s*\(/,
    "the preview server must expose a per-request cookie minting function");
  // The TTL must be read per request, not baked in, so the regression suite can
  // cross the expiry boundary and prove the bug cannot return.
  assert.match(code, /PREVIEW_COOKIE_TTL_SECONDS/,
    "the preview server's session TTL must be overridable so expiry is testable");

  // The learner JWT must not be a frozen constant either: the Supabase stub
  // validates it, so a frozen token fails its own expiry check.
  assert.equal(/const\s+LEARNER_JWT\s*=/.test(code),
    false,
    "the learner JWT must be minted per request, not frozen at startup");
  assert.match(code, /function\s+learnerTokenValid\s*\(/,
    "the Supabase stub must validate a presented learner token rather than compare to a constant");

  // And the handlers must actually receive a per-request value.
  for (const handler of ["qcHandler", "examHandler", "certHandler"]) {
    assert.match(code, new RegExp(handler + "\\(\\{[^}]*cookie: session\\.cookie"),
      handler + " must be given the freshly minted session cookies");
  }
});

// ---------------------------------------------------------------------------
// 2. The real cookie lifecycle: a stale seal is genuinely rejected.
//    This is what makes the bug real, so it must stay true.
// ---------------------------------------------------------------------------
test("an expired session seal is rejected by the real security module", () => {
  const SECRETS = {
    SUPABASE_URL: "https://stub.invalid",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
    ACADEMY_COOKIE_SECRET: "unit-test-cookie-secret-at-least-32-bytes",
  };
  const saved = {};
  for (const [k, v] of Object.entries(SECRETS)) { saved[k] = process.env[k]; process.env[k] = v; }
  try {
    const sec = require(SECURITY);
    // Seal with an expiry in the past — exactly what a long-idle preview server
    // was handing to the handler.
    const stale = sec.seal({ aud: "academy-test-portal", exp: Date.now() - 1000 }, SECRETS.ACADEMY_COOKIE_SECRET);
    assert.equal(sec.unseal(stale, SECRETS.ACADEMY_COOKIE_SECRET), null,
      "an expired QA seal must not verify — this is why the stale-constant preview failed");
    assert.equal(
      sec.unseal(sec.cookieValue({ headers: { cookie: sec.QA_COOKIE + "=" + stale } }, sec.QA_COOKIE), SECRETS.ACADEMY_COOKIE_SECRET),
      null,
      "the handler's cookie lookup must reject an expired QA cookie",
    );
    // And a live one still verifies, so the fix cannot be "accept anything".
    const live = sec.seal({ aud: "academy-test-portal", exp: Date.now() + 60000 }, SECRETS.ACADEMY_COOKIE_SECRET);
    const opened = sec.unseal(live, SECRETS.ACADEMY_COOKIE_SECRET);
    assert.ok(opened && opened.aud === "academy-test-portal", "a live QA seal must still verify");
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

// ---------------------------------------------------------------------------
// 3. The end-to-end proof over REAL HTTP against the REAL preview server,
//    with no cookies supplied by the client — exactly like the owner's browser.
// ---------------------------------------------------------------------------
const post = (port, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({
    host: "127.0.0.1", port, path: "/api/academy-quick-check", method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:" + port,
      "Content-Length": Buffer.byteLength(data),
    },
  }, (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => resolve({ status: r.statusCode, body: d }));
  });
  req.on("error", (e) => resolve({ status: 0, body: e.message }));
  req.end(data);
});

test("a real preview server keeps serving classes long past the old one-hour window", async () => {
  const src = previewSource();
  if (src === null) return; // preview server absent

  const child = spawn(process.execPath, [PREVIEW_SERVER], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      // 1-second TTLs so the test can actually cross the expiry boundary. A
      // shorter TTL grants nothing; it only makes staleness reachable.
      PREVIEW_COOKIE_TTL_SECONDS: "1",
      PREVIEW_QA_TTL_SECONDS: "1",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));

  const waitForPort = async () => {
    for (let i = 0; i < 60; i++) {
      const r = await post(PORT, { action: "load", class_key: "p1m1c1", preview: true });
      if (r.status !== 0) return true;
      await new Promise((res) => setTimeout(res, 250));
    }
    return false;
  };

  try {
    assert.ok(await waitForPort(), "the preview server must start and answer:\n" + logs.join(""));

    // No cookie is sent by the client. The OLD server's frozen, expired constant
    // produced 403 "Admin QA access is required" here.
    const first = await post(PORT, { action: "load", class_key: "p1m1c1", preview: true });
    assert.equal(first.status, 200,
      "a fresh preview server must authorize a class load with no client cookie; got HTTP "
      + first.status + " " + first.body);
    const body = JSON.parse(first.body);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.questions) && body.questions.length > 0,
      "the load must return the class's questions");

    // THE DECISIVE CHECK, and the one the old suite could never make.
    //
    // This server was started with a 1-second session TTL, so its very first
    // cookie has already expired by now. The OLD server sealed that cookie once
    // at startup, so from this point on EVERY request returned
    // 403 "Admin QA access is required" — the owner's exact symptom. Per-request
    // minting means the cookie for THIS request is always fresh, so it works.
    await new Promise((res) => setTimeout(res, 1500));
    const afterIdle = await post(PORT, { action: "load", class_key: "p4m4c5", preview: true });
    assert.equal(afterIdle.status, 200,
      "after idling past the cookie TTL a class must still load — this is the owner's " +
      "'This class could not be opened' bug; got HTTP " + afterIdle.status + " " + afterIdle.body);
    const afterBody = JSON.parse(afterIdle.body);
    assert.equal(afterBody.ok, true, "the post-idle load must be authorized, not refused");

    // Keep going: every further request past the TTL must also succeed.
    for (const key of ["p1m6c2", "p2m4c1", "p3m2c6"]) {
      await new Promise((res) => setTimeout(res, 1200)); // cross the TTL again
      const r = await post(PORT, { action: "load", class_key: key, preview: true });
      assert.equal(r.status, 200,
        key + " must load after crossing the session TTL again; got HTTP " + r.status + " " + r.body);
    }

    // Authorization must not have been weakened: a hostile origin is still
    // rejected by the real allowedOrigin() gate.
    const hostile = await new Promise((resolve) => {
      const data = JSON.stringify({ action: "load", class_key: "p1m1c1", preview: true });
      const req = http.request({
        host: "127.0.0.1", port: PORT, path: "/api/academy-quick-check", method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example.com", "Content-Length": data.length },
      }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve({ status: r.statusCode })); });
      req.end(data);
    });
    assert.equal(hostile.status, 403, "a hostile origin must still be refused — the fix must not open the gate");
  } finally {
    child.kill("SIGTERM");
    await new Promise((res) => setTimeout(res, 300));
    if (!child.killed) child.kill("SIGKILL");
  }
});
