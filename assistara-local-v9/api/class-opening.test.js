"use strict";

// class-opening.test.js — EVERY class must open through the real interface.
//
// History: opening a class surfaced "QUICK CHECK UNAVAILABLE / This class could
// not be opened." / "Admin QA access is required." in the local preview. The
// root cause was an authorization failure on the Quick Check load request (the
// preview server did not sign both cookies), not the client renderer. The load
// path is the only path a learner has into a class, so this suite drives the
// REAL inline script from academy-dashboard.html — the same bytes a browser
// executes — against the REAL api/academy-quick-check.js handler (via the
// shared in-memory harness), and asserts that for EVERY one of the 90 classes:
//
//   1  the lesson shell renders
//   2  no "QUICK CHECK UNAVAILABLE" alert is shown (courseView carries no
//      [role="alert"])
//   3  the Quick Check load request reaches the server exactly once and
//      returns ok:true — a 403/401 would fail here
//   4  exactly one Quick Check container is mounted
//   5  every question from the bank renders one answer group
//
// Nothing here is an isolated handler test: the client and server talk through
// the same relative-path fetch the browser uses.
//
// Run: node --test assistara-local-v9/api/class-opening.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSession } = require("./_qc-harness.js");
const bank = require("./_quick-check-bank.js");

function parseKey(classKey) {
  const m = /^p(\d+)m(\d+)c(\d+)$/.exec(classKey);
  if (!m) throw new Error("unrecognised class key " + classKey);
  return { phase: Number(m[1]) - 1, module: Number(m[2]) - 1, ci: Number(m[3]) - 1 };
}

const TABLE = bank.map(set => {
  const at = parseKey(set.class_key);
  return {
    classKey: set.class_key,
    ...at,
    questionCount: set.questions.length,
  };
});

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

for (const row of TABLE) {
  test(`class ${row.classKey} opens without the QUICK CHECK UNAVAILABLE alert`, async () => {
    const session = createSession();
    try {
      const { qc, document, network } = session;
      placeLearnerAt(session, row);

      network.length = 0;
      await qc.openClass(row.ci);

      const view = document.getElementById("courseView");
      assert.ok(view, "courseView must exist");
      assert.ok(view.querySelector(".lessonShell"), "the lesson shell did not render");

      // The exact regression: qcRenderLoadFailure() inserts a div.lessonShell
      // with role="alert" reading "QUICK CHECK UNAVAILABLE". It is the only
      // role="alert" the app ever creates, so its absence proves the class
      // opened instead of failing.
      assert.equal(view.querySelector('[role="alert"]'), null,
        "the QUICK CHECK UNAVAILABLE banner must not appear — the class must open");

      const loads = network.filter(entry => entry.action === "load");
      assert.equal(loads.length, 1, "opening a class must load its Quick Check exactly once");
      assert.equal(loads[0].body.ok, true,
        "the Quick Check load must be authorized (ok:true), not a 401/403");

      const containers = view.querySelectorAll("section.lessonSection[data-qc-section]");
      assert.equal(containers.length, 1, "exactly one Quick Check container must mount");

      const section = qc.qcFindSection();
      assert.ok(section, "qcFindSection must find the mounted container");
      assert.equal(section.querySelectorAll(".answers").length, row.questionCount,
        "one answer group per bank question must render");
    } finally {
      session.dispose();
    }
  });
}

test("class-opening coverage spans every class", () => {
  assert.equal(TABLE.length, 90, "the class-opening suite must cover all 90 classes");
  const keys = new Set(TABLE.map(row => row.classKey));
  for (const set of bank) assert.ok(keys.has(set.class_key), "every bank row must be covered");
});

// ---------------------------------------------------------------------------
// Preview review-all — the Test Portal owner must be able to open ANY class
// ---------------------------------------------------------------------------
test("preview review-all mode unlocks every class, module, phase and exam", async () => {
  // The owner cannot review "a class in another module" while the preview sits
  // in a brand-new learner state: everything after Class 1 is progression-
  // locked. The Test Portal's ADMIN TEST STATE dropdown now offers "review
  // all": previewState() completes every class and passes the four phase exams,
  // which drives the SAME unlock chain a real learner uses. Authentication is
  // untouched — every request still goes through the real API with the QA
  // cookie (asserted below on the deepest class).
  const session = createSession({ pathname: "/academy/test-portal" });
  try {
    const { qc, document, network } = session;
    qc.previewState("reviewall");

    // Every one of the 90 classes, across all four phases and all 24 modules,
    // must become reachable through the real unlock chain.
    for (const row of TABLE) {
      assert.equal(qc.isClassUnlocked(row.phase, row.module, row.ci), true,
        row.classKey + " must be unlocked in review mode");
    }
    assert.equal(qc.phasesPassed(), 4, "all four phase exams must read as passed");

    // The deepest class opens through the real openClass() path and its Quick
    // Check load is authorized (ok:true) — a 401/403 would fail here.
    const last = TABLE[TABLE.length - 1];
    qc.setCurrent(last.phase, last.module);
    network.length = 0;
    await qc.openClass(last.ci);

    const view = document.getElementById("courseView");
    assert.ok(view.querySelector(".lessonShell"), "the lesson shell must render");
    assert.equal(view.querySelector('[role="alert"]'), null,
      "no QUICK CHECK UNAVAILABLE banner for " + last.classKey);
    const loads = network.filter(e => e.action === "load");
    assert.equal(loads.length, 1, "opening the class must load its Quick Check exactly once");
    assert.equal(loads[0].body.ok, true,
      "the Quick Check load must be authorized (ok:true), not a 401/403");
  } finally {
    session.dispose();
  }
});

test("the Test Portal exposes the review-all state in the ADMIN TEST STATE dropdown", () => {
  const html = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "academy-dashboard.html"), "utf8");
  assert.match(html, /<option value="reviewall">/, "the review-all option must exist");
  assert.match(html, /13\. QA — every class &amp; exam unlocked \(review all\)/,
    "the option must be labelled clearly in the ADMIN TEST STATE selector");
});