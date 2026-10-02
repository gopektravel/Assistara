"use strict";

// portal-cta-buffer.test.js — the CTA scale and the desktop workspace buffer.
//
// Owner directive, 2 October 2026:
//   #8  CTAs compact + strong + readable. NOT skinny text, NOT fat pills.
//       Desktop ~40-44px for normal important actions; touch 44-46px.
//       NOT one universal .btn override, and Quick Check / Phase Exam /
//       Final Assessment controls must not be damaged.
//   #9  A consistent desktop workspace buffer: comfortable space between the
//       sidebar and content, and between content and the right viewport edge.
//       Use more of a PC screen than the old 1260px cap, without going
//       full-bleed and without stretching reading text.
//
// The measured problem these lock down (real rendered values, not assumptions):
//   before: mainLeftGap 0px, mainRightEdgeGap 15px at BOTH 1366 and 1920,
//           because .main's 1720px cap never engaged - the widest grid track is
//           ~1670px once the 250px sidebar and scrollbar are removed, so
//           content sat flush against the sidebar and hard against the edge.
//   after:  1920 -> 95px / 111px gutters, 1366 -> 48px / 63px, and 1464px of
//           content width versus 1180px in the shipped baseline.
//
// Run: node --test assistara-local-v9/api/portal-cta-buffer.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const html = fs.readFileSync(DASHBOARD, "utf8");
const NC = html.replace(/\/\*[\s\S]*?\*\//g, "");

// The CTA scale block, isolated by its own comment marker in the raw source.
const CTA_MARKER = "#8 CTA / button scale";
const ctaAt = html.indexOf(CTA_MARKER);
assert.ok(ctaAt > 0, "the CTA scale block must exist");
const styleStart = html.lastIndexOf("<style>", ctaAt);
const styleEnd = html.indexOf("</style>", ctaAt);
assert.ok(styleStart > 0 && styleEnd > ctaAt, "the CTA block must sit inside a <style> element");
const CTA = html.slice(ctaAt, styleEnd).replace(/\/\*[\s\S]*?\*\//g, "");
const CTA_RULES = [...CTA.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(m => ({
  selector: m[1].trim().replace(/\s+/g, " "),
  body: m[2].trim().replace(/\s+/g, " "),
}));
const selectors = CTA_RULES.map(r => r.selector);

// ---------------------------------------------------------------------------
// #9 — desktop workspace buffer
// ---------------------------------------------------------------------------
test("#9: the desktop workspace buffer is a cap that actually engages", () => {
  // The base cap must be untouched: the mobile/tablet layout still uses it.
  assert.match(NC, /\.main\{padding:36px 40px 70px;max-width:1260px;width:100%\}/,
    "the shipped 1260px base .main must be untouched");

  // The desktop cap must be present and centred.
  assert.match(NC, /\.main\{max-width:1560px;justify-self:center;padding-left:48px;padding-right:48px\}/,
    "the desktop workspace must be centred with an explicit horizontal buffer");

  // The whole point: a cap only creates a buffer if it is NARROWER than the
  // space available. The widest track is viewport - 250px sidebar - scrollbar.
  // At 1920 that is ~1655px, so a 1720px cap could never engage. Assert the
  // shipped cap is genuinely below that, and that the old non-engaging one is
  // gone.
  const SIDEBAR = 250;
  const SCROLLBAR = 15;
  const widestTrack = 1920 - SIDEBAR - SCROLLBAR;
  const cap = /max-width:(\d+)px;justify-self:center/.exec(NC);
  assert.ok(cap, "a desktop max-width with justify-self:center must exist");
  const capPx = Number(cap[1]);
  assert.ok(capPx < widestTrack,
    "the desktop cap (" + capPx + "px) must be narrower than the widest available track ("
    + widestTrack + "px) or no buffer can ever exist at 1920");
  assert.equal(/max-width:1720px/.test(NC), false,
    "the 1720px cap never engaged and must be gone");

  // The buffer must be real on BOTH sides, not only the right.
  assert.match(NC, /\.main\{max-width:1560px;justify-self:center;padding-left:48px;padding-right:48px\}/,
    "the desktop workspace needs gutters on both sides");

  // Reading measures must NOT be stretched to fill the wider workspace.
  assert.match(NC, /\.lead\{[^}]*max-width:720px/, "the Home lead keeps its reading measure");
  assert.match(NC, /\.lessonShell\{max-width:920px/, "the approved lesson shell keeps its measure");
  assert.equal(/DESKTOP PORTAL COMPOSITION PASS[\s\S]*?\.lessonShell\{[^}]*max-width:/.test(html), false,
    "the portal pass must not re-cap or widen the lesson shell");
});

test("#9: the workspace still uses more width than the shipped 1260px baseline", () => {
  // 1260px base minus its own 80px padding = 1180px of content.
  const baselineContent = 1260 - 80;
  // New: 1560px cap minus 2 x 48px padding = 1464px of content.
  const cap = Number(/max-width:(\d+)px;justify-self:center/.exec(NC)[1]);
  const pad = /justify-self:center;padding-left:(\d+)px;padding-right:(\d+)px/.exec(NC);
  const newContent = cap - Number(pad[1]) - Number(pad[2]);
  assert.ok(newContent > baselineContent,
    "the desktop workspace must be wider than the shipped baseline content width (" +
    baselineContent + "px); got " + newContent + "px");
  // But it must still be a genuine buffer, not full-bleed.
  assert.ok(newContent <= widestTrackForTest(),
    "the workspace must still leave room for gutters, not run edge to edge");
});

function widestTrackForTest() { return 1920 - 250 - 15; }

// ---------------------------------------------------------------------------
// #8 — CTA scale
// ---------------------------------------------------------------------------
test("#8: normal important CTAs are sized 40-44px on desktop", () => {
  // One named rule per control family - not a universal .btn override.
  const families = [
    ["#continueCard .btn", "Continue Learning", 40, 44],
    ["#home>.sectionTitle:has(+ #skillsSnapshot) .btn", "View My Skills", 39, 45],
    ["#courseView .classCard .btn", "Review / Start Class", 39, 45],
    ["#courseView .phaseCard .btn,#courseView .moduleCard .btn", "Module / Phase action", 39, 45],
    ["#certExams .btn:not(#startFinalExam)", "Download Certificate", 39, 45],
    ["#settings .resource .btn,#resources .resource .btn", "Settings / Resources action", 39, 45],
  ];
  for (const [selector, label, min, max] of families) {
    const rule = CTA_RULES.find(r => r.selector === selector);
    assert.ok(rule, label + " must have its own CTA rule; found selectors: " + selectors.join(" | "));
    const mh = /min-height:(\d+)px/.exec(rule.body);
    assert.ok(mh, label + " must set an explicit min-height");
    const px = Number(mh[1]);
    assert.ok(px >= min && px <= max,
      label + " must be " + min + "-" + max + "px on desktop, got " + px + "px");
  }
});

test("#8: tertiary and breadcrumb CTAs are compact but still have a real hit area", () => {
  const viewAll = CTA_RULES.find(r => r.selector === ".achvViewAll");
  assert.ok(viewAll, "View all must have its own rule");
  const va = Number(/min-height:(\d+)px/.exec(viewAll.body)[1]);
  assert.ok(va >= 30 && va <= 40,
    "View all is a tertiary action: compact, but " + va + "px must stay clickable");

  // The breadcrumb back control was a bare 16px text link. It must now carry a
  // hit area on BOTH breakpoints without becoming a fat pill.
  const crumbDesktop = CTA_RULES.filter(r => r.selector === ".crumbs button");
  assert.ok(crumbDesktop.length >= 2,
    "the breadcrumb must be sized at desktop AND at touch");
  const desktopRule = crumbDesktop[0];
  const desktopMin = Number(/min-height:(\d+)px/.exec(desktopRule.body)[1]);
  assert.ok(desktopMin >= 30,
    "the breadcrumb back control must have a real desktop hit area, got " + desktopMin + "px");
  const touchRule = crumbDesktop[1];
  const touchMin = Number(/min-height:(\d+)px/.exec(touchRule.body)[1]);
  assert.ok(touchMin >= 44, "the breadcrumb must meet the 44px touch floor, got " + touchMin + "px");
});

test("#8: touch breakpoints keep a 44-46px floor", () => {
  const touchAt = CTA.indexOf("@media(max-width:850px)");
  assert.ok(touchAt > 0, "the CTA block must declare a touch breakpoint");
  // A rule is a TOUCH rule when its selector appears after the touch media
  // query opened. Using indexOf (first occurrence) would wrongly find the
  // desktop rule of the same family.
  for (const [selector, label, min, max] of [
    ["#courseView .classCard .btn", "class action", 44, 47],
    ["#home #continueCard .btn", "Continue Learning", 44, 47],
    [".achvViewAll", "View all", 44, 47],
    [".crumbs button", "breadcrumb back", 44, 47],
  ]) {
    const at = CTA.indexOf(selector, touchAt);
    assert.ok(at !== -1, label + " must have a touch-size rule inside @media(max-width:850px)");
    const px = Number(/min-height:(\d+)px/.exec(CTA.slice(at).match(/\{([^}]*)\}/)[1])[1]);
    assert.ok(px >= min && px <= max,
      label + " must be " + min + "-" + max + "px at touch, got " + px + "px");
  }
  // The shipped touch floor for lesson + Quick Check must survive untouched.
  assert.match(NC, /\.lessonBack\{[^}]*min-height:44px/, "the lesson back control keeps its 44px floor");
  assert.match(NC, /\.lessonActions[^{,]*\{[^}]*min-height:4[0-9]px/, "lesson action chips keep their floor");
});

test("#8: no universal .btn override, and no assessment control is resized", () => {
  // A bare `.btn{...}` in the CTA block would resize everything, including the
  // Quick Check, the Phase Exam and the Final Assessment.
  assert.equal(selectors.includes(".btn"), false,
    "the CTA scale must not be a single universal .btn override; selectors: " + selectors.join(" | "));
  assert.equal(/^\s*\.btn\{/.test(CTA), false,
    "the CTA block must not contain a bare .btn rule");

  // Nothing that could match an assessment or Quick Check control. A selector
  // that names one only inside :not(...) EXCLUDES it, so strip :not(...) before
  // scanning - otherwise the deliberate certificate exclusion reads as a hit.
  const positiveSelectors = selectors.map((s) => s.replace(/:not\([^)]*\)/g, ""));
  for (const forbidden of [
    "startPhaseExam", "phaseExamStart", "startFinalExam",
    "quizSubmit", "checkBtn", ".answer", "answers", "data-qc-section",
    "lessonBack", "lessonResourceOpen", "lessonActions",
  ]) {
    assert.equal(positiveSelectors.some(s => s.includes(forbidden)), false,
      "the CTA block must not resize \"" + forbidden + "\"; selectors: " + selectors.join(" | "));
  }

  // The Final Assessment control must be explicitly excluded where the
  // Certificate actions are sized, because it lives inside #certExams.
  const certRule = CTA_RULES.find(r => r.selector.includes("#certExams"));
  assert.ok(certRule, "the certificate action rule must exist");
  assert.match(certRule.selector, /:not\(#startFinalExam\)/,
    "the certificate rule must exclude #startFinalExam - that button is the Final Assessment control");

  // Those controls must still exist and keep their shipped sizing.
  assert.match(html, /id="startPhaseExam"/, "the Phase Exam control must still ship");
  assert.match(html, /btn phaseExamStart/, "the Phase Exam control must keep its class hook");
  assert.match(html, /id="startFinalExam"/, "the Final Assessment control must still ship");
  assert.match(NC, /\.quizSubmit \.btn,\.checkBtn,#finishLesson10,#continueM3Class3\{width:100%;min-height:50px\}/,
    "the Check Answers / quiz submit control must keep its shipped 50px floor");
  assert.match(NC, /\.findingsLesson \.answer\{min-height:48px\}/,
    "Quick Check answer controls must keep their shipped sizing");
});

test("#8: CTA text stays clearly bold, not skinny", () => {
  // The families that were previously 10px type are the "skinny text" problem.
  for (const selector of [
    "#courseView .phaseCard .btn,#courseView .moduleCard .btn",
    "#courseView .classCard .btn",
    "#certExams .btn:not(#startFinalExam)",
    "#settings .resource .btn,#resources .resource .btn",
  ]) {
    const rule = CTA_RULES.find(r => r.selector === selector);
    assert.ok(rule, selector + " must exist");
    const fs_ = /font-size:([\d.]+)px/.exec(rule.body);
    assert.ok(fs_, selector + " must set an explicit font-size");
    assert.ok(Number(fs_[1]) >= 11,
      selector + " type must be readable (>=11px), got " + fs_[1] + "px");
  }
  // The base Assistara button language must remain bold.
  assert.match(NC, /\.btn\{[^}]*font:800 12px/, "the base .btn must keep the 800 weight Assistara language");
});

// ---------------------------------------------------------------------------
// Phase Journey stays the historical component and stays compact
// ---------------------------------------------------------------------------
test("Your Path stays historical, four cards only, and compact on desktop", () => {
  const a = html.indexOf('getElementById("phaseJourney").innerHTML=');
  const b = html.indexOf('document.querySelectorAll("[data-journey]")', a);
  const journey = html.slice(a, b);
  assert.match(journey,
    /getElementById\("phaseJourney"\)\.innerHTML=curriculum\.map\(\(p,pi\)=>\{let s=phaseStatus\(pi\),locked=s\.key==="locked";return '<button '\+\(locked/,
    "the journey builder must stay the historical four-card one");
  assert.equal(/final/i.test(journey), false, "no Final Assessment node");
  assert.equal(/certificate/i.test(journey), false, "no Certificate node");
  for (const gone of ["phaseSteps", "phaseStep", "phaseDot", "phaseCurrent"]) {
    assert.equal(html.includes(gone), false, gone + " must not reappear");
  }
  // The compact desktop card, verified as the 20-25% reduction in
  // portal-desktop.test.js; assert the shipped values here so a later edit
  // cannot quietly re-inflate them.
  assert.match(NC, /\.journey button\{padding:12px 14px 11px;border-radius:15px\}/,
    "the 1366px journey card must stay compact");
  assert.match(NC, /\.journey button\{padding:14px 16px 13px\}/,
    "the very wide journey card must stay compact");
  assert.equal(/padding:18px 18px 16px/.test(NC), false, "the first-pass 18px padding must stay gone");
  assert.equal(/padding:22px 22px 20px/.test(NC), false, "the first-pass 22px padding must stay gone");
});

// ---------------------------------------------------------------------------
// Quick Check must stay ONE vertical flow
// ---------------------------------------------------------------------------
test("the Quick Check stays a single vertical flow", () => {
  // The shipped rule scopes through .quizQ[data-q]; match it as it actually is.
  assert.match(NC,
    /\[data-qc-section\]:not\(\.quizCompleteState\)[^{}]*\.answers \{[^{}]*grid-template-columns: 1fr/,
    "Quick Check answers must be a single column");
  assert.equal(/\[data-qc-section\][^{]*\.answers\{grid-template-columns:\s*repeat/.test(NC), false,
    "Quick Check answers must never be placed in desktop columns");
});
