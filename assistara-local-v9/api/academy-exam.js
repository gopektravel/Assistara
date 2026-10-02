"use strict";

// POST /api/academy-exam
//
//   { action: "load",   exam_key, preview? }
//   { action: "submit", exam_key, exam_version, selections, preview? }
//
// Security model, identical in shape to api/academy-quick-check.js:
//
//   * The answer key lives only in this server module's bank. `publicQuestions`
//     strips every field a browser could use to reconstruct it, and no response
//     ever contains which option was correct.
//   * Grading is server-owned. The request body has no score, passed, or
//     completion field, and the strict per-action field allowlist rejects a body
//     that tries to smuggle one in.
//   * Unlock is server-owned. A phase exam is refused until every class in that
//     phase is completed in academy_class_progress, and the final assessment is
//     refused until all four phase exams are recorded as passed. The browser's
//     own isPhaseUnlocked() is a rendering convenience, not the gate.
//   * Persistence is server-owned. The graded result is written through the
//     service-role-only RPC academy_record_exam_attempt; learners hold no
//     INSERT or UPDATE grant on academy_exam_attempts.
//   * Every attempt is kept. A retake appends a row, and the highest score wins,
//     so a learner can never erase an earlier fail by retaking.

const {
  ACADEMY_COOKIE,
  QA_COOKIE,
  allowedOrigin,
  config,
  cookieValue,
  noStore,
  unseal,
  validatedLearnerSession,
} = require("./_academy-security");
const { requiredClassKeysForExam, classKeysForPhase, PHASE_TITLES } = require("./_curriculum");
const assessments = require("./_exam-bank");

const byExamKey = new Map(assessments.map(exam => [exam.exam_key, exam]));
const EXAM_KEYS = assessments.map(exam => exam.exam_key);
const MAX_BODY_BYTES = 64 * 1024;
const EXAM_KEY_RE = /^(phase_[1-4]|final)$/;

const ALLOWED_ACTION_FIELDS = {
  load: new Set(["action", "exam_key", "preview"]),
  submit: new Set(["action", "exam_key", "exam_version", "selections", "preview"]),
};

function send(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  let body;
  try {
    body = typeof req.body === "object" && req.body !== null
      ? req.body
      : JSON.parse(String(req.body || "{}"));
  } catch {
    return { error: "Invalid JSON request" };
  }
  if (!body || Array.isArray(body) || typeof body !== "object") return { error: "Invalid request" };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) return { error: "Request is too large" };
  const allowed = ALLOWED_ACTION_FIELDS[body.action];
  if (!allowed) return { error: "Unknown action" };
  const unexpected = Object.keys(body).find(key => !allowed.has(key));
  if (unexpected) return { error: `Unexpected field: ${unexpected}` };
  return { body };
}

function validateExamKey(value) {
  if (typeof value !== "string" || !EXAM_KEY_RE.test(value)) return null;
  return byExamKey.get(value) || null;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSelections(selections, exam, { complete = false } = {}) {
  if (!plainObject(selections)) return { ok: false, error: "Selections must be an object" };
  const questions = new Map(exam.questions.map(question => [question.id, question]));
  const entries = Object.entries(selections);
  if (entries.length > questions.size) return { ok: false, error: "Too many question selections" };
  if (complete && entries.length !== questions.size) return { ok: false, error: "Answer every question before submitting" };

  for (const [questionId, optionId] of entries) {
    const question = questions.get(questionId);
    if (!question) return { ok: false, error: "Unknown question ID" };
    if (typeof optionId !== "string" || !question.options.some(option => option.id === optionId)) {
      return { ok: false, error: "Unknown option ID" };
    }
  }
  return { ok: true };
}

// The only projection of a question that may leave the server.
function publicQuestions(exam) {
  return exam.questions.map(question => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options.map(option => ({ id: option.id, text: option.text })),
  }));
}

// Server-owned grading. Returns counts only; per-question correctness is
// deliberately NOT returned, because a per-question verdict would let a learner
// binary-search the key across retakes.
function grade(selections, exam) {
  let correctCount = 0;
  for (const question of exam.questions) {
    if (selections[question.id] === question.correct_option_id) correctCount += 1;
  }
  return correctCount;
}

function scoreFor(correctCount, exam) {
  return Math.round((correctCount / exam.questions.length) * 100);
}

function isPassed(score, exam) {
  return score >= exam.passing_score;
}

function learnerHeaders(cfg, session, extra = {}) {
  return { apikey: cfg.anon, Authorization: `Bearer ${session.access_token}`, ...extra };
}

function serviceHeaders(cfg, extra = {}) {
  return { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, ...extra };
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

function restUrl(cfg, table, params) {
  return `${cfg.url}/rest/v1/${table}?${new URLSearchParams(params).toString()}`;
}

async function completedClassKeys(cfg, session) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_class_progress", {
    select: "class_key",
    user_id: `eq.${session.user_id}`,
    completed: "eq.true",
    limit: "1000",
  }), { headers: learnerHeaders(cfg, session) });
  if (!response.ok) throw new Error("Could not load class progress");
  return new Set(Array.isArray(body) ? body.map(row => row.class_key) : []);
}

async function ownAttempts(cfg, session, examKey) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_exam_attempts", {
    select: "exam_key,score,passing_score,passed,attempted_at",
    user_id: `eq.${session.user_id}`,
    exam_key: `eq.${examKey}`,
    order: "attempted_at.desc",
    limit: "100",
  }), { headers: learnerHeaders(cfg, session) });
  if (!response.ok) throw new Error("Could not load exam history");
  return Array.isArray(body) ? body : [];
}

async function recordAttempt(cfg, session, exam, { score, passed }) {
  const { response, body } = await requestJSON(`${cfg.url}/rest/v1/rpc/academy_record_exam_attempt`, {
    method: "POST",
    headers: serviceHeaders(cfg, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_user_id: session.user_id,
      p_exam_key: exam.exam_key,
      p_exam_version: exam.exam_version,
      p_score: score,
      p_passing_score: exam.passing_score,
      p_passed: passed,
    }),
  });
  if (!response.ok || body !== true) throw new Error("Could not record exam attempt");
  return true;
}

async function authenticate(req, body, cfg) {
  if (body.preview === true) {
    // Admin QA only: a sealed cookie this deployment issued itself.
    const qaCookie = unseal(cookieValue(req, QA_COOKIE), cfg.cookieSecret);
    if (!qaCookie || qaCookie.aud !== "academy-test-portal") return { error: "Admin QA access is required" };
    return { preview: true };
  }

  const cookie = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
  if (!cookie || cookie.aud !== "academy" || !cookie.access_token) return { error: "Academy session required" };
  const session = await validatedLearnerSession({ access_token: cookie.access_token }, cfg);
  if (!session || session.user_id !== cookie.user_id) return { error: "Academy access is not available" };
  return { preview: false, session };
}

// Server-owned unlock check. `phase_N` requires every class in phase N complete;
// `final` requires all four phase exams passed.
async function unlockStatus(cfg, session, exam) {
  const required = requiredClassKeysForExam(exam.exam_key);
  if (!required) {
    const phaseAttempts = await Promise.all(
      [1, 2, 3, 4].map(n => ownAttempts(cfg, session, `phase_${n}`)));
    const missing = [];
    phaseAttempts.forEach((rows, index) => {
      const best = rows.reduce(
        (acc, row) => (acc === null || Number(row.score) > Number(acc) ? row : acc), null);
      if (!best || best.passed !== true) missing.push(`phase_${index + 1}`);
    });
    return { unlocked: missing.length === 0, reason: missing.length ? "Pass every phase exam to unlock the final Academy assessment." : null, missing };
  }

  const completed = await completedClassKeys(cfg, session);
  const outstanding = required.filter(classKey => !completed.has(classKey));
  return {
    unlocked: outstanding.length === 0,
    reason: outstanding.length
      ? `Complete all ${required.length} Phase ${exam.exam_key.slice(6)} classes before taking the exam.`
      : null,
    outstanding: outstanding.slice(0, 12),
    required_count: required.length,
    completed_count: required.length - outstanding.length,
  };
}

function attemptSummary(rows, exam) {
  const best = rows.reduce(
    (acc, row) => (acc === null || Number(row.score) > Number(acc.score) ? row : acc), null);
  return {
    attempts: rows.length,
    best_score: best ? Number(best.score) : null,
    best_passed: best ? best.passed === true : false,
    passed: rows.some(row => row.passed === true),
    passing_score: exam.passing_score,
    last_attempt_at: rows.length ? (rows[0].attempted_at || null) : null,
  };
}

async function loadAction(cfg, auth, exam) {
  const base = {
    ok: true,
    exam_key: exam.exam_key,
    exam_version: exam.exam_version,
    title: exam.title,
    instructions: exam.instructions,
    question_count: exam.questions.length,
    passing_score: exam.passing_score,
    questions: publicQuestions(exam),
  };

  if (auth.preview) {
    return { ...base, unlocked: true, preview: true, history: attemptSummary([], exam) };
  }

  const gate = await unlockStatus(cfg, auth.session, exam);
  const rows = await ownAttempts(cfg, auth.session, exam.exam_key);
  const history = attemptSummary(rows, exam);
  // A learner who already passed is not re-gated: the phase stays passed even if
  // a class is later reopened, and the phase card must keep reading "Passed".
  if (gate.unlocked || history.passed) {
    return { ...base, unlocked: true, locked_reason: null, history, required_count: gate.required_count };
  }
  return { ...base, unlocked: false, locked_reason: gate.reason, history, required_count: gate.required_count };
}

async function submitAction(cfg, auth, exam, selections) {
  const valid = validateSelections(selections, exam, { complete: true });
  if (!valid.ok) return { status: 400, body: { ok: false, error: valid.error } };

  if (auth.preview) {
    const correctCount = grade(selections, exam);
    const score = scoreFor(correctCount, exam);
    return {
      status: 200,
      body: {
        ok: true,
        exam_key: exam.exam_key,
        score,
        passing_score: exam.passing_score,
        passed: isPassed(score, exam),
        preview: true,
      },
    };
  }

  const gate = await unlockStatus(cfg, auth.session, exam);
  const priorRows = await ownAttempts(cfg, auth.session, exam.exam_key);
  const prior = attemptSummary(priorRows, exam);
  // Already-passed attempts stay valid, so the gate is re-evaluated only while
  // the learner has not yet passed. A forged submit cannot upgrade a fail.
  if (!gate.unlocked && !prior.passed) {
    return { status: 403, body: { ok: false, error: "This assessment is still locked", locked_reason: gate.reason } };
  }

  const correctCount = grade(selections, exam);
  const score = scoreFor(correctCount, exam);
  const passed = isPassed(score, exam);
  await recordAttempt(cfg, auth.session, exam, { score, passed });

  const rows = await ownAttempts(cfg, auth.session, exam.exam_key);
  return {
    status: 200,
    body: {
      ok: true,
      exam_key: exam.exam_key,
      score,
      passing_score: exam.passing_score,
      passed,
      correct_count: correctCount,
      question_count: exam.questions.length,
      history: attemptSummary(rows, exam),
      next_phase_unlocked: passed ? nextPhaseAfter(exam) : null,
    },
  };
}

// Which phase a pass opens, or null for the final assessment.
function nextPhaseAfter(exam) {
  const match = /^phase_([1-4])$/.exec(exam.exam_key);
  if (!match) return null;
  const next = Number(match[1]) + 1;
  if (next > 4) return "final";
  return `phase_${next}`;
}

module.exports = async function academyExam(req, res) {
  noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!allowedOrigin(req.headers.origin)) return send(res, 403, { ok: false, error: "Forbidden" });

  const parsed = parseBody(req);
  if (parsed.error) return send(res, 400, { ok: false, error: parsed.error });
  const { body } = parsed;

  const exam = validateExamKey(body.exam_key);
  if (!exam) return send(res, 404, { ok: false, error: "Assessment not found" });

  if (body.action === "submit") {
    if (typeof body.exam_version !== "string" || body.exam_version !== exam.exam_version) {
      return send(res, 409, {
        ok: false,
        error: "Current assessment version is required",
        exam_version: exam.exam_version,
      });
    }
  }

  let cfg;
  try { cfg = config(); } catch {
    return send(res, 503, { ok: false, error: "Academy service unavailable" });
  }

  try {
    const auth = await authenticate(req, body, cfg);
    if (auth.error) return send(res, 403, { ok: false, error: auth.error });

    if (body.action === "load") return send(res, 200, await loadAction(cfg, auth, exam));

    if (!plainObject(body.selections)) return send(res, 400, { ok: false, error: "Selections must be an object" });
    const result = await submitAction(cfg, auth, exam, body.selections);
    return send(res, result.status, result.body);
  } catch (error) {
    console.error("academy-exam", error && error.message ? error.message : "request failed");
    return send(res, 503, { ok: false, error: "Assessment service unavailable" });
  }
};

module.exports._test = {
  assessments,
  EXAM_KEYS,
  grade,
  scoreFor,
  isPassed,
  validateSelections,
  publicQuestions,
  attemptSummary,
  unlockStatus,
  nextPhaseAfter,
  PHASE_TITLES,
  classKeysForPhase,
};
