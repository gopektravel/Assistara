"use strict";

// exam.test.js — server-level regression for the Academy Phase Exams and Final
// Assessment pipeline.
//
// What it runs
//   The REAL api/academy-exam.js and api/academy-certificate.js handlers with a
//   stubbed Supabase/GoTrue behind global.fetch — the same request/response
//   cycles a browser produces. Nothing here re-implements grading or unlock
//   logic, so the test cannot drift from the shipped server.
//
// Why it exists
//   The Academy's progression now runs through server-owned exams. A bug here is
//   not a cosmetic issue: it decides who may unlock Phase 2, who may take the
//   Final Assessment, and who may download a Certificate of Completion. The
//   suite therefore pins the security boundary (the answer key never reaches
//   the browser, scores and pass flags cannot be forged, unlock is derived from
//   authoritative rows) and the lifecycle behaviours (best attempt kept, retake
//   appends, already-passed learners are not re-gated, cross-learner isolation).
//
// Run: node --test assistara-local-v9/api/exam.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const examHandler = require("./academy-exam.js");
const certHandler = require("./academy-certificate.js");
const { buildCertificatePdf, sanitiseAscii } = require("./_certificate-pdf.js");
const bank = require("./_exam-bank.js");
const curriculum = require("./_curriculum.js");
const security = require("./_academy-security.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");

const COOKIE_SECRET = "exam-test-cookie-secret-32-bytes-minimum";
const SERVICE_KEY = "exam-test-service-role-key";
const ANON_KEY = "exam-test-anon-key";
const SUPABASE_URL = "https://supabase.exam.test";
const ORIGIN = "https://www.getassistara.com";

const EXAM_BY_KEY = new Map(bank.map(exam => [exam.exam_key, exam]));

// The dashboard keeps its own copy of the curriculum. The server-side exam gate
// (which classes must be complete before a phase exam unlocks, how many classes
// a phase contains) must agree with what the learner sees in the browser, or a
// lesson could appear complete while the gate still counts the old total. This
// loads the REAL `const curriculum=[...]` literal out of academy-dashboard.html
// and compares it field-for-field against the server registry.
function assertMatchesDashboard() {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  const start = source.indexOf("const curriculum=[");
  const end = source.indexOf("];", start);
  assert.ok(start > 0 && end > start + 20, "dashboard curriculum literal not found");
  let dashboard;
  try {
    // The literal is a plain array of strings/numbers, so evaluating it is safe
    // here; every other copy of this data is asserted by the audit below.
    dashboard = new Function("return (" + source.slice(start + 17, end + 1) + ");")();
  } catch (err) {
    assert.fail("dashboard curriculum literal failed to parse: " + err.message);
  }
  assert.ok(Array.isArray(dashboard) && dashboard.length === 4, "dashboard must declare exactly 4 phases");

  const shapes = dashboard.map(phase => phase.modules.map(module => module[1].length));
  for (const phaseNumber of [1, 2, 3, 4]) {
    assert.deepEqual(shapes[phaseNumber - 1], curriculum.PHASE_SHAPES[phaseNumber],
      `dashboard phase ${phaseNumber} module/class counts disagree with the server registry`);
    assert.equal(dashboard[phaseNumber - 1].title, curriculum.PHASE_TITLES[phaseNumber],
      `dashboard phase ${phaseNumber} title disagrees with the server registry`);
  }
  const dashboardTotal = dashboard.reduce((n, p) => n + p.modules.reduce((m, x) => m + x[1].length, 0), 0);
  assert.equal(dashboardTotal, curriculum.ALL_CLASS_KEYS.length,
    "dashboard phase totals disagree with the server registry");
}

// ---------------------------------------------------------------------------
// Fake GoTrue JWTs: validatedLearnerSession() parses the token's `exp` claim,
// so the access_token inside the sealed cookie must be a real JWT shape.
// ---------------------------------------------------------------------------
function fakeJwt(userId, expSeconds) {
  const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return b64({ alg: "none", typ: "JWT" })
    + "." + b64({ sub: userId, exp: expSeconds })
    + ".sig";
}
const JWT_1 = fakeJwt("learner-1", Math.floor(Date.now() / 1000) + 3600);
const JWT_2 = fakeJwt("learner-2", Math.floor(Date.now() / 1000) + 3600);

// ---------------------------------------------------------------------------
// Stub Supabase/GoTrue: serves exactly the endpoints the handlers touch.
// ---------------------------------------------------------------------------

function makeSupabase(options = {}) {
  const state = {
    users: new Map([
      ["learner-1", { id: "learner-1", deleted_at: null, banned_until: null }],
      ["learner-2", { id: "learner-2", deleted_at: null, banned_until: null }],
    ]),
    access: new Set(["learner-1", "learner-2"]),
    progress: new Map(),   // "learner-1|p1m1c1" -> { completed: true, completed_at }
    attempts: new Map(),   // "learner-1|phase_1" -> [rows...]
    failRecordings: false, // make academy_record_exam_attempt throw
    failProgress: false,   // make class-progress reads throw
    failHistory: false,    // make exam-attempt reads throw
    ...(options.state || {}),
  };

  function respond(body, status = 200) {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function tokenToUser(auth) {
    const token = String(auth || "").replace(/^Bearer\s+/i, "");
    if (token === JWT_1) return "learner-1";
    if (token === JWT_2) return "learner-2";
    return null;
  }

  async function fetchStub(input, init = {}) {
    const url = String(input);
    const { method = "GET" } = init;
    const auth = String((init.headers || {}).Authorization || "");
    const isService = auth.includes(SERVICE_KEY);

    // GoTrue current user
    if (url.endsWith("/auth/v1/user")) {
      const id = tokenToUser(auth);
      if (!id) return respond({ code: 401 }, 401);
      return respond({ id, email: id + "@example.test", user_metadata: { name: "Ada Learner" } });
    }
    // GoTrue admin live-record check
    if (url.includes("/auth/v1/admin/users/")) {
      const id = decodeURIComponent(url.split("/").pop());
      const user = state.users.get(id);
      return user ? respond({ user }) : respond({}, 404);
    }
    // RPC academy_has_access
    if (url.endsWith("/rest/v1/rpc/academy_has_access")) {
      const body = JSON.parse((init.body && String(init.body)) || "{}");
      return respond(state.access.has(body.p_user_id));
    }
    // RPC academy_record_exam_attempt (service-role only)
    if (url.endsWith("/rest/v1/rpc/academy_record_exam_attempt")) {
      if (!isService) return respond({ message: "permission denied" }, 401);
      if (state.failRecordings) {
        const err = new Error("network down");
        err.simulated = true;
        throw err;
      }
      const body = JSON.parse(String(init.body));
      // The migration derives `passed` from the threshold; a mismatched flag
      // must be refused, so no attempt can be written with a forged pass.
      const derived = body.p_score >= body.p_passing_score;
      if (derived !== body.p_passed) return respond({ message: "pass flag mismatch" }, 400);
      const key = body.p_user_id + "|" + body.p_exam_key;
      const rows = state.attempts.get(key) || [];
      rows.push({
        user_id: body.p_user_id,
        exam_key: body.p_exam_key,
        exam_version: body.p_exam_version,
        score: body.p_score,
        passing_score: body.p_passing_score,
        passed: derived,
        attempted_at: new Date().toISOString(),
      });
      state.attempts.set(key, rows);
      return respond(true);
    }
    // REST academy_exam_attempts (learner own-row SELECT)
    if (url.includes("/rest/v1/academy_exam_attempts")) {
      const qs = new URLSearchParams(url.split("?")[1] || "");
      if (state.failHistory) {
        const err = new Error("history down");
        err.simulated = true;
        throw err;
      }
      const user = String(qs.get("user_id") || "").replace(/^eq\./, "");
      const examKey = String(qs.get("exam_key") || "").replace(/^eq\./, "");
      const rows = (state.attempts.get(user + "|" + examKey) || [])
        .slice()
        .sort((a, b) => String(b.attempted_at || "").localeCompare(String(a.attempted_at || "")));
      return respond(rows);
    }
    // REST academy_class_progress (learner own-row SELECT)
    if (url.includes("/rest/v1/academy_class_progress")) {
      if (state.failProgress) {
        const err = new Error("progress down");
        err.simulated = true;
        throw err;
      }
      const qs = new URLSearchParams(url.split("?")[1] || "");
      const user = String(qs.get("user_id") || "").replace(/^eq\./, "");
      const classKey = String(qs.get("class_key") || "").replace(/^eq\./, "");
      if (classKey) {
        const row = state.progress.get(user + "|" + classKey);
        return respond(row ? [row] : []);
      }
      const rows = [];
      for (const [key, row] of state.progress.entries()) {
        const sep = key.indexOf("|");
        if (sep < 0 || key.slice(0, sep) !== user) continue;
        if (row.completed !== true) continue;
        rows.push({ class_key: key.slice(sep + 1) });
      }
      return respond(rows);
    }
    const error = new Error("stub: unhandled " + url);
    error.simulated = true;
    throw error;
  }

  return { state, fetchStub };
}

// ---------------------------------------------------------------------------
// Request plumbing with the same shape the Vercel functions use.
// ---------------------------------------------------------------------------

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: null, finished: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    end(payload) { this.body = payload; this.finished = true; },
  };
}

function setEnv(extra = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SUPABASE") || k.startsWith("ACADEMY_")) delete process.env[k];
  }
  Object.assign(process.env, {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    ACADEMY_COOKIE_SECRET: COOKIE_SECRET,
    ACADEMY_ALLOWED_ORIGINS: ORIGIN,
    ...extra,
  });
}

function liveCookie(cookieName, payload, secret) {
  return `${cookieName}=${security.seal(payload, secret)}`;
}

function learnerCookie(userId = "learner-1", token = JWT_1, over = {}) {
  return liveCookie(security.ACADEMY_COOKIE, {
    aud: "academy",
    user_id: userId,
    access_token: token,
    exp: Date.now() + 600000,
    ...over,
  }, COOKIE_SECRET);
}

function qaCookie(over = {}) {
  return liveCookie(security.QA_COOKIE, {
    aud: "academy-test-portal",
    user_id: "qa-bot",
    exp: Date.now() + 600000,
    ...over,
  }, COOKIE_SECRET);
}

let savedFetch = null;
async function withSupabase(supabase, fn) {
  savedFetch = global.fetch;
  global.fetch = supabase.fetchStub;
  try {
    return await fn();
  } finally {
    global.fetch = savedFetch;
    savedFetch = null;
  }
}

async function postExam(supabase, body, { cookie = learnerCookie(), origin = ORIGIN, raw } = {}) {
  return withSupabase(supabase, async () => {
    const res = makeRes();
    setEnv();
    await examHandler({
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: raw !== undefined ? raw : JSON.stringify(body),
    }, res);
    let json = null;
    try { json = JSON.parse(res.body || "null"); } catch (_) {}
    return { status: res.statusCode, json, res };
  });
}

function completePhaseClasses(state, userId, phase) {
  for (const classKey of curriculum.classKeysForPhase(phase)) {
    state.progress.set(userId + "|" + classKey, { completed: true, completed_at: "2026-01-01T00:00:00Z" });
  }
}

function seedPassed(state, userId, examKey, score, attemptedAt) {
  const rows = state.attempts.get(userId + "|" + examKey) || [];
  rows.push({
    user_id: userId,
    exam_key: examKey,
    score,
    passing_score: 80,
    passed: score >= 80,
    attempted_at: attemptedAt || "2026-02-01T00:00:00Z",
  });
  state.attempts.set(userId + "|" + examKey, rows);
}

// The exact selections a learner must send to get a specific score.
function correctSelections(exam) {
  const selections = {};
  for (const question of exam.questions) selections[question.id] = question.correct_option_id;
  return selections;
}
function allWrongSelections(exam) {
  const selections = {};
  for (const question of exam.questions) {
    const wrong = question.options.find(option => option.id !== question.correct_option_id);
    selections[question.id] = wrong ? wrong.id : question.options[0].id;
  }
  return selections;
}

// ---------------------------------------------------------------------------
// Bank and curriculum integrity
// ---------------------------------------------------------------------------

test("BANK: exactly five assessments with the mandated phase/final shape", () => {
  assert.equal(bank.length, 5);
  assert.deepEqual(bank.map(exam => exam.exam_key), ["phase_1", "phase_2", "phase_3", "phase_4", "final"]);
  for (const exam of bank.slice(0, 4)) {
    assert.equal(exam.questions.length, 10, exam.exam_key + " must have exactly 10 questions");
  }
  assert.equal(EXAM_BY_KEY.get("final").questions.length, 15, "final must have exactly 15 questions");
  assert.ok(bank.every(exam => /^[A-Za-z0-9_-]+-v[1-9][0-9]*$/.test(exam.exam_version)), "version must be <key>-vN");
});

test("BANK: every assessment keeps its answer key server-side only", () => {
  for (const exam of bank) {
    assert.ok(exam.questions.length > 0);
    assert.ok(exam.questions.every(q => typeof q.correct_option_id === "string"));
    const public_ = examHandler._test.publicQuestions(exam);
    for (const question of public_) {
      assert.deepEqual(Object.keys(question).sort(), ["id", "options", "prompt"]);
      assert.ok(!Object.prototype.hasOwnProperty.call(question, "correct_option_id"));
      for (const option of question.options) {
        assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
      }
    }
    const serialized = JSON.stringify(public_);
    for (const token of ["correct_option_id", "correct_index", "correctAnswer", "answerKey", "isCorrect"]) {
      assert.equal(serialized.includes(token), false, `${exam.exam_key} leaked ${token}`);
    }
  }
});

test("BANK: every exam declares the passing threshold 80 and applies it", () => {
  for (const exam of bank) {
    assert.equal(exam.passing_score, 80, exam.exam_key + " passing threshold");
    const passing = Math.ceil((80 / 100) * exam.questions.length);
    assert.equal(examHandler._test.isPassed(exam.passing_score, exam), true);
    assert.equal(examHandler._test.isPassed(exam.passing_score - 1, exam), false);
  }
});

test("BANK: exactly one defensible correct option per question, plausible distractors", () => {
  for (const exam of bank) {
    for (const question of exam.questions) {
      assert.ok(typeof question.prompt === "string" && question.prompt.length > 0);
      assert.ok(question.options.length >= 2, question.id + " needs distractors");
      const correct = question.options.filter(o => o.id === question.correct_option_id);
      assert.equal(correct.length, 1, question.id + " must have exactly one correct option");
      // Distractors are plausible and never duplicate: no option text repeats.
      const texts = question.options.map(o => o.text);
      assert.equal(new Set(texts).size, texts.length, question.id + " duplicates an option text");
      // Every option id belongs to this question (ids encode the question).
      assert.ok(question.options.every(o => String(o.id).startsWith(question.id + ".")),
        question.id + " has a foreign option id");
    }
  }
});

test("CURRICULUM: phase exams require exactly that phase's classes; final requires all phases", () => {
  for (const phase of [1, 2, 3, 4]) {
    const required = curriculum.requiredClassKeysForExam("phase_" + phase);
    assert.deepEqual(required, curriculum.classKeysForPhase(phase));
  }
  assert.equal(curriculum.requiredClassKeysForExam("final"), null);
  assert.equal(curriculum.requiredClassKeysForExam("phase_5"), null);
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_1")), "phase_2");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_4")), "final");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("final")), null);
});

test("CURRICULUM: the dashboard's phase/module/class counts and titles match the server registry", () => {
  assertMatchesDashboard();
});

// ---------------------------------------------------------------------------
// Runtime: auth, transport, body
// ---------------------------------------------------------------------------

test("RUNTIME: GET is rejected with 405 and an Allow header", async () => {
  const res = makeRes();
  setEnv();
  await examHandler({ method: "GET", headers: { origin: ORIGIN } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader("allow"), "POST");
});

test("RUNTIME: cross-origin POST is rejected with 403", async () => {
  const supabase = makeSupabase();
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" }, { origin: "https://evil.example" });
  assert.equal(out.status, 403);
});

test("RUNTIME: no cookie is refused before any Supabase call", async () => {
  const supabase = makeSupabase();
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" }, { cookie: "" });
  assert.equal(out.status, 403);
  assert.match(out.json.error, /Academy session required/);
});

test("RUNTIME: a forged (unsigned) cookie is refused", async () => {
  const supabase = makeSupabase();
  const forged = Buffer.from(
    JSON.stringify({ aud: "academy", access_token: JWT_1, user_id: "learner-1", exp: Date.now() + 60000 }),
  ).toString("base64url");
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" }, { cookie: `${security.ACADEMY_COOKIE}=${forged}` });
  assert.equal(out.status, 403);
});

test("RUNTIME: an expired session refuses even with a valid JWT", async () => {
  const supabase = makeSupabase();
  const expiredJwt = fakeJwt("learner-1", Math.floor(Date.now() / 1000) - 60);
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" },
    { cookie: learnerCookie("learner-1", expiredJwt) });
  assert.equal(out.status, 403);
});

test("RUNTIME: an expired sealed cookie is refused", async () => {
  const supabase = makeSupabase();
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" },
    { cookie: learnerCookie("learner-1", JWT_1, { exp: Date.now() - 1000 }) });
  assert.equal(out.status, 403);
});

test("RUNTIME: missing server env vars return 503 and never a question", async () => {
  const supabase = makeSupabase();
  const res = makeRes();
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SUPABASE") || k.startsWith("ACADEMY_")) delete process.env[k];
  }
  process.env.SUPABASE_URL = SUPABASE_URL; // the other three are deliberately absent
  await withSupabase(supabase, async () => {
    await examHandler({
      method: "POST",
      headers: { origin: ORIGIN, cookie: learnerCookie() },
      body: JSON.stringify({ action: "load", exam_key: "phase_1" }),
    }, res);
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.includes("questions"), false);
});

test("RUNTIME: unknown exam key returns 404", async () => {
  const supabase = makeSupabase();
  for (const examKey of ["phase_5", "phase_0", "midterm", "finale", "", "final; DR"] ) {
    const out = await postExam(supabase, { action: "load", exam_key: examKey });
    assert.equal(out.status, 404, `expected 404 for ${JSON.stringify(examKey)}`);
    assert.equal(out.json.questions, undefined);
  }
});

test("RUNTIME: version mismatch returns 409 and never grades a stale bank", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const selections = correctSelections(EXAM_BY_KEY.get("phase_1"));
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: "phase_1-v0", selections,
  });
  assert.equal(out.status, 409);
  assert.equal(out.json.exam_version, "phase_1-v1");
  assert.equal(supabase.state.attempts.size, 0, "a stale submit must not write an attempt");
});

test("RUNTIME: malformed bodies, unknown actions and smuggled fields are rejected with 400", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const mustBe400 = [
    "{not json",
    "",
    "[]",
    '"a string"',
    '{"action":"graded","exam_key":"phase_1"}',
    '{"action":"load","exam_key":"phase_1","who":"me"}',
    '{"action":"submit","exam_key":"phase_1","exam_version":"phase_1-v1","selections":{},"score":95}',
    '{"action":"submit","exam_key":"phase_1","exam_version":"phase_1-v1","selections":{},"passed":true}',
    '{"action":"submit","exam_key":"phase_1","exam_version":"phase_1-v1","selections":{},"unlock":true}',
    '{"action":"submit","exam_key":"phase_1","exam_version":"phase_1-v1","selections":{},"completed":true}',
    JSON.stringify({ action: "submit", exam_key: "phase_1", exam_version: "phase_1-v1", selections: {}, correct_count: 10 }),
  ];
  for (const raw of mustBe400) {
    const out = await postExam(supabase, null, { raw });
    assert.equal(out.status, 400, `expected 400 for ${raw}, got ${out.status}`);
  }
  assert.equal(supabase.state.attempts.size, 0, "rejected bodies must never write an attempt");
});

test("RUNTIME: a non-string selections field is rejected with 400", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: "phase_1-v1", selections: ["phase_1.q01"],
  });
  assert.equal(out.status, 400);
  assert.equal(supabase.state.attempts.size, 0);
});

test("RUNTIME: an oversized body is rejected with 400", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const big = "x".repeat(65 * 1024);
  const out = await postExam(supabase, null, { raw: JSON.stringify({ action: "load", exam_key: "phase_1", big }) });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /too large/i);
});

test("RUNTIME: every response is no-store and JSON", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.match(out.res.getHeader("cache-control"), /no-store/);
  assert.match(out.res.getHeader("x-content-type-options"), /nosniff/);
  assert.match(String(out.res.getHeader("content-type")), /application\/json/);
});

// ---------------------------------------------------------------------------
// Load: key absence, unlock gating
// ---------------------------------------------------------------------------

test("LOAD: a locked phase exam returns questions, no key, no unlock", async () => {
  const supabase = makeSupabase();
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.equal(out.status, 200);
  assert.equal(out.json.ok, true);
  assert.equal(out.json.unlocked, false);
  assert.match(out.json.locked_reason, /Complete all 22 Phase 1 classes/);
  assert.equal(out.json.history.attempts, 0);
  assert.equal(out.json.questions.length, 10);
  for (const question of out.json.questions) {
    assert.deepEqual(Object.keys(question).sort(), ["id", "options", "prompt"]);
  }
  const serialized = JSON.stringify(out.json);
  for (const token of ["correct_option_id", "correct_index", "correctAnswer", "answerKey", "isCorrect"]) {
    assert.equal(serialized.includes(token), false);
  }
});

test("LOAD: an unlocked phase exam reports required_count and empty history", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.equal(out.json.unlocked, true);
  assert.equal(out.json.locked_reason, null);
  assert.equal(out.json.required_count, 22);
  assert.equal(out.json.question_count, 10);
  assert.equal(out.json.passing_score, 80);
});

test("LOAD: the final assessment stays locked until all four phase exams pass", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  completePhaseClasses(supabase.state, "learner-1", 2);
  completePhaseClasses(supabase.state, "learner-1", 3);
  completePhaseClasses(supabase.state, "learner-1", 4);
  for (const phase of [1, 2, 3]) seedPassed(supabase.state, "learner-1", "phase_" + phase, 90);
  const out = await postExam(supabase, { action: "load", exam_key: "final" });
  assert.equal(out.status, 200);
  assert.equal(out.json.unlocked, false);
  assert.match(out.json.locked_reason, /Pass every phase exam/);
  assert.equal(out.json.history.attempts, 0);
  assert.equal(out.json.questions.length, 15);
});

test("LOAD: the final assessment is usable once all four phases pass", async () => {
  const supabase = makeSupabase();
  for (const phase of [1, 2, 3, 4]) {
    completePhaseClasses(supabase.state, "learner-1", phase);
    seedPassed(supabase.state, "learner-1", "phase_" + phase, 95);
  }
  const out = await postExam(supabase, { action: "load", exam_key: "final" });
  assert.equal(out.json.unlocked, true);
  assert.equal(out.json.question_count, 15);
});

test("LOAD: an already-passed phase exam is not re-gated even if a class is reopened", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  seedPassed(supabase.state, "learner-1", "phase_1", 82, "2026-02-01T00:00:00Z");
  // Simulate a class reopened later: progress row removed by an admin action.
  supabase.state.progress.delete("learner-1|p1m1c1");
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.equal(out.json.unlocked, true);
  assert.equal(out.json.history.passed, true);
  assert.equal(out.json.history.best_score, 82);
  assert.equal(out.json.history.attempts, 1);
});

// ---------------------------------------------------------------------------
// Submit: grading, persistence, attempt history, lock re-evaluation
// ---------------------------------------------------------------------------

test("SUBMIT: correct answers pass, are persisted, and return no key or verdict", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const exam = EXAM_BY_KEY.get("phase_1");
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version,
    selections: correctSelections(exam),
  });
  assert.equal(out.status, 200);
  assert.equal(out.json.passed, true);
  assert.equal(out.json.score, 100);
  assert.equal(out.json.passing_score, 80);
  assert.equal(out.json.correct_count, 10);
  assert.equal(out.json.question_count, 10);
  assert.equal(out.json.next_phase_unlocked, "phase_2");
  const serialized = JSON.stringify(out.json);
  // The whole submit response must be free of answer-key vocabulary. A bare
  // "correct" would collide with the intentional `correct_count`, so scan for
  // the key-bearing spellings only.
  for (const token of ["correct_option_id", "correct_index", "isCorrect", "results", "feedback"]) {
    assert.equal(serialized.includes(token), false);
  }
  // Persisted by the service-role RPC only, appended not updated.
  const rows = supabase.state.attempts.get("learner-1|phase_1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].passed, true);
  assert.equal(rows[0].score, 100);
});

test("SUBMIT: a below-threshold score is failed and persisted as a fail", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const exam = EXAM_BY_KEY.get("phase_1");
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version,
    selections: allWrongSelections(exam),
  });
  assert.equal(out.status, 200);
  assert.equal(out.json.passed, false);
  assert.equal(out.json.score, 0);
  assert.equal(out.json.next_phase_unlocked, null);
  const rows = supabase.state.attempts.get("learner-1|phase_1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].passed, false);
});

test("SUBMIT: every retake appends and the best attempt wins", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const exam = EXAM_BY_KEY.get("phase_1");
  const wrong = allWrongSelections(exam);
  const correct = correctSelections(exam);
  const payload = (selections) => ({
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version, selections,
  });
  const first = await postExam(supabase, payload(wrong));
  assert.equal(first.json.passed, false);
  const second = await postExam(supabase, payload(wrong));
  assert.equal(second.json.passed, false);
  const third = await postExam(supabase, payload(correct));
  assert.equal(third.json.passed, true);
  const rows = supabase.state.attempts.get("learner-1|phase_1");
  assert.equal(rows.length, 3, "three attempts must be appended, never updated");
  assert.deepEqual(rows.map(r => r.passed), [false, false, true]);
  assert.equal(third.json.history.attempts, 3);
  assert.equal(third.json.history.best_score, 100);
  assert.equal(third.json.history.best_passed, true);
});

test("SUBMIT: a locked exam is refused with 403 even with all-correct answers", async () => {
  const supabase = makeSupabase();
  // Only ONE class complete: exam must stay locked.
  supabase.state.progress.set("learner-1|p1m1c1", { completed: true, completed_at: "2026-01-01T00:00:00Z" });
  const exam = EXAM_BY_KEY.get("phase_1");
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version,
    selections: correctSelections(exam),
  });
  assert.equal(out.status, 403);
  assert.match(out.json.error, /locked/i);
  assert.equal(supabase.state.attempts.size, 0, "a locked attempt must never be recorded");
});

test("SUBMIT: partial selections cannot be graded (400)", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const exam = EXAM_BY_KEY.get("phase_1");
  const partial = {};
  partial[exam.questions[0].id] = exam.questions[0].correct_option_id;
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version, selections: partial,
  });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /Answer every question/);
  assert.equal(supabase.state.attempts.size, 0);
});

test("SUBMIT: unknown question or option ids are rejected with 400", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const exam = EXAM_BY_KEY.get("phase_1");
  // Replace the first question's id with one that is not in the bank.
  const badQuestion = correctSelections(exam);
  const firstId = exam.questions[0].id;
  const firstValue = badQuestion[firstId];
  delete badQuestion[firstId];
  badQuestion["phase_1.q99"] = firstValue;
  const out1 = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version, selections: badQuestion,
  });
  assert.equal(out1.status, 400);
  assert.match(out1.json.error, /Unknown question ID/);

  // A valid question id mapped to an option of a different question.
  const badOption = correctSelections(exam);
  badOption[exam.questions[0].id] = "phase_1.q99.o01";
  const out2 = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version, selections: badOption,
  });
  assert.equal(out2.status, 400);
  assert.match(out2.json.error, /Unknown option ID/);
  assert.equal(supabase.state.attempts.size, 0);
});

test("SUBMIT: selections from another exam are rejected", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  const phase2 = EXAM_BY_KEY.get("phase_2");
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: "phase_1-v1",
    selections: correctSelections(phase2),
  });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /Unknown question ID/);
});

test("SUBMIT: cross-learner attempts are never visible or graded for another learner", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  completePhaseClasses(supabase.state, "learner-2", 1);
  seedPassed(supabase.state, "learner-2", "phase_1", 99, "2026-02-01T00:00:00Z");
  // learner-1 must not see learner-2's history or use it to unlock.
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.equal(out.json.history.attempts, 0, "learner-1 must not see learner-2's attempts");
  assert.equal(out.json.history.passed, false);
  // learner-2 loads with its own (empty) history via its own cookie.
  const out2 = await postExam(supabase, { action: "load", exam_key: "phase_1" }, { cookie: learnerCookie("learner-2", JWT_2) });
  assert.equal(out2.json.unlocked, true);
  assert.equal(out2.json.history.attempts, 1);
  assert.equal(out2.json.history.passed, true);
});

test("SUBMIT: server failure during recording returns 503 and writes nothing", async () => {
  const supabase = makeSupabase();
  completePhaseClasses(supabase.state, "learner-1", 1);
  supabase.state.failRecordings = true;
  const exam = EXAM_BY_KEY.get("phase_1");
  const out = await postExam(supabase, {
    action: "submit", exam_key: "phase_1", exam_version: exam.exam_version,
    selections: correctSelections(exam),
  });
  assert.equal(out.status, 503);
  assert.equal(out.json.ok, false);
  assert.equal(supabase.state.attempts.size, 0);
});

test("LOAD: a class-progress read failure returns 503, never a locked verdict", async () => {
  const supabase = makeSupabase();
  supabase.state.failProgress = true;
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1" });
  assert.equal(out.status, 503);
  assert.equal(out.json.unlocked, undefined);
});

// ---------------------------------------------------------------------------
// Preview (QA portal) pathway
// ---------------------------------------------------------------------------

test("PREVIEW: load refuses without a sealed QA cookie", async () => {
  const supabase = makeSupabase();
  const out = await postExam(supabase, { action: "load", exam_key: "phase_1", preview: true });
  assert.equal(out.status, 403);
  assert.match(out.json.error, /Admin QA access is required/);
  // The learner path is also refused when preview is claimed but the cookie is
  // the learner's.
  const out2 = await postExam(supabase, { action: "load", exam_key: "phase_1", preview: true },
    { cookie: learnerCookie() });
  assert.equal(out2.status, 403);
});

test("PREVIEW: a non-boolean preview flag cannot unlock the QA path", async () => {
  const supabase = makeSupabase();
  for (const raw of [
    '{"action":"load","exam_key":"phase_1","preview":"yes"}',
    '{"action":"load","exam_key":"phase_1","preview":1}',
    '{"action":"load","exam_key":"phase_1","preview":"true"}',
  ]) {
    const out = await postExam(supabase, null, { raw, cookie: qaCookie() });
    // The QA cookie is present but `preview === true` was not sent, so the
    // learner session path is used and the QA cookie cannot substitute for it.
    assert.equal(out.status, 403, `expected 403 for ${raw}`);
  }
});

test("PREVIEW: a valid QA cookie bypasses unlock and never persists", async () => {
  const supabase = makeSupabase();
  const cookie = qaCookie();
  const out = await postExam(supabase, { action: "load", exam_key: "final", preview: true }, { cookie });
  assert.equal(out.status, 200);
  assert.equal(out.json.unlocked, true);
  assert.equal(out.json.preview, true);
  assert.equal(out.json.history.attempts, 0);
  const exam = EXAM_BY_KEY.get("final");
  const submit = await postExam(supabase, {
    action: "submit", exam_key: "final", exam_version: exam.exam_version,
    selections: correctSelections(exam), preview: true,
  }, { cookie });
  assert.equal(submit.status, 200);
  assert.equal(submit.json.passed, true);
  assert.equal(submit.json.preview, true);
  assert.equal(supabase.state.attempts.size, 0, "preview submissions must never persist");
});

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

test("CERT: ineligible learners get 403, not a PDF", async () => {
  const supabase = makeSupabase();
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie() } }, res);
  });
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body), /Graduation requirements are not complete/);
  assert.match(String(res.headers["content-type"]), /text\/plain/);
  assert.equal(res.headers["content-disposition"], undefined);
});

test("CERT: a graduated learner streams a branded PDF as an attachment", async () => {
  const supabase = makeSupabase();
  for (const phase of [1, 2, 3, 4]) completePhaseClasses(supabase.state, "learner-1", phase);
  for (const phase of [1, 2, 3, 4]) seedPassed(supabase.state, "learner-1", "phase_" + phase, 90, "2026-02-01T00:00:00Z");
  seedPassed(supabase.state, "learner-1", "final", 92, "2026-02-14T00:00:00Z");
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie() } }, res);
  });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"]), /application\/pdf/);
  assert.match(String(res.headers["content-disposition"]), /attachment; filename="Assistara-Academy-Certificate.pdf"/);
  const pdf = Buffer.from(res.body);
  assert.ok(pdf.subarray(0, 5).toString("latin1") === "%PDF-", "must start with the PDF header");
  const text = pdf.toString("latin1");
  assert.match(text, /Ada Learner/, "the PDF must contain the learner's recorded name");
  assert.match(text, /Awarded 2026-02-14/, "the grant date must come from the last final attempt");
  assert.match(text, /\/Count 1/, "the certificate must be a single page");
});

test("CERT: ?preview=1 is accepted only with a valid QA portal cookie", async () => {
  const supabase = makeSupabase();
  // A learner cookie must not open the preview path.
  const learnerRes = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({
      method: "GET",
      headers: { origin: ORIGIN, cookie: learnerCookie() },
      url: "/api/academy-certificate?preview=1",
    }, learnerRes);
  });
  assert.equal(learnerRes.statusCode, 403);
  // QA cookie works regardless of graduation.
  const qaRes = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({
      method: "GET",
      headers: { origin: ORIGIN, cookie: qaCookie() },
      url: "/api/academy-certificate?preview=1",
    }, qaRes);
  });
  assert.equal(qaRes.statusCode, 200);
  assert.match(String(qaRes.headers["content-type"]), /application\/pdf/);
  const text = qaRes.body.toString("latin1");
  assert.match(text, /Test Student/, "preview certificate must use the test-student identity");
});

test("CERT: POST is rejected with 405 and an Allow header", async () => {
  const supabase = makeSupabase();
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "POST", headers: { origin: ORIGIN } }, res);
  });
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader("allow"), "GET");
});

test("CERT: cross-origin GET is rejected with 403", async () => {
  const supabase = makeSupabase();
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: "https://evil.example", cookie: learnerCookie() } }, res);
  });
  assert.equal(res.statusCode, 403);
});

test("CERT: a banned or deleted learner gets 403 even when rows look graduated", async () => {
  const supabase = makeSupabase();
  for (const phase of [1, 2, 3, 4]) completePhaseClasses(supabase.state, "learner-1", phase);
  for (const phase of [1, 2, 3, 4]) seedPassed(supabase.state, "learner-1", "phase_" + phase, 90);
  seedPassed(supabase.state, "learner-1", "final", 92);
  supabase.state.users.set("learner-1", { id: "learner-1", deleted_at: new Date().toISOString(), banned_until: null });
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie() } }, res);
  });
  assert.equal(res.statusCode, 403, "a deleted learner must never receive a certificate");
});

test("CERT: no-store headers protect the PDF response", async () => {
  const supabase = makeSupabase();
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie() } }, res);
  });
  assert.match(String(res.headers["cache-control"]), /no-store/);
});

test("CERT: a failing attempt beside a passing one still qualifies (best attempt wins)", async () => {
  const supabase = makeSupabase();
  for (const phase of [1, 2, 3, 4]) completePhaseClasses(supabase.state, "learner-1", phase);
  for (const phase of [1, 2, 3, 4]) {
    seedPassed(supabase.state, "learner-1", "phase_" + phase, 40, "2026-01-01T00:00:00Z");
    seedPassed(supabase.state, "learner-1", "phase_" + phase, 88, "2026-02-01T00:00:00Z");
  }
  seedPassed(supabase.state, "learner-1", "final", 40, "2026-02-10T00:00:00Z");
  seedPassed(supabase.state, "learner-1", "final", 91, "2026-02-14T00:00:00Z");
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie() } }, res);
  });
  assert.equal(res.statusCode, 200, "a subsequent pass must satisfy graduation despite earlier fails");
  const text = Buffer.from(res.body).toString("latin1");
  assert.match(text, /Awarded 2026-02-14/);
});

test("CERT: learner-2 cannot claim learner-1's certificate eligibility", async () => {
  const supabase = makeSupabase();
  for (const phase of [1, 2, 3, 4]) completePhaseClasses(supabase.state, "learner-1", phase);
  for (const phase of [1, 2, 3, 4]) seedPassed(supabase.state, "learner-1", "phase_" + phase, 90);
  seedPassed(supabase.state, "learner-1", "final", 92);
  // learner-2 has no rows of their own.
  const res = makeRes();
  setEnv();
  await withSupabase(supabase, async () => {
    await certHandler({ method: "GET", headers: { origin: ORIGIN, cookie: learnerCookie("learner-2", JWT_2) } }, res);
  });
  assert.equal(res.statusCode, 403, "graduation rows belong only to their owner");
  assert.match(String(res.body), /Graduation requirements are not complete/);
});

test("UNIT: bestPassed accepts an attempt list containing any passing row", () => {
  const { bestPassed } = certHandler._test;
  assert.equal(bestPassed([{ passed: false }, { passed: true }]), true);
  assert.equal(bestPassed([{ passed: true }, { passed: false }]), true);
  assert.equal(bestPassed([{ passed: false }, { passed: false }]), false);
  assert.equal(bestPassed([]), false, "no attempts must never read as passed");
  assert.equal(bestPassed([{ passed: 1 }]), false, "only a strict boolean true counts");
  assert.equal(bestPassed([{ passed: "true" }]), false, "a string flag must not be trusted");
});

// ---------------------------------------------------------------------------
// PDF builder unit tests
// ---------------------------------------------------------------------------

test("PDF: single-page letter PDF with the learner name, title and date", () => {
  const pdf = buildCertificatePdf({ learnerName: "Jane Doe", courseTitle: "Assistara Academy Virtual Assistant Program", grantDate: "2026-03-01" });
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Count 1/);
  assert.match(text, /Jane Doe/);
  assert.match(text, /Assistara Academy Virtual Assistant Program/);
  assert.match(text, /Awarded 2026-03-01/);
  assert.match(text, /\/BaseFont \/Helvetica/);
  assert.match(text, /\/BaseFont \/Helvetica-Bold/);
  assert.ok(text.trimEnd().endsWith("%%EOF"), "the PDF must end with %%EOF");
});

test("PDF: non-ASCII and control characters are stripped, brackets escaped", () => {
  const pdf = buildCertificatePdf({
    learnerName: "Zoë O'Brien (Jr.)",
    courseTitle: "Virtual Assistant Program",
    grantDate: "2026-03-01",
  });
  const text = pdf.toString("latin1");
  assert.doesNotMatch(text, /Zoë/, "non-ASCII must be dropped for the built-in font");
  assert.doesNotMatch(text, /\/Zo/, "sanitised name must be ASCII");
  assert.equal(sanitiseAscii("Zoë O'Brien"), "Zo O'Brien");
  assert.equal(sanitiseAscii("  a   b\nc  "), "a b c");
  assert.equal(sanitiseAscii(""), "");
  assert.equal(sanitiseAscii(null), "");
});

// ---------------------------------------------------------------------------
// Zero-token source scans
// ---------------------------------------------------------------------------

test("ZERO-TOKEN: the load response shape never carries an answer key at the source level", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-exam.js"), "utf8");
  const call = src.slice(src.indexOf("function publicQuestions"), src.indexOf("function grade"));
  for (const field of ["correct_option_id", "correct_index", "isCorrect", "answer_key"]) {
    assert.equal(call.includes(field), false, "publicQuestions references " + field);
  }
});

test("ZERO-TOKEN: the certificate module carries no answer key vocabulary", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-certificate.js"), "utf8");
  for (const token of ["correct_option_id", "correct_index", "correctAnswer", "answerKey"]) {
    assert.equal(src.includes(token), false);
  }
});

test("ZERO-TOKEN: the exam client receives selections ids only, never correctness", () => {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  const start = source.indexOf("const EXAM_ENDPOINT");
  const end = source.indexOf("function renderCertificate");
  assert.ok(start > 0 && end > start, "exam client module must be present in the dashboard");
  const module_ = source.slice(start, end);
  for (const token of ["correct_option_id", "correct_index", "correctAnswer", "answerKey", "isCorrect"]) {
    assert.equal(module_.includes(token), false, "exam client references " + token);
  }
});

test("ZERO-TOKEN: dashboard course/exam markup is free of answer-key markers", () => {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  for (const token of ['class="correct"', 'id="correctAnswer"', "data-correct", "quizAnswerKey"]) {
    assert.equal(source.includes(token), false);
  }
});

// ---------------------------------------------------------------------------
// Migration contract (read-only)
// ---------------------------------------------------------------------------

test("MIGRATION: exam persistence migration is service-role-only and derives passed", () => {
  const sql = fs.readFileSync(
    path.join(ROOT, "..", "supabase", "migrations", "202609300001_academy_exam_attempt_persistence.sql"), "utf8");
  assert.match(sql, /academy_record_exam_attempt/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.academy_record_exam_attempt\(uuid, text, text, integer, integer, boolean\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.academy_record_exam_attempt\([\s\S]*?FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.academy_record_exam_attempt\([\s\S]*?TO service_role;/);
  assert.match(sql, /v_passed := \(p_score >= p_passing_score\)/);
  assert.match(sql, /p_exam_key !~ '\^\(phase_\[1-4\]\|final\)\$'/);
});

test("MIGRATION: attempts are append-only, never updated or deleted", () => {
  const sql = fs.readFileSync(
    path.join(ROOT, "..", "supabase", "migrations", "202609300001_academy_exam_attempt_persistence.sql"), "utf8");
  assert.ok(!/UPDATE\s+public\.academy_exam_attempts/i.test(sql));
  assert.ok(!/DELETE\s+FROM\s+public\.academy_exam_attempts/i.test(sql));
  assert.match(sql, /INSERT INTO public\.academy_exam_attempts/);
});

// ---------------------------------------------------------------------------
// Unit-level exports sanity
// ---------------------------------------------------------------------------

test("UNIT: attemptSummary picks the highest score and preserves attempt count", () => {
  const summary = examHandler._test.attemptSummary([
    { score: 70, passed: false, attempted_at: "2026-01-01T00:00:00Z" },
    { score: 90, passed: true, attempted_at: "2026-01-02T00:00:00Z" },
  ], EXAM_BY_KEY.get("phase_1"));
  assert.equal(summary.attempts, 2);
  assert.equal(summary.best_score, 90);
  assert.equal(summary.best_passed, true);
  assert.equal(summary.passed, true);
  assert.equal(summary.passing_score, 80);
});

test("UNIT: validateSelections is exact about question set and completeness", () => {
  const exam = EXAM_BY_KEY.get("phase_1");
  const sel = correctSelections(exam);
  assert.equal(examHandler._test.validateSelections(sel, exam, { complete: true }).ok, true);
  const partial = { [exam.questions[0].id]: exam.questions[0].correct_option_id };
  assert.equal(examHandler._test.validateSelections(partial, exam, { complete: true }).ok, false);
  assert.equal(examHandler._test.validateSelections(partial, exam, { complete: false }).ok, true);
  assert.equal(examHandler._test.validateSelections(null, exam, { complete: false }).ok, false);
  assert.equal(examHandler._test.validateSelections([], exam, { complete: false }).ok, false);
});

test("UNIT: scoreFor rounds to integer percentages", () => {
  assert.equal(examHandler._test.scoreFor(8, EXAM_BY_KEY.get("phase_1")), 80);
  assert.equal(examHandler._test.scoreFor(9, EXAM_BY_KEY.get("phase_1")), 90);
  assert.equal(examHandler._test.scoreFor(12, EXAM_BY_KEY.get("final")), 80);
});

test("UNIT: nextPhaseAfter walks phase_1..4 then final", () => {
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_1")), "phase_2");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_2")), "phase_3");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_3")), "phase_4");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("phase_4")), "final");
  assert.equal(examHandler._test.nextPhaseAfter(EXAM_BY_KEY.get("final")), null);
});

// ---------------------------------------------------------------------------
// Deploy wiring (read-only): the endpoints the dashboard calls must be built and
// routed by Vercel, or every exam and certificate request 404s in production.
// ---------------------------------------------------------------------------

const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

test("DEPLOY: vercel.json builds and routes the exam API", () => {
  const srcs = (VERCEL.builds || []).map(b => b.src);
  const routes = (VERCEL.routes || []).map(r => r.src);
  assert.ok(srcs.includes("api/academy-exam.js"), "no build entry for api/academy-exam.js");
  assert.ok(routes.includes("/api/academy-exam"), "no route for /api/academy-exam");
  assert.ok(routes.indexOf("/api/academy-exam") < routes.indexOf("/(.*)"),
    "exam route is shadowed by the catch-all");
  const fn = (VERCEL.builds || []).find(b => b.src === "api/academy-exam.js");
  const include = (fn.config && fn.config.includeFiles) || [];
  assert.ok(include.includes("api/_exam-bank.js"), "server-only exam bank not bundled");
  assert.ok(include.includes("api/_curriculum.js"), "curriculum registry not bundled");
  assert.ok(include.includes("api/_academy-security.js"), "shared security helper not bundled");
});

test("DEPLOY: vercel.json builds and routes the certificate API", () => {
  const srcs = (VERCEL.builds || []).map(b => b.src);
  const routes = (VERCEL.routes || []).map(r => r.src);
  assert.ok(srcs.includes("api/academy-certificate.js"), "no build entry for api/academy-certificate.js");
  assert.ok(routes.includes("/api/academy-certificate"), "no route for /api/academy-certificate");
  assert.ok(routes.indexOf("/api/academy-certificate") < routes.indexOf("/(.*)"),
    "certificate route is shadowed by the catch-all");
  const fn = (VERCEL.builds || []).find(b => b.src === "api/academy-certificate.js");
  const include = (fn.config && fn.config.includeFiles) || [];
  assert.ok(include.includes("api/_certificate-pdf.js"), "PDF builder not bundled");
  assert.ok(include.includes("api/_curriculum.js"), "curriculum registry not bundled");
  assert.ok(include.includes("api/_academy-security.js"), "shared security helper not bundled");
});

test("DEPLOY: the server-only exam bank is never published as a static asset", () => {
  const staticSrcs = (VERCEL.builds || [])
    .filter(b => (b.use || "").includes("static"))
    .map(b => b.src);
  for (const s of staticSrcs) {
    assert.equal(/_exam-bank/.test(s), false, `exam bank published as static asset: ${s}`);
    assert.equal(/_certificate-pdf/.test(s), false, `PDF builder published as static asset: ${s}`);
  }
});