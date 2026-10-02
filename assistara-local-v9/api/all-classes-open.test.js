"use strict";

// all-classes-open.test.js — EVERY class must open by CLICKING THROUGH the real
// portal, from the course index all the way down to the lesson.
//
// Why this suite exists separately from class-opening.test.js:
//   class-opening.test.js calls qc.openClass() directly. That proves the load
//   path works, but it BYPASSES the Phase -> Module -> Class browsing wiring
//   that the desktop portal pass added. A class could open fine in isolation and
//   still be unreachable because the browse() route, the module card handler, or
//   the class-card handler was mis-bound.
//
// This suite therefore drives the REAL rendered DOM for every one of the 90
// classes: it clicks the phase card, then the module card, then the class card,
// and only then asserts the lesson opened. Every click goes through the same
// bindCourse() wiring a learner uses.
//
// For each of the 90 classes it asserts:
//   1  the class card is present, enabled, and carries the class title
//   2  clicking it renders the lesson shell
//   3  NO "QUICK CHECK UNAVAILABLE" banner ([role="alert"]) — the exact
//      historical failure mode
//   4  exactly one Quick Check container mounts
//   5  it holds exactly the question count the bank declares for that class
//   6  the Quick Check load reached the server once and returned ok:true
//   7  the lesson title is the class's own title, not a neighbour's
//   8  browsing + opening changed NO learner progression
//
// It runs the whole walk twice: once from a fresh learner who has earned their
// way to each class in order, and once in review-all state where everything is
// unlocked.
//
// Run: node --test assistara-local-v9/api/all-classes-open.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSession } = require("./_qc-harness.js");
const bank = require("./_quick-check-bank.js");

function parseKey(classKey) {
  const m = /^p(\d+)m(\d+)c(\d+)$/.exec(classKey);
  if (!m) throw new Error("unrecognised class key " + classKey);
  return { phase: Number(m[1]) - 1, module: Number(m[2]) - 1, ci: Number(m[3]) - 1 };
}

const TABLE = bank.map(set => ({
  classKey: set.class_key,
  ...parseKey(set.class_key),
  questionCount: set.questions.length,
}));

// openClass() is async; the click handler returns its promise. Settle it.
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};

// A real learner: every earlier class completed, every earlier phase exam passed.
function placeLearnerAt(session, row) {
  for (const set of bank) {
    if (set.class_key === row.classKey) break;
    session.qc.completed.add(set.class_key);
  }
  for (let phase = 1; phase <= row.phase; phase++) session.qc.passExam("phase_" + phase, 100);
  session.qc.setCurrent(row.phase, row.module);
}

// Walk the real DOM from the course index to the lesson, clicking every level.
async function openThroughDom(session, row, network) {
  const { qc, document } = session;
  const view = document.getElementById("courseView");

  // Level 1: the course index must offer this phase.
  qc.browse(null, null);
  const phaseCard = view.querySelector('[data-phase="' + row.phase + '"]');
  assert.ok(phaseCard, "course index must offer a phase card for Phase " + (row.phase + 1));
  phaseCard.click();

  // Level 2: the phase view must offer this module.
  const moduleCard = view.querySelector('[data-module="' + row.module + '"]');
  assert.ok(moduleCard,
    "Phase " + (row.phase + 1) + " must offer a module card for Module " + (row.module + 1));
  assert.equal(moduleCard.hasAttribute("disabled"), false,
    "Module " + (row.module + 1) + " must be clickable for " + row.classKey);
  moduleCard.click();

  // Level 3: the module view must offer this class, with its real title.
  const classCard = view.querySelector('.classOpen[data-class="' + row.ci + '"]');
  assert.ok(classCard, "Module " + (row.module + 1) + " must offer a class card for Class " + (row.ci + 1));
  assert.equal(classCard.hasAttribute("disabled"), false, row.classKey + " must not be a disabled button");
  const heading = classCard.parentNode.querySelector("h3");
  const listedTitle = heading ? heading.textContent.trim() : "";
  assert.ok(listedTitle.length > 0, row.classKey + " must be listed with a readable title");

  // Level 4: click the class and let the async open settle.
  const fingerprintBefore = qc.progressionFingerprint();
  network.length = 0;
  await classCard.onclick();
  await settle();

  return { view, listedTitle, fingerprintBefore };
}

// Shared assertions once the lesson has been opened.
//
// expectCompleted distinguishes the two legitimate Quick Check states:
//   false — the learner has NOT finished this class yet, so the questions and
//           their answer groups must render;
//   true  — the class is already complete, so the Quick Check must render the
//           "Class Complete" panel instead of the questions. Asserting the
//           answer groups here would be wrong: a completed class is not a
//           failed open.
function assertLessonOpened(ctx, row, expectCompleted) {
  const { view, listedTitle, fingerprintBefore, qc, network } = ctx;

  assert.ok(view.querySelector(".lessonShell"), row.classKey + ": the lesson shell did not render");
  assert.equal(view.querySelector('[role="alert"]'), null,
    row.classKey + ": the QUICK CHECK UNAVAILABLE banner must not appear — the class must open");

  const containers = view.querySelectorAll("section.lessonSection[data-qc-section]");
  assert.equal(containers.length, 1,
    row.classKey + ": exactly one Quick Check container must mount");
  const section = containers[0];

  if (expectCompleted) {
    assert.equal(section.getAttribute("data-qc-state"), "completed",
      row.classKey + ": an already-complete class must render its completed Quick Check state");
    assert.ok(section.querySelector("[data-qc-done]"),
      row.classKey + ": a completed class must render the Class Complete panel");
    assert.ok(/Class Complete|QUICK CHECK COMPLETE/.test(section.textContent),
      row.classKey + ": a completed class must announce its completion to the learner");
    // Some approved renderers leave the question markup in the DOM behind the
    // completion panel, so the reliable signal is the completed state + panel,
    // not the absence of .answers.
  } else {
    assert.equal(section.querySelectorAll(".answers").length, row.questionCount,
      row.classKey + ": one answer group per bank question must render");
  }

  const loads = network.filter(entry => entry.action === "load");
  assert.equal(loads.length, 1, row.classKey + ": the Quick Check must load exactly once");
  assert.equal(loads[0].body.ok, true,
    row.classKey + ": the Quick Check load must be authorized (ok:true), not a 401/403");
  assert.equal(loads[0].classKey, row.classKey,
    row.classKey + ": the load must request THIS class's Quick Check");
  assert.equal(loads[0].body.questions.length, row.questionCount,
    row.classKey + ": the server must return this class's own question set");

  // The lesson heading must be this class's own title.
  const lessonTitle = view.querySelector(".lessonShell h1");
  assert.ok(lessonTitle && lessonTitle.textContent.trim().length > 0,
    row.classKey + ": the lesson must render its own heading");
  assert.equal(lessonTitle.textContent.trim(), listedTitle,
    row.classKey + ": the lesson heading must match the title in the class list");

  // Browsing and opening are navigation, never progression.
  assert.equal(qc.progressionFingerprint(), fingerprintBefore,
    row.classKey + ": browsing to and opening a class must not change progression");
}

// ---------------------------------------------------------------------------
// 1. Every class opens from the state a learner earns their way to.
// ---------------------------------------------------------------------------
for (const row of TABLE) {
  test(`every class opens by clicking through the portal — ${row.classKey}`, async () => {
    const session = createSession({ pathname: "/academy/dashboard" });
    try {
      const { qc, network } = session;
      placeLearnerAt(session, row);
      const ctx = await openThroughDom(session, row, network);
      // The learner has not finished this class yet, so its questions must render.
      assertLessonOpened({ ...ctx, qc, network }, row, false);
    } finally {
      session.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Every class opens in review-all state, and the whole 90-class walk is
//    driven from ONE session to prove navigation can repeat without drift.
// ---------------------------------------------------------------------------
test("all 90 classes open in sequence from a single review-all session", async () => {
  const session = createSession({ pathname: "/academy/test-portal" });
  try {
    const { qc, document, network } = session;
    qc.previewState("reviewall");
    assert.equal(qc.phasesPassed(), 4, "review-all must read as all four phases passed");

    const view = document.getElementById("courseView");
    const opened = [];
    for (const row of TABLE) {
      const ctx = await openThroughDom(session, row, network);
      // In review-all every class is complete, so each must render its
      // "Class Complete" Quick Check panel.
      assertLessonOpened({ ...ctx, qc, network }, row, true);
      opened.push(row.classKey);

      // Navigating back to the course index must work after every single open,
      // otherwise a reviewer walking all 90 classes gets stranded.
      qc.browse(null, null);
      assert.equal(view.querySelectorAll("[data-phase]").length, 4,
        row.classKey + ": My Course must return to the four-phase index");
    }
    assert.equal(opened.length, 90, "the walk must cover all 90 classes");
    assert.equal(new Set(opened).size, 90, "each class must be opened exactly once");
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// 3. No class may be opened while LOCKED — the guard must hold.
// ---------------------------------------------------------------------------
test("a locked class card offers no start button, and a locked module cannot be entered", () => {
  // Seat a learner who has passed Phases 1-3 and completed all their classes.
  // Phase 4 Module 1 Class 1 is then the current open class; Classes 2-4 must be
  // locked. A locked card must not render a clickable button at all, so it is
  // unreachable rather than merely disabled.
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc, document } = session;
    const view = document.getElementById("courseView");
    for (let pi = 0; pi < 3; pi++) {
      for (let mi = 0; mi < qc.curriculum[pi].modules.length; mi++) {
        for (let ci = 0; ci < qc.curriculum[pi].modules[mi][1].length; ci++) {
          qc.completed.add(qc.key(pi, mi, ci));
        }
      }
      qc.passExam("phase_" + (pi + 1), 100);
    }
    qc.browse(3, 0);
    const cards = view.querySelectorAll(".classCard");
    assert.ok(cards.length >= 2, "Phase 4 Module 1 must list its classes");

    let open = 0, locked = 0;
    for (const card of cards) {
      if (card.className.includes("lockedCard")) {
        locked++;
        assert.equal(card.querySelector(".classOpen"), null,
          "a locked class card must not offer a Start/Review button");
        assert.ok(/Locked|unlock/.test(card.textContent),
          "a locked class card must say why it is locked");
      } else {
        open++;
        assert.ok(card.querySelector(".classOpen"),
          "an unlocked class card must offer a button");
      }
    }
    assert.equal(open, 1, "exactly one class may be open at the head of a module");
    assert.ok(locked >= 1, "the remaining classes must be locked");

    // A locked MODULE must refuse to be entered: clicking it navigates nowhere.
    qc.browse(3, null);
    assert.ok(view.querySelectorAll(".moduleCard").length >= 2,
      "Phase 4 must list more than one module");
    assert.equal(qc.isModuleUnlocked(3, 0), true,
      "the first module of an unlocked phase is reachable");
    assert.equal(qc.isModuleUnlocked(3, 1), false,
      "a later module of the same phase is still locked");
    const lockedModule = [...view.querySelectorAll(".moduleCard")]
      .find(b => b.className.includes("lockedCard") || b.hasAttribute("disabled"));
    if (lockedModule) {
      const before = view.innerHTML;
      lockedModule.click();
      assert.equal(view.innerHTML, before,
        "clicking a locked module must not navigate anywhere");
    }
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// 4. Regression: opening a class must never silently UN-complete it.
//
// Found while building this suite. previewState() seeds progress client-side on
// purpose, because the Test Portal must never write learner rows to the
// production database. loadQuickCheckClass() then reconciled `completed` from the
// server, which legitimately has no row for those seeded classes — so opening a
// class DELETED its completion. A reviewer picking "review all" lost one
// completion per class opened, and the progress counters fell as they browsed.
// ---------------------------------------------------------------------------
test("opening a class in review-all must not un-complete it", async () => {
  const session = createSession({ pathname: "/academy/test-portal" });
  try {
    const { qc, document, network } = session;
    qc.previewState("reviewall");

    // The seed completes everything client-side only; the store stays empty.
    assert.equal(qc.phasesPassed(), 4, "review-all must read as four phases passed");
    assert.equal(qc.completed.size, 90,
      "precondition: the harness must expose `completed` live, not as a stale snapshot");
    const seeded = qc.progressionFingerprint();
    assert.equal(qc.completed.size, 90,
      "precondition: review-all must seed all 90 classes");
    assert.match(seeded, /"completed":\["p1m1c1"/,
      "review-all must seed every class as completed");
    assert.match(seeded, /"passedPhases":4/,
      "review-all must seed all four phase exams as passed");

    const view = document.getElementById("courseView");
    const before = session.store.progress.size;
    assert.equal(before, 0, "the preview seed must not write rows to the store");

    // Open several classes across different phases.
    for (const key of ["p1m1c1", "p2m3c2", "p4m4c5"]) {
      const row = TABLE.find(r => r.classKey === key);
      const ctx = await openThroughDom(session, row, network);
      assertLessonOpened({ ...ctx, qc, network }, row, true);
      assert.equal(qc.progressionFingerprint(), seeded,
        key + ": opening a class in review-all must leave the seeded progression untouched");
    }
    assert.equal(qc.phasesPassed(), 4, "opening classes must not un-pass any phase");

    // Outside the Test Portal the server stays authoritative, and the fix above
    // must NOT have weakened that. Two directions:
    //   server says completed -> the client adopts it;
    //   server has no row     -> the client does not claim completion.
    const live = createSession({ pathname: "/academy/dashboard" });
    try {
      const { qc: liveQc, network: liveNet, store } = live;
      liveQc.setCurrent(0, 0);
      liveNet.length = 0;
      await liveQc.openClass(0);
      await settle();
      const load = liveNet.find(e => e.action === "load");
      assert.ok(load, "the class must issue its Quick Check load");
      assert.equal(load.body.completed, false, "the store has no completion row yet");
      assert.equal(liveQc.completed.has("p1m1c1"), false,
        "with no server row the client must not claim the class is complete");

      // Now let the server own a completion, in a fresh session so the load
      // is not skipped by qcLoaded.
      const owner = createSession({ pathname: "/academy/dashboard" });
      try {
        owner.store.progress.set("user-1|p1m1c1", { completed: true, completed_at: new Date().toISOString() });
        owner.qc.setCurrent(0, 0);
        await owner.qc.openClass(0);
        await settle();
        assert.equal(owner.qc.completed.has("p1m1c1"), true,
          "in production the server is authoritative: a server completion row must be adopted by the client");
      } finally {
        owner.dispose();
      }
      assert.equal(store.progress.size, 0, "opening a class must not itself create a completion row");
    } finally {
      live.dispose();
    }
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// 5. Coverage integrity — this suite must actually span the whole curriculum.
// ---------------------------------------------------------------------------
test("all-classes-open coverage spans all four phases and all 90 classes", () => {
  assert.equal(TABLE.length, 90, "the suite must cover all 90 classes");
  const keys = new Set(TABLE.map(r => r.classKey));
  assert.equal(keys.size, 90, "class keys must be unique");
  for (const set of bank) assert.ok(keys.has(set.class_key), "every bank row must be covered");
  for (const phase of [1, 2, 3, 4]) {
    const inPhase = TABLE.filter(r => r.phase === phase - 1);
    assert.ok(inPhase.length > 0, "Phase " + phase + " must contribute classes to this suite");
  }
  // Every phase must have at least one module with more than one class, so the
  // suite exercises module switching rather than only first classes.
  const multi = new Set();
  for (const r of TABLE) multi.add(r.phase + ":" + r.module);
  assert.ok(multi.size >= 24, "the suite must span the whole module tree, found " + multi.size + " modules");
  assert.ok(TABLE.some(r => r.questionCount >= 5),
    "the suite must include a class with a full five-question Quick Check");
  assert.ok(TABLE.some(r => r.questionCount < 5),
    "the suite must include a class with a shorter Quick Check");
});
