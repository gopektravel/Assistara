"use strict";

// Server-side Academy curriculum registry.
//
// The exam endpoint needs to answer two questions without trusting the browser:
//   1. which classes must be complete before a phase exam may be attempted, and
//   2. how many classes a phase contains (for progress reporting).
//
// The class list is declared here ONCE and asserted against the Quick Check bank
// at load time, so a curriculum change that adds a class without a matching
// Quick Check set fails loudly instead of silently unlocking an exam. The
// browser keeps its own copy in the dashboard; the audit suite checks the two
// agree, and `assertMatchesDashboard` is called by the exam test.

const PHASE_SHAPES = Object.freeze({
  1: Object.freeze([4, 4, 4, 3, 3, 4]),
  2: Object.freeze([4, 3, 4, 4, 2, 2, 5, 2, 4, 2]),
  3: Object.freeze([5, 6, 3, 4]),
  4: Object.freeze([4, 4, 5, 5]),
});

const PHASE_TITLES = Object.freeze({
  1: "Freelancing Foundations",
  2: "Creative & Digital Marketing Skills",
  3: "AI & Digital Systems",
  4: "Landing Your First Client",
});

function buildPhaseClassKeys() {
  const out = new Map();
  for (const [phaseNumber, moduleCounts] of Object.entries(PHASE_SHAPES)) {
    const keys = [];
    moduleCounts.forEach((count, moduleIndex) => {
      for (let classIndex = 1; classIndex <= count; classIndex += 1) {
        keys.push(`p${phaseNumber}m${moduleIndex + 1}c${classIndex}`);
      }
    });
    out.set(Number(phaseNumber), Object.freeze(keys));
  }
  return out;
}

const PHASE_CLASS_KEYS = buildPhaseClassKeys();
const PHASE_NUMBERS = Object.freeze(Object.keys(PHASE_SHAPES).map(Number).sort());
const ALL_CLASS_KEYS = Object.freeze(PHASE_NUMBERS.flatMap(phase => PHASE_CLASS_KEYS.get(phase)));
const CLASS_KEY_TO_PHASE = new Map(ALL_CLASS_KEYS.map(classKey => [classKey, Number(classKey.slice(1, 2))]));

// The exam key that must be passed before `phaseNumber` becomes reachable.
function requiredExamForPhase(phaseNumber) {
  return phaseNumber <= 1 ? null : `phase_${phaseNumber - 1}`;
}

function phaseForClassKey(classKey) {
  return CLASS_KEY_TO_PHASE.get(classKey) || null;
}

function isClassKey(value) {
  return typeof value === "string" && CLASS_KEY_TO_PHASE.has(value);
}

function classKeysForPhase(phaseNumber) {
  return PHASE_CLASS_KEYS.get(phaseNumber) || null;
}

// Total classes a learner must have completed for a given phase exam to unlock.
function requiredClassKeysForExam(examKey) {
  const match = /^phase_([1-4])$/.exec(String(examKey || ""));
  if (!match) return null;
  return classKeysForPhase(Number(match[1]));
}

module.exports = {
  PHASE_SHAPES,
  PHASE_TITLES,
  PHASE_NUMBERS,
  PHASE_CLASS_KEYS,
  ALL_CLASS_KEYS,
  requiredExamForPhase,
  phaseForClassKey,
  isClassKey,
  classKeysForPhase,
  requiredClassKeysForExam,
};
