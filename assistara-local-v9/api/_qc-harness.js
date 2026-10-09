"use strict";

// _qc-harness.js — test-only bootstrap for the Quick Check client regression.
//
// It runs the REAL inline script from academy-dashboard.html — the same source
// bytes the browser executes — inside a minimal DOM (_qc-dom.js), and routes the
// script's `fetch` calls to the REAL api/academy-quick-check.js handler backed by
// an in-memory stand-in for Supabase REST/GoTrue and the academy_complete_class
// RPC.
//
// Nothing in this file is shipped, imported by the Academy, or required at
// runtime. The only modification made to the real script source is a splice that
// exports a handful of already-defined internals so the test can drive them
// without a browser; every function body executed is the shipped one.

const fs = require("node:fs");
const nodePath = require("node:path");
const vm = require("node:vm");

const { createWindow } = require("./_qc-dom.js");

const ROOT = nodePath.resolve(__dirname, "..");
const DASHBOARD = nodePath.join(ROOT, "academy-dashboard.html");
const ORIGIN = "https://www.getassistara.com";
const SERVICE = "service-role-key-test";

const SECRETS = {
  SUPABASE_URL: "https://stub.invalid",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  ACADEMY_COOKIE_SECRET: "cookie-secret-0123456789abcdef0123456789ab",
  ACADEMY_ALLOWED_ORIGINS: ORIGIN,
};

let installed = false;
function installEnv() {
  if (installed) return;
  Object.assign(process.env, SECRETS);
  installed = true;
}

function readInlineScript() {
  const html = fs.readFileSync(DASHBOARD, "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    throw new Error("expected exactly one inline <script> block, found " + blocks.length);
  }
  return blocks[0][1];
}

// Replace the boot() call with an export of already-defined internals. The
// exported names must exist in the shipped script; a rename here fails loudly
// rather than silently testing nothing.
const EXPORTS = [
  "QC_ADAPTERS", "qcFindSection", "mountQuickCheck", "openClass", "submitQuickCheck",
  "loadQuickCheckClass", "qcSanitizeQuestions", "qcApplyResults", "qcServerFeedback",
  "qcAllAnswered", "qcSelectionMap", "qcPost", "markClassComplete", "renderCourse",
  "completed", "current", "isClassUnlocked", "key", "totalClasses", "qcLoaded",
  "isPhaseUnlocked", "isModuleUnlocked", "qcMountWarned",
  // Exam client internals (added by the Academy pipeline layer).
  "openExamView", "examPost", "examSanitizeLoad", "examRenderSubmit", "examRenderResult",
  "examCourseReset", "renderCertificate", "renderHome", "openPage", "buildNav",
  "bestExam", "phaseStatus", "phasesPassed", "examAttempts",
  "previewState",
  // Skills page renderer (release QA).
  "renderSkills", "skillState", "skillCard", "skills",
  // Achievements + Home Quick Access (owner directive, 2 October 2026).
  "achievements", "ACHIEVEMENT_MILESTONES", "renderAchievements",
  "modulesDone", "totalModules", "skillsDemonstrated",
  "LIVE_SESSIONS", "upcomingSessions", "nextSession", "liveSessionSubtitle",
  "buildSessions",
  // Desktop portal composition pass: navigation vs progression (owner A5).
  "browse", "browseBarHTML", "guardProgression", "progressionFingerprint",
  "progressionSnapshot", "restoreProgression", "curriculum", "countsPhase",
  "countsModule", "progressState", "isModuleComplete", "firstIncompleteInModule",
  "renderCourseView", "renderHomeView", "openPageView", "nextAction",
  // Community checkbox for test portal.
  "wireCommunity", "updateCommunityUI",
];

function instrument(source) {
  const bootCall = /boot\(\)\.catch\(\(\)=>\{[\s\S]*?\}\);/;
  if (!bootCall.test(source)) {
    throw new Error("could not find the boot() call to splice; dashboard structure changed");
  }
  // `completed`, `current` and `examAttempts` are REBOUND by the app itself
  // (previewState() does `completed = new Set()`), so exporting them by value
  // hands the test a stale reference that silently stops tracking the app.
  // Export them through accessors so a test always observes live state.
  const LIVE = new Set(["completed", "current", "examAttempts"]);
  const exported = EXPORTS
    .filter(name => !LIVE.has(name))
    .map(name => "  " + name + ",")
    .join("\n");
  const liveAccessors = [...LIVE]
    .map(name => "  get " + name + "() { return " + name + "; },")
    .concat(["  set current(value) { current = value; },"])
    .join("\n");
  const bridge = [
    "globalThis.__QC_TEST__ = {",
    exported,
    liveAccessors,
    "  setCurrent(phase, moduleIndex) { current = { phase: phase, module: moduleIndex }; },",
    "  getCurrent() { return current; },",
    // Test-only setup: a real learner reaches Phase 2 only by passing the
    // Phase 1 exam, and the sequential unlock chain depends on that record.
    "  passExam(examKey, score) { examAttempts.push({ exam_key: examKey, score: score, passed: true }); },",
    "};",
  ].join("\n");
  return source.replace(bootCall, bridge);
}

// ---------------------------------------------------------------------------
// In-memory authoritative store, mirroring supabase/migrations semantics.
// ---------------------------------------------------------------------------
function createStore() {
  return {
    users: new Map([["user-1", { id: "user-1", deleted_at: null, banned_until: null }]]),
    access: new Set(["user-1"]),
    progress: new Map(),
    drafts: new Map(),
    attempts: new Map(), // pkey(user, examKey) -> [attempt rows, newest first]
    completeCalls: [],
    deleteDrafts: [],
  };
}

const pkey = (user, classKey) => user + "|" + classKey;

function fakeJwt(expSeconds) {
  const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return b64({ alg: "none", typ: "JWT" }) + "." + b64({ sub: "user-1", exp: expSeconds }) + ".sig";
}

function buildFetch(store, network, options, stubErrors) {
  const opts = options || {};
  const learnerJwt = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
  const sec = require(nodePath.join(ROOT, "api", "_academy-security.js"));
  const learnerCookie = sec.ACADEMY_COOKIE + "=" + sec.seal(
    { aud: "academy", user_id: "user-1", access_token: learnerJwt, exp: Date.now() + 3600000 },
    SECRETS.ACADEMY_COOKIE_SECRET);
  // The real preview server signs BOTH cookies and sends them on every request.
  // A portal session must do the same, or the real handlers refuse its
  // preview:true loads with "Admin QA access is required".
  const portal = String(opts.pathname || "").indexOf("/academy/test-portal") === 0;
  const qaCookie = portal ? sec.QA_COOKIE + "=" + sec.seal(
    { aud: "academy-test-portal", user_id: "user-1", exp: Date.now() + 3600000 },
    SECRETS.ACADEMY_COOKIE_SECRET) : "";
  const cookieHeader = opts.cookie === null ? "" : (portal ? learnerCookie + "; " + qaCookie : learnerCookie);

  const respond = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  });

  return async function fetchStub(input, init) {
   try {
    // The dashboard posts to a relative path ("/api/academy-quick-check");
    // resolve it against the page origin exactly as a browser would.
    const url = new URL(String(input), ORIGIN);
    // NB: local name is `route`, not `path` — `path` is node:path at module scope.
    const route = url.pathname;
    const method = ((init && init.method) || "GET").toUpperCase();
    const headers = (init && init.headers) || {};

    if (route === "/api/academy-quick-check") {
      const body = JSON.parse((init && init.body) || "{}");
      const entry = { url: route, action: body.action, classKey: body.class_key, preview: body.preview === true, request: body, status: 0, body: null };
      network.push(entry);
      const chunks = [];
      const res = {
        statusCode: 200,
        setHeader(name, value) { (res._headers = res._headers || {})[name] = value; },
        end(payload) { chunks.push(String(payload)); res._body = chunks.join(""); res._done = true; },
      };
      const req = {
        method,
        headers: { origin: ORIGIN, cookie: cookieHeader, ...headers },
        body: JSON.stringify(body),
      };
      const handler = require(nodePath.join(ROOT, "api", "academy-quick-check.js"));
      await handler(req, res);
      let json = null;
      try { json = JSON.parse(res._body || "null"); } catch (_) { /* non-JSON body is a failure signal for the test */ }
      entry.status = res.statusCode;
      entry.body = json;
      return respond(res.statusCode, json);
    }

    if (route === "/api/academy-exam") {
      const body = JSON.parse((init && init.body) || "{}");
      const entry = { url: route, action: body.action, examKey: body.exam_key, preview: body.preview === true, request: body, status: 0, body: null };
      network.push(entry);
      const chunks = [];
      const res = {
        statusCode: 200,
        setHeader(name, value) { (res._headers = res._headers || {})[name] = value; },
        end(payload) { chunks.push(String(payload)); res._body = chunks.join(""); res._done = true; },
      };
      const req = {
        method,
        url: url.pathname,
        headers: { origin: ORIGIN, cookie: cookieHeader, ...headers },
        body: JSON.stringify(body),
      };
      const handler = require(nodePath.join(ROOT, "api", "academy-exam.js"));
      await handler(req, res);
      let json = null;
      try { json = JSON.parse(res._body || "null"); } catch (_) { /* non-JSON body is a failure signal for the test */ }
      entry.status = res.statusCode;
      entry.body = json;
      return respond(res.statusCode, json);
    }

    // GoTrue current user
    if (route === "/auth/v1/user") {
      if (headers.Authorization !== "Bearer " + learnerJwt) return respond(401, {});
      return respond(200, { id: "user-1", email: "learner@example.com" });
    }
    // GoTrue admin live-record check
    if (route.startsWith("/auth/v1/admin/users/")) {
      const id = decodeURIComponent(route.split("/").pop());
      const user = store.users.get(id);
      return user ? respond(200, { user }) : respond(404, {});
    }
    // RPC academy_has_access
    if (route === "/rest/v1/rpc/academy_has_access") {
      const body = JSON.parse((init && init.body) || "{}");
      return respond(200, store.access.has(body.p_user_id) === true);
    }
    // RPC academy_complete_class — idempotent, preserves completed_at, and
    // clears the draft in the same transaction.
    if (route === "/rest/v1/rpc/academy_complete_class") {
      const body = JSON.parse((init && init.body) || "{}");
      const key = pkey(body.p_user_id, body.p_class_key);
      store.completeCalls.push({ userId: body.p_user_id, classKey: body.p_class_key });
      const existing = store.progress.get(key);
      if (!existing || !existing.completed) {
        store.progress.set(key, { completed: true, completed_at: new Date().toISOString() });
      }
      if (store.drafts.delete(key)) store.deleteDrafts.push(key);
      return respond(200, true);
    }
    // REST academy_class_progress — learners are SELECT-own only. Supports the
    // single-row lookup the Quick Check uses (class_key filter present) AND the
    // multi-row read the exam/certificate gates use (no class_key filter, all
    // completed rows for the caller are returned).
    if (route === "/rest/v1/academy_class_progress") {
      const isService = String(headers.Authorization || "").includes(SERVICE);
      const isLearner = String(headers.Authorization || "").replace("Bearer ", "") === learnerJwt;
      if (!isService && !isLearner) return respond(401, { message: "permission denied" });
      if (method !== "GET") return respond(401, { message: "permission denied" });
      const user = String(url.searchParams.get("user_id") || "").replace(/^eq\./, "");
      const classKey = String(url.searchParams.get("class_key") || "").replace(/^eq\./, "");
      if (classKey) {
        const row = store.progress.get(pkey(user, classKey));
        return respond(200, row ? [row] : []);
      }
      // Multi-row: rows are stored keyed `user|class_key`.
      const onlyCompleted = String(url.searchParams.get("completed") || "").replace(/^eq\./, "") === "true";
      const rows = [];
      for (const [key, row] of store.progress.entries()) {
        const sep = key.indexOf("|");
        if (sep < 0 || key.slice(0, sep) !== user) continue;
        if (onlyCompleted && row.completed !== true) continue;
        rows.push({ ...row, class_key: key.slice(sep + 1) });
      }
      return respond(200, rows);
    }
    // REST academy_exam_attempts — learners SELECT own rows only; the exam and
    // certificate endpoints filter by user_id + exam_key and order newest first.
    if (route === "/rest/v1/academy_exam_attempts") {
      const isService = String(headers.Authorization || "").includes(SERVICE);
      const isLearner = String(headers.Authorization || "").replace("Bearer ", "") === learnerJwt;
      if (!isService && !isLearner) return respond(401, { message: "permission denied" });
      if (method !== "GET") return respond(401, { message: "permission denied" });
      const user = String(url.searchParams.get("user_id") || "").replace(/^eq\./, "");
      const examKey = String(url.searchParams.get("exam_key") || "").replace(/^eq\./, "");
      const rows = [];
      for (const [key, list] of store.attempts.entries()) {
        const sep = key.indexOf("|");
        if (sep < 0 || key.slice(0, sep) !== user) continue;
        const rowKey = key.slice(sep + 1);
        if (examKey && rowKey !== examKey) continue;
        rows.push(...list);
      }
      return respond(200, rows);
    }
    // RPC academy_record_exam_attempt — service_role only. Mirrors the migration
    // contract: derives `passed` from score >= passing_score and rejects a row
    // whose flag disagrees, so the API cannot write a forged pass.
    if (route === "/rest/v1/rpc/academy_record_exam_attempt") {
      if (!String(headers.Authorization || "").includes(SERVICE)) return respond(401, { message: "permission denied" });
      const body = JSON.parse((init && init.body) || "{}");
      const { p_user_id, p_exam_key, p_exam_version, p_score, p_passing_score, p_passed } = body;
      if (!p_user_id || !p_exam_key || !p_exam_version
          || typeof p_score !== "number" || typeof p_passing_score !== "number"
          || typeof p_passed !== "boolean") {
        return respond(400, "Invalid exam attempt");
      }
      if (!/^(phase_[1-4]|final)$/.test(p_exam_key)) return respond(400, "Unknown exam key");
      if (p_score < 0 || p_score > 100 || p_passing_score < 0 || p_passing_score > 100) {
        return respond(400, "Exam score out of range");
      }
      const derived = p_score >= p_passing_score;
      if (derived !== p_passed) return respond(400, "Exam pass flag does not match the recorded threshold");
      const key = pkey(p_user_id, p_exam_key);
      const list = store.attempts.get(key) || [];
      list.push({
        user_id: p_user_id,
        exam_key: p_exam_key,
        exam_version: p_exam_version,
        score: p_score,
        passing_score: p_passing_score,
        passed: derived,
        attempted_at: new Date().toISOString(),
      });
      store.attempts.set(key, list);
      return respond(200, true);
    }
    // REST academy_quick_check_drafts — service_role only (RLS: no policies).
    if (route === "/rest/v1/academy_quick_check_drafts") {
      if (!String(headers.Authorization || "").includes(SERVICE)) return respond(401, { message: "permission denied" });
      const key = (u, c) => pkey(String(u).replace(/^eq\./, ""), String(c).replace(/^eq\./, ""));
      if (method === "GET") {
        const row = store.drafts.get(key(url.searchParams.get("user_id"), url.searchParams.get("class_key")));
        return respond(200, row ? [row] : []);
      }
      if (method === "POST") {
        const body = JSON.parse((init && init.body) || "{}");
        store.drafts.set(key(body.user_id, body.class_key), { question_set_version: body.question_set_version, state: body.state });
        return respond(201, []);
      }
      if (method === "DELETE") {
        store.drafts.delete(key(url.searchParams.get("user_id"), url.searchParams.get("class_key")));
        return respond(204, null);
      }
    }
    return respond(404, { message: "stub: unhandled " + route });
   } catch (error) {
     // Surface harness faults instead of letting the client swallow them.
     stubErrors.push({ url: String(input), error: error && error.stack ? error.stack : String(error) });
     throw error;
   }
  };
}

// The page chrome the renderers and progress code write into. Everything else
// the script touches resolves through StubDocument's detached-stub fallback.
function seedDom(document) {
  for (const id of ["app", "courseView", "loading", "coursePct", "mobileNav", "previewControls"]) {
    const el = document.createElement(id === "courseView" ? "main" : "div");
    el.setAttribute("id", id);
    document.body.appendChild(el);
    document.byId.set(id, el);
  }
}

// ---------------------------------------------------------------------------
// Boot one dashboard session.
// ---------------------------------------------------------------------------
function createSession(options) {
  const opts = options || {};
  installEnv();
  const store = createStore();
  const network = [];
  const window = createWindow({ pathname: opts.pathname || "/academy/dashboard" });
  const source = instrument(readInlineScript());

  seedDom(window.document);

  // The REAL server modules (_academy-security.js) call the Node-global fetch,
  // so the in-memory Supabase stand-in must be installed there as well as in
  // the dashboard sandbox. Otherwise the handler would reach the real network.
  const realFetch = globalThis.fetch;
  const stubErrors = [];
  const fetchStub = buildFetch(store, network, opts, stubErrors);
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  const restore = () => { globalThis.fetch = realFetch; };

  window.__warnings = [];
  window.console = Object.assign(Object.create(console), {
    warn: (...args) => { window.__warnings.push(args.map(String).join(" ")); },
    log: () => {}, info: () => {}, debug: () => {},
  });

  // The stub window is the vm global, so Node's timer functions must be
  // injected explicitly — a vm context has no Node globals of its own. Timers
  // are tracked so dispose() can clear the draft-debounce handles and let
  // `node --test` exit cleanly.
  const pendingTimers = new Set();
  const track = (fn) => (...args) => {
    const handle = fn(...args);
    pendingTimers.add(handle);
    return handle;
  };
  const sandbox = vm.createContext(window);
  sandbox.setTimeout = track(setTimeout);
  sandbox.clearTimeout = (handle) => { pendingTimers.delete(handle); clearTimeout(handle); };
  sandbox.setInterval = track(setInterval);
  sandbox.clearInterval = (handle) => { pendingTimers.delete(handle); clearInterval(handle); };
  sandbox.queueMicrotask = queueMicrotask;
  sandbox.structuredClone = structuredClone;
  sandbox.fetch = fetchStub;

  vm.runInContext(source, sandbox, { filename: "academy-dashboard.inline.js" });

  const qc = window.__QC_TEST__;
  if (!qc) { restore(); throw new Error("instrumentation failed: __QC_TEST__ was not published"); }
  for (const name of EXPORTS) {
    if (!(name in qc)) { restore(); throw new Error("instrumentation failed: missing export " + name); }
  }
  const dispose = () => {
    for (const handle of pendingTimers) { clearTimeout(handle); clearInterval(handle); }
    pendingTimers.clear();
    restore();
  };
  return { window, document: window.document, qc, store, network, warnings: window.__warnings, stubErrors, dispose };
}

module.exports = { createSession, installEnv, readInlineScript, instrument, SECRETS, ORIGIN, DASHBOARD };
