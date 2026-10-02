"use strict";

// quick-check.client.test.js — permanent table-driven regression over EVERY
// class key in QC_ADAPTERS.
//
// What it runs
//   The REAL inline script from academy-dashboard.html (the same bytes the
//   browser executes) inside a dependency-free minimal DOM, wired to the REAL
//   api/academy-quick-check.js handler backed by an in-memory stand-in for
//   Supabase/GoTrue and the academy_complete_class RPC. Nothing here is a
//   re-implementation of the client, so the test cannot drift from it.
//
// Why it exists
//   The Quick Check used to be located by matching the visible heading text
//   `=== "QUICK CHECK"`. Ten Phase 1 renderers emitted "🧠 QUICK CHECK", so
//   mountQuickCheck() returned early, the server grading path was never wired,
//   and those classes could never be completed — the whole Academy was blocked
//   at Class 1. Nothing in the suite caught it.
//
// Per class it asserts
//   1  the class renderer opens
//   2  exactly one Quick Check container exists
//   3  mountQuickCheck finds that container
//   4  questions load and the browser holds no answer key
//   5  answer controls are wired (a click records exactly that option)
//   6  partial selection is not submittable
//   7  Check Answers issues exactly one server `check` request
//   8  a wrong response paints only the selected answer's server feedback
//   9  a wrong response never marks another option as correct
//  10  retry after a wrong answer works
//  11  an all-correct response produces the completed state
//  12  completion updates progression
//  13  the next class unlocks where applicable
//  14  no duplicate completion side effect occurs
//
// Run: node --test assistara-local-v9/api/quick-check.client.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createSession, readInlineScript } = require("./_qc-harness.js");
const bank = require("./_quick-check-bank.js");

const DASHBOARD = path.resolve(__dirname, "..", "academy-dashboard.html");

// The ten classes that were detached from the server path by the emoji heading.
// Named explicitly so the regression is visible in the test output rather than
// being an anonymous row in a table.
const PREVIOUSLY_BROKEN = [
  "p1m1c1", "p1m1c2", "p1m1c3", "p1m1c4",
  "p1m2c1", "p1m2c2", "p1m2c3", "p1m2c4",
  "p1m3c1", "p1m3c2",
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Let the async check handler (fetch -> JSON -> render -> re-mount) settle.
const settle = async () => { for (let i = 0; i < 12; i++) await sleep(2); };

function parseKey(classKey) {
  const m = /^p(\d+)m(\d+)c(\d+)$/.exec(classKey);
  if (!m) throw new Error("unrecognised class key " + classKey);
  return { phase: Number(m[1]) - 1, module: Number(m[2]) - 1, ci: Number(m[3]) - 1 };
}

const SET_BY_KEY = new Map(bank.map(set => [set.class_key, set]));

const TABLE = bank.map(set => {
  const at = parseKey(set.class_key);
  const options = set.questions.map(q => q.options.length);
  return {
    classKey: set.class_key,
    ...at,
    questionCount: set.questions.length,
    optionCounts: options,
    correctIndex: set.questions.map(q => q.options.findIndex(o => o.id === q.correct_option_id)),
    hasNextInModule: bank.some(other => {
      const o = parseKey(other.class_key);
      return o.phase === at.phase && o.module === at.module && o.ci === at.ci + 1;
    }),
  };
});

const wrongIndex = (row, qi) => (row.correctIndex[qi] + 1) % row.optionCounts[qi];

// Put the session in the state a real learner is in when they open this class:
// every earlier class completed and every earlier phase exam passed.
function placeLearnerAt(session, row) {
  for (const set of bank) {
    if (set.class_key === row.classKey) break;
    session.qc.completed.add(set.class_key);
  }
  for (let phase = 1; phase <= row.phase; phase++) session.qc.passExam("phase_" + phase, 100);
  session.qc.setCurrent(row.phase, row.module);
}

// An answer click re-renders the whole lesson, so the live DOM must be
// re-queried before every click — exactly as a learner clicks live elements.
function pickAnswer(session, qi, ai) {
  const section = session.qc.qcFindSection();
  assert.ok(section, "no [data-qc-section] container before answering question " + qi);
  const group = section.querySelectorAll(".answers")[qi];
  assert.ok(group, "no answer group for question " + qi);
  const button = group.querySelectorAll("button")[ai];
  assert.ok(button, "no answer button for question " + qi + " option " + ai);
  button.click();
}

function liveCheckButton(session) {
  const section = session.qc.qcFindSection();
  assert.ok(section, "no [data-qc-section] container");
  return section.querySelector('button[id^="check"]');
}

function answerGroups(session) {
  return session.qc.qcFindSection().querySelectorAll(".answers");
}

function checkRequests(session) {
  return session.network.filter(entry => entry.action === "check");
}

function loadRequests(session) {
  return session.network.filter(entry => entry.action === "load");
}

// The per-question feedback block is named differently by each render family:
//   .feedback        renderLesson1-7, 9-20      (legacy Phase 1, 19 renderers)
//   .answerFeedback  renderLesson8              (p1m2c4, a one-off outlier)
//   .quizFeedback    renderLesson21-23, 30-33, renderBrandLesson, renderVisualBrandLesson
// The union below is asserted against the source by the "feedback class names"
// test, so a rename fails loudly instead of silently reading zero nodes.
const FEEDBACK_SELECTOR = ".feedback, .answerFeedback, .quizFeedback";

// Read the painted feedback per question, plus the correct marker on the
// option buttons.
function readPaintedFeedback(session) {
  const section = session.qc.qcFindSection();
  const nodes = section.querySelectorAll(FEEDBACK_SELECTOR);
  return {
    texts: nodes.map(node => node.textContent.trim()),
    markedCorrect: section.querySelectorAll(".correct").length,
    feedbackNodes: nodes.length,
  };
}

// Which option the learner is still shown to have chosen once the answers are
// graded. The feedback paragraph belongs to a specific answer, so the answer
// has to stay visibly marked: the legacy Phase 1 renderers used to make
// `selected` and `correct` mutually exclusive, so a wrong pick came back with
// no class at all and the learner was left with feedback about an answer they
// could no longer identify.
//
// Exactly one option per question may carry it, and a renderer can only ever
// mark the option that was clicked, so this is also the assertion that keeps
// the correct alternative from being revealed by a class change.
function readOwnSelection(session) {
  const section = session.qc.qcFindSection();
  const groups = section.querySelectorAll(".answers");
  return {
    index: groups.map(group => {
      const own = group.querySelectorAll("button.selected");
      assert.equal(own.length, 1, "exactly one option per question must be marked as the learner's own choice");
      return group.querySelectorAll("button").indexOf(own[0]);
    }),
    chosenAndCorrect: section.querySelectorAll(".answers button.selected.correct").length,
  };
}

// ---------------------------------------------------------------------------

test("every legacy answer button marks the learner's own pick independently of grading", () => {
  const source = readInlineScript();
  // The pre-fix form made the two marks mutually exclusive: `selected` while
  // unanswered, `correct` once graded, so a graded wrong pick carried neither.
  // It must not reappear, and every answer button must emit both marks from
  // two independent conditions.
  assert.deepEqual(
    source.match(/Submitted\?\(ai===q\.correct\?'correct':''\):'selected'\)/g) || [],
    [],
    "a renderer still swaps `selected` for `correct` instead of keeping both",
  );
  const both = source.match(/<button class="answer [^']*'\+\([^']*\?'selected ':''\)\+\(/g) || [];
  assert.equal(
    both.length, 20,
    "all 20 legacy Phase 1 answer buttons must mark the learner's own pick independently of the correct mark",
  );
});

test("Quick Check mount hook is structural, never text-based", () => {
  const source = readInlineScript();
  assert.ok(
    !/textContent\.trim\(\)\s*===\s*["']QUICK CHECK["']/.test(source),
    "qcFindSection must not locate the Quick Check by visible heading text",
  );
  assert.ok(
    /section\.lessonSection\[data-qc-section\]/.test(source),
    "qcFindSection must select section.lessonSection[data-qc-section]",
  );
});

test("no Quick Check heading uses the emoji variant", () => {
  const source = readInlineScript();
  const headings = [...source.matchAll(/<div class="eyebrow">([^<]*QUICK CHECK[^<]*)<\/div>/g)]
    .map(match => match[1].trim());
  assert.ok(headings.length > 0, "expected Quick Check headings in the source");

  // Most renderers pick the heading with a template conditional, so remove that
  // expression first, then require the remaining literal text to be a label
  // this test already knows. An emoji or any extra word therefore fails here.
  const KNOWN = new Set([
    "",
    "COMPLETION",
    "QUICKCHECK",
    "✓QUICKCHECKCOMPLETE",
    "QUICKCHECKUNAVAILABLE",
    "QUICKCHECKREVIEW",
  ]);
  const offenders = [];
  for (const raw of headings) {
    const literal = raw
      .replace(/\$\{done\?"[^"]*":"[^"]*"\}/g, "")
      .replace(/'\+\(done\?"[^"]*":"[^"]*"\)\+'/g, "")
      .replace(/["'${}()+\s]/g, "");
    if (!KNOWN.has(literal)) offenders.push(raw);
  }
  assert.deepEqual(offenders, [], "every Quick Check heading must read QUICK CHECK");
  // The rendered heading is asserted per class below; this only guards the
  // markup. A file-wide emoji ban would false-positive on the Notion module icon
  // and on the comment that documents the historical defect.
});

// Keeps FEEDBACK_SELECTOR honest: if a renderer renames its feedback block the
// lifecycle test would silently read zero feedback nodes, so pin the set.
test("feedback class names are exactly the ones the test reads", () => {
  const source = readInlineScript();
  const names = new Set();
  for (const match of source.matchAll(/class="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token && /feedback/i.test(token)) names.add(token);
    }
  }
  assert.deepEqual(
    [...names].sort(),
    ["answerFeedback", "feedback", "quizFeedback"],
    "update FEEDBACK_SELECTOR in this test if a feedback class name changes",
  );
  const selectors = FEEDBACK_SELECTOR.split(",").map(part => part.trim().replace(/^\./, "")).sort();
  assert.deepEqual([...names].sort(), selectors, "the selector union must match the emitted class names");
});

test("every QC_ADAPTERS render target carries the [data-qc-section] hook", () => {
  const source = readInlineScript();
  const adapters = source.slice(source.indexOf("const QC_ADAPTERS"), source.indexOf("const qcLoaded"));
  const targets = [...adapters.matchAll(/render:\s*([A-Za-z0-9_]+)/g)].map(m => m[1]);
  assert.equal(targets.length, TABLE.length, "QC_ADAPTERS entry count must match the question bank");
  assert.equal(new Set(targets).size, targets.length, "QC_ADAPTERS render targets must be unique");

  const carryingHook = new Set();
  for (const m of source.matchAll(/data-qc-section/g)) {
    const before = source.lastIndexOf("function ", m.index);
    const name = /function ([A-Za-z0-9_]+)\(/.exec(source.slice(before, before + 90));
    if (name) carryingHook.add(name[1]);
  }
  // renderLesson24-29 are thin wrappers that delegate to the shared brand
  // renderers, which carry the hook themselves.
  const delegates = {
    renderLesson24: "renderBrandLesson", renderLesson25: "renderBrandLesson", renderLesson26: "renderBrandLesson",
    renderLesson27: "renderVisualBrandLesson", renderLesson28: "renderVisualBrandLesson", renderLesson29: "renderVisualBrandLesson",
  };
  const missing = targets.filter(target => {
    if (carryingHook.has(target)) return false;
    const delegate = delegates[target];
    return !delegate || !carryingHook.has(delegate);
  });
  assert.deepEqual(missing, [], "renderers that produce Quick Check DOM without the hook");
  assert.ok(carryingHook.has("renderBrandLesson"));
  assert.ok(carryingHook.has("renderVisualBrandLesson"));
});

test("a class with questions but no mountable container warns", async () => {
  const session = createSession();
  try {
    const row = TABLE[0];
    placeLearnerAt(session, row);
    await session.qc.openClass(row.ci);
    // Simulate a renderer that lost the hook, then re-mount.
    const section = session.qc.qcFindSection();
    section.remove();
    session.warnings.length = 0;
    session.qc.mountQuickCheck(row.classKey);
    assert.equal(
      session.warnings.filter(line => line.includes(row.classKey) && line.includes("data-qc-section")).length,
      1,
      "expected one console.warn naming the class and the missing container",
    );
  } finally {
    session.dispose();
  }
});

for (const row of TABLE) {
  const tag = PREVIOUSLY_BROKEN.includes(row.classKey) ? " [was broken]" : "";

  test(`${row.classKey} mounts and completes via the server${tag}`, async () => {
    const session = createSession();
    try {
      const set = SET_BY_KEY.get(row.classKey);
      const { qc, document, store, network } = session;

      placeLearnerAt(session, row);
      const unlockedBefore = row.hasNextInModule ? qc.isClassUnlocked(row.phase, row.module, row.ci + 1) : null;
      if (row.hasNextInModule) assert.equal(unlockedBefore, false, "the next class must start locked");

      // -- 1. the class renderer opens ------------------------------------
      network.length = 0;
      await qc.openClass(row.ci);
      const view = document.getElementById("courseView");
      assert.ok(view.querySelector(".lessonShell"), "the lesson shell did not render");
      assert.equal(loadRequests(session).length, 1, "opening a class must load its Quick Check exactly once");
      assert.equal(loadRequests(session)[0].body.ok, true);

      // -- 2. exactly one Quick Check container ---------------------------
      const containers = view.querySelectorAll("section.lessonSection[data-qc-section]");
      assert.equal(containers.length, 1, "expected exactly one Quick Check container");

      // -- 3. mountQuickCheck finds it -------------------------------------
      const section = qc.qcFindSection();
      assert.ok(section, "qcFindSection returned null");
      assert.equal(section, containers[0], "qcFindSection must return the rendered container");

      // The heading the learner actually sees is Academy-standard. This is
      // cosmetic, not functional: the mount above already worked without it.
      const eyebrow = section.querySelector(".eyebrow");
      assert.ok(eyebrow, "the Quick Check section must have an eyebrow heading");
      assert.equal(
        eyebrow.textContent.trim(),
        "QUICK CHECK",
        "the rendered Quick Check heading must read exactly QUICK CHECK",
      );

      // -- 4. questions load, and the browser holds no answer key ----------
      const adapter = qc.QC_ADAPTERS[row.classKey];
      assert.equal(adapter.lesson.questions.length, row.questionCount, "question count");
      assert.deepEqual(
        adapter.lesson.questions.map(q => q.id),
        set.questions.map(q => q.id),
        "loaded question ids must match the bank",
      );
      for (const question of adapter.lesson.questions) {
        assert.ok(!Object.prototype.hasOwnProperty.call(question, "correct"), "browser must not hold a correct-option index");
        assert.ok(!("correct_option_id" in question), "browser must not hold the answer key");
        assert.deepEqual(Object.keys(question).sort(), ["a", "id", "optionIds", "q"]);
        for (const id of question.optionIds) assert.ok(!id.includes("correct"), "option id must not encode correctness");
      }
      assert.equal(answerGroups(session).length, row.questionCount, "one answer group per question");

      // -- 5. answer controls are wired ------------------------------------
      const firstWrong = wrongIndex(row, 0);
      pickAnswer(session, 0, firstWrong);
      const selections = qc.qcSelectionMap(adapter);
      assert.equal(Object.keys(selections).length, 1, "clicking an answer must record exactly one selection");
      assert.equal(selections[set.questions[0].id], set.questions[0].options[firstWrong].id);

      // -- 6. partial selection is not submittable ------------------------
      assert.equal(qc.qcAllAnswered(adapter), false, "a partial Quick Check must not count as answered");
      network.length = 0;
      const partialButton = liveCheckButton(session);
      if (partialButton && !partialButton.disabled) {
        partialButton.click();
        await settle();
      }
      assert.equal(checkRequests(session).length, 0, "an incomplete Quick Check must not reach the grader");
      assert.equal(qc.completed.has(row.classKey), false);

      // -- 7. wrong answers produce exactly one server check ---------------
      for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, wrongIndex(row, qi));
      assert.equal(qc.qcAllAnswered(adapter), true);
      network.length = 0;
      const wrongButton = liveCheckButton(session);
      assert.ok(wrongButton, "no Check Answers button");
      assert.equal(wrongButton.disabled, false, "Check Answers must be enabled once every question is answered");
      wrongButton.click();
      await settle();

      const wrongChecks = checkRequests(session);
      assert.equal(wrongChecks.length, 1, "one wrong submission must issue exactly one server check request");
      const wrongResponse = wrongChecks[0].body;
      assert.equal(wrongResponse.ok, true);
      assert.equal(wrongResponse.completed, false, "a wrong submission must not complete the class");
      assert.equal(wrongResponse.results.length, row.questionCount);
      assert.ok(wrongResponse.results.every(r => r.correct === false), "every answer was wrong");

      // the client sent selections only — no key, no extra fields
      assert.deepEqual(Object.keys(wrongChecks[0].request).sort(), ["action", "class_key", "preview", "question_set_version", "selections"]);

      // -- 8. only the selected answer's server feedback is painted --------
      const paintedWrong = readPaintedFeedback(session);
      assert.equal(paintedWrong.feedbackNodes, row.questionCount, "one feedback block per question");
      wrongResponse.results.forEach((result, qi) => {
        assert.equal(
          paintedWrong.texts[qi],
          result.feedback,
          "question " + qi + " must paint exactly the server feedback for the selected option",
        );
        assert.ok(paintedWrong.texts[qi].length > 0, "question " + qi + " feedback must not be empty");
      });

      // -- 9. a wrong response reveals no other option as correct ----------
      assert.equal(paintedWrong.markedCorrect, 0, "a wrong submission must not mark any option correct");
      assert.equal(qc.completed.has(row.classKey), false, "a wrong submission must not complete the class");
      assert.equal(store.completeCalls.filter(c => c.classKey === row.classKey).length, 0, "no completion RPC for a wrong submission");

      // -- 9b. the learner's own wrong pick is still shown as their pick ----
      // The learner must be able to see which answer the feedback above is
      // about. `selected` is 1 per question and `correct` is still 0, so the
      // answer stays identifiable without anything naming the right one.
      const ownAfterWrong = readOwnSelection(session);
      assert.equal(ownAfterWrong.index.length, row.questionCount, "one marked option per question after grading");
      ownAfterWrong.index.forEach((ai, qi) => {
        assert.equal(
          ai, wrongIndex(row, qi),
          "question " + qi + " must still show the option the learner chose, not drop the mark",
        );
      });
      assert.equal(
        ownAfterWrong.chosenAndCorrect, 0,
        "a wrong submission must not leave any option marked as both chosen and correct",
      );

      // -- 10. retry after a wrong answer works ----------------------------
      // Re-answer question 0 correctly while the rest stay wrong, then submit.
      pickAnswer(session, 0, row.correctIndex[0]);
      network.length = 0;
      liveCheckButton(session).click();
      await settle();
      const retryChecks = checkRequests(session);
      assert.equal(retryChecks.length, 1, "retry must issue exactly one server check request");
      const retryFeedback = readPaintedFeedback(session);
      assert.equal(
        retryFeedback.texts[0],
        retryChecks[0].body.results[0].feedback,
        "the retried question must paint the correct answer's server feedback",
      );
      assert.notEqual(
        retryFeedback.texts[0],
        wrongResponse.results[0].feedback,
        "correct and wrong feedback for the same question must differ",
      );
      assert.equal(retryChecks[0].body.results[0].correct, true);
      assert.equal(retryChecks[0].body.completed, false, "a partial fix must not complete the class");
      assert.equal(qc.completed.has(row.classKey), false);

      // A correct answer carries both marks: it is what the learner chose, and
      // it is right. Keeping them independent is what lets the wrong case above
      // keep its mark without borrowing the correct styling.
      const ownAfterRetry = readOwnSelection(session);
      assert.equal(ownAfterRetry.index[0], row.correctIndex[0], "the retried question must show the new choice");
      assert.equal(
        ownAfterRetry.chosenAndCorrect, 1,
        "the one correct answer must be both the learner's choice and marked correct",
      );

      // -- 11. all-correct produces the completed state --------------------
      for (let qi = 1; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
      network.length = 0;
      liveCheckButton(session).click();
      await settle();
      const finalChecks = checkRequests(session);
      assert.equal(finalChecks.length, 1, "the final submission must issue exactly one server check request");
      assert.equal(finalChecks[0].body.completed, true, "an all-correct submission must complete the class server-side");
      assert.ok(finalChecks[0].body.results.every(r => r.correct === true));
      assert.equal(qc.completed.has(row.classKey), true, "the client must reflect server-owned completion");

      // -- 12. completion updates progression -----------------------------
      const progress = store.progress.get("user-1|" + row.classKey);
      assert.ok(progress && progress.completed === true, "authoritative progress row must be completed");
      assert.ok(progress.completed_at, "completed_at must be recorded");
      const pct = document.getElementById("coursePct").textContent;
      assert.match(pct, /^\d+% classes complete$/, "progress must be recomputed after completion");

      // -- 13. the next class unlocks where applicable ---------------------
      if (row.hasNextInModule) {
        assert.equal(qc.isClassUnlocked(row.phase, row.module, row.ci + 1), true, "the next class must unlock");
      }

      // -- 14. no duplicate completion side effect ------------------------
      assert.equal(
        store.completeCalls.filter(c => c.classKey === row.classKey).length,
        1,
        "completing a class must call academy_complete_class exactly once",
      );

      // Reopening a completed class: reviewable, still complete, no new writes.
      network.length = 0;
      await qc.openClass(row.ci);
      const reopened = qc.qcFindSection();
      assert.ok(reopened, "a completed class must still render its Quick Check section");
      assert.equal(view.querySelectorAll("section.lessonSection[data-qc-section]").length, 1);
      assert.equal(
        store.completeCalls.filter(c => c.classKey === row.classKey).length,
        1,
        "reopening a completed class must not re-complete it",
      );
      assert.equal(qc.completed.has(row.classKey), true);
      assert.ok(
        reopened.className.includes("quizCompleteState") || reopened.querySelector(".brandNextUnlock, .completeMoment, .quizComplete, .brandLessonComplete"),
        "a completed class must render a completion state",
      );

      // The ten classes detached by the emoji heading must now reach the grader.
      if (PREVIOUSLY_BROKEN.includes(row.classKey)) {
        assert.equal(wrongChecks.length, 1, row.classKey + " must issue a server check request");
        assert.equal(finalChecks.length, 1, row.classKey + " must complete through the server");
        assert.equal(store.completeCalls.filter(c => c.classKey === row.classKey).length, 1);
      }

      // No mount warnings anywhere in the lifecycle.
      assert.deepEqual(
        session.warnings.filter(line => line.includes("data-qc-section")),
        [],
        "a healthy class must not warn about a missing container",
      );
      assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
    } finally {
      session.dispose();
    }
  });
}

// ===========================================================================
// STEP 2C - reopening a completed class
// ===========================================================================
//
// Completion is server-owned and permanent: there is no retake, so a completed
// class has nothing left to answer. What it must still have is the lesson and a
// way forward.
//
// Reopening used to give 20 of 33 classes a live answer grid back and p1m2c4 a
// live Check Answers + Complete Class pair, because the renderers' completion
// branches are reached by a `done` conditional that is emitted OUTSIDE the class
// attribute:
//
//   <section class="lessonSection" data-qc-section '+(done?"quizCompleteState":"")+'>
//
// so the token lands as a bare boolean attribute beside data-qc-section,
// `.quizCompleteState` is never set, and the Step 2B.3 `:not(.quizCompleteState)`
// rules stay live.
//
// Step 2C fixes the state rather than the 29 renderers:
// qcNormalizeCompletedState() runs inside mountQuickCheck, the one place all 33
// renderers pass through, and replaces the section's children with one canonical
// card. "Zero answer controls / zero Check-Complete CTAs / zero grading POST"
// is therefore structural - the nodes are removed, not hidden.

const DONE_CARD = ".qcDone";
const DONE_EYEBROW = "\u2713 QUICK CHECK COMPLETE";
// Every answer control, per-question block and submit row the renderers emit.
const ANSWER_CONTROL_SELECTOR = [
  ".answers", ".question", ".quizQ", ".quizBar", ".quizSubmit", ".answer",
  ".radioMark", ".selected", ".correct", ".checkBtn", ".brandQuiz",
].join(", ");
// Every control that can reach the grader or the completion RPC.
const GRADING_CTA_SELECTOR = 'button[id^="check"], button[id^="complete"], button[id^="finishLesson"]';

function normaliserSource() {
  const source = readInlineScript();
  const from = source.indexOf("function qcNormalizeCompletedState(");
  const to = source.indexOf("function ctaNext(");
  assert.notEqual(from, -1, "qcNormalizeCompletedState must exist in the dashboard");
  assert.notEqual(to, -1, "ctaNext must exist in the dashboard");
  return source.slice(from, to);
}

test("the completed-state normaliser is wired to the single mount choke point", () => {
  const source = readInlineScript();
  const mount = source.slice(
    source.indexOf("function mountQuickCheck("),
    source.indexOf("function mountQuickCheck(") + 1200,
  );
  assert.match(
    mount,
    /if \(completed\.has\(classKey\)\) qcNormalizeCompletedState\(classKey, section\);/,
    "mountQuickCheck must normalise a completed class, guarded by completed.has(classKey)",
  );
  // The normaliser runs before any wiring, so the section querySelector calls
  // below it find nothing to wire.
  const normaliseAt = mount.indexOf("qcNormalizeCompletedState(classKey, section)");
  const wireAt = mount.indexOf('querySelector(\'button[id^="check"]\')');
  assert.ok(normaliseAt !== -1 && (wireAt === -1 || normaliseAt < wireAt),
    "the normaliser must run before mountQuickCheck looks for a Check Answers button");

  // It shapes the DOM and nothing else: no request, no completion, no control.
  const normaliser = normaliserSource();
  assert.doesNotMatch(
    normaliser,
    /qcPost|submitQuickCheck|markClassComplete|save_draft|academy_complete_class/,
    "the normaliser must never talk to the server",
  );
  assert.doesNotMatch(
    normaliser,
    /id\s*=\s*["'](?:check|complete|finishLesson)/,
    "the normaliser must not emit a Check Answers or Complete Class control",
  );
  // Nodes are moved, never copied: the renderer's own live handlers must survive.
  assert.doesNotMatch(normaliser, /cloneNode|innerHTML\s*=/,
    "the normaliser must reparent the renderer's own nodes so their handlers survive");
  // Idempotent: a second mount on an already-normalised section does nothing.
  assert.match(normaliser, /data-qc-state"\)\s*===\s*"completed"\)\s*return/,
    "the normaliser must be a no-op once the section is already normalised");
});

test("a completed Quick Check has no retake or review-to-pass affordance", () => {
  const source = readInlineScript();
  assert.doesNotMatch(
    source,
    /Review Quick Check|Retake Quick Check|retakeQuickCheck|qcRetake|btnRetake/,
    "a completed Quick Check must not offer a retake",
  );
});

// APPROVED PRE-EXISTING FEATURE, not part of Step 2C and deliberately kept.
//
// keepCompletedModule6TestsVisible() re-attaches a read-only "QUICK CHECK
// REVIEW" panel to a completed Module 6 lesson, and it only fires when the
// section carries `.quizCompleteState` - the very token the renderers emit
// outside the class attribute. So in the baseline the function was dead code and
// the completed p1m6c1-c4 tests stayed hidden on reopen; Step 2C is what brings
// it back. Deleting it would remove approved work, so the invariants below are
// stated as INERT rather than absent: the panel may show the questions and the
// choices, every control in it is disabled, and it never reveals which choice
// was right.
const REVIEW_PANEL_CLASSES = new Set(["p1m6c1", "p1m6c2", "p1m6c3", "p1m6c4"]);
const REVIEW_PANEL = ".completedTestReview";

// Everything a learner can actually press, or that can reach the grader.
function liveControls(root) {
  return Array.from(root.querySelectorAll("button, input, select, textarea"))
    .filter(node => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true");
}

// Answer-shaped nodes that are not part of the approved read-only review panel.
function liveAnswerControls(root) {
  const inReview = (node) => {
    for (let n = node; n; n = n.parentNode) {
      if (n.getAttribute && String(n.getAttribute("class") || "").includes("completedTestReview")) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll(ANSWER_CONTROL_SELECTOR)).filter(node => {
    if (inReview(node)) return false;
    if (node.tagName === "BUTTON" && node.hasAttribute("disabled")) return false;
    return true;
  });
}

test("the approved Module 6 test review stays visible, read-only and key-free on reopen", async () => {
  assert.ok(readInlineScript().includes("function keepCompletedModule6TestsVisible()"),
    "the approved completed-test review must still be shipped");

  for (const classKey of REVIEW_PANEL_CLASSES) {
    const row = TABLE.find(r => r.classKey === classKey);
    const session = createSession();
    try {
      const { qc } = session;
      placeLearnerAt(session, row);
      await qc.openClass(row.ci);
      for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
      liveCheckButton(session).click();
      await settle();
      qc.qcLoaded.delete(row.classKey);
      await qc.openClass(row.ci);
      await settle();

      const section = qc.qcFindSection();
      const panels = Array.from(section.querySelectorAll(REVIEW_PANEL));
      assert.equal(panels.length, 1, classKey + " must show its completed-test review exactly once");
      assert.notEqual(panels[0], section.querySelector(DONE_CARD),
        "the review panel is a sibling of the completion card, never inside it");
      assert.match(panels[0].textContent, /not marked/i,
        "the review panel must say that correct answers are not marked");
      const choices = Array.from(panels[0].querySelectorAll(".answer"));
      assert.equal(choices.length, row.questionCount * row.optionCounts[0],
        "the review panel shows every question and every choice");
      assert.deepEqual(choices.filter(b => !b.hasAttribute("disabled")), [],
        "every reviewed choice must be disabled: this is a record, not a retake");
      assert.deepEqual(liveControls(panels[0]), [], "the review panel must expose no control at all");
      assert.doesNotMatch(panels[0].toHTML(), /class="correct|is correct|right answer/i,
        "the review panel must not mark or leak the answer key");
      assert.equal(liveAnswerControls(section).length, 0,
        "nothing outside the review panel may be an answer control");
      assert.deepEqual(liveControls(section).map(b => b.id),
        [(section.querySelector(".qcDoneActions button") || {}).id],
        "the progression CTA must be the only live control in the whole section");
    } finally {
      session.dispose();
    }
  }

  // ...and it must not leak onto the other classes.
  for (const classKey of ["p1m1c1", "p1m2c4", "p2m1c2", "p2m3c1"]) {
    const row = TABLE.find(r => r.classKey === classKey);
    const session = createSession();
    try {
      const { qc } = session;
      placeLearnerAt(session, row);
      await qc.openClass(row.ci);
      for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
      liveCheckButton(session).click();
      await settle();
      qc.qcLoaded.delete(row.classKey);
      await qc.openClass(row.ci);
      await settle();
      assert.equal(qc.qcFindSection().querySelectorAll(REVIEW_PANEL).length, 0,
        classKey + " has no approved review panel and must not grow one");
    } finally {
      session.dispose();
    }
  }
});

test("the Step 2C styles cannot reach the ACTIVE Quick Check", () => {
  const html = fs.readFileSync(DASHBOARD, "utf8");
  const marker = "STEP 2C - the reopened completed Quick Check";
  const from = html.indexOf(marker);
  assert.notEqual(from, -1, "the Step 2C style block must be documented in the dashboard");
  const block = html.slice(from, html.indexOf("</style>", from));
  // Every selector the step adds has to be reachable only from the completed
  // card, or the approved Step 2B.3 ACTIVE system would be at risk.
  const offenders = [];
  for (const part of block.split("{")) {
    const head = part.slice(part.lastIndexOf("}"));
    if (!head.trim() || /^\s*@/.test(head) || /^[\s\d.@()a-z-]*$/.test(head.trim()) === false) continue;
    if (!head.trim()) continue;
    for (const selector of head.split(",")) {
      const trimmed = selector.trim();
      if (!trimmed || trimmed.startsWith("@") || /^\d|^from$|^to$/.test(trimmed)) continue;
      if (!/^\.qcDone/.test(trimmed)) offenders.push(trimmed);
    }
  }
  assert.deepEqual(offenders, [], "every Step 2C selector must be scoped under .qcDone");
  assert.ok(/\.qcDoneSection/.test(block), "the section marker class must be styled too");
  assert.ok(/prefers-reduced-motion/.test(block), "the entrance animation must be reduced-motion safe");
  assert.doesNotMatch(block, /@keyframes\s+\w*(confetti|burst|pop|shake)/i,
    "the completed card must not animate like a celebration");
});

// The DOM shim hands back Arrays where a browser hands back a NodeList and an
// HTMLCollection. Neither of those has Array methods, so a line that reads
// `node.querySelectorAll("p").filter(...)` passes every test in this file and
// throws a TypeError in production the first time the learner reopens a
// completed class. (It did: Step 2C shipped that line, and only the browser
// found it.) This freezes the DOM collections to the real API surface, and the
// static check above pins every call site in the shipped script.
const ARRAY_ONLY_METHODS = new Set([
  "map", "filter", "find", "findIndex", "flat", "flatMap", "some", "every",
  "reduce", "reduceRight", "slice", "splice", "concat", "join", "includes",
  "indexOf", "lastIndexOf", "at", "fill", "copyWithin", "push", "pop", "shift",
  "unshift", "reverse", "sort", "keys", "values", "entries",
]);

function freezeDomCollections(session) {
  const nodeProto = Object.getPrototypeOf(session.document.body);
  const docProto = Object.getPrototypeOf(session.document);
  const abused = [];
  const freeze = (label, list) => new Proxy(list, {
    get(target, prop) {
      if (typeof prop === "string" && ARRAY_ONLY_METHODS.has(prop)) {
        abused.push(label + "." + prop);
        throw new TypeError(label + "." + prop
          + " is not a function: a browser " + label + " has no Array methods");
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const originalQsa = nodeProto.querySelectorAll;
  const originalQs = nodeProto.querySelector;
  const originalDocQsa = docProto.querySelectorAll;
  const originalChildren = Object.getOwnPropertyDescriptor(nodeProto, "children");
  nodeProto.querySelectorAll = function (selector) {
    return freeze("NodeList", originalQsa.call(this, selector));
  };
  nodeProto.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };
  docProto.querySelectorAll = function (selector) {
    return freeze("NodeList", originalDocQsa.call(this, selector));
  };
  Object.defineProperty(nodeProto, "children", {
    configurable: true,
    get() { return freeze("HTMLCollection", originalChildren.get.call(this)); },
  });
  return {
    abused,
    restore() {
      nodeProto.querySelectorAll = originalQsa;
      nodeProto.querySelector = originalQs;
      docProto.querySelectorAll = originalDocQsa;
      Object.defineProperty(nodeProto, "children", originalChildren);
    },
  };
}

test("the shipped script never calls an Array-only method on a live DOM collection", () => {
  const source = readInlineScript();
  // A NodeList has forEach, length, item and index access. It has no map, filter,
  // find, some, every, reduce, slice or includes.
  const collectionAbuse = /querySelectorAll\((?:[^()]|\([^()]*\))*\)\s*\.\s*(map|filter|find|findIndex|flat|flatMap|some|every|reduce|reduceRight|slice|splice|concat|includes|indexOf|lastIndexOf|at|join)\b/;
  assert.doesNotMatch(source, collectionAbuse,
    "querySelectorAll() returns a NodeList in a browser; wrap it in Array.from() or [...] before using an Array method");
  assert.doesNotMatch(source, /\b(?:children|childNodes)\s*\.\s*(?:slice|filter|map|find|flat|some|every|reduce|concat|includes|indexOf|join|at)\b/,
    "children is an HTMLCollection in a browser; wrap it in Array.from() or [...] before using an Array method");
  // ...including an alias, so a saved reference cannot smuggle it back in.
  const aliased = [...source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[\w.]+\.querySelectorAll\(/g)]
    .map(m => m[1]);
  for (const name of aliased) {
    assert.doesNotMatch(source, new RegExp("\\b" + name + "\\s*\\.\\s*(map|filter|find|findIndex|flat|some|every|reduce|slice|includes|indexOf|at)\\b"),
      name + " is a NodeList alias, not an Array");
  }
});

for (const classKey of ["p1m1c1", "p1m2c4", "p1m6c4", "p2m1c2", "p2m3c1"]) {
  const row = TABLE.find(r => r.classKey === classKey);
  test(`${classKey} reopen touches only real DOM collection APIs`, async () => {
    const session = createSession();
    const frozen = freezeDomCollections(session);
    try {
      const { qc } = session;
      placeLearnerAt(session, row);
      await qc.openClass(row.ci);
      for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
      liveCheckButton(session).click();
      await settle();
      // The ACTIVE half of the lifecycle runs under the frozen collections too,
      // so this covers the whole render + mount + re-render path.
      qc.qcLoaded.delete(row.classKey);
      await qc.openClass(row.ci);
      await settle();

      const section = qc.qcFindSection();
      assert.equal(Array.from(section.querySelectorAll(DONE_CARD)).length, 1,
        "the completed card must still be built under a real NodeList API");
      assert.equal(Array.from(section.children)[0], section.querySelector(DONE_CARD),
        "the card must still be the section's first child");
      assert.deepEqual(frozen.abused, [], "no Array method was called on a DOM collection");
    } finally {
      frozen.restore();
      session.dispose();
    }
  });
}

test("a completed class survives a re-mount without changing", async () => {
  const row = TABLE.find(r => r.classKey === "p1m1c1");
  const session = createSession();
  try {
    const { qc, document } = session;
    placeLearnerAt(session, row);
    await qc.openClass(row.ci);
    for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
    liveCheckButton(session).click();
    await settle();
    qc.qcLoaded.delete(row.classKey);
    await qc.openClass(row.ci);
    await settle();

    const before = qc.qcFindSection();
    const card = before.querySelector(DONE_CARD);
    const cta = card.querySelector(".qcDoneActions button");
    const headline = card.querySelector(".qcDoneHeadline").textContent;

    // qcRunCheck and openClass both re-mount; the completed section must not
    // drift, gain a second card, or lose its CTA.
    qc.mountQuickCheck(row.classKey);
    qc.mountQuickCheck(row.classKey);

    const after = qc.qcFindSection();
    assert.equal(after, before, "the test must re-mount the same section");
    assert.equal(after.querySelectorAll(DONE_CARD).length, 1, "still exactly one card");
    assert.equal(after.children.length, 1, "the card is still the only child");
    assert.equal(liveAnswerControls(after).length, 0, "still no answer controls");
    assert.equal(after.querySelectorAll(GRADING_CTA_SELECTOR).length, 0, "still no grading CTA");
    assert.equal(after.querySelector(".qcDoneActions button"), cta, "the progression CTA must survive");
    assert.equal(after.querySelector(".qcDoneHeadline").textContent, headline, "the card copy must survive");
  } finally {
    session.dispose();
  }
});

for (const row of TABLE) {
  test(`${row.classKey} reopened completed class is one read-only completion card`, async () => {
    const session = createSession();
    try {
      const { qc, document, store, network } = session;
      const view = document.getElementById("courseView");

      placeLearnerAt(session, row);
      await qc.openClass(row.ci);
      for (let qi = 0; qi < row.questionCount; qi++) pickAnswer(session, qi, row.correctIndex[qi]);
      network.length = 0;
      liveCheckButton(session).click();
      await settle();
      assert.equal(checkRequests(session).length, 1, "precondition: the class passes through the server once");

      const progress = store.progress.get("user-1|" + row.classKey);
      assert.ok(progress && progress.completed === true, "precondition: the class is server-complete");
      const completedAt = progress.completed_at;
      assert.ok(Number.isFinite(Date.parse(completedAt)), "precondition: completed_at is recorded");

      const titleBefore = view.querySelector("h1").textContent;
      const draftsBefore = store.drafts.size;
      const rpcBefore = store.completeCalls.filter(c => c.classKey === row.classKey).length;
      assert.equal(rpcBefore, 1, "precondition: exactly one completion RPC");

      // ---- reopen the way a returning learner does: a fresh server load ----
      // qcLoaded is the one-shot guard that stops a second `load`; clearing it
      // is what a new page load does, so the card below is rendered from the
      // server's own completed:true / completed_at response, not from local
      // submission state. (The QA portal is always preview, and a preview load
      // hard-codes completed:false, so fresh-load reopen is not representable
      // in the browser - it is covered here instead.)
      qc.qcLoaded.delete(row.classKey);
      network.length = 0;
      await qc.openClass(row.ci);
      await settle();

      // -- the server still owns completion, and its answer is unchanged ----
      const loads = loadRequests(session);
      assert.equal(loads.length, 1, "reopening must issue exactly one load");
      const loaded = loads[0].body;
      assert.equal(loaded.ok, true);
      assert.equal(loaded.completed, true, "the server must report the class completed");
      assert.equal(loaded.completed_at, completedAt, "the server must return the original completed_at");
      assert.ok(!("last_check_results" in loaded),
        "a completed class must not be handed graded results for repainting");

      // -- one canonical card ----------------------------------------------
      const section = qc.qcFindSection();
      assert.ok(section, "a completed class must still render its Quick Check section");
      assert.equal(view.querySelectorAll("section.lessonSection[data-qc-section]").length, 1,
        "exactly one Quick Check container");
      assert.equal(section.getAttribute("data-qc-state"), "completed",
        "the section must be marked completed so the ACTIVE system stays off");
      assert.ok(section.classList.contains("quizCompleteState"),
        "the Step 2B.3 :not(.quizCompleteState) rules must be switched off");
      assert.ok(section.classList.contains("qcDoneSection"),
        "the section must carry the Step 2C marker class");

      const cards = section.querySelectorAll(DONE_CARD);
      assert.equal(cards.length, 1, "exactly one canonical completion card");
      assert.equal(section.children[0], cards[0], "the card must be the section's first child");
      const reviewPanels = section.querySelectorAll(REVIEW_PANEL).length;
      assert.equal(section.children.length, 1 + reviewPanels,
        "the only thing allowed beside the card is the approved read-only test review");
      assert.equal(reviewPanels, REVIEW_PANEL_CLASSES.has(row.classKey) ? 1 : 0,
        row.classKey + " review panel presence must match the approved baseline");
      assert.notEqual(cards[0].getAttribute("data-qc-done"), null, "the card must carry the data-qc-done hook");
      assert.equal(cards[0].querySelector(".eyebrow").textContent.trim(), DONE_EYEBROW,
        "the card must announce the completed Quick Check");
      assert.ok(cards[0].querySelector(".qcDoneHeadline"), "the card must keep the class's own headline");
      assert.ok(cards[0].textContent.trim().length > 0, "the card must carry readable copy");
      assert.doesNotMatch(cards[0].textContent, /correct_option_id|optionIds/,
        "the card must not leak an answer key");

      // -- no answer control a learner can press, structurally ---------------
      assert.equal(liveAnswerControls(section).length, 0,
        "a reopened class must hold no answer control outside the approved review panel");
      assert.equal(cards[0].querySelectorAll(ANSWER_CONTROL_SELECTOR).length, 0,
        "the completion card itself must hold no answer control at all");
      assert.equal(section.querySelectorAll(FEEDBACK_SELECTOR).length, 0,
        "a reopened class must hold no graded feedback");
      assert.equal(section.querySelectorAll(GRADING_CTA_SELECTOR).length, 0,
        "a reopened class must hold no Check Answers or Complete Class control");

      // -- the progression CTA is the only live control ----------------------
      const actions = cards[0].querySelector(".qcDoneActions");
      const cta = actions ? actions.querySelector("button") : null;
      assert.ok(cta, "a completed class must offer a progression CTA");
      assert.match(cta.getAttribute("id") || "", /^continue/,
        "the progression CTA must keep the continue* id convention");
      assert.doesNotMatch(cta.textContent, /review|retake|try again|check answers|complete class/i,
        "the only control on a completed class must be a way forward, not a way back in");
      assert.deepEqual(liveControls(section).map(node => node.id), [cta.getAttribute("id")],
        "the progression CTA must be the section's only live control");

      // -- zero grading, zero completion, no draft --------------------------
      assert.equal(checkRequests(session).length, 0, "a reopened class must not grade");
      assert.equal(network.filter(e => e.action === "save_draft").length, 0,
        "a reopened class must not save a draft");
      assert.equal(store.completeCalls.filter(c => c.classKey === row.classKey).length, 1,
        "a reopened class must not call the completion RPC again");
      assert.equal(store.drafts.size, draftsBefore, "a reopened class must not recreate its draft");
      assert.equal(store.progress.get("user-1|" + row.classKey).completed_at, completedAt,
        "completed_at must be preserved exactly");
      assert.equal(qc.completed.has(row.classKey), true, "the client must still reflect completion");

      // -- the lesson is still fully readable -------------------------------
      assert.ok(view.querySelector(".lessonShell"), "the lesson shell must still render");
      assert.ok(view.querySelectorAll("section.lessonSection").length >= 2,
        "the Quick Check must not be the whole lesson");
      assert.equal(view.querySelector("h1").textContent, titleBefore,
        "reopening must render the same class, not something else");

      // -- one correct way forward -----------------------------------------
      cta.click();
      await settle();
      const heading = view.querySelector("h1");
      assert.ok(!heading || heading.textContent !== titleBefore,
        "the progression CTA must leave the completed class");

      assert.deepEqual(session.warnings.filter(line => line.includes("data-qc-section")), [],
        "reopening a completed class must not warn about a missing container");
      assert.deepEqual(session.stubErrors, [], "the harness reported stub faults");
    } finally {
      session.dispose();
    }
  });
}
