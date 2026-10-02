"use strict";

// exam.client.test.js — the REAL exam client from academy-dashboard.html driven
// through its full lifecycle against the REAL api/academy-exam.js handler and
// the in-memory Supabase stand-in (the same harness that runs the Quick Check
// client tests). Nothing here re-implements the client, so it cannot drift.
//
// What it proves, end to end, in a browser-shaped world:
//   * the intro renders question count, passing score and a Begin control,
//     and the load request is exactly { action, exam_key, preview } — nothing
//     else, and never a key;
//   * the browser never receives an answer key: load bodies carry only
//     id/prompt/options with id/text options, and the rendered DOM is free of
//     correct-option markers;
//   * answering every question correctly through the real button + Next/Submit
//     controls drives one server submit whose selections are exactly the
//     chosen option ids, and a pass updates the client mirror, the server
//     attempt rows, the phase status and the next-phase unlock;
//   * a sub-threshold run paints the fail state, records the attempt
//     server-side, and the retake path works and keeps the highest score;
//   * an already-passed exam reopens into a read-only summary, never a retake;
//   * a locked exam shows the server's locked_reason and no way to begin;
//   * the final assessment gates on all four phase exams and, once passed,
//     turns the certificate card into a Download Certificate link.
//
// Run: node --test assistara-local-v9/api/exam.client.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSession } = require("./_qc-harness.js");
const bank = require("./_exam-bank.js");
const { PHASE_CLASS_KEYS, ALL_CLASS_KEYS } = require("./_curriculum.js");

const EXAM_BY_KEY = new Map(bank.map(exam => [exam.exam_key, exam]));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const settle = async () => { for (let i = 0; i < 12; i++) await sleep(2); };

const EXAM_ROUTE = "/api/academy-exam";
function examRequests(session, action) {
  return session.network.filter(e => e.url === EXAM_ROUTE && e.action === action);
}

// The server gate reads academy_class_progress, so put the learner at the point
// where a phase exam is genuinely unlocked: every class in that phase complete.
function completePhaseClasses(session, phaseNumber) {
  for (const classKey of PHASE_CLASS_KEYS.get(phaseNumber)) {
    session.store.progress.set("user-1|" + classKey, {
      completed: true,
      completed_at: new Date().toISOString(),
    });
  }
}

function seedAttempt(session, examKey, score, passed, attemptedAt) {
  const list = session.store.attempts.get("user-1|" + examKey) || [];
  list.push({
    user_id: "user-1",
    exam_key: examKey,
    exam_version: EXAM_BY_KEY.get(examKey).exam_version,
    score,
    passing_score: 80,
    passed,
    attempted_at: attemptedAt || new Date().toISOString(),
  });
  session.store.attempts.set("user-1|" + examKey, list);
}

// Client-side helpers: the mirror `completed` set and `examAttempts` are what
// phaseStatus()/bestExam()/renderCertificate() read, so seed them alongside the
// authoritative store rows when a test needs the dashboard to see graduation.
function completeAllClassesMirror(session) {
  for (const classKey of ALL_CLASS_KEYS) session.qc.completed.add(classKey);
}
function passExamMirror(session, examKey, score) {
  session.qc.passExam(examKey, score === undefined ? 100 : score);
}

// The exam client re-renders the whole lesson after each answer click, exactly
// like the Quick Check, so every live query must happen fresh from the DOM.
function liveButtons(session, selector) {
  return Array.from(session.document.getElementById("courseView").querySelectorAll(selector));
}
function clickButton(session, id) {
  const button = session.document.getElementById("courseView").querySelector("#" + id);
  assert.ok(button, "expected a #" + id + " button in the live DOM");
  button.click();
}
function clickOption(session, optionId) {
  const button = liveButtons(session, ".answer")
    .find(btn => String(btn.dataset.optid) === optionId);
  assert.ok(button, "expected an answer button for option " + optionId);
  button.click();
}

// Answer one whole exam. `wantCorrect` true picks the bank's correct_option_id,
// false picks a distractor (one step past the correct option, wrapping), so the
// run really exercises the server grader from the learner's actual controls.
function answerAll(session, exam, wantCorrect) {
  assert.ok(exam, "exam must exist in the bank");
  clickButton(session, "examBegin");
  const questions = exam.questions;
  for (let qi = 0; qi < questions.length; qi++) {
    const question = questions[qi];
    const correctIndex = question.options.findIndex(o => o.id === question.correct_option_id);
    const choice = wantCorrect
      ? question.correct_option_id
      : question.options[(correctIndex + 1) % question.options.length].id;
    clickOption(session, choice);
    const last = qi === questions.length - 1;
    clickButton(session, last ? "examFinish" : "examNext");
  }
}

// Every load body a browser ever receives must be key-free and shaped exactly.
function assertKeyFreeLoadBody(body) {
  assert.equal(body.ok, true);
  const serialized = JSON.stringify(body);
  for (const token of ["correct_option_id", "correct_index", "isCorrect", "answerKey"]) {
    assert.equal(serialized.includes(token), false, "load body leaked " + token);
  }
  assert.ok(Array.isArray(body.questions) && body.questions.length > 0);
  for (const question of body.questions) {
    assert.deepEqual(Object.keys(question).sort(), ["id", "options", "prompt"]);
    assert.ok(Array.isArray(question.options) && question.options.length >= 2);
    for (const option of question.options) {
      assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
    }
  }
}

test("a phase exam loads into an intro with no answer key in the DOM", async () => {
  const session = createSession();
  try {
    completePhaseClasses(session, 1);
    await session.qc.openExamView("phase_1");

    const loads = examRequests(session, "load");
    assert.equal(loads.length, 1, "opening an exam must load it exactly once");
    const entry = loads[0];
    assert.equal(entry.preview, false, "the learner client must never run preview");
    assert.equal(entry.status, 200);
    assert.deepEqual(
      Object.keys(entry.request).sort(),
      ["action", "exam_key", "preview"],
      "the load request must carry nothing but action/exam_key/preview",
    );
    assert.equal(entry.request.exam_key, "phase_1");
    assert.equal(entry.request.action, "load");
    assertKeyFreeLoadBody(entry.body);
    assert.equal(entry.body.unlocked, true);
    assert.equal(entry.body.question_count, 10);
    assert.equal(entry.body.passing_score, 80);

    const host = session.document.getElementById("courseView");
    const html = host.innerHTML;
    assert.match(html, /ACADEMY ASSESSMENT/);
    assert.match(html, /10 questions/);
    assert.match(html, /80%/);
    assert.ok(host.querySelector("#examBegin"), "the intro must offer Begin Exam");
    assert.equal(liveButtons(session, ".answer").length, 0,
      "the intro must not show answer buttons");

    // The loaded questions the client sanitised hold only safe fields.
    assert.equal(session.qc.examSanitizeLoad ? true : false, true);
    const loaded = session.qc.examSanitizeLoad(entry.body, "phase_1");
    for (const question of loaded.questions) {
      assert.deepEqual(Object.keys(question).sort(), ["id", "options", "prompt"]);
      for (const option of question.options) {
        assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
      }
    }
  } finally {
    session.dispose();
  }
});

test("a fully correct run passes, records server-side and unlocks Phase 2", async () => {
  const session = createSession();
  try {
    const exam = EXAM_BY_KEY.get("phase_1");
    completePhaseClasses(session, 1);
    await session.qc.openExamView("phase_1");
    answerAll(session, exam, true);
    await settle();

    const submits = examRequests(session, "submit");
    assert.equal(submits.length, 1);
    const entry = submits[0];
    assert.equal(entry.status, 200);
    assert.equal(entry.preview, false);
    assert.deepEqual(
      Object.keys(entry.request).sort(),
      ["action", "exam_key", "exam_version", "preview", "selections"],
      "the submit request must carry only the allow-listed fields",
    );
    assert.equal(entry.request.action, "submit");
    assert.equal(entry.request.exam_key, "phase_1");
    assert.equal(entry.request.exam_version, exam.exam_version);
    assert.deepEqual(
      entry.request.selections,
      Object.fromEntries(exam.questions.map(q => [q.id, q.correct_option_id])),
      "the learner's selections must be exactly the choices they clicked",
    );

    const out = entry.body;
    assert.equal(out.ok, true);
    assert.equal(out.passed, true);
    assert.equal(out.score, 100);
    assert.equal(out.passing_score, 80);
    assert.equal(out.correct_count, 10);
    assert.equal(out.question_count, 10);
    assert.equal(out.next_phase_unlocked, "phase_2");
    const serialized = JSON.stringify(out);
    for (const token of ["correct_option_id", "correct_index", "isCorrect", "results", "feedback"]) {
      assert.equal(serialized.includes(token), false, "submit body leaked " + token);
    }

    // Server-owned persistence.
    const rows = session.store.attempts.get("user-1|phase_1");
    assert.equal(rows.length, 1, "a pass must append exactly one attempt row");
    assert.equal(rows[0].passed, true);
    assert.equal(rows[0].score, 100);

    // Client mirror + unlock chain.
    const mirror = session.qc.examAttempts.filter(a => a.exam_key === "phase_1");
    assert.equal(mirror.length, 1);
    assert.equal(mirror[0].passed, true);
    assert.equal(session.qc.phaseStatus(0).key, "passed");
    assert.equal(session.qc.isPhaseUnlocked(1), true,
      "passing Phase 1 must unlock Phase 2 in the client's own progression");

    // Result view.
    const host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /ASSESSMENT PASSED/);
    assert.match(host.innerHTML, /Score: 100%/);
    const progress = host.querySelector("#examProgress");
    assert.ok(progress, "a pass must offer the Continue control");
    assert.match(progress.textContent, /Continue to Phase 2/);

    // The rendered result must not contain answer-key vocabulary.
    for (const token of ["correct_option_id", "correct_index", "isCorrect", "data-correct"]) {
      assert.equal(host.innerHTML.includes(token), false, "result DOM leaked " + token);
    }
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("a failing run records the attempt and the retake improves to a pass", async () => {
  const session = createSession();
  try {
    const exam = EXAM_BY_KEY.get("phase_1");
    completePhaseClasses(session, 1);
    await session.qc.openExamView("phase_1");
    answerAll(session, exam, false);
    await settle();

    let submits = examRequests(session, "submit");
    assert.equal(submits.length, 1);
    assert.equal(submits[0].body.ok, true);
    assert.equal(submits[0].body.passed, false);
    assert.equal(submits[0].body.score, 0);
    assert.equal(submits[0].body.next_phase_unlocked, null);
    let rows = session.store.attempts.get("user-1|phase_1");
    assert.equal(rows.length, 1, "a failing attempt must still be recorded");
    assert.equal(rows[0].passed, false);

    let host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /ASSESSMENT NOT PASSED/);
    assert.match(host.innerHTML, /Your score: 0%/);
    const retry = host.querySelector("#examRetry2");
    assert.ok(retry, "a failing run must offer Retake Assessment");
    assert.notEqual(session.qc.phaseStatus(0).key, "passed",
      "a failing exam must not mark the phase passed");
    assert.equal(session.qc.isPhaseUnlocked(1), false,
      "a failing Phase 1 exam must not unlock Phase 2");

    // Retake from the fail card: fresh load, then a perfect run.
    retry.click();
    await settle();
    assert.equal(examRequests(session, "load").length, 2, "retaking must load the exam again");
    answerAll(session, exam, true);
    await settle();

    submits = examRequests(session, "submit");
    assert.equal(submits.length, 2);
    assert.equal(submits[1].body.passed, true);
    assert.equal(submits[1].body.score, 100);
    rows = session.store.attempts.get("user-1|phase_1");
    assert.equal(rows.length, 2, "every attempt must append, never overwrite");
    assert.deepEqual(rows.map(r => r.passed), [false, true]);
    assert.equal(session.qc.bestExam("phase_1").score, 100,
      "the highest score must win, not the last attempt");
    assert.equal(session.qc.phaseStatus(0).key, "passed");
    assert.equal(session.qc.isPhaseUnlocked(1), true);

    host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /ASSESSMENT PASSED/);
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("an already-passed exam reopens as a read-only summary, never a retake", async () => {
  const session = createSession();
  try {
    // Passed attempt at 82 with no class completion at all: the history pass
    // must bypass the class gate for an already-graduated phase exam.
    seedAttempt(session, "phase_1", 82, true);
    await session.qc.openExamView("phase_1");

    const loads = examRequests(session, "load");
    assert.equal(loads.length, 1);
    assert.equal(loads[0].body.ok, true);
    assert.equal(loads[0].body.history.passed, true);
    assert.equal(loads[0].body.history.best_score, 82);

    const host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /ALREADY PASSED/);
    assert.match(host.innerHTML, /Highest score: 82%/);
    assert.match(host.innerHTML, /Attempts: 1/);
    assert.ok(host.querySelector("#examBackDone"), "the summary must offer a way back");
    assert.equal(host.querySelector("#examBegin"), null,
      "an already-passed exam must not offer a retake");
    assert.equal(liveButtons(session, ".answer").length, 0);

    // No submit must ever fire from the already-passed view.
    assert.equal(examRequests(session, "submit").length, 0);
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("a locked exam shows the server's reason and no way to begin", async () => {
  const session = createSession();
  try {
    // No completed classes: Phase 1 exam stays locked server-side.
    await session.qc.openExamView("phase_1");

    const loads = examRequests(session, "load");
    assert.equal(loads.length, 1);
    assert.equal(loads[0].body.ok, true);
    assert.equal(loads[0].body.unlocked, false);
    assert.match(loads[0].body.locked_reason, /Complete all 22 Phase 1 classes/);

    const host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /Complete all 22 Phase 1 classes/);
    assert.ok(host.querySelector("#examBackLocked"), "the locked view must offer a way back");
    assert.equal(host.querySelector("#examBegin"), null);
    assert.equal(liveButtons(session, ".answer").length, 0);
    assert.equal(examRequests(session, "submit").length, 0);
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("the final assessment gates on all four phase exams, not fewer", async () => {
  const session = createSession();
  try {
    // Only phases 1-3 passed: final must stay locked.
    for (let phase = 1; phase <= 3; phase++) seedAttempt(session, "phase_" + phase, 95, true);
    await session.qc.openExamView("final");

    let loads = examRequests(session, "load");
    assert.equal(loads.length, 1);
    assert.equal(loads[0].body.ok, true);
    assert.equal(loads[0].body.unlocked, false, "three of four phases must not unlock the final");
    assert.match(loads[0].body.locked_reason, /Pass every phase exam/);
    let host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /Pass every phase exam/);
    assert.ok(host.querySelector("#examBackLocked"));
    assert.equal(host.querySelector("#examBegin"), null);

    // Pass Phase 4, then the final loads as a 15-question assessment.
    seedAttempt(session, "phase_4", 98, true);
    await session.qc.openExamView("final");
    loads = examRequests(session, "load");
    assert.equal(loads.length, 2);
    assert.equal(loads[1].body.unlocked, true);
    assert.equal(loads[1].body.question_count, 15);
    host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /15 questions/);
    assert.ok(host.querySelector("#examBegin"));
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("passing the final turns the certificate card into a Download Certificate link", async () => {
  const session = createSession();
  try {
    const final = EXAM_BY_KEY.get("final");
    // Everything before the final: 90 classes + four phase passes, both in the
    // authoritative store and in the client mirror the certificate card reads.
    for (let phase = 1; phase <= 4; phase++) {
      completePhaseClasses(session, phase);
      seedAttempt(session, "phase_" + phase, 100, true);
      passExamMirror(session, "phase_" + phase, 100);
    }
    completeAllClassesMirror(session);
    session.qc.setCurrent(3, null);

    await session.qc.openExamView("final");
    answerAll(session, final, true);
    await settle();

    const submits = examRequests(session, "submit");
    assert.equal(submits.length, 1);
    assert.equal(submits[0].body.passed, true);
    assert.equal(submits[0].body.score, 100);
    const rows = session.store.attempts.get("user-1|final");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].passed, true);

    const host = session.document.getElementById("courseView");
    assert.match(host.innerHTML, /ASSESSMENT PASSED/);
    const progress = host.querySelector("#examProgress");
    assert.ok(progress, "a final pass must offer the certificate control");
    assert.match(progress.textContent, /Go to Certificate/);

    // examRenderResult calls renderCertificate; the card must now offer the
    // branded PDF download rather than a Take Final Exam button or nothing.
    const certActions = session.document.byId.get("certExams");
    assert.ok(certActions, "the #certExams card must have been rendered");
    assert.match(certActions.innerHTML, /href="\/api\/academy-certificate"/);
    assert.match(certActions.innerHTML, /Download Certificate/);
    assert.equal(session.document.byId.get("finalExamTitle").textContent, "Passed");
    assert.equal(session.document.byId.get("certificateStatus").textContent, "Academy Completed");
    assert.equal(
      session.document.byId.get("finalExamText").textContent,
      "Final exam passed with a highest score of 100%.",
      "the Certificate page must report the final result after a pass",
    );
    // The Home "Certificate journey" mirror card was removed as redundant with
    // the Phase Journey, so #homeCertificate no longer exists. The Certificate
    // page is the single source of certificate status and must be asserted
    // instead — see boot-bootstrap.test.js, which guards the removal.

    const reqNames = session.network.map(e => e.url).filter(u => u === EXAM_ROUTE);
    assert.equal(reqNames.length, 2, "one load + one submit for the final");
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});

test("the certificate card stays locked while the final exam is not passed", async () => {
  const session = createSession();
  try {
    // Four phase passes but no final pass: card offers Take Final Exam.
    for (let phase = 1; phase <= 4; phase++) {
      completePhaseClasses(session, phase);
      seedAttempt(session, "phase_" + phase, 100, true);
      passExamMirror(session, "phase_" + phase, 100);
    }
    completeAllClassesMirror(session);
    session.qc.renderCertificate();

    const certActions = session.document.byId.get("certExams");
    assert.match(certActions.innerHTML, /Take Final Exam/);
    const start = session.document.byId.get("startFinalExam");
    assert.ok(start, "the locked card must offer the Take Final Exam control");
    assert.equal(session.document.byId.get("finalExamTitle").textContent, "Ready");
    assert.equal(session.document.byId.get("certificateStatus").textContent, "Certificate Locked");

    // Clicking the CTA opens the real final exam flow.
    start.click();
    await settle();
    const loads = examRequests(session, "load");
    assert.equal(loads.length, 1);
    assert.equal(loads[0].examKey, "final");
    assert.equal(loads[0].body.unlocked, true);
    const host = session.document.getElementById("courseView");
    assert.ok(host.querySelector("#examBegin"), "the final exam must open from the card CTA");
    assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
  } finally {
    session.dispose();
  }
});