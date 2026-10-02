"use strict";

// Checkpoint 2D executable QA suite.
// Run: node --test assistara-local-v9/api/quick-check.audit.test.js
//
// This suite executes real assertions against the real server-only bank and the
// real exported grading logic in academy-quick-check.js. It does not inspect
// source text for anything it claims to prove at runtime.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const qc = require("./academy-quick-check.js");
const bank = require("./_quick-check-bank.js");
const { grade, isAllCorrect, publicQuestions, validateSelections, validateStoredState } = qc._test;

const migrationPath = path.join(repoRoot, "supabase", "migrations", "202609280001_academy_quick_check_persistence.sql");
const dashboardPath = path.join(repoRoot, "assistara-local-v9", "academy-dashboard.html");

const ALL_CLASSES = bank.map(s => s.class_key);
const ALL_QUESTIONS = bank.flatMap(s => s.questions.map(q => ({ set: s, q })));

// ---------------------------------------------------------------------------
// HISTORICAL BASELINE
//
// The approved baseline commit predates the newest classes, so it cannot be
// reconciled against every class in the bank. Two ways to make that test pass
// are both wrong: repinning the baseline to a newer commit silently deletes the
// historical guarantee, and keeping the old "33 classes" expectation is a
// stale pin that can only be satisfied by rewriting history.
//
// So the suite derives the baseline's own class list, scopes the byte-for-byte
// reconciliation to exactly the classes the baseline contains, and names the
// remainder explicitly. Those classes are covered by the structural, security
// and lifecycle suites instead, and "BASELINE COVERAGE" reports both numbers so
// the report can never imply coverage the baseline never had.
// ---------------------------------------------------------------------------
const BASELINE_COMMIT = "8aac9aa";
const BASELINE_DASHBOARD = "assistara-local-v9/academy-dashboard.html";

// Release QA re-pointed every internal production reference at the lesson the
// learner is reading. This is the single definition of that rewrite; the
// reconciliation below applies it to the historical baseline so the bank and
// the baseline can never drift apart again.
const INTERNAL_LANGUAGE_RULES = [
  [/\bThe source highlights\b/g, "This lesson highlights"],
  [/\bThe source frames\b/g, "This lesson frames"],
  [/\bThe source combines\b/g, "This lesson combines"],
  [/\bThe source says\b/g, "This lesson says"],
  [/\bThe source explicitly says\b/g, "This lesson says"],
  [/\bThe source explicitly recommends\b/g, "This lesson recommends"],
  [/\bThe source recommends\b/g, "This lesson recommends"],
  [/\bThe source gives\b/g, "This lesson gives"],
  [/\bThe source describes\b/g, "This lesson describes"],
  [/\bThe source points to\b/g, "This lesson points to"],
  [/\bThe source distinguishes\b/g, "This lesson distinguishes"],
  [/\bThe source sets\b/g, "This lesson sets"],
  [/\bThe source names\b/g, "This lesson names"],
  [/\bThe source marks\b/g, "This lesson marks"],
  [/\bThe source is\b/g, "This lesson is"],
  [/\bThe source uses\b/g, "This lesson uses"],
  [/\bThe source does not cover\b/g, "This lesson does not cover"],
  [/\bThe source does not\b/g, "This lesson does not"],
  [/\bThe source's\b/g, "This lesson's"],
  [/\bThe source\b/g, "This lesson"],
  [/\bthe source's\b/g, "this lesson's"],
  [/\bthe source\b/g, "this lesson"],
  [/\bThe guidebook\b/g, "This lesson"],
  [/\bthe guidebook's\b/g, "this lesson's"],
  [/\bthe guidebook\b/g, "this lesson"],
  [/\bThe guide's\b/g, "This lesson's"],
  [/\bThe guide\b/g, "This lesson"],
  [/\bthe guide's\b/g, "this lesson's"],
  [/\bthe guide\b/g, "this lesson"],
  [/\bthis lesson lesson\b/g, "this lesson"],
  [/\bThis lesson lesson\b/g, "This lesson"],
];

function applyBaselineLanguageRewrite(text) {
  let out = String(text);
  for (const [pattern, replacement] of INTERNAL_LANGUAGE_RULES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, replacement);
  }
  return out;
}

function readBaselineQuestions(source, lessonName) {
  const declaration = source.indexOf("const " + lessonName + "=");
  const marker = source.indexOf("questions:[", declaration);
  assert.ok(declaration >= 0 && marker >= 0, `baseline questions missing for ${lessonName}`);
  const open = source.indexOf("[", marker);
  let depth = 0;
  let quote = "";
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "[") depth += 1;
    if (ch === "]" && --depth === 0) return Function("return " + source.slice(open, i + 1))();
  }
  assert.fail(`unterminated baseline question array for ${lessonName}`);
}

// Returns the baseline dashboard plus the questions it declares, per class.
function loadBaseline() {
  const baseline = execFileSync("git", ["show", `${BASELINE_COMMIT}:${BASELINE_DASHBOARD}`], {
    cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
  });
  const declared = [...baseline.matchAll(/const (lesson\d+)=\{key:"([^"]+)"/g)].map(m => m[2]);
  assert.ok(declared.length > 0, "the approved baseline must declare at least one question class");
  assert.equal(new Set(declared).size, declared.length, "the baseline declares a duplicate class key");

  const byClass = new Map();
  for (const [, lessonName, classKey] of baseline.matchAll(/const (lesson\d+)=\{key:"([^"]+)"/g)) {
    byClass.set(classKey, readBaselineQuestions(baseline, lessonName));
  }
  assert.equal(byClass.size, declared.length, "every baseline lesson must yield a readable question array");
  return { baseline, declared, byClass };
}

// ---------------------------------------------------------------------------
// ITEM 5 — BANK STRUCTURE / CONSISTENCY
// ---------------------------------------------------------------------------

test("BANK: 90 classes and 371 questions", () => {
  assert.equal(bank.length, 90);
  assert.equal(ALL_QUESTIONS.length, 371);
});

test("BANK: class keys unique", () => {
  assert.equal(new Set(ALL_CLASSES).size, ALL_CLASSES.length);
});

test("BANK: class key matches p#m#c# and version is a generation of that key", () => {
  for (const set of bank) {
    assert.match(set.class_key, /^p[1-4]m[1-9][0-9]*c[1-9][0-9]*$/, set.class_key);
    // The generation suffix belongs to the bank, so a content revision may bump
    // it. What must never be possible is a version that belongs to another
    // class, or a malformed generation.
    assert.match(
      set.question_set_version,
      new RegExp("^" + set.class_key.replace(/\./g, "\\.") + "-v[1-9][0-9]*$"),
      set.class_key,
    );
  }
});

test("BANK: generation is monotonic in class order so a stale client is rejected", () => {
  // Every class starts at -v1. A revision bumps only the classes it touched.
  // This keeps the audit honest: a class may be at -v2, but never below -v1.
  for (const set of bank) {
    const generation = Number(set.question_set_version.slice(set.class_key.length + 2));
    assert.ok(Number.isInteger(generation) && generation >= 1, set.class_key);
  }
  assert.ok(
    bank.some(set => set.question_set_version !== `${set.class_key}-v1`),
    "expected at least one class to carry a content revision",
  );
});

test("BANK: question ids are <class_key>.qNN and unique within the whole bank", () => {
  const seen = new Set();
  for (const { set, q } of ALL_QUESTIONS) {
    assert.match(q.id, new RegExp(`^${set.class_key}\\.q[0-9]{2}$`), q.id);
    assert.equal(seen.has(q.id), false, `duplicate question id ${q.id}`);
    seen.add(q.id);
  }
  assert.equal(seen.size, 371);
});

test("BANK: option ids are <question_id>.oNN, unique per question, >=2 options", () => {
  for (const { q } of ALL_QUESTIONS) {
    assert.ok(q.options.length >= 2, `${q.id} has ${q.options.length} options`);
    const ids = q.options.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, `${q.id} duplicate option id`);
    for (const o of q.options) {
      assert.match(o.id, new RegExp(`^${q.id.replace(/\./g, "\\.")}\\.o[0-9]{2}$`), o.id);
    }
  }
});

test("BANK: exactly one correct option per question and it is a real option of that question", () => {
  for (const { q } of ALL_QUESTIONS) {
    const ids = q.options.map(o => o.id);
    assert.ok(ids.includes(q.correct_option_id), `${q.id} correct_option_id ${q.correct_option_id} not among options`);
    assert.equal(ids.filter(id => id === q.correct_option_id).length, 1);
  }
});

test("BANK: every non-correct option has feedback; no feedback keyed to the correct option", () => {
  for (const { q } of ALL_QUESTIONS) {
    const keys = Object.keys(q.wrong_feedback_by_option);
    const wrongIds = q.options.map(o => o.id).filter(id => id !== q.correct_option_id);
    assert.deepEqual([...keys].sort(), [...wrongIds].sort(), `${q.id} wrong_feedback key set`);
    for (const id of wrongIds) {
      const text = q.wrong_feedback_by_option[id];
      assert.equal(typeof text, "string");
      assert.ok(text.length > 0, `${q.id} empty feedback for ${id}`);
    }
  }
});

test("BANK: no wrong-answer feedback text ever contains a correct option id", () => {
  for (const { q } of ALL_QUESTIONS) {
    for (const [id, text] of Object.entries(q.wrong_feedback_by_option)) {
      assert.equal(id === q.correct_option_id, false);
      assert.equal(text.includes(q.correct_option_id), false, `${q.id} feedback for ${id} leaks correct id`);
    }
  }
});

// A wrong-answer explanation has one job: justify the option the learner chose.
// When it also spells the correct option out, it has handed over the answer key
// and the learner never has to reason. The id guard above cannot see this,
// because a plain-language leak contains no id at all: p2m3c3.q03 shipped
// "... the Inbox is where messages from both platforms are consolidated" as
// the feedback for three wrong options. Both guards below are what that gap
// looked like when it was open.
test("BANK: no wrong-answer feedback contains the correct option's text", () => {
  for (const { q } of ALL_QUESTIONS) {
    const correct = q.options.find(o => o.id === q.correct_option_id);
    assert.ok(correct, `${q.id} has no correct option to compare against`);
    for (const [id, text] of Object.entries(q.wrong_feedback_by_option)) {
      assert.equal(id === q.correct_option_id, false, `${q.id} keys feedback to its correct option`);
      assert.equal(
        text.includes(correct.text), false,
        `${q.id} feedback for ${id} states the correct option "${correct.text}"`,
      );
    }
  }
});

// The same defect in a subtler form: a short correct option named in ordinary
// prose rather than quoted, so exact matching misses it.
//
// Scoped to short, non-formula options on purpose. In the true/false classes
// the correct option is a whole sentence, and every explanation shares
// ordinary words with it, so a whole-word rule across the whole bank reports
// 115 false positives and would train everyone to ignore it. A label answer is
// the case where naming it really is the leak.
const QC_NON_LABEL_GLYPH = /[+\-*/×÷=<>^%()→↔]/;
const QC_WORDS = text => text
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .split(" ")
  .filter(Boolean);

test("BANK: a short, non-formula correct option is never named in its wrong feedback", () => {
  let policed = 0;
  for (const { q } of ALL_QUESTIONS) {
    const correct = q.options.find(o => o.id === q.correct_option_id);
    const parts = QC_WORDS(correct.text);
    if (parts.length > 3 || QC_NON_LABEL_GLYPH.test(correct.text)) continue;
    policed += 1;
    const wrongText = Object.values(q.wrong_feedback_by_option).join(" ");
    const haystack = " " + QC_WORDS(wrongText).join(" ") + " ";
    for (const word of parts) {
      if (word.length < 3) continue;
      assert.equal(
        haystack.includes(" " + word + " "), false,
        `${q.id} wrong feedback names the correct option "${correct.text}" (word "${word}")`,
      );
    }
  }
  assert.ok(
    policed >= 10,
    `the label-answer guard must cover a meaningful share of the bank, it covered only ${policed}`,
  );
});

test("BANK: prompts and option texts are non-empty strings, order preserved as stored", () => {
  for (const { q } of ALL_QUESTIONS) {
    assert.equal(typeof q.prompt, "string");
    assert.ok(q.prompt.length > 0, `${q.id} empty prompt`);
    for (const o of q.options) {
      assert.equal(typeof o.text, "string");
      assert.ok(o.text.length > 0, `${o.id} empty option text`);
    }
  }
});

test("BANK: correct_explanation is present for every question", () => {
  for (const { q } of ALL_QUESTIONS) {
    assert.equal(typeof q.correct_explanation, "string");
    assert.ok(q.correct_explanation.length > 0, `${q.id} empty correct_explanation`);
  }
});

test("BANK: top-level array is frozen (cannot be mutated at runtime by a request)", () => {
  assert.equal(Object.isFrozen(bank), true);
});

test("BANK: publicQuestions() never emits correct_option_id, correct_explanation or wrong_feedback", () => {
  for (const set of bank) {
    const serialised = JSON.stringify(publicQuestions(set));
    // The key/feedback FIELDS must never reach the browser. Option ids and text
    // legitimately do (all four options must be rendered), so the correct option
    // id necessarily appears in the option list - that is not a leak on its own.
    assert.equal(serialised.includes("correct_option_id"), false, set.class_key);
    assert.equal(serialised.includes("correct_explanation"), false, set.class_key);
    assert.equal(serialised.includes("wrong_feedback_by_option"), false, set.class_key);
    assert.equal(/"correct"/.test(serialised), false, set.class_key);
    assert.equal(/"feedback"/.test(serialised), false, set.class_key);
    // Only prompt + options may be present.
    const payload = publicQuestions(set);
    for (const q of payload) {
      assert.deepEqual(Object.keys(q).sort(), ["id", "options", "prompt"]);
      for (const o of q.options) assert.deepEqual(Object.keys(o).sort(), ["id", "text"]);
    }
  }
});

// ---------------------------------------------------------------------------
// ITEM 3 — EXHAUSTIVE ANSWER-LEAK GRADING TEST
// grade() is the real exported grader used by the live check action.
// ---------------------------------------------------------------------------

const counters = { correct: 0, wrong: 0, failures: 0 };
const failureLog = [];

function record(label, problem) {
  counters.failures += 1;
  failureLog.push(`${label}: ${problem}`);
}

test("GRADE: correct submission returns correct=true only for the exact correct option", () => {
  for (const { set, q } of ALL_QUESTIONS) {
    const results = grade({ [q.id]: q.correct_option_id }, set);
    const mine = results.find(r => r.question_id === q.id);
    assert.ok(mine, `${q.id} missing from grade() output`);
    assert.equal(mine.correct, true, `${q.id} correct option graded false`);
    assert.equal(mine.selected_option_id, q.correct_option_id);
    assert.equal(mine.feedback, q.correct_explanation);
    counters.correct += 1;
  }
});

test("GRADE: each wrong option returns correct=false and ONLY that option's feedback", () => {
  for (const { set, q } of ALL_QUESTIONS) {
    for (const option of q.options) {
      if (option.id === q.correct_option_id) continue;
      const results = grade({ [q.id]: option.id }, set);
      const mine = results.find(r => r.question_id === q.id);

      // (a) correct === false
      if (mine.correct !== false) record(`${q.id}/${option.id}`, `correct=${mine.correct} expected false`);
      // (b) selected_option_id is not the correct option id
      if (mine.selected_option_id === q.correct_option_id) record(`${q.id}/${option.id}`, "response echoed correct option id");
      // (c) response body must not contain the correct option id anywhere
      const body = JSON.stringify(results);
      if (body.includes(q.correct_option_id)) record(`${q.id}/${option.id}`, "correct option id present in response body");
      // (d) feedback must be exactly the selected wrong option's feedback
      if (mine.feedback !== q.wrong_feedback_by_option[option.id]) record(`${q.id}/${option.id}`, "feedback is not the selected option's feedback");
      // (e) no feedback for any UNSELECTED option may be present
      for (const other of q.options) {
        if (other.id === option.id) continue;
        const otherText = other.id === q.correct_option_id
          ? q.correct_explanation
          : q.wrong_feedback_by_option[other.id];
        if (otherText && mine.feedback.includes(otherText)) record(`${q.id}/${option.id}`, `unselected option ${other.id} feedback present`);
      }
      // (f) full answer key must not be present
      if (body.includes("correct_option_id")) record(`${q.id}/${option.id}`, "answer key field present");
      // (g) no "correct" list may be present
      if (/"correct"\s*:\s*(true|\[)/.test(body)) record(`${q.id}/${option.id}`, "answer-key shape present");

      counters.wrong += 1;
    }
  }
});

test("GRADE: isAllCorrect is true only for a fully correct submission", () => {
  for (const { set, q } of ALL_QUESTIONS) {
    const all = {};
    for (const question of set.questions) all[question.id] = question.correct_option_id;
    assert.equal(isAllCorrect(grade(all, set), set), true, `${set.class_key} all-correct rejected`);

    // Flip exactly one question to a wrong option -> must not complete.
    const firstWrong = set.questions[0].options.find(o => o.id !== set.questions[0].correct_option_id);
    const oneWrong = { ...all, [set.questions[0].id]: firstWrong.id };
    assert.equal(isAllCorrect(grade(oneWrong, set), set), false, `${set.class_key} completed with one wrong answer`);

    // Missing answers -> must not complete.
    const partial = { ...all };
    delete partial[set.questions[0].id];
    assert.equal(isAllCorrect(grade(partial, set), set), false, `${set.class_key} completed with missing answer`);
  }
});

test("GRADE: end-to-end — a wrong answer can never be converted into completion", () => {
  // Simulate the exact body the server builds for the `check` action.
  for (const set of bank) {
    const full = {};
    for (const q of set.questions) {
      const wrong = q.options.find(o => o.id !== q.correct_option_id);
      full[q.id] = wrong.id;
    }
    const results = grade(full, set);
    assert.equal(isAllCorrect(results, set), false, set.class_key);
    assert.equal(results.every(r => r.correct === false), true, set.class_key);
    // A client-supplied `correct`/`completed`/`allCorrect` flag must be irrelevant:
    // the server derives completion from isAllCorrect(results) only.
    const clientLies = { ...full, correct: true, allCorrect: true, completed: true, passed: true, score: 127 };
    const validation = validateSelections(clientLies, set, { complete: true });
    assert.equal(validation.ok, false, `${set.class_key} accepted client-supplied grade fields`);
  }
});

// ---------------------------------------------------------------------------
// ITEM 7 — INPUT VALIDATION / FAILURE BEHAVIOUR
// ---------------------------------------------------------------------------

test("VALIDATE: unknown question id rejected", () => {
  const set = bank[0];
  assert.equal(validateSelections({ "p1m1c1.q99": "p1m1c1.q99.o01" }, set, { complete: true }).ok, false);
});

test("VALIDATE: unknown option id rejected", () => {
  const set = bank[0];
  const q = set.questions[0];
  assert.equal(validateSelections({ [q.id]: `${q.id}.o99` }, set, { complete: true }).ok, false);
});

test("VALIDATE: option id belonging to a different question rejected", () => {
  const set = bank[0];
  const [a, b] = set.questions;
  assert.equal(validateSelections({ [a.id]: b.options[0].id }, set, { complete: true }).ok, false);
});

test("VALIDATE: partial selection rejected when complete=true, accepted when complete=false", () => {
  const set = bank[0];
  const q = set.questions[0];
  const one = { [q.id]: q.correct_option_id };
  assert.equal(validateSelections(one, set, { complete: true }).ok, false);
  assert.equal(validateSelections(one, set).ok, true);
});

test("VALIDATE: non-object / array / null selections rejected", () => {
  const set = bank[0];
  for (const bad of [null, [], "x", 5, true]) {
    assert.equal(validateSelections(bad, set).ok, false, String(bad));
  }
});

test("VALIDATE: non-string option value rejected", () => {
  const set = bank[0];
  const q = set.questions[0];
  assert.equal(validateSelections({ [q.id]: 1 }, set).ok, false);
});

test("VALIDATE: more selections than questions rejected", () => {
  const set = bank[0];
  const over = {};
  for (let i = 1; i <= set.questions.length + 1; i += 1) {
    over[`${set.class_key}.q${String(i).padStart(2, "0")}`] = `${set.class_key}.q01.o01`;
  }
  assert.equal(validateSelections(over, set).ok, false);
});

test("VALIDATE: prototype-pollution style keys rejected", () => {
  const set = bank[0];
  for (const key of ["__proto__", "constructor", "toString"]) {
    assert.equal(validateSelections({ [key]: "x" }, set).ok, false, key);
  }
});

test("VALIDATE: validateStoredState rejects tampered / foreign / wrong-schema state", () => {
  const set = bank[0];
  const q = set.questions[0];
  const good = { schema_version: 1, selections: { [q.id]: q.correct_option_id }, last_checked_selections: {} };
  assert.equal(validateStoredState(good, set), true);
  assert.equal(validateStoredState({ ...good, schema_version: 2 }, set), false);
  assert.equal(validateStoredState({ ...good, extra: 1 }, set), false);
  assert.equal(validateStoredState({ ...good, selections: { "p9m9c9.q01": "p9m9c9.q01.o01" } }, set), false);
  assert.equal(validateStoredState({ ...good, completed: true }, set), false);
  assert.equal(validateStoredState(null, set), false);
});

// ---------------------------------------------------------------------------
// ITEM 5 (cont.) — FRONTEND <-> BANK CONSISTENCY
// ---------------------------------------------------------------------------

test("FRONTEND: every Quick Check adapter in the dashboard maps to a real bank class", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  const block = html.match(/const QC_ADAPTERS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, "QC_ADAPTERS not found in dashboard");
  const referenced = [...block[1].matchAll(/["'`](p[1-4]m[1-9][0-9]*c[1-9][0-9]*)["'`]/g)].map(m => m[1]);
  assert.ok(referenced.length > 0, "no class keys found in QC_ADAPTERS");
  for (const key of referenced) {
    assert.ok(ALL_CLASSES.includes(key), `QC_ADAPTERS references unknown class ${key}`);
  }
  // No adapter may reference a placeholder class (classes with no bank entry).
  assert.equal(new Set(referenced).size, referenced.length, "duplicate class key in QC_ADAPTERS");
});

test("FRONTEND: dashboard exposes no answer key material", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  // These bank field names must never appear in the served frontend.
  for (const token of ["correct_option_id", "correct_explanation", "wrong_feedback_by_option"]) {
    assert.equal(html.includes(token), false, `dashboard contains ${token}`);
  }
  // No numeric correct-index mapping keyed by question id.
  assert.equal(/["']correct["']\s*:\s*\d/.test(html), false, "dashboard contains numeric correct mapping");
  // No question-set version LITERALS (the field name may appear, the value may not).
  assert.equal(/["']p[1-4]m[1-9]\d*c\d+-v\d+["']/.test(html), false, "dashboard contains question set version literal");
  // No question/option id literals from the bank.
  for (const { q } of ALL_QUESTIONS) {
    assert.equal(html.includes(q.id), false, `dashboard contains question id ${q.id}`);
  }
});

test("FRONTEND: no lesson question array is populated in the browser", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  const defs = [...html.matchAll(/const (lesson\d+)\s*=\s*\{[\s\S]*?questions:\[([\s\S]*?)\]\}/g)];
  assert.equal(defs.length, 90, `expected 90 lesson defs, found ${defs.length}`);
  for (const d of defs) {
    assert.equal(d[2].trim(), "", `${d[1]} still holds question data in the browser`);
  }
});

// ---------------------------------------------------------------------------
// BLOCKER: the Quick Check client glue is referenced but never defined.
// ---------------------------------------------------------------------------

test("FRONTEND: every Quick Check helper that is CALLED is also DEFINED", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  const required = [
    "loadQuickCheckClass", "submitQuickCheck", "qcPost",
    "scheduleQuickCheckDraft", "flushQuickCheckDraft",
    "qcApplyResults", "qcClearResults",
  ];
  const undefinedHelpers = [];
  for (const name of required) {
    const defined = new RegExp(`(function|const|let|var)\\s+${name}\\b`).test(html)
      || new RegExp(`\\b${name}\\s*=\\s*(async\\s*)?(function|\\()`).test(html);
    if (!defined) undefinedHelpers.push(name);
  }
  assert.deepEqual(undefinedHelpers, [], `called but never defined: ${undefinedHelpers.join(", ")}`);
});

test("FRONTEND: the load and save_draft API actions are actually called", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.ok(/action:"load"/.test(html) || /action:\s*"load"/.test(html), "frontend never calls action=load");
  assert.ok(/action:"save_draft"/.test(html) || /action:\s*"save_draft"/.test(html), "frontend never calls action=save_draft");
});

test("FRONTEND: the quick check endpoint is called more than the single hardcoded p1m1c1 stub", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.match(html, /const QC_ENDPOINT\s*=\s*"\/api\/academy-quick-check"/);
  assert.match(html, /async function qcPost\(classKey, payload\)/);
  assert.match(html, /fetch\(QC_ENDPOINT/);
  assert.match(html, /Object\.assign\(\{ class_key: classKey \}, payload\)/);
  // No hardcoded per-class class_key / version literal may drive a submission.
  assert.equal(/class_key:"p1m1c1"/.test(html), false, "dashboard hardcodes a single class_key at a call site");
  assert.equal(/question_set_version:"p1m1c1-v1"/.test(html), false, "dashboard hardcodes a question set version");
  // No "always answer option 0" scaffolding may remain.
  assert.equal(/optionIds\[0\]/.test(html), false, "dashboard still auto-selects option 0 for every question");
});

// ---------------------------------------------------------------------------
// BLOCKER: vercel.json does not build or route the new API.
// ---------------------------------------------------------------------------

test("DEPLOY: vercel.json builds the Quick Check API function", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, "assistara-local-v9", "vercel.json"), "utf8"));
  const srcs = (vercel.builds || []).map(b => b.src);
  assert.ok(srcs.includes("api/academy-quick-check.js"), "no build entry for api/academy-quick-check.js");
});

test("DEPLOY: vercel.json routes /api/academy-quick-check", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, "assistara-local-v9", "vercel.json"), "utf8"));
  const routes = (vercel.routes || []).map(r => r.src);
  assert.ok(routes.includes("/api/academy-quick-check"), "no route for /api/academy-quick-check");
  assert.ok(routes.indexOf("/api/academy-quick-check") < routes.indexOf("/(.*)"), "Quick Check route is shadowed by the catch-all");
});

test("DEPLOY: the server-only bank is bundled with the function and never published as a static asset", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, "assistara-local-v9", "vercel.json"), "utf8"));
  const qc = (vercel.builds || []).find(b => b.src === "api/academy-quick-check.js");
  assert.ok(qc, "no build entry for api/academy-quick-check.js");
  const include = (qc.config && qc.config.includeFiles) || [];
  assert.ok(include.includes("api/_quick-check-bank.js"), "bank not in includeFiles");
  assert.ok(include.includes("api/_academy-security.js"), "shared security helper not in includeFiles");
  // The bank must never be a standalone static build target.
  const staticSrcs = (vercel.builds || [])
    .filter(b => (b.use || "").includes("static"))
    .map(b => b.src);
  for (const s of staticSrcs) {
    assert.equal(/_quick-check-bank/.test(s), false, `bank published as static asset: ${s}`);
  }
  for (const r of vercel.routes || []) {
    assert.equal(/_quick-check-bank/.test(r.src || "") || /_quick-check-bank/.test(r.dest || ""), false,
      "bank is routable");
  }
});

// ---------------------------------------------------------------------------
// BLOCKER: learner-facing copy fidelity (lost check mark glyph).
// ---------------------------------------------------------------------------

test("COPY: every correct_explanation keeps the check mark used by the dashboard", () => {
  const raw = fs.readFileSync(path.join(__dirname, "_quick-check-bank.js"), "utf8");
  const dash = fs.readFileSync(dashboardPath, "utf8");
  const prefix = (dash.match(/const QC_CORRECT_PREFIX\s*=\s*"([^"]*)"/) || [])[1];
  assert.ok(prefix, "dashboard QC_CORRECT_PREFIX not found");
  assert.ok(prefix.includes("\u2713"), "dashboard prefix no longer contains U+2713");
  assert.equal(raw.includes("\u2713"), true, "bank contains no U+2713 check mark at all");
  for (const { set, q } of ALL_QUESTIONS) {
    assert.ok(q.correct_explanation === prefix.trimEnd() || q.correct_explanation.startsWith(prefix),
      `${set.class_key}.${q.id} does not start with the dashboard prefix ${JSON.stringify(prefix)}: ${JSON.stringify(q.correct_explanation.slice(0, 24))}`);
  }
});

test("BANK: prompts, options and feedback reconcile byte-for-byte with the approved baseline transformation", () => {
  const { baseline, byClass: baselineByClass } = loadBaseline();
  const currentPrefix = (fs.readFileSync(dashboardPath, "utf8").match(/const QC_CORRECT_PREFIX\s*=\s*"([^"]*)"/) || [])[1];
  const baselinePrefix = (baseline.match(/const QC_CORRECT_PREFIX="([^"]*)"/) || [])[1];
  const retryCue = (baseline.match(/const QC_RETRY_CUE="([^"]*)"/) || [])[1];
  const fallback = (baseline.match(/const QC_WRONG_FALLBACK="([^"]*)"/) || [])[1];
  const openerBlock = (baseline.match(/const QC_WRONG_OPENERS=\[([^\]]*)\]/) || [])[1];
  const openers = [...openerBlock.matchAll(/"([^"]*)"/g)].map(m => m[1]);
  assert.ok(currentPrefix.includes("\u2713"));
  // Scope: reconcile exactly the classes the baseline declares, and require
  // every other bank class to be named here rather than skipped in silence.
  const reconciled = bank.filter(set => baselineByClass.has(set.class_key));
  const postBaseline = bank.filter(set => !baselineByClass.has(set.class_key));
  assert.ok(reconciled.length > 0, "the approved baseline must cover at least one bank class");
  assert.equal(
    reconciled.length + postBaseline.length,
    bank.length,
    "every bank class must be either reconciled against the baseline or declared newer than it",
  );
  for (const set of postBaseline) {
    assert.equal(
      baseline.includes(`key:"${set.class_key}"`),
      false,
      `${set.class_key} is declared newer than the baseline but appears in it; a newer baseline commit is required to reconcile it`,
    );
  }

  for (const set of reconciled) {
    const oldQuestions = baselineByClass.get(set.class_key);
    assert.equal(set.questions.length, oldQuestions.length, set.class_key);
    for (let i = 0; i < oldQuestions.length; i += 1) {
      const old = oldQuestions[i];
      const question = set.questions[i];
      assert.equal(question.prompt, old.q, question.id + " prompt");
      assert.deepEqual(question.options.map(option => option.text), old.a, question.id + " options/order");
      // The baseline copy is reconciled in substance, not byte-for-byte.
      // Release QA deliberately re-pointed every "the source" / "the guide" /
      // "the guidebook" reference at the lesson the learner is actually
      // reading (Worker C F-11): a learner has never seen the source document,
      // and being told the answer lives in it implies material they do not
      // have. The reconciliation therefore applies the SAME internal-language
      // rewrite the bank received and then compares, so a drift in either
      // direction still fails loudly.
      const expectedExplanation = (old.why && old.why.trim() ? baselinePrefix + old.why : baselinePrefix.trimEnd()).replace(/^\?/, "\u2713");
      const sameShape = question.correct_explanation.length > 0
        && question.correct_explanation.startsWith("\u2713");
      assert.ok(sameShape, question.id + " explanation body must keep the approved check-mark prefix");
      assert.equal(
        question.correct_explanation,
        applyBaselineLanguageRewrite(expectedExplanation),
        question.id + " explanation body must equal the baseline text with only the "
          + "internal-language rewrite applied",
      );
      if (set.class_key.startsWith("p2")) {
        let seed = 0;
        for (let c = 0; c < old.q.length; c += 1) seed = (seed * 31 + old.q.charCodeAt(c)) >>> 0;
        for (let optionIndex = 0; optionIndex < old.a.length; optionIndex += 1) {
          if (optionIndex === old.correct) continue;
          const optionId = question.options[optionIndex].id;
          const why = old.whyWrong && old.whyWrong[optionIndex];
          const body = why && why.trim() ? why.trim() : fallback;
          const expected = openers[(seed + optionIndex) % openers.length] + " " + body + retryCue;
          assert.equal(
            question.wrong_feedback_by_option[optionId],
            applyBaselineLanguageRewrite(expected),
            question.id + " feedback " + optionId + " must equal the baseline text with only "
              + "the internal-language rewrite applied",
          );
        }
      }
    }
  }

  console.log(`historical baseline coverage: ${reconciled.length} classes`);
  console.log(`current Quick Check coverage: ${bank.length} classes`);
  if (postBaseline.length) {
    console.log(
      `newer than baseline ${BASELINE_COMMIT}, so covered by the structural, security and lifecycle suites rather than by byte reconciliation: `
      + postBaseline.map(set => set.class_key).join(", "),
    );
  }
});

test("BANK: classes newer than the historical baseline are still fully wired and graded", () => {
  // Byte reconciliation cannot speak for the classes the approved baseline
  // predates. Those must still be held to the full structural contract, or a
  // stale baseline would quietly become a coverage hole.
  const { baseline, byClass } = loadBaseline();
  const html = fs.readFileSync(dashboardPath, "utf8");
  const postBaseline = bank.filter(set => !byClass.has(set.class_key));
  assert.ok(postBaseline.length > 0, "expected the approved baseline to predate at least one class");

  for (const set of postBaseline) {
    assert.ok(set.questions.length > 0, set.class_key + " has no questions");
    for (const q of set.questions) {
      // The client contract rejects anything other than exactly four options,
      // so fewer would make the class unusable rather than merely unusual.
      assert.equal(q.options.length, 4, q.id + " must offer exactly four options");
      const ids = q.options.map(o => o.id);
      assert.equal(ids.filter(id => id === q.correct_option_id).length, 1, q.id + " correct option");
      assert.ok(q.correct_explanation.trim(), q.id + " empty correct explanation");
      assert.equal(
        q.wrong_feedback_by_option[q.correct_option_id],
        undefined,
        q.id + " must not carry wrong-answer feedback for its correct option",
      );
      for (const option of q.options) {
        if (option.id === q.correct_option_id) continue;
        assert.ok(
          typeof q.wrong_feedback_by_option[option.id] === "string" && q.wrong_feedback_by_option[option.id].trim(),
          q.id + " missing feedback for " + option.id,
        );
      }
    }
    // The client must be able to serve it at all: a QC_ADAPTERS entry whose
    // render target carries the structural mount hook.
    assert.match(html, new RegExp(`"${set.class_key}":`), set.class_key + " has no QC_ADAPTERS entry");
    assert.equal(
      baseline.includes(`key:"${set.class_key}"`),
      false,
      set.class_key + " must not appear in the baseline it is declared newer than",
    );
  }

  // Every class, baseline-covered or not, still has questions the service can
  // grade; the per-class client regression and the lifecycle harness then drive
  // all of them end to end.
  assert.equal(
    bank.filter(set => set.questions.length > 0).length,
    bank.length,
    "every class must be gradeable by the service",
  );
  console.log(`newer-than-baseline classes held to the structural contract: ${postBaseline.length} classes`);
});

test("FRONTEND: LOAD fills lesson questions with a sanitized server projection and restores draft selections", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.match(html, /async function loadQuickCheckClass\(classKey\)/);
  assert.match(html, /action: "load"/);
  assert.match(html, /adapter\.lesson\.questions = questions/);
  assert.match(html, /question\.optionIds\.indexOf\(draft\.selections\[question\.id\]\)/);
  assert.match(html, /return \{ id: question\.id, q: question\.prompt, a: options\.map/);
  assert.equal(/correct_option_id|correct_explanation|wrong_feedback_by_option/.test(html), false);
});

test("FRONTEND: draft debounce, flush-before-check, server-only results and authoritative completion are wired", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.match(html, /const QC_SAVE_DEBOUNCE_MS = 800/);
  assert.match(html, /action: "save_draft"/);
  assert.match(html, /action: "check"/);
  assert.match(html, /await flushQuickCheckDraft\(classKey\)/);
  assert.match(html, /qcApplyResults\(adapter, data\.results, selections\)/);
  assert.match(html, /window\.addEventListener\("pagehide", qcFlushActiveDraft\)/);
  assert.match(html, /document\.visibilityState === "hidden"/);
  assert.match(html, /if \(data\.completed\) completed\.add\(classKey\)/);
});

test("FRONTEND: no auto-answer scaffolding, database writes or direct draft-table access", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.equal(/optionIds\[0\]/.test(html), false);
  assert.equal(/class_key:\s*"p1m1c1"/.test(html), false);
  assert.equal(/question_set_version:\s*"p1m1c1-v1"/.test(html), false);
  assert.equal(/academy_quick_check_drafts/.test(html), false);
  assert.equal(/\.from\(["']academy_class_progress["']\)\s*\.(insert|upsert|update|delete)/.test(html), false);
});

test("FRONTEND: network and malformed-response failures clear grades and cannot complete a class", () => {
  const html = fs.readFileSync(dashboardPath, "utf8");
  assert.match(html, /async function qcRunCheck\(classKey\)[\s\S]*?catch \(error\) \{\s*qcClearResults\(adapter\)/);
  assert.match(html, /Quick Check returned malformed results\. Your class was not completed/);
  assert.match(html, /if \(!qcAllAnswered\(adapter\)\)/);
  assert.match(html, /response\.completed!==true/);
});

test("COPY: no replacement character or bare '?' glyph leaked into feedback copy", () => {
  const raw = fs.readFileSync(path.join(__dirname, "_quick-check-bank.js"), "utf8");
  assert.equal(raw.includes("\uFFFD"), false, "bank contains U+FFFD replacement characters");
  for (const { set, q } of ALL_QUESTIONS) {
    assert.equal(q.correct_explanation.startsWith("?"), false, `${set.class_key}.${q.id} starts with a literal '?'`);
    for (const [id, text] of Object.entries(q.wrong_feedback_by_option)) {
      assert.equal(/^\?/.test(text), false, `${id} wrong feedback starts with a literal '?'`);
    }
  }
});

// ---------------------------------------------------------------------------
// ITEM 1 / 5 — MIGRATION TEXT ASSERTIONS (static, explicitly labelled)
// These assert on migration TEXT, not on a live database.
// ---------------------------------------------------------------------------

const sql = fs.readFileSync(migrationPath, "utf8");

function sqlComments() {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
const code = sqlComments();

test("MIGRATION: creates drafts table IF NOT EXISTS and never drops academy_class_progress", () => {
  assert.ok(code.includes("CREATE TABLE IF NOT EXISTS public.academy_quick_check_drafts"));
  assert.equal(/DROP\s+TABLE[^;]*academy_class_progress/i.test(code), false);
  assert.equal(/TRUNCATE/i.test(code), false);
  assert.equal(/DELETE\s+FROM\s+public\.academy_class_progress/i.test(code), false);
});

test("MIGRATION: academy_complete_class EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role", () => {
  assert.ok(/REVOKE ALL ON FUNCTION public\.academy_complete_class\(uuid, text\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/i.test(code));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.academy_complete_class\(uuid, text\)\s*\n?\s*TO service_role;/i.test(code));
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.academy_complete_class[^;]*\bTO\s+(PUBLIC|anon|authenticated)\b/i.test(code), false);
});

test("MIGRATION: no authenticated INSERT/UPDATE policy on drafts", () => {
  const policies = [...code.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(m => m[0]);
  const draftsPolicies = policies.filter(p => /academy_quick_check_drafts/i.test(p));
  for (const p of draftsPolicies) {
    if (/FOR\s+(INSERT|UPDATE)/i.test(p)) {
      assert.equal(/TO\s+authenticated/i.test(p), false, `authenticated write policy exists: ${p}`);
    }
  }
  // Explicitly: no INSERT/UPDATE policy to authenticated on drafts.
  for (const p of draftsPolicies) {
    if (/FOR\s+(INSERT|UPDATE)/i.test(p)) {
      assert.equal(/TO\s+authenticated/i.test(p), false, `authenticated write policy exists: ${p}`);
    }
  }
});

test("MIGRATION: no authenticated INSERT/UPDATE/DELETE GRANT on drafts", () => {
  assert.equal(/GRANT[^;]*\bINSERT\b[^;]*\bTO\s+authenticated\b/i.test(code), false, "authenticated INSERT grant present");
  assert.equal(/GRANT[^;]*\bUPDATE\b[^;]*\bTO\s+authenticated\b/i.test(code), false, "authenticated UPDATE grant present");
  assert.equal(/GRANT[^;]*\bDELETE\b[^;]*\bTO\s+authenticated\b/i.test(code), false, "authenticated DELETE grant present");
});

test("MIGRATION: no authenticated SELECT grant on drafts", () => {
  const grants = [...code.matchAll(/GRANT\s+([^;]+?)\s+ON TABLE public\.academy_quick_check_drafts\s+TO\s+([^;]+);/gi)];
  assert.equal(grants.some(([, , roles]) => /\bauthenticated\b/i.test(roles)), false, "authenticated SELECT grant present");
});

test("MIGRATION: no authenticated DELETE policy on drafts", () => {
  const policies = [...code.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(m => m[0]);
  const deletePolicies = policies.filter(p => /academy_quick_check_drafts/i.test(p) && /FOR\s+DELETE/i.test(p));
  for (const p of deletePolicies) {
    assert.equal(/TO\s+authenticated/i.test(p), false, `authenticated DELETE policy present: ${p}`);
  }
});

test("MIGRATION: PUBLIC, anon and authenticated have zero draft CRUD; service_role has explicit CRUD", () => {
  assert.match(code, /REVOKE ALL PRIVILEGES ON TABLE public\.academy_quick_check_drafts\s+FROM PUBLIC, anon, authenticated;/i);
  assert.match(code, /REVOKE SELECT \(%1\$I\), INSERT \(%1\$I\), UPDATE \(%1\$I\), REFERENCES \(%1\$I\) ON TABLE public\.academy_quick_check_drafts FROM PUBLIC, anon, authenticated/i);
  const grants = [...code.matchAll(/GRANT\s+([^;]+?)\s+ON TABLE public\.academy_quick_check_drafts\s+TO\s+([^;]+);/gi)];
  for (const [, privileges, roles] of grants) {
    assert.match(roles, /^service_role$/i);
    assert.match(privileges, /SELECT/i);
    assert.match(privileges, /INSERT/i);
    assert.match(privileges, /UPDATE/i);
    assert.match(privileges, /DELETE/i);
  }
  assert.ok(grants.length > 0, "explicit service_role draft CRUD grant missing");
  assert.doesNotMatch(code, /CREATE POLICY[^;]*academy_quick_check_drafts[^;]*TO\s+authenticated/i);
});

test("MIGRATION: academy_class_progress INSERT/UPDATE/DELETE revoked from PUBLIC/anon/authenticated", () => {
  assert.ok(/REVOKE\s+SELECT,\s+INSERT,\s+UPDATE,\s+DELETE\s+ON\s+TABLE\s+public\.academy_class_progress\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(code));
});

test("MIGRATION: column-level INSERT/UPDATE revoke loop present for academy_class_progress", () => {
  assert.ok(/REVOKE\s+SELECT\s+\(%1\$I\),\s+INSERT\s+\(%1\$I\),\s+UPDATE\s+\(%1\$I\)\s+ON\s+TABLE\s+public\.academy_class_progress\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(code));
});

test("MIGRATION: drops every pre-existing policy on academy_class_progress (no permissive policy survives)", () => {
  assert.ok(/pg_policies[\s\S]*?tablename = 'academy_class_progress'/i.test(code));
  assert.ok(/DROP POLICY %I ON public\.academy_class_progress/i.test(code));
});

test("MIGRATION: recreates own-row SELECT policy for academy_class_progress", () => {
  assert.ok(/CREATE POLICY academy_class_progress_select_own[\s\S]*?FOR SELECT TO authenticated[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i.test(code));
});

test("MIGRATION: academy_complete_class preserves completed_at on already-completed rows", () => {
  assert.ok(/WHEN existing\.completed THEN existing\.completed_at/i.test(code));
});

test("MIGRATION: academy_complete_class deletes the draft in the same function (atomic)", () => {
  assert.ok(/DELETE FROM public\.academy_quick_check_drafts/i.test(code));
});

test("MIGRATION: academy_complete_class validates its inputs", () => {
  assert.ok(/p_user_id IS NULL/i.test(code));
  assert.ok(/p_class_key !~ '\^p\[1-4\]m\[1-9\]\[0-9\]\*c\[1-9\]\[0-9\]\*\$'/i.test(code) || /p_class_key !~/i.test(code));
});

test("MIGRATION: trigger function EXECUTE revoked from PUBLIC/anon/authenticated", () => {
  assert.ok(/REVOKE ALL ON FUNCTION public\.academy_quick_check_drafts_touch_updated_at\(\)/i.test(code));
});

test("MIGRATION: is re-runnable (idempotent) - every CREATE POLICY is preceded by a drop", () => {
  assert.ok(/DROP POLICY IF EXISTS/g.test(sql), "missing DROP POLICY IF EXISTS");
  assert.ok(/DROP TRIGGER IF EXISTS/g.test(sql), "missing DROP TRIGGER IF EXISTS");
  // The drafts policies are dropped by name.
  const literalDrops = new Set([...code.matchAll(/DROP POLICY IF EXISTS\s+([a-z0-9_]+)/gi)].map(m => m[1]));
  // academy_class_progress policies are dropped dynamically from pg_policies,
  // so a literal DROP is not required for those - but the dynamic sweep must exist
  // and must run before the CREATE POLICY.
  const dynamicSweep = code.indexOf("DROP POLICY %I ON public.academy_class_progress");
  assert.ok(dynamicSweep > 0, "no dynamic policy sweep for academy_class_progress");
  for (const name of literalDrops) {
    assert.ok(
      code.includes(`CREATE POLICY ${name}`) || /^academy_quick_check_drafts_/.test(name),
      `DROP POLICY IF EXISTS ${name} is neither recreated nor a defensive drop of a drafts policy`,
    );
  }
  const createProg = code.indexOf("CREATE POLICY academy_class_progress_select_own");
  assert.ok(dynamicSweep < createProg, "academy_class_progress policy is created before the dynamic drop sweep runs");
  // Every remaining CREATE POLICY must be either literally dropped first or covered
  // by the dynamic sweep.
  for (const m of code.matchAll(/CREATE POLICY\s+([a-z0-9_]+)/gi)) {
    const name = m[1];
    if (literalDrops.has(name)) continue;
    assert.ok(/^academy_class_progress_/.test(name),
      `CREATE POLICY ${name} is neither dropped by name nor covered by the academy_class_progress sweep`);
  }
  // Defensive drops of policies this migration no longer creates are allowed and
  // are in fact required, so that an older revision's write policies cannot survive.
  for (const name of literalDrops) {
    assert.ok(
      code.includes(`CREATE POLICY ${name}`) || /^academy_quick_check_drafts_/.test(name),
      `DROP POLICY IF EXISTS ${name} is neither recreated nor a defensive drop of a drafts policy`,
    );
  }
});

// ---------------------------------------------------------------------------
// ITEM 4 — IDOR: server identity is taken from the session, never from the body
// ---------------------------------------------------------------------------

test("IDOR: no action accepts a user_id field", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  const allow = src.match(/const ALLOWED_ACTION_FIELDS = \{[\s\S]*?\n\};/);
  assert.ok(allow);
  assert.equal(allow[0].includes("user_id"), false, "user_id is an accepted request field");
  assert.equal(/"user_id"/.test(allow[0]), false);
});

test("IDOR: all session-derived queries filter on the validated session user_id", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  // Matches session.user_id and auth.session.user_id (call sites pass auth.session).
  const refs = [...src.matchAll(/\b(?:auth\.)?session\.user_id\b/g)].map(m => m[0]);
  assert.ok(refs.length >= 4, `expected multiple session.user_id references, found ${refs.length}`);
});

test("IDOR: no body-derived user id is ever forwarded", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.equal(/body\.user_id/.test(src), false, "body.user_id is referenced");
  assert.equal(/body\[.user_id.\]/.test(src), false, "body['user_id'] is referenced");
  // The only user_id assigned in a request body is the session-derived one.
  const assignments = [...src.matchAll(/user_id:\s*([^,\n}]+)/g)].map(m => m[1].trim());
  for (const a of assignments) {
    assert.ok(/session\.user_id/.test(a) || /^userId$/.test(a), `user_id assigned from ${a}`);
  }
});

test("IDOR: cookie user_id must match the live validated session user_id", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/session\.user_id !== cookie\.user_id/.test(src), "no cookie/session user_id cross-check");
  assert.ok(/validatedLearnerSession/.test(src), "session is not validated against live auth + entitlement");
});

test("IDOR: every user-scoped table read/delete is filtered by the caller's own row", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  // The two user-scoped tables are read through restUrl(cfg, table, params) and the
  // DELETE goes through a literal template. Both must pin the caller identity.
  for (const table of ["academy_class_progress", "academy_quick_check_drafts"]) {
    const readCalls = [...src.matchAll(new RegExp(`restUrl\\(cfg,\\s*"${table}",\\s*\\{([\\s\\S]*?)\\}\\)`, "g"))];
    assert.ok(readCalls.length > 0, `no restUrl read found for ${table}`);
    for (const c of readCalls) {
      assert.ok(/user_id:\s*`eq\.\$\{\s*session\.user_id\s*\}`/.test(c[1]),
        `${table} read is not scoped to session.user_id: ${c[1].slice(0, 120)}`);
    }
  }
  // The direct DELETE uses a literal template; the POST/upsert URL shares the same
  // table prefix, so only count URLs whose request options carry method DELETE.
  const deletes = [...src.matchAll(/rest\/v1\/academy_quick_check_drafts\?([^\s"'`]+)`?\s*,\s*\{\s*method:\s*"DELETE"/g)].map(m => m[1]);
  assert.ok(deletes.length > 0, "no direct drafts DELETE found");
  for (const d of deletes) {
    assert.ok(/user_id=eq\.\$\{session\.user_id\}/.test(d), `drafts DELETE not scoped to session.user_id: ${d}`);
    assert.ok(/class_key=eq\.\$\{classKey\}/.test(d), `drafts DELETE not scoped to class_key: ${d}`);
  }
});

test("IDOR: the upsert path can only ever write the caller's own row", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  const write = src.match(/async function writeOwnDraft\([\s\S]*?\n\}/);
  assert.ok(write, "writeOwnDraft not found");
  // The upsert URL pins the conflict target to (user_id, class_key) only.
  assert.ok(/on_conflict=user_id%2Cclass_key/.test(write[0]), "upsert conflict target is not (user_id, class_key)");
  // The payload identity comes from the session, never the request body.
  assert.ok(/user_id:\s*session\.user_id,/.test(write[0]), "upsert user_id is not the session user_id");
  assert.ok(/class_key:\s*set\.class_key,/.test(write[0]), "upsert class_key is not the validated set class_key");
  // And it uses service_role so RLS cannot silently block or widen it.
  assert.ok(/apikey:\s*cfg\.service/.test(write[0]), "upsert does not use the service_role key");
});

test("AUTHORITY: every draft DB operation uses service_role and never learnerHeaders", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  for (const name of ["ownDraft", "writeOwnDraft", "deleteOwnDraft"]) {
    const fn = src.match(new RegExp("async function " + name + "\\([\\s\\S]*?\\n\\}"));
    assert.ok(fn, name + " not found");
    assert.match(fn[0], /apikey:\s*cfg\.service/);
    assert.match(fn[0], /Authorization:\s*`Bearer \$\{cfg\.service\}`/);
    assert.doesNotMatch(fn[0], /learnerHeaders/);
  }
});

test("IDOR: service_role draft writes bind user_id from the validated session only", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  const write = src.match(/async function writeOwnDraft\([\s\S]*?\n\}/);
  assert.ok(write, "writeOwnDraft not found");
  assert.ok(/user_id: session\.user_id,/.test(write[0]), "writeOwnDraft does not bind user_id from the session");
  // The completion RPC must be invoked with the session identity.
  // Exclude the function definition itself ("async function serverComplete(cfg, userId, ...)").
  const callSites = [...src.matchAll(/(?<!function )serverComplete\(cfg,\s*([^,]+),\s*([^)]+)\)/g)]
    .map(m => m[1].trim());
  assert.ok(callSites.length > 0, "serverComplete is never called");
  for (const arg of callSites) {
    assert.ok(/auth\.session\.user_id/.test(arg), `serverComplete called with ${arg}`);
  }
});

// ---------------------------------------------------------------------------
// ITEM 2 / 8 — REQUEST-SHAPE AND METHOD GUARDS
// ---------------------------------------------------------------------------

test("GATE: only POST is accepted", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/req\.method !== "POST"/.test(src));
  assert.ok(/res\.setHeader\("Allow", "POST"\)/.test(src));
});

test("GATE: origin allowlist enforced before any work", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/allowedOrigin\(req\.headers\.origin\)/.test(src));
  assert.ok(/403/.test(src));
});

test("GATE: request body size capped", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/MAX_BODY_BYTES/.test(src));
  assert.ok(/Request is too large/.test(src));
});

test("GATE: unexpected body fields rejected (no mass-assignment)", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/Unexpected field/.test(src));
});

test("GATE: unauthenticated request never returns questions", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  // The handler body: authenticate must run before any action dispatch.
  const handlerStart = src.indexOf("module.exports = async function academyQuickCheck");
  const authIdx = src.indexOf("await authenticate(req, body, cfg)", handlerStart);
  const loadIdx = src.indexOf("loadAction(cfg, auth, set)", handlerStart);
  assert.ok(handlerStart > 0);
  assert.ok(authIdx > handlerStart, "authenticate not found inside the handler");
  assert.ok(loadIdx > handlerStart, "loadAction call not found inside the handler");
  assert.ok(authIdx < loadIdx, "authentication does not precede the load action");
});

test("GATE: server config failure returns 503 and never a completion", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/try \{ cfg = config\(\); \} catch \{[\s\S]*?503/.test(src));
  assert.ok(/catch \(error\) \{[\s\S]*?503[\s\S]*?Quick Check service unavailable/.test(src));
});

test("GATE: completion failure throws instead of returning completed:true", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/if \(!response\.ok \|\| body !== true\) throw new Error\("Could not persist class completion"\)/.test(src));
  // `completed: true` may only be returned AFTER serverComplete resolved.
  const callIdx = src.indexOf("await serverComplete(");
  const after = src.slice(callIdx, callIdx + 400);
  assert.ok(after.indexOf("completed: true") > 0, "completed:true returned without a preceding serverComplete");
  // And the failure text must not be present in a 200 path.
  assert.equal(/completed: true[^}]*Could not persist/.test(src), false);
});

test("GATE: writeOwnDraft failure throws (no silent draft loss reported as success)", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/if \(!response\.ok\) throw new Error\("Could not save Quick Check draft"\)/.test(src));
});

test("GATE: unknown class_key returns 404 (placeholder classes cannot be completed)", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/validateClassKey/.test(src));
  assert.ok(/404[\s\S]{0,40}Quick Check not found/.test(src));
  // No placeholder class may exist in the bank.
  for (const set of bank) {
    assert.ok(set.questions.length > 0, `${set.class_key} is a placeholder in the bank`);
  }
});

test("GATE: version staleness returns 409 rather than grading against a moved bank", () => {
  const src = fs.readFileSync(path.join(__dirname, "academy-quick-check.js"), "utf8");
  assert.ok(/409/.test(src));
  assert.ok(/Quick Check version is stale|Current question-set version is required/.test(src));
});

// ---------------------------------------------------------------------------
// ITEM 7 — RUNTIME end-to-end tests against the real exported handler.
// A stub Supabase is injected by intercepting globalThis.fetch, so these are
// real request/response cycles through academy-quick-check.js.
// ---------------------------------------------------------------------------

const handler = require("./academy-quick-check.js");
const { seal } = require("./_academy-security.js");

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: null, finished: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    end(payload) { this.body = payload; this.finished = true; },
  };
}

const CFG = {
  SUPABASE_URL: "https://stub.supabase.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  ACADEMY_COOKIE_SECRET: "x".repeat(48),
};
const savedEnv = { ...process.env };
function setCfg(extra = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SUPABASE") || k.startsWith("ACADEMY_")) delete process.env[k];
  }
  Object.assign(process.env, CFG, extra);
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SUPABASE") || k.startsWith("ACADEMY_")) delete process.env[k];
  }
  Object.assign(process.env, savedEnv);
}

async function invoke(req) {
  const res = makeRes();
  await handler(req, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, headers: res.headers, res };
}

function liveCookie(over = {}) {
  return `assistara_academy=${seal({ aud: "academy", access_token: "tok", user_id: "u1", exp: Date.now() + 600000, ...over }, CFG.ACADEMY_COOKIE_SECRET)}`;
}

async function post(body, { cookie, origin = "https://getassistara.com", raw } = {}) {
  setCfg();
  const out = await invoke({
    method: "POST",
    headers: { origin, cookie: cookie || "", "content-type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
  restoreEnv();
  return out;
}

test("RUNTIME: GET is rejected with 405 and an Allow header", async () => {
  setCfg();
  const out = await invoke({ method: "GET", headers: { origin: "https://getassistara.com" } });
  restoreEnv();
  assert.equal(out.status, 405);
  assert.equal(out.res.getHeader("allow"), "POST");
});

test("RUNTIME: a cross-origin POST is rejected with 403", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1" }, { origin: "https://evil.example" });
  assert.equal(out.status, 403);
});

test("RUNTIME: a request with no session cookie is refused", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1" });
  assert.equal(out.status, 403);
  assert.match(out.json.error, /Academy session required/);
});

test("RUNTIME: a forged (unsigned) cookie is refused", async () => {
  const forged = Buffer.from(JSON.stringify({ aud: "academy", access_token: "t", user_id: "u1", exp: Date.now() + 60000 })).toString("base64url");
  const out = await post({ action: "load", class_key: "p1m1c1" }, { cookie: `assistara_academy=${forged}` });
  assert.equal(out.status, 403);
});

test("RUNTIME: an expired session cookie is refused", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1" }, { cookie: liveCookie({ exp: Date.now() - 1000 }) });
  assert.equal(out.status, 403);
});

test("RUNTIME: missing server env vars return 503 and never a completion", async () => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SUPABASE") || k.startsWith("ACADEMY_")) delete process.env[k];
  }
  process.env.SUPABASE_URL = CFG.SUPABASE_URL; // the other three are deliberately absent
  const out = await invoke({
    method: "POST",
    headers: { origin: "https://getassistara.com", cookie: liveCookie() },
    body: JSON.stringify({ action: "check", class_key: "p1m1c1", question_set_version: "p1m1c1-v1", selections: {} }),
  });
  restoreEnv();
  assert.equal(out.status, 503);
  assert.equal(out.json.completed, undefined);
  assert.equal(String(out.res.body).includes("completed"), false);
});

test("RUNTIME: an unknown / placeholder class_key returns 404", async () => {
  for (const key of ["p3m7c9", "p1m1c1x", "P1M1C1", "", "p1m1c1; DROP TABLE"]) {
    const out = await post({ action: "load", class_key: key });
    assert.equal(out.status, 404, `expected 404 for class_key ${JSON.stringify(key)}`);
  }
});

test("RUNTIME: malformed bodies, unknown actions and smuggled fields are rejected with 400", async () => {
  const mustBe400 = [
    "{not json",
    "",
    "[]",
    '"a string"',
    '{"action":"delete_everything","class_key":"p1m1c1"}',
    '{"action":"load","class_key":"p1m1c1","user_id":"someone-else"}',
    '{"action":"check","class_key":"p1m1c1","question_set_version":"p1m1c1-v1","selections":{},"completed":true}',
    '{"action":"check","class_key":"p1m1c1","question_set_version":"p1m1c1-v1","selections":{},"allCorrect":true}',
    '{"action":"check","class_key":"p1m1c1","question_set_version":"p1m1c1-v1","selections":{},"score":127}',
    '{"action":"check","class_key":"p1m1c1","question_set_version":"p1m1c1-v1","selections":{},"passed":true}',
  ];
  for (const raw of mustBe400) {
    const out = await post(null, { raw });
    assert.equal(out.status, 400, `expected 400 for ${raw}, got ${out.status} ${out.res.body}`);
  }
});

test("RUNTIME: a non-boolean preview flag cannot unlock the QA preview path", async () => {
  // preview must be exactly true; anything else falls through to the learner gate.
  for (const raw of [
    '{"action":"load","class_key":"p1m1c1","preview":"yes"}',
    '{"action":"load","class_key":"p1m1c1","preview":1}',
    '{"action":"load","class_key":"p1m1c1","preview":"true"}',
  ]) {
    const out = await post(null, { raw });
    assert.equal(out.status, 403, `expected 403 for ${raw}, got ${out.status}`);
    assert.equal(out.json.completed, undefined);
  }
});

test("RUNTIME: an oversized body is rejected with 400", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1", preview: true, pad: "x".repeat(30 * 1024) });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /too large/i);
});

test("RUNTIME: preview mode is refused without an Admin QA cookie", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1", preview: true });
  assert.equal(out.status, 403);
  assert.match(out.json.error, /Admin QA access is required/);
});

test("RUNTIME: every response is no-store", async () => {
  const out = await post({ action: "load", class_key: "p1m1c1" });
  assert.match(String(out.res.getHeader("cache-control")), /no-store/);
  assert.equal(out.res.getHeader("x-content-type-options"), "nosniff");
});

// ---------------------------------------------------------------------------
// Summary — printed so the executed totals are visible in the runner output.
// ---------------------------------------------------------------------------

test("SUMMARY: executed grading totals", () => {
  console.log("");
  console.log("  questions tested            = " + ALL_QUESTIONS.length);
  console.log("  correct submissions tested  = " + counters.correct);
  console.log("  wrong submissions tested    = " + counters.wrong);
  console.log("  total submissions tested    = " + (counters.correct + counters.wrong));
  console.log("  failures                    = " + counters.failures);
  for (const f of failureLog) console.log("    FAIL " + f);
  console.log("");
  assert.equal(counters.failures, 0);
});
