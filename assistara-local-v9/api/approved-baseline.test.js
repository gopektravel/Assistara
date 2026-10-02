"use strict";

// approved-baseline.test.js — regression protection for the APPROVED Academy
// visual baseline, restored from git baseline 3ae51e8 on 2026-10-01.
//
// The owner rejected the "RESPONSIVE LESSON ARCHITECTURE" two-column lesson
// system that existed only as an uncommitted working-tree change. This suite
// exists so that system (and the phase-card journey that replaced the approved
// dot journey) can never come back, and so the approved presentation stays
// pinned. It also re-asserts the FUNCTIONAL layers that must survive the
// presentation rollback, because a visual rollback that quietly drops grading,
// slide mappings or exam security is a failure, not a restoration.
//
// Baseline of record: 3ae51e8 == origin/main == HEAD.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const html = fs.readFileSync(DASHBOARD, "utf8");
const htmlNoComments = html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
const count = (hay, needle) => hay.split(needle).length - 1;

const CSS = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n").replace(/<\/?style[^>]*>/g, "");

// ---------------------------------------------------------------------------
// 1. The rejected two-column lesson architecture must never return
// ---------------------------------------------------------------------------
test("no generic two-column lesson architecture exists", () => {
  assert.equal(html.includes("RESPONSIVE LESSON ARCHITECTURE"), false,
    "the rejected architecture banner must not ship");
  assert.equal(/\.lessonShell\s*\{\s*display:grid/.test(htmlNoComments), false,
    "the lesson shell must never become a grid");
  assert.equal(htmlNoComments.includes("grid-template-columns:repeat(2,minmax(0,1fr));column-gap:36px"), false,
    "the two-column lesson template must not exist");
  assert.equal(htmlNoComments.includes(".lessonShell>*{grid-column:1/-1}"), false,
    "teaching sections must not be full-width grid children");
  assert.equal(htmlNoComments.includes(".lessonShell>.lessonSection{grid-column:auto}"), false,
    "teaching sections must not flow side-by-side");
  assert.equal(htmlNoComments.includes(".lessonShell>.lessonSection[data-qc-section]{grid-column:1/-1}"), false,
    "the Quick Check section must not be re-placed by the grid");
  // The desktop widening that pushed .main toward 1440px for the lesson grid.
  assert.equal(htmlNoComments.includes(".main{max-width:1440px}"), false,
    "the 1440px main widening must not exist");
  assert.equal(/@media\s*\(min-width:1700px\)/.test(htmlNoComments), false,
    "the 1700px lesson-architecture breakpoint must not exist");
  assert.equal(/@media\s*\(min-width:1180px\)/.test(htmlNoComments), false,
    "the 1180px lesson-architecture breakpoint must not exist");
});

test("Quick Check questions never flow into columns", () => {
  // The rejected build added, inside the 1180px block:
  //   .lessonSection[data-qc-section] .quiz{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}
  assert.equal(htmlNoComments.includes("minmax(420px,1fr)"), false,
    "the two-column Quick Check template must not exist");
  assert.equal(/\.quiz\s*\{[^}]*grid-template-columns/.test(htmlNoComments), false,
    ".quiz must stay a single-column flow");
  // Question 1 -> answers -> feedback -> Question 2, always.
  assert.match(htmlNoComments, /\.objectives,\.quiz,\.answers\s*\{\s*display:grid;gap:9px\s*\}/,
    "the quiz must be a plain vertical stack");
  assert.match(htmlNoComments,
    /\[data-qc-section\]:not\(\.quizCompleteState\) \.question \.answers,\s*\[data-qc-section\]:not\(\.quizCompleteState\) \.quizQ\[data-q\] \.answers\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*1fr;/,
    "Quick Check answers must be pinned to one column at every width");
});

// ---------------------------------------------------------------------------
// 2. The approved lesson presentation, pinned to the baseline declarations
// ---------------------------------------------------------------------------
test("the approved centred lesson shell is the base presentation", () => {
  assert.match(htmlNoComments, /\.lessonShell\{max-width:920px;margin:0 auto\}/,
    "the approved centred shell base must be present");
  assert.match(htmlNoComments, /\.lessonShell\{max-width:980px\}/,
    "the approved 980px refinement must be present");
  assert.equal(/\.lessonShell\{width:100%;max-width:none/.test(htmlNoComments), false,
    "the full-bleed shell must not ship");
  // Sections stack vertically with the approved spacing and a rule between them.
  assert.match(htmlNoComments, /\.lessonSection\{padding:28px 0;border-bottom:1px solid var\(--line\)\}/,
    "the approved vertical section spacing must be present");
  // Original paragraph width / spacing / colour.
  assert.match(htmlNoComments, /\.lessonSection p\{font-size:16px;line-height:1\.72;color:#4e4942\}/,
    "the approved body-copy rule must be present");
  assert.equal(/\.lessonSection p\{[^}]*max-width:none/.test(htmlNoComments), false,
    "body copy must not be un-measured across the full column");
  assert.match(htmlNoComments, /\.lessonHead \.lead\{font-size:13px;line-height:1\.5\}/,
    "the approved lead paragraph must be present");
  assert.equal(/\.lessonHead \.lead\{[^}]*max-width:70ch/.test(htmlNoComments), false,
    "the rejected 70ch lead cap must not ship");
});

test("the approved prominent 16:9 player is restored", () => {
  assert.match(htmlNoComments,
    /\.lessonVideo\{aspect-ratio:16\/9;background:#171717;color:#fff;border-radius:24px;display:grid;place-items:center;text-align:center;padding:30px\}/,
    "the approved 16:9 player plate must be the base rule");
  assert.equal(/max-height:300px|max-height:190px/.test(htmlNoComments), false,
    "the player must not be height-clamped (that produced the cramped strip)");
  assert.equal(htmlNoComments.includes("max-width:1180px"), false,
    "the player must take its width from the lesson column");
  // The baseline edge-to-edge phone video is still present.
  assert.match(htmlNoComments, /\.lessonVideo\{width:calc\(100% - \(var\(--mobile-gutter\) \* 2\)\);margin:0 var\(--mobile-gutter\);aspect-ratio:16\/9/,
    "the approved edge-to-edge phone video must survive");
});

test("CTA typography follows the approved system", () => {
  assert.match(htmlNoComments,
    /\.lessonActions a,\.lessonActions span\{background:#fff;border:1px solid var\(--line\);border-radius:999px;padding:9px 12px;font-size:11px;font-weight:800/,
    "the approved 11px/800 pill must be present");
  assert.equal(/\.lessonActions[^{]*\{[^}]*font-size:13px/.test(htmlNoComments), false,
    "the rejected 13px CTA bump must not ship");
  assert.match(htmlNoComments, /\.lessonBack\{[^}]*font:800 12px Manrope/,
    "the approved 800-weight back link must be present");
  // The touch floor stays where it belongs: the touch breakpoint only.
  assert.match(htmlNoComments, /\.lessonBack\{[^}]*min-height:44px/,
    "the back control must meet the 44px touch minimum on touch viewports");
  assert.match(htmlNoComments, /\.lessonActions[^{,]*\{[^}]*min-height:4[0-9]px/,
    "the action chips must meet the 44px touch minimum on touch viewports");
});

test("every approved lesson family is still present", () => {
  for (const family of [
    ".conceptGrid", ".shiftCompare", ".workflow", ".laneExplorer", ".signalPath",
    ".ownershipFormula", ".weekMap", ".focusStage", ".focusSplit",
    ".manualSignalMap", ".emailTriage", ".vbrandLesson", ".lessonThesis",
  ]) {
    assert.ok(html.includes(family), "approved lesson family " + family + " must not be removed");
    assert.match(htmlNoComments, new RegExp(family.replace(".", "\\.") + "\\s*(?:[,{:.\\[#a-zA-Z0-9_-]|$)"),
      "approved lesson family " + family + " must keep its CSS rules");
  }
});

// ---------------------------------------------------------------------------
// 3. Exactly ONE Phase Journey, Phase 1 -> 2 -> 3 -> 4
// ---------------------------------------------------------------------------
test("there is exactly one Phase Journey and it ends at Phase 4", () => {
  assert.equal(count(html, 'id="phaseJourney"'), 1, "there must be exactly one journey mount");
  assert.equal(count(html, 'class="journey"'), 1, "there must be exactly one .journey container");
  // The restored historical component has NO dot/line rail and NO current card.
  for (const gone of ['class="phaseSteps"', 'class="phaseCurrent"', 'class="phaseStep', 'class="phaseDot']) {
    assert.equal(count(html, gone), 0, 'the dot/line rail marker "' + gone + '" must not exist');
  }
  // No duplicate journey UI.
  assert.equal(count(htmlNoComments, "#phaseJourney{display:block}"), 0,
    "the ID-scoped block override that suppressed the .journey grid must be gone");
});

test("the Phase Journey is the ORIGINAL four-square-card presentation (532d0c8a)", () => {
  // Restored from git history: commit 532d0c8a, 2026-09-22 23:54:15 +0800,
  // "Add sequential module and class unlock journey". This is the component the
  // owner asked for back; the dot/line rail that replaced it must not return.
  assert.match(htmlNoComments, /\.journey\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px\}/,
    "four equal phase cards in the original grid");
  assert.match(htmlNoComments,
    /\.journey button\{background:#fff;border:1px solid var\(--line\);border-radius:15px;padding:13px;text-align:left;font:inherit;cursor:pointer\}/,
    "the original white square card");
  assert.match(htmlNoComments, /\.journey button\.doneCard\{background:#fbfff9\}/,
    "the original passed-card tint");
  assert.match(htmlNoComments, /\.journey strong\{display:block;font-size:12px\}/,
    "the original phase-number line");
  assert.match(htmlNoComments, /\.journey small\{font-size:10px;color:var\(--muted\)\}/,
    "the original state line");
  assert.match(htmlNoComments, /\.lockedCard,[^}]*\.journey button:disabled,[^}]*\{background:#efede8;/,
    "the original locked-card treatment");
  // The rejected presentations are gone from CSS AND markup.
  assert.equal(/phaseStepName|phaseStepStatus|phaseStepBar/.test(html), false,
    "the rejected per-step name / status / progress bar must not exist");
  for (const gone of ["phaseSteps", "phaseStep", "phaseDot", "phaseCurrent", "phaseStepTitle", "phaseStepState", "phaseStepMeta"]) {
    assert.equal(html.includes(gone), false, 'the dot/line rail\'s "' + gone + '" must be gone');
  }
});

test("the Phase Journey never contains the Final Assessment or the Certificate", () => {
  const start = html.indexOf('getElementById("phaseJourney").innerHTML=');
  const end = html.indexOf('document.querySelectorAll("[data-journey]")', start);
  assert.ok(start > 0 && end > start, "the journey builder must exist");
  const journey = html.slice(start, end);
  assert.equal(/certificate/i.test(journey), false, "no Certificate node in the journey");
  assert.equal(/final/i.test(journey), false, "no Final Assessment node in the journey");
  assert.equal(/Phase 5|pi<5|curriculum\.length\+1/.test(journey), false,
    "the journey must be exactly the four curriculum phases");
  // The restored historical builder (532d0c8a) uses curriculum.map directly without
  // a .phaseSteps wrapper.
  assert.match(journey, /getElementById\("phaseJourney"\)\.innerHTML=curriculum\.map\(\(p,pi\)=>/,
    "the steps must be generated from the four curriculum phases");
  // The journey must not be hidden by a blanket display:none.
  assert.equal(/\.phaseSteps\s*,\s*\.phaseCurrent\s*\{\s*display:none\s*\}/.test(htmlNoComments), false,
    "the journey must not be hidden");
});

// ---------------------------------------------------------------------------
// 4. Functional layers must survive the presentation rollback
// ---------------------------------------------------------------------------
test("Quick Check grading and security are intact", () => {
  assert.match(html, /mountQuickCheck\s*\(/, "Quick Check mounting must exist");
  assert.match(html, /checkAnswers/, "server-side grading must be called");
  assert.match(html, /data-qc-section/, "the Quick Check section hook must exist");
  const qcBank = path.join(__dirname, "_quick-check-bank.js");
  assert.ok(fs.existsSync(qcBank), "the Quick Check bank must exist");
  const bank = fs.readFileSync(qcBank, "utf8");
  assert.match(bank, /p1m1c1/, "the bank must cover the approved classes");
  assert.match(bank, /p4m4c5/, "the bank must cover the newest classes");
});

test("curriculum scale and progression are intact", () => {
  assert.ok(count(html, /function renderLesson\d+\(/) >= 90,
    "all 90 classes must keep their own lesson renderer");
  for (const fn of ["renderHome", "renderCourse"]) {
    assert.match(html, new RegExp("function " + fn + "\\("), fn + " must exist");
  }
  assert.match(html, /phaseExamCta/, "the Phase Exam CTA wiring must exist");
  assert.match(html, /data-open="certificate"/, "the Certificate entry point must exist");
  assert.match(html, /id="skills"/, "the Skills page must exist");
  assert.match(html, /openLessonSlidesPreview/, "the slides viewer must be wired");
  assert.match(html, /resolveSlideFileId/, "the slide mapping resolver must exist");
  assert.match(html, /test-portal|testPortal/, "the Test Portal must exist");
});

test("fonts are Manrope-only", () => {
  assert.equal(/DM Sans|DM\+Sans/.test(html), false, "DM Sans must not be reintroduced");
  assert.match(html, /family=Manrope:/, "Manrope must be the only loaded webfont");
  assert.match(html, /manrope-lock\.css/, "the Manrope lock stylesheet must be referenced");
});

// ---------------------------------------------------------------------------
// 5. Structural sanity of the edited file
// ---------------------------------------------------------------------------
test("the dashboard stylesheet is structurally balanced", () => {
  assert.equal(count(html, "<style"), 5, "there must be five style blocks (original 4 + portal composition)");
  assert.equal(count(html, "</style>"), 5, "every style block must be closed");
  let n = 0;
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(html))) {
    n++;
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
    let open = 0, close = 0;
    for (const ch of css) { if (ch === "{") open++; else if (ch === "}") close++; }
    assert.equal(open, close, "style block " + n + " must have balanced braces");
  }
  assert.equal(n, 5, "all five style blocks must be scanned");
  assert.ok(CSS.length > 0, "stylesheet content must be present");
});