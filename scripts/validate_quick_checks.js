#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BANK_PATH = path.join(ROOT, "assistara-local-v9", "api", "_quick-check-bank.js");
const DASHBOARD_PATH = path.join(ROOT, "assistara-local-v9", "academy-dashboard.html");
const EXPECTED_CLASSES = [
  "p1m1c1", "p1m1c2", "p1m1c3", "p1m1c4",
  "p1m2c1", "p1m2c2", "p1m2c3", "p1m2c4",
  "p1m3c1", "p1m3c2", "p1m3c3", "p1m3c4",
  "p1m4c1", "p1m4c2", "p1m4c3",
  "p1m5c1", "p1m5c2", "p1m5c3",
  "p1m6c1", "p1m6c2", "p1m6c3", "p1m6c4",
  "p2m1c1", "p2m1c2", "p2m1c3", "p2m1c4",
  "p2m2c1", "p2m2c2", "p2m2c3",
  "p2m3c1", "p2m3c2", "p2m3c3", "p2m3c4",
];
const TOTAL_QUESTIONS = 143;
const PHASE_2_CLASSES = new Set(EXPECTED_CLASSES.filter(key => key.startsWith("p2")));
const failures = [];
const warnings = [];
const fail = message => failures.push(message);
const dashboard = fs.readFileSync(DASHBOARD_PATH, "utf8");
const prefixMatch = dashboard.match(/const QC_CORRECT_PREFIX\s*=\s*"([^"]*)"/);
const correctPrefix = prefixMatch && prefixMatch[1];
const retryCueMatch = dashboard.match(/const QC_RETRY_CUE\s*=\s*"([^"]*)"/);
const retryCue = retryCueMatch && retryCueMatch[1];
const fallbackMatch = dashboard.match(/const QC_WRONG_FALLBACK\s*=\s*"([^"]*)"/);
const wrongFallback = fallbackMatch && fallbackMatch[1];
const openersMatch = dashboard.match(/const QC_WRONG_OPENERS\s*=\s*\[([^\]]*)\]/);
const openers = openersMatch ? [...openersMatch[1].matchAll(/"([^"]*)"/g)].map(match => match[1]) : [];
let bank;
try { bank = require(BANK_PATH); } catch (error) { console.error("FAIL: cannot load server bank: " + error.message); process.exit(2); }

function normalize(text) {
  return String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
}

function containsLongPhrase(text, candidate) {
  const phrase = normalize(candidate);
  return phrase.split(" ").filter(Boolean).length >= 3 && normalize(text).includes(phrase);
}

function expectedWrongFeedback(questionText, explanation, selectedIndex) {
  let seed = 0;
  for (let i = 0; i < questionText.length; i += 1) seed = (seed * 31 + questionText.charCodeAt(i)) >>> 0;
  const opener = openers[(seed + selectedIndex) % openers.length];
  return opener + " " + (explanation && explanation.trim() ? explanation.trim() : wrongFallback) + retryCue;
}

function extractArray(source, lessonName) {
  const declaration = source.indexOf("const " + lessonName + "=");
  if (declaration < 0) return null;
  const marker = source.indexOf("questions:[", declaration);
  if (marker < 0) return null;
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
    if (ch === "]" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

function readBaseline() {
  try {
    return execFileSync("git", ["show", "8aac9aa:assistara-local-v9/academy-dashboard.html"], { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    fail("baseline reconciliation: git show 8aac9aa failed: " + error.message);
    return null;
  }
}

function baselineQuestions(source) {
  const result = new Map();
  const declarations = [...source.matchAll(/const (lesson\d+)=\{key:"([^"]+)"/g)];
  for (const [, lessonName, classKey] of declarations) {
    const array = extractArray(source, lessonName);
    if (!array) { fail("baseline reconciliation: cannot read questions for " + classKey); continue; }
    try { result.set(classKey, Function("return " + array)()); }
    catch (error) { fail("baseline reconciliation: malformed baseline questions for " + classKey + ": " + error.message); }
  }
  return result;
}

if (!correctPrefix || !correctPrefix.includes("\u2713") || !retryCue || !wrongFallback || openers.length < 6) {
  fail("dashboard feedback constants are missing or malformed");
}
if (!Array.isArray(bank) || bank.length !== EXPECTED_CLASSES.length) fail("expected exactly 33 classes, found " + (bank && bank.length));
const keys = Array.isArray(bank) ? bank.map(set => set && set.class_key) : [];
const duplicateClasses = keys.filter((key, index) => keys.indexOf(key) !== index);
if (duplicateClasses.length) fail("duplicate class keys: " + [...new Set(duplicateClasses)].join(", "));
for (const key of EXPECTED_CLASSES) if (!keys.includes(key)) fail("expected class missing: " + key);
for (const key of keys) if (!EXPECTED_CLASSES.includes(key)) fail("unexpected class: " + key);

const seenQuestionIds = new Set();
const seenOptionIds = new Set();
let questionCount = 0;
for (const set of bank || []) {
  if (!set || !EXPECTED_CLASSES.includes(set.class_key) || set.question_set_version !== set.class_key + "-v1" || !Array.isArray(set.questions)) {
    fail("malformed class record or version: " + (set && set.class_key));
    continue;
  }
  for (let questionIndex = 0; questionIndex < set.questions.length; questionIndex += 1) {
    questionCount += 1;
    const q = set.questions[questionIndex];
    const expectedId = set.class_key + ".q" + String(questionIndex + 1).padStart(2, "0");
    if (!q || typeof q !== "object" || Array.isArray(q)) { fail(set.class_key + " question " + questionIndex + " is not an object"); continue; }
    if (q.id !== expectedId) fail(set.class_key + " expected question id " + expectedId + ", found " + q.id);
    if (seenQuestionIds.has(q.id)) fail("duplicate question id: " + q.id);
    seenQuestionIds.add(q.id);
    if (typeof q.prompt !== "string" || !q.prompt.trim()) fail(q.id + " has malformed/empty prompt");
    if (!Array.isArray(q.options) || q.options.length !== 4) { fail(q.id + " must have exactly four options"); continue; }
    const localOptionIds = new Set();
    for (let optionIndex = 0; optionIndex < q.options.length; optionIndex += 1) {
      const option = q.options[optionIndex];
      const optionId = q.id + ".o" + String(optionIndex + 1).padStart(2, "0");
      if (!option || option.id !== optionId || typeof option.text !== "string" || !option.text.trim()) fail(q.id + " malformed option at index " + optionIndex);
      if (localOptionIds.has(option && option.id)) fail(q.id + " duplicate option id " + (option && option.id));
      if (seenOptionIds.has(option && option.id)) fail("duplicate option id in bank: " + (option && option.id));
      localOptionIds.add(option && option.id);
      seenOptionIds.add(option && option.id);
    }
    if (!q.options.some(option => option && option.id === q.correct_option_id)) fail(q.id + " has no valid correct_option_id");
    if (typeof q.correct_explanation !== "string" || !q.correct_explanation.trim()) fail(q.id + " missing correct_explanation");
    else if (correctPrefix && !(q.correct_explanation === correctPrefix.trimEnd() || q.correct_explanation.startsWith(correctPrefix))) fail(q.id + " correct_explanation has an invalid prefix");
    if (!q.wrong_feedback_by_option || typeof q.wrong_feedback_by_option !== "object" || Array.isArray(q.wrong_feedback_by_option)) {
      fail(q.id + " missing wrong_feedback_by_option object");
      continue;
    }
    const wrongIds = q.options.filter(option => option.id !== q.correct_option_id).map(option => option.id).sort();
    const feedbackIds = Object.keys(q.wrong_feedback_by_option).sort();
    if (JSON.stringify(wrongIds) !== JSON.stringify(feedbackIds)) fail(q.id + " wrong-feedback keys do not exactly cover wrong options");
    for (const option of q.options) {
      if (option.id === q.correct_option_id) continue;
      const feedback = q.wrong_feedback_by_option[option.id];
      if (typeof feedback !== "string" || feedback.trim().length < 25) { fail(q.id + " missing useful feedback for " + option.id); continue; }
      if (containsLongPhrase(feedback, q.options.find(candidate => candidate.id === q.correct_option_id).text)) fail(q.id + " wrong feedback discloses correct option text");
      if (/the answer is|correct answer is|choose option|pick this|instead choose|option [1-4]/i.test(feedback)) fail(q.id + " wrong feedback points at the answer");
    }
    if (PHASE_2_CLASSES.has(set.class_key)) {
      const texts = wrongIds.map(id => q.wrong_feedback_by_option[id]);
      if (new Set(texts).size !== texts.length) fail(q.id + " Phase 2 wrong-option feedback is not option-specific");
    }
  }
}
if (questionCount !== TOTAL_QUESTIONS) fail("expected 143 questions, found " + questionCount);

const baseline = readBaseline();
if (baseline) {
  const baselineMap = baselineQuestions(baseline);
  const baselineKeys = [...baselineMap.keys()];
  if (baselineKeys.length !== EXPECTED_CLASSES.length) fail("baseline class count mismatch: expected 33, found " + baselineKeys.length);
  for (const key of EXPECTED_CLASSES) if (!baselineMap.has(key)) fail("baseline class missing: " + key);
  const baselinePrefix = (baseline.match(/const QC_CORRECT_PREFIX="([^"]*)"/) || [])[1];
  const baselineCue = (baseline.match(/const QC_RETRY_CUE="([^"]*)"/) || [])[1];
  const baselineFallback = (baseline.match(/const QC_WRONG_FALLBACK="([^"]*)"/) || [])[1];
  const baselineOpenersBlock = (baseline.match(/const QC_WRONG_OPENERS=\[([^\]]*)\]/) || [])[1] || "";
  const baselineOpeners = [...baselineOpenersBlock.matchAll(/"([^"]*)"/g)].map(match => match[1]);
  const currentOpeners = openers;
  for (const set of bank || []) {
    const oldQuestions = baselineMap.get(set.class_key) || [];
    if (oldQuestions.length !== set.questions.length) {
      fail("baseline question-count mismatch for " + set.class_key + ": " + oldQuestions.length + " vs " + set.questions.length);
      continue;
    }
    for (let i = 0; i < oldQuestions.length; i += 1) {
      const old = oldQuestions[i];
      const current = set.questions[i];
      if (current.prompt !== old.q) fail(current.id + " prompt differs from baseline");
      if (JSON.stringify(current.options.map(option => option.text)) !== JSON.stringify(old.a)) fail(current.id + " option text/order differs from baseline");
      const expectedCorrect = old.why && old.why.trim() ? baselinePrefix + old.why : baselinePrefix.trimEnd();
      if (current.correct_explanation !== expectedCorrect.replace(/^\?/, "✓")) fail(current.id + " correct explanation body differs from baseline");
      if (set.class_key.startsWith("p2")) {
        let seed = 0;
        for (let c = 0; c < old.q.length; c += 1) seed = (seed * 31 + old.q.charCodeAt(c)) >>> 0;
        for (let optionIndex = 0; optionIndex < old.a.length; optionIndex += 1) {
          if (optionIndex === old.correct) continue;
          const optionId = current.options[optionIndex].id;
          const why = old.whyWrong && old.whyWrong[optionIndex];
          const body = why && why.trim() ? why.trim() : baselineFallback;
          const expected = baselineOpeners[(seed + optionIndex) % baselineOpeners.length] + " " + body + baselineCue;
          if (current.wrong_feedback_by_option[optionId] !== expected) fail(current.id + " wrong feedback for " + optionId + " differs from baseline transformation");
        }
      }
    }
  }
  void currentOpeners;
}

if (failures.length) {
  console.error("Quick Check server-bank validator: FAIL");
  for (const message of failures) console.error("  FAIL " + message);
  process.exit(1);
}
console.log("Quick Check server-bank validator: PASS");
console.log("  classes: " + bank.length + "/33");
console.log("  questions: " + questionCount + "/143");
console.log("  stable IDs, four options, versions, correct-answer copy, all wrong-option feedback: PASS");
console.log("  Phase 2 option-specific feedback: PASS");
console.log("  baseline fidelity (prompts/options/correct explanations/Phase 2 wrong feedback): PASS");
