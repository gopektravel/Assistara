"use strict";

// academy-quiz-start.test.js guards the flow the quiz was rewritten to: the
// page opens on question 1.
//
// The landing screen (oversized headline, result preview, benefits checklist,
// start button) was removed on purpose. It put a click between the banner and
// the first question, and a visitor who clicked the banner from /academy was
// landing on a second hero rather than a quiz. These assertions make that
// reintroduction have to be deliberate.
//
// It also covers the two things the landing screen's removal could have broken
// silently: boot() used to wire a start button that no longer exists, which
// would throw and leave the page on "Loading…", and the retake control used to
// show the landing section again.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const page = fs.readFileSync(path.join(root, "assistara-local-v9", "academy-quiz.html"), "utf8");
const quiz = fs.readFileSync(path.join(root, "assistara-local-v9", "quiz.js"), "utf8");
const report = fs.readFileSync(path.join(root, "assistara-local-v9", "quiz-report.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assistara-local-v9", "quiz.css"), "utf8");

function between(startMarker, endMarker) {
  const a = page.indexOf(startMarker);
  assert.ok(a >= 0, "missing marker: " + startMarker);
  const b = page.indexOf(endMarker, a + startMarker.length);
  assert.ok(b >= 0, "missing end marker: " + endMarker + " after " + startMarker);
  return page.slice(a, b);
}

test("the quiz page has no landing screen, teaser or start button", () => {
  for (const gone of ["quizLanding", "startQuiz", "quiz-teaser", "quiz-benefits", "quiz-landing"]) {
    assert.ok(!page.includes(gone), "the removed landing screen must not come back: " + gone);
  }
});

test("question 1 is on screen the moment the page loads", () => {
  assert.match(page, /<section class="quiz-play shell" id="quizPlay">/);
  assert.ok(!page.includes('id="quizPlay" hidden'), "the quiz section must not start hidden");

  // The header carries the branding, and the progress indicator is inside the
  // visible quiz section, not behind a click.
  assert.match(page, /class="quiz-head"/);
  assert.match(page, /class="quiz-head-kicker"/);
  assert.match(page, /id="quizProgress"/);
  assert.match(page, /id="progressLabel"/);

  // Exactly one h1, and it is the compact header's, not a second hero.
  assert.equal(page.split("<h1").length - 1, 1, "the page must carry exactly one h1");
});

test("boot() starts the quiz itself instead of wiring a start button", () => {
  // A stray reference would throw inside boot() and leave the page on the
  // loading placeholder, which no test would catch from here.
  assert.ok(!quiz.includes('$("startQuiz")'), "quiz.js must not reference a removed start button");
  assert.match(quiz, /startQuiz\(\);/, "the quiz must start itself once the questions have loaded");

  // Resuming after a refresh still wins over a fresh start, and the reveal step
  // still gets initialised by this file.
  assert.match(quiz, /if \(restore\(\)\) \{/, "an interrupted quiz still resumes at the question it was on");
  assert.match(quiz, /__quizInitReveal/, "quiz.js must still hand over to the reveal step");
});

test("a retake returns to question 1, not to a landing screen", () => {
  assert.ok(!report.includes('$("quizLanding")'), "quiz-report.js must not show a removed landing screen");
  // The retake control must re-render the first question.
  assert.match(report, /__quizRenderQuestion/, "a retake has to paint question 1 again");
});

test("no explanation section exists between questions and reveal", () => {
  const about = page.indexOf('id="quizAbout"');
  const quizStart = page.indexOf('id="quizPlay"');
  const reveal = page.indexOf('id="quizReveal"');
  assert.equal(about, -1, "the explanation section must not exist");
  assert.ok(quizStart < reveal, "the questions must come before the reveal step");
});

test("the new copy keeps the project's writing rules", () => {
  // Check the whole page for writing rules
  assert.doesNotMatch(page, /—/, "no em dashes");
  assert.match(page, /illustrative/, "income figures must stay illustrative");
});

test("the quiz.css keeps its answers, transitions and reduced-motion support", () => {
  assert.match(css, /\.quiz-head-title/);
  assert.match(css, /\.quiz-option/);
  assert.match(css, /\.quiz-option:has\(input:checked\)/, "chosen answer cards keep their state");
  assert.match(css, /q-anim-in/, "the question keeps its transition");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "motion must respect the setting");

  // The components that were deleted must not leave their styling behind.
  for (const dead of [".quiz-landing", ".quiz-teaser", ".quiz-benefits", ".quiz-cta", ".quiz-lead", ".quiz-about"]) {
    assert.ok(
      !new RegExp("\\" + dead + "\\b").test(css),
      "dead styling for a removed component: " + dead
    );
  }
});
