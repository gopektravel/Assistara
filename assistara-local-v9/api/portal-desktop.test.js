"use strict";

// portal-desktop.test.js — the desktop portal composition pass and the
// navigation / progression separation.
//
// Owner directive, 1 October 2026 (corrected later the same day):
//   A1  the Academy workspace must use the desktop width, not a 1260px cap
//       inside a 250px sidebar that leaves a dead band on a large monitor;
//   A2  Home must compose Welcome / Continue Learning / Academy Progress /
//       next class / next unlock / classes / modules / phases passed across
//       the real desktop space, without inventing new widgets;
//   A3  "YOUR PATH" / PHASE JOURNEY must be the ORIGINAL four-square-card
//       component restored from git history — commit 532d0c8a, 2026-09-22,
//       "Add sequential module and class unlock journey". NOT the dot/line
//       rail that replaced it, and NOT a new design. Exactly Phase 1 -> 2 ->
//       3 -> 4. No Final Assessment node. No Certificate node.
//   A4  PHASE -> MODULE -> CLASSES browsing must use the desktop width with
//       responsive columns, and the hierarchy must be obvious;
//   A5  browsing is navigation, progression is learner state. Clicking
//       backwards must never relock a phase, and changing pages must never
//       mutate completed classes, passed phase exams, unlocked phases, skill
//       progression, or final-assessment eligibility;
//   E   the approved lessons must not be redesigned to accommodate this.
//
// The A5 requirement is proven EXECUTABLY below, with the owner's own scenario:
// state = Phase 3 passed / Phase 4 unlocked, then browse Phase 4 -> 1 -> 2 ->
// 3 -> 4, clicking the real rendered journey cards, and asserting after EVERY
// click that Phase 1/2/3 are still passed and Phase 4 is still unlocked.
//
// Run: node --test assistara-local-v9/api/portal-desktop.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { createSession, readInlineScript } = require("./_qc-harness.js");

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const APPROVED_BASELINE = "3ae51e8";
const source = readInlineScript();
const html = fs.readFileSync(DASHBOARD, "utf8");

// Strip CSS/JS comments so prose describing the pass cannot satisfy a matcher.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const htmlNoComments = stripComments(html);

const MARKER = "DESKTOP PORTAL COMPOSITION PASS";
const blockStart = html.indexOf(MARKER);
assert.ok(blockStart > 0, "the desktop portal composition style block must exist");
// Slice from the enclosing <style> so the block's own header comment is
// captured whole and can actually be stripped below.
const styleOpen = html.lastIndexOf("<style>", blockStart);
const blockEnd = html.indexOf("</style>", blockStart);
assert.ok(styleOpen > 0 && blockEnd > blockStart, "the portal style block must be a complete <style> element");
const PORTAL = html.slice(styleOpen, blockEnd);
const PORTAL_NO_COMMENTS = stripComments(PORTAL);
assert.equal(PORTAL_NO_COMMENTS.includes(MARKER), false,
  "comment stripping must actually remove the portal block's header prose, or prose could satisfy a matcher");

// Helper: extract a function body from the stripped HTML source.
//
// This must be a real lexer, not naive brace counting. The dashboard bodies
// contain braces inside string and template literals (lesson markup, CSS
// snippets), so counting raw braces runs straight past the closing brace and
// "finds" writes that live in completely unrelated functions. A false positive
// there would mean either a spurious failure or, worse, a real regression
// hiding behind a broken assertion.
function extractFunction(name) {
  const src = htmlNoComments;
  const at = src.indexOf("function " + name + "(");
  assert.ok(at > 0, name + " must exist");
  const bodyStart = src.indexOf("{", at);
  assert.ok(bodyStart > at, name + " must have a body");

  let depth = 0;
  let i = bodyStart;
  while (i < src.length) {
    const c = src[i];
    // Line comment
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    // Block comment (htmlNoComments already dropped CSS comments, but JS ones
    // may remain in the inline script).
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i);
      if (i < 0) break;
      i += 2;
      continue;
    }
    // String / template literal, with backslash escapes.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    // Regex literal: only where a value is expected. Distinguished from
    // division by requiring the previous significant char to be an opener or
    // an operator.
    if (c === "/") {
      const prev = src.slice(bodyStart, i).trimEnd().slice(-1);
      if (prev === "" || "(,=:[!&|?{};+-*%~^<>".includes(prev)) {
        i++;
        let inClass = false;
        while (i < src.length) {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) { i++; break; }
          else if (src[i] === "\n") break;
          i++;
        }
        while (src[i] && /[gimsuy]/.test(src[i])) i++;
        continue;
      }
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
    i++;
  }
  throw new Error("could not find the end of " + name);
}

// The dashboard's inline script runs inside a vm context, so arrays and objects
// it returns have a foreign prototype. deepStrictEqual compares prototypes, so
// structural assertions go through a JSON round-trip.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// A1 — the desktop workspace uses the desktop width
// ---------------------------------------------------------------------------
test("A1: the Academy workspace is wider than the shipped 1260px cap AND has real gutters", () => {
  // The shipped cap produced the dead band: at 1920px the 250px sidebar left a
  // ~1655px track and .main clamped it to 1260px, stranding ~400px.
  assert.match(html, /\.main\{[^}]*max-width:1260px/, "the shipped base .main cap is still the base declaration");
  assert.match(
    PORTAL_NO_COMMENTS,
    /\.main\{max-width:1560px;justify-self:center;padding-left:48px;padding-right:48px\}/,
    "the desktop pass must widen .main, centre it, and give it explicit gutters on both sides",
  );
  // The cap must be NARROWER than the widest available track, or no gutter can
  // ever exist. A 1720px cap was wider than the ~1655px track, so it never
  // engaged and content sat flush against the sidebar (measured gap 0px).
  const widestTrack = 1920 - 250 - 15;
  const cap = Number(/max-width:(\d+)px;justify-self:center/.exec(PORTAL_NO_COMMENTS)[1]);
  assert.ok(cap < widestTrack,
    "the desktop cap (" + cap + "px) must be narrower than the widest track (" + widestTrack +
    "px) or the workspace can never have a buffer");
  // Still wider than the shipped baseline: 1260 - 80 padding = 1180px content.
  assert.ok(cap - 96 > 1260 - 80,
    "the desktop workspace must still use more width than the shipped baseline");
  // The sidebar is retained — the pass widens the workspace, it does not
  // replace the shell with a full-bleed layout.
  assert.match(html, /\.app\{min-height:100vh;display:grid;grid-template-columns:250px 1fr\}/,
    "the sidebar grid must be retained");
  assert.equal(/\.app\{[^}]*grid-template-columns:none/.test(htmlNoComments), false,
    "the desktop pass must not remove the sidebar column");
});

test("A1: reading measures keep their own caps, so no text is stretched to a long line", () => {
  // The approved lesson shell is the reading measure and must be unchanged.
  assert.match(htmlNoComments, /\.lessonShell\{max-width:980px/, "the approved 980px lesson reading measure must survive the desktop pass");
  assert.equal(/DESKTOP PORTAL COMPOSITION PASS[\s\S]*?\.lessonShell\{[^}]*max-width:/.test(PORTAL), false,
    "the portal pass must not re-cap the lesson shell");
  // The home lead paragraph keeps its measure too.
  assert.match(html, /\.lead\{[^}]*max-width:720px/, "the home lead must keep its 720px measure");
});

// ---------------------------------------------------------------------------
// A2 — the Home composition
// ---------------------------------------------------------------------------
test("A2: Home composes Continue Learning and Academy Progress across the desktop width", () => {
  // Every element the owner listed must still be present — the pass composes
  // them, it does not replace them with new widgets.
  for (const id of ["continueCard", "overallPct", "overallFill", "doneClasses", "doneModules", "passedPhases"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " must still be on Home");
  }
  assert.match(html, /Welcome, <span class="firstName">student<\/span>/, "the Welcome headline must stay");
  assert.match(source, /<div class="unlockHint">\s*✨ NEXT UNLOCK/, "the next-unlock hint must stay");
  assert.match(source, /<b>Next class:<\/b>/, "the next-class line must stay");
  // Balanced, substantial columns on desktop.
  assert.match(
    PORTAL_NO_COMMENTS,
    /#home \.dashboardGrid\{grid-template-columns:minmax\(0,1\.12fr\) minmax\(0,\.88fr\);gap:22px;align-items:stretch\}/,
    "Continue Learning and Academy Progress must be balanced desktop columns",
  );
  assert.match(PORTAL_NO_COMMENTS, /#continueCard\{padding:28px 30px!important\}/,
    "Continue Learning must be given real desktop padding");
  // #overallPct carries an inline font-size, so the desktop override MUST be
  // !important or it would silently lose to the inline style.
  assert.match(PORTAL_NO_COMMENTS, /#home \.dashboardGrid>\.card:nth-child\(2\) h2\{font-size:62px!important/,
    "the Academy Progress figure must be given desktop weight");
  assert.match(PORTAL_NO_COMMENTS, /#home \.dashboardGrid>\.card:nth-child\(2\) h2\{[^}]*margin:10px 0 16px!important/,
    "the Academy Progress figure must also override the inline margin");
});

// ---------------------------------------------------------------------------
// A3 — "YOUR PATH": the ORIGINAL four-square-card journey from 532d0c8a
//
// Restored byte-for-byte from:
//   532d0c8a3f0d223d984508c3ba29eff73d0e82a0  2026-09-22 23:54:15 +0800
//   "Add sequential module and class unlock journey"
// It was replaced by the dot/line rail in:
//   e7eb6e6d559a5fb5ee40702d6f1fe0c21a2e5c1b  2026-09-23 16:04:53 +0800
//   "Compact mobile dashboard progress and phase journey"
// The owner rejected the rail and asked for the original component back.
// ---------------------------------------------------------------------------
const HISTORICAL_COMMIT = "532d0c8a3f0d223d984508c3ba29eff73d0e82a0";

const JOURNEY_START = 'getElementById("phaseJourney").innerHTML=';
const JOURNEY_END = 'document.querySelectorAll("[data-journey]")';
const journeyStatement = () => {
  const a = html.indexOf(JOURNEY_START);
  const b = html.indexOf(JOURNEY_END, a);
  assert.ok(a > 0 && b > a, "the journey builder must exist");
  return html.slice(a, b);
};

test("A3: Your Path is the ORIGINAL four-square-card component from 532d0c8a", () => {
  // 1. The exact historical markup builder, byte-identical to git history.
  const historical = execFileSync("git", ["show", HISTORICAL_COMMIT + ":assistara-local-v9/academy-dashboard.html"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 29 });
  const ha = historical.indexOf(JOURNEY_START);
  const hb = historical.indexOf(JOURNEY_END, ha);
  assert.ok(ha > 0 && hb > ha, "the historical commit must contain the journey builder");
  const original = historical.slice(ha, hb);

  assert.equal(journeyStatement(), original,
    "the journey builder must be byte-identical to the historical one at " + HISTORICAL_COMMIT);

  // Verbatim, so a future edit has to be deliberate:
  //   return '<button '+(locked?'disabled aria-disabled="true"':'data-journey="'+pi+'"')
  //   +' class="'+(s.key==="passed"?"doneCard":locked?"lockedCard":"")
  //   +'"><strong>'+(s.key==="passed"?"\u2713 ":locked?"\ud83d\udd12 ":"\u25cb ")
  //   +'Phase '+(pi+1)+'</strong><small>'+s.label+'</small></button>'
  const j = journeyStatement();
  assert.match(
    j,
    /getElementById\("phaseJourney"\)\.innerHTML=curriculum\.map\(\(p,pi\)=>\{let s=phaseStatus\(pi\),locked=s\.key==="locked";/,
    "the journey builder must be driven straight off phaseStatus(pi)",
  );
  assert.ok(j.includes('return \'<button \'+(locked?\'disabled aria-disabled="true"\':\'data-journey="\'+pi+\'"\')'),
    'the historical disabled/data-journey expression must be verbatim');
  assert.match(j, /\+' class="'\+\(s\.key==="passed"\?"doneCard":locked\?"lockedCard":""\)\+'"><strong>'/,
    "the historical doneCard/lockedCard class expression and <strong> open must be verbatim");
  assert.match(j, /\+\(s\.key==="passed"\?"\u2713 ":locked\?"\ud83d\udd12 ":"\u25cb "\)\+'Phase '/,
    "the historical check / lock / open-circle marker expression must be verbatim");
  assert.match(j, /\+'<\/strong><small>'\+s\.label\+'<\/small><\/button>'\}\)\.join\(""\);/,
    "the historical </strong><small> state line must be verbatim");

  // 2. No dot/line rail, and none of the presentation invented since.
  for (const gone of [
    "phaseSteps", "phaseStep", "phaseDot", "phaseStepLabel", "phaseCurrent",
    "phaseStepTitle", "phaseStepState", "phaseStepMeta", "phaseViewingNote",
    "phaseCurrentLabel", "phaseStates", "activePhase",
  ]) {
    assert.equal(html.includes(gone), false,
      'the dot/line rail\'s "' + gone + '" must be gone — Your Path is the original card component');
  }

  // 3. The dot/line CSS is gone, and so is the connector rule it needed.
  assert.equal(/#phaseJourney\{display:block\}/.test(htmlNoComments), false,
    "the ID-scoped override that suppressed the .journey grid must be gone");
  assert.equal(/\.phaseSteps:before/.test(htmlNoComments), false,
    "the connector line must be gone");
  assert.equal(/#home>\.sectionTitle:has\(\+ #phaseJourney\)/.test(htmlNoComments), false,
    "the dot/line section-title overrides must be gone");

  // 4. The historical CSS is live, not just present in a comment.
  const css = [
    [/\.journey\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px\}/, "the original 4-column .journey grid"],
    [/\.journey button\{background:#fff;border:1px solid var\(--line\);border-radius:15px;padding:13px;text-align:left;font:inherit;cursor:pointer\}/, "the original white square card"],
    [/\.journey button\.doneCard\{background:#fbfff9\}/, "the original passed-card tint"],
    [/\.journey strong\{display:block;font-size:12px\}/, "the original phase-number line"],
    [/\.journey small\{font-size:10px;color:var\(--muted\)\}/, "the original state line"],
    [/\.lockedCard,[^}]*\.journey button:disabled,[^}]*\{background:#efede8;border-color:#ddd9d1;color:#9a958d;cursor:not-allowed;box-shadow:none\}/, "the original locked-card treatment"],
  ];
  for (const [rx, label] of css) {
    assert.match(htmlNoComments, rx, "the original Your Path CSS must still be live: " + label);
  }

  // 5. Still exactly four phases, and no fifth node of any kind.
  assert.equal(/curriculum\.map/.test(j), true, "the four steps must come from the curriculum's four phases");
  assert.equal(/Phase 5|pi<5|curriculum\.length\+1/.test(j), false,
    "the journey must be exactly the four curriculum phases");
  assert.equal(/final/i.test(j), false, "no Final Assessment node in the journey");
  assert.equal(/certificate/i.test(j), false, "no Certificate node in the journey");
  assert.equal(html.split('id="phaseJourney"').length - 1, 1, "there must be exactly one journey mount");
  assert.equal(html.split('class="journey"').length - 1, 1, "the journey container keeps its original .journey class");
});

test("A3: the restored statement cannot be silently truncated by ASI", () => {
  // Regression guard. A single ',' instead of '+' before `}).join("")` makes the
  // whole `innerHTML=` assignment an expression statement, so the statement
  // silently evaluates to its LAST comma operand instead of the card markup.
  // That shipped once during this pass; the journey rendered as a text fragment.
  const j = journeyStatement();
  assert.equal(/,\s*\}\)\.join/.test(j), false,
    "the builder must not end in a comma before the arrow-function close (ASI would truncate it)");
  assert.match(j, /\+'<\/small><\/button>'\}\)\.join\(""\);$/,
    "the builder's final expression must be a string literal, so the comma operator can never win");
  // One .join() over four iterations means exactly four <button> openers are
  // generated at runtime — asserted executably in the state test below.
  assert.equal((j.match(/<button/g) || []).length, 1, "the template must open the button exactly once");
  assert.equal((j.match(/<\/button>/g) || []).length, 1, "the template must close the button exactly once");
});

test("A3: the four states still come from progression, and the cards still navigate", () => {
  // Passed -> doneCard, locked -> lockedCard + disabled, otherwise plain.
  assert.match(source, /let s=phaseStatus\(pi\),locked=s\.key==="locked";return '<button '/,
    "the historical state expression must survive");
  assert.match(source, /disabled aria-disabled="true"/,
    "a locked phase must still be a disabled button");
  // Navigation goes through the guarded browse() entry point.
  assert.match(source, /document\.querySelectorAll\("\[data-journey\]"\)\.forEach\(b=>b\.onclick=\(\)=>browse\(Number\(b\.dataset\.journey\),null\)\)/,
    "journey steps must navigate through browse()");
});

test("A3: responsive adaptations are scaling only, and cover 390 / 768 / 1366 / 1920", () => {
  // The original CSS only knew the phone breakpoint, so the adaptations live in
  // the portal block. They must scale the SAME card component: padding, gap,
  // border-radius, type size. Nothing may add a rail, a chip, a dot or a card.
  const required = [
    "#home #phaseJourney{margin-bottom:2px}",
    ".journey{grid-template-columns:repeat(4,minmax(0,1fr))}",
    ".journey button{min-width:0}",
    ".journey{gap:10px}",
    ".journey button{padding:12px 14px 11px;border-radius:15px}",
    ".journey button:hover:not(:disabled){border-color:#cfc9ba}",
    ".journey strong{font-size:12px;line-height:1.15}",
    ".journey small{font-size:10px;line-height:1.2;margin-top:0}",
    ".journey button.doneCard{background:#fbfff9;border-color:#cfe2cb}",
    ".journey{gap:12px}",
    ".journey button{padding:14px 16px 13px}",
    ".journey strong{font-size:12.5px;line-height:1.15}",
    ".journey small{font-size:10.5px;line-height:1.2;margin-top:0}",
    ".journey{grid-template-columns:1fr 1fr}",
    ".journey button{padding:10px 11px 9px}",
    ".journey strong{font-size:11px;line-height:1.15}",
    ".journey small{font-size:9.5px;line-height:1.2}",
  ];
  for (const r of required) {
    assert.match(PORTAL_NO_COMMENTS, new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "portal block must contain the responsive rule: " + r);
  }
  // The four viewports.
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:1181px\)\{[\s\S]*?\.journey\{gap:10px\}/,
    "1366px laptop / 1920px desktop must be declared");
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:1601px\)\{[\s\S]*?\.journey\{gap:12px\}/,
    "a very wide desktop step must be declared");
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:701px\) and \(max-width:850px\)\{\s*\.journey\{grid-template-columns:1fr 1fr\}/,
    "768px tablet must keep the historical two-up treatment");
  // 390px: the shipped phone rules are untouched and still win.
  assert.match(htmlNoComments, /\.journey\{grid-template-columns:1fr;gap:7px\}/,
    "the historical 390px single-column rule must survive");
  assert.match(htmlNoComments, /\.journey button\{padding:12px 13px;border-radius:14px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 10px\}/,
    "the historical 390px card layout must survive");
  // The 4-column grid must not blow out on a long phase label.
  assert.match(PORTAL_NO_COMMENTS, /\.journey\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/,
    "the desktop grid must use minmax(0,1fr) so it cannot overflow");
  assert.match(PORTAL_NO_COMMENTS, /\.journey button\{min-width:0\}/,
    "journey cards must be allowed to shrink");
});

// ---------------------------------------------------------------------------
// A4 — the Phase -> Module -> Class browsing interface
// ---------------------------------------------------------------------------
test("A4: the browsing interface uses responsive columns and states the hierarchy", () => {
  for (const [sel, cols] of [
    ["#courseView>.stack:has(>.phaseCard)", "repeat(2,minmax(0,1fr))"],
    ["#courseView>.stack:has(>.moduleCard)", "repeat(2,minmax(0,1fr))"],
    ["#courseView>.stack:has(>.classCard)", "repeat(2,minmax(0,1fr))"],
  ]) {
    const escaped = sel.replace(/[()>.:#[\]]/g, "\\$&");
    assert.match(PORTAL_NO_COMMENTS,
      new RegExp(escaped + "\\{grid-template-columns:" + cols.replace(/[()]/g, "\\$&")),
      sel + " must be a desktop column grid");
  }
  // A third class column on very wide desktops, so a 6-class module is not two
  // lonely rows.
  assert.match(PORTAL_NO_COMMENTS,
    /@media\(min-width:1601px\)\{[\s\S]*?#courseView>\.stack:has\(>\.classCard\)\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/,
    "a very wide desktop must gain a third class column");
  // Overflow guard. A fixed leading track is only safe when the flexible track
  // beside it is minmax(0,1fr) - that is what lets a long class or skill title
  // shrink to nothing instead of pushing the row past the viewport. A fixed
  // track next to a bare `1fr` is the real defect, so assert on that shape
  // rather than banning pixels outright: the shipped lesson CSS in the first
  // style block already uses 29 such rows.
  const columnTracks = [...PORTAL_NO_COMMENTS.matchAll(/grid-template-columns:([^;}]*)/g)].map((m) => m[1].trim());
  for (const t of columnTracks.filter((t) => /^\d+px/.test(t))) {
    assert.match(t, /minmax\(0,1fr\)/,
      "a fixed pixel track is only safe beside a shrinkable track, found: " + t);
  }
  assert.equal(columnTracks.some((t) => /^\d+px.*(^|\s)1fr(\s|$)/.test(t)), false,
    "no grid may pair a fixed pixel track with a non-shrinkable 1fr");
  // The two grids the Skills/Achievements pass introduced must be shrinkable too.
  for (const [sel, cols] of [
    ["#skills .skillGrid", "repeat(2,minmax(0,1fr))"],
    ["#achievementsList", "repeat(2,minmax(0,1fr))"],
  ]) {
    assert.match(PORTAL_NO_COMMENTS,
      new RegExp(sel.replace(/[()>.:#[\]]/g, "\\$&") + "\\{grid-template-columns:" + cols.replace(/[()]/g, "\\$&")),
      sel + " must use a shrinkable two-column grid");
  }

  // The third hierarchy level is explicit, not implied.
  assert.ok(source.includes('<div class="sectionTitle browseLevel browseLevelClasses"><h2>Classes</h2>'),
    "the class list must carry its own CLASSES heading");
  assert.ok(source.includes('<div class="sectionTitle browseLevel"><div><div class="eyebrow">PHASE \'+p.n+\' \xb7 MODULE \''),
    "the module heading must be a tagged hierarchy level");
  assert.ok(source.includes('<div class="eyebrow">PHASE \'+p.n+\' \xb7 \'+ps.label.toUpperCase()+\'</div><h2>\'+p.title+\'</h2>'),
    "the phase heading must name the phase and its state");
});

// ---------------------------------------------------------------------------
// A5 — navigation and progression are separate models
// ---------------------------------------------------------------------------
test("A5: browse() is the single navigation entry point and every view is guarded", () => {
  assert.match(source, /function browse\(phase,moduleIndex\)\{return guardProgression\(/,
    "browse() must be the guarded navigation entry point");
  for (const [fn, view] of [["renderCourse", "renderCourseView"], ["renderHome", "renderHomeView"], ["openPage", "openPageView"]]) {
    assert.match(source, new RegExp("function " + fn + "\\([^)]*\\)\\{return guardProgression\\(" + view + ","),
      fn + "() must be a guarded entry point over " + view + "()");
  }
  // No portal navigation may write `current` and render directly any more.
  for (const [label, old] of [
    ["phase cards", 'document.querySelectorAll("[data-phase]").forEach(b=>b.onclick=()=>{current.phase='],
    ["journey steps", 'document.querySelectorAll("[data-journey]").forEach(b=>b.onclick=()=>{current={phase:'],
    ["course index", 'document.querySelectorAll("[data-all]").forEach(b=>b.onclick=()=>{current={phase:'],
    ["continue learning", "if(cb)cb.onclick=()=>{current={phase:"],
  ]) {
    assert.equal(htmlNoComments.includes(old), false,
      label + " must navigate through browse(), not write navigation state inline: " + old);
  }
  // The guard forwards its arguments, so a guarded view keeps its signature.
  assert.match(source, /function guardProgression\(fn,label\)\{const args=\[\]\.slice\.call\(arguments,2\)/,
    "guardProgression must forward arguments to the view it guards");
  assert.match(source, /function openPage\(id\)\{return guardProgression\(openPageView,"openPage\("\+id\+"\)",id\)\}/,
    "openPage must forward its page id through the guard");
  // The guard covers the whole progression model, not just completed classes.
  for (const facet of ["completed:", "exams:", "phases:", "unlockedClasses:", "skills:", "finalExam:"]) {
    assert.ok(source.includes(facet), "the progression fingerprint must cover " + facet);
  }
  // Reverting a mutation must be reported, not silent.
  assert.match(source, /console\.error\("\[academy\] a view\/navigation action changed learner progression/,
    "a reverted progression mutation must be reported");
});

test("A5: a visible BROWSING bar separates location from progression", () => {
  assert.match(source, /function browseBarHTML\(\)/, "the browse bar helper must exist");
  assert.match(source, /<span class="browseBarNote">Browsing never changes your progress\.<\/span>/,
    "the browse bar must state the separation in learner language");
  for (const branch of [
    'if(current.phase===null){host.innerHTML=browseBarHTML()+',
    'exam=bestExam("phase_"+(current.phase+1));host.innerHTML=browseBarHTML()+',
    "host.innerHTML=browseBarHTML()+'<div class=\"crumbs\"><button data-all>My Course</button><span>›</span><button data-backphase>",
  ]) {
    assert.ok(source.includes(branch), "every browsing view must lead with the browse bar: " + branch);
  }
  assert.match(PORTAL_NO_COMMENTS, /\.browseBar\{display:flex/,
    "the browse bar must be styled at every viewport");
  assert.match(PORTAL_NO_COMMENTS, /@media\(max-width:850px\)\{[\s\S]*?\.browseBar\{/,
    "the browse bar must reorganise on a phone");
  // The browse bar is the ONLY place location is shown, which is what keeps the
  // restored journey component itself unmodified.
  assert.equal(/phaseStep[^"]*viewing|phaseCurrentLabel|browseBarTag[^>]*>[^<]*you are viewing/i.test(htmlNoComments), false,
    "location must not be painted onto the journey cards");
});

// ---------------------------------------------------------------------------
// A5 — the owner's exact state test, executed.
// ---------------------------------------------------------------------------

// A learner at: Phase 1 passed, Phase 2 passed, Phase 3 passed, Phase 4 unlocked.
function seatPhase3Passed(qc) {
  for (let pi = 0; pi < 3; pi++) {
    for (let mi = 0; mi < qc.curriculum[pi].modules.length; mi++) {
      for (let ci = 0; ci < qc.curriculum[pi].modules[mi][1].length; ci++) {
        qc.completed.add(qc.key(pi, mi, ci));
      }
    }
    qc.passExam("phase_" + (pi + 1), 90);
  }
}

// The full progression state, read the way the UI reads it.
function readProgression(qc) {
  return {
    phaseStatus: plain(qc.curriculum.map((p, pi) => qc.phaseStatus(pi).key)),
    unlocked: plain(qc.curriculum.map((p, pi) => qc.isPhaseUnlocked(pi))),
    passedPhases: qc.phasesPassed(),
    classesDone: qc.completed.size,
    fingerprint: qc.progressionFingerprint(),
  };
}

function assertPhase3StillPassed(qc, where, actual) {
  assert.deepEqual(actual.phaseStatus, ["passed", "passed", "passed", "not"],
    where + ": Phase 1/2/3 must still be passed and Phase 4 not");
  assert.deepEqual(actual.unlocked, [true, true, true, true],
    where + ": Phase 4 must still be unlocked — clicking must never relock a phase");
  assert.equal(actual.passedPhases, 3,
    where + ": the passed-phase count must not change while browsing");
}

test("A5 STATE TEST: browsing Phase 4 -> 1 -> 2 -> 3 -> 4 never relocks a phase", () => {
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc } = session;
    seatPhase3Passed(qc);

    // Precondition: the owner's stated starting state.
    assertPhase3StillPassed(qc, "before any navigation", readProgression(qc));
    const start = readProgression(qc);
    assert.equal(qc.phaseStatus(0).key, "passed", "Phase 1 must start passed");
    assert.equal(qc.phaseStatus(1).key, "passed", "Phase 2 must start passed");
    assert.equal(qc.phaseStatus(2).key, "passed", "Phase 3 must start passed");
    assert.equal(qc.isPhaseUnlocked(3), true, "Phase 4 must start unlocked");

    // The owner's exact navigation sequence, forwards and backwards.
    const sequence = [3, 0, 1, 2, 3];
    const fingerprints = [start.fingerprint];
    sequence.forEach((pi, i) => {
      qc.browse(pi, null);
      const after = readProgression(qc);
      assertPhase3StillPassed(qc, "after browsing Phase " + (pi + 1) + " (step " + (i + 1) + ")", after);
      assert.equal(after.classesDone, start.classesDone,
        "after browsing Phase " + (pi + 1) + ": completed classes must not change");
      assert.equal(after.fingerprint, start.fingerprint,
        "after browsing Phase " + (pi + 1) + ": the WHOLE progression fingerprint must be byte-identical");
      fingerprints.push(after.fingerprint);
    });
    // Every intermediate state is identical, not merely the last one.
    assert.equal(new Set(fingerprints).size, 1,
      "all " + fingerprints.length + " states in the navigation sequence must be identical");
  } finally {
    session.dispose();
  }
});

test("A5 STATE TEST: browsing modules and classes inside a phase changes nothing either", () => {
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc } = session;
    seatPhase3Passed(qc);
    const before = qc.progressionFingerprint();

    // Drill into a phase, walk every module, then walk back out.
    qc.browse(0, 0);
    assertPhase3StillPassed(qc, "inside Phase 1 Module 1", readProgression(qc));
    for (let mi = 0; mi < qc.curriculum[0].modules.length; mi++) {
      if (!qc.isModuleUnlocked(0, mi)) continue;
      qc.browse(0, mi);
      assertPhase3StillPassed(qc, "inside Phase 1 Module " + (mi + 1), readProgression(qc));
    }
    qc.browse(0, null);
    qc.browse(2, 1);
    assertPhase3StillPassed(qc, "inside Phase 3 Module 2", readProgression(qc));
    qc.browse(null, null);
    assertPhase3StillPassed(qc, "back on the course index", readProgression(qc));
    assert.equal(qc.progressionFingerprint(), before,
      "module and class browsing must leave the progression fingerprint byte-identical");
  } finally {
    session.dispose();
  }
});

test("A5 STATE TEST: clicking the real journey cards cannot change progression", () => {
  // Drives the rendered journey through the DOM, not the API: renderHome(), then
  // click each journey card exactly as the learner would, re-rendering between
  // clicks so every state is re-derived from the model.
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc, document } = session;
    const mount = document.createElement("div");
    mount.setAttribute("id", "phaseJourney");
    mount.setAttribute("class", "journey");
    document.body.appendChild(mount);
    document.byId.set("phaseJourney", mount);

    // 1. A fresh learner must see all four phases, with only Phase 1 open.
    qc.renderHome();
    const fresh = mount.querySelectorAll("button");
    assert.equal(fresh.length, 4, "the restored journey must render exactly four cards, not a fragment");
    assert.deepEqual(plain(fresh.map(c => c.className.trim())),
      ["", "lockedCard", "lockedCard", "lockedCard"],
      "a fresh learner sees Phase 1 open and Phases 2-4 locked");
    assert.deepEqual(plain(fresh.map(c => c.textContent.replace(/\s+/g, " ").trim())),
      ["\u25cb Phase 1Not Started", "\ud83d\udd12 Phase 2Locked", "\ud83d\udd12 Phase 3Locked", "\ud83d\udd12 Phase 4Locked"],
      "the four cards must read as the historical Phase 1..4 cards with their states");

    // 2. Seed the owner's scenario: Phase 1/2/3 passed, Phase 4 unlocked.
    seatPhase3Passed(qc);
    qc.renderHome();
    const before = qc.progressionFingerprint();
    const readCards = () => plain(mount.querySelectorAll("button").map(c => c.className.trim() + " | " + c.textContent.replace(/\s+/g, " ").trim()));
    assert.deepEqual(readCards(), [
      "doneCard | \u2713 Phase 1Passed",
      "doneCard | \u2713 Phase 2Passed",
      "doneCard | \u2713 Phase 3Passed",
      " | \u25cb Phase 4Not Started",
    ], "with Phase 3 passed, three cards are done and Phase 4 is open");

    // 3. Every unlocked phase must be clickable, in both directions.
    for (const pi of [3, 0, 1, 2, 3, 0, 2]) {
      const card = mount.querySelectorAll("button")[pi];
      assert.equal(card.hasAttribute("disabled"), false,
        "Phase " + (pi + 1) + " must be clickable — browsing a passed phase must not lock it");
      card.click();
      assertPhase3StillPassed(qc, "after clicking journey card Phase " + (pi + 1), readProgression(qc));
      assert.equal(qc.progressionFingerprint(), before,
        "after clicking journey card Phase " + (pi + 1) + ": progression must be unchanged");
      // Re-render Home so the journey is rebuilt from the model, then re-read
      // the cards; the progression states must be identical every time.
      qc.renderHome();
      assert.deepEqual(readCards(), [
        "doneCard | \u2713 Phase 1Passed",
        "doneCard | \u2713 Phase 2Passed",
        "doneCard | \u2713 Phase 3Passed",
        " | \u25cb Phase 4Not Started",
      ], "after browsing Phase " + (pi + 1) + ": the journey must still read three done cards and one open phase");
      assert.equal(mount.querySelectorAll("button.doneCard").length, 3,
        "after browsing Phase " + (pi + 1) + ": Phases 1-3 must still render as doneCard");
    }
  } finally {
    session.dispose();
  }
});

test("A5: the guard is real — a view action that changes progression is reverted", () => {
  // If this test ever stops reverting, the separation is decorative.
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc } = session;
    seatPhase3Passed(qc);
    const before = qc.progressionFingerprint();
    const classesBefore = qc.completed.size;

    const reported = [];
    const realError = session.window.console.error;
    session.window.console.error = (...args) => reported.push(args.map(String).join(" "));
    try {
      const result = qc.guardProgression(() => {
        // A deliberate fault: a view that completes classes and forges passes.
        qc.completed.add("p4m4c1");
        qc.passExam("phase_1", 10);
        qc.passExam("final", 100);
        return "mutated";
      }, "deliberate-fault-injection");
      assert.equal(result, "mutated", "the guarded function's return value must be passed through");
    } finally {
      session.window.console.error = realError;
    }

    assert.equal(qc.progressionFingerprint(), before,
      "a progression mutation made by a guarded view must be reverted");
    assert.equal(qc.completed.has("p4m4c1"), false, "the forged completion must be undone");
    assert.equal(qc.completed.size, classesBefore, "the completed-class count must be restored");
    assert.equal(qc.bestExam("final"), null, "a forged final-exam pass must be undone");
    assert.equal(qc.phasesPassed(), 3, "the forged low-score pass must not un-pass Phase 1");
    assert.equal(reported.length, 1, "the revert must be reported, not silent");
    assert.match(reported[0], /changed learner progression \(deliberate-fault-injection\)/,
      "the report must name the offending action");
  } finally {
    session.dispose();
  }
});

test("A5: no navigation or view function may write progression", () => {
  // The owner: "changing pages must never mutate completed classes, passed
  // phase exams, unlocked phases, skill progression, or final-assessment
  // eligibility." The only writers of those are markClassComplete, the exam
  // submit path, the Quick Check submit/load path, the Test Portal seeder, and
  // the guard's own undo. None of them is a view.
  const VIEW_FUNCTIONS = [
    "browse", "browseBarHTML", "renderCourse", "renderCourseView",
    "renderHome", "renderHomeView", "openPage", "openPageView",
  ];
  for (const name of VIEW_FUNCTIONS) {
    const fn = extractFunction(name);
    for (const write of ["completed.add(", "completed.delete(", "completed.clear(",
      "examAttempts.push(", "examAttempts.splice("]) {
      assert.equal(fn.includes(write), false,
        name + "() writes progression via `" + write + "` — navigation and views must be read-only");
    }
  }
});

test("A5: the portal pass introduced no new progression writer", () => {
  // The approved progression-writer allow-list. The pre-portal snapshot this
  // test originally diffed against lived in a machine-local temp directory, so
  // it crashed on any other machine or CI. Asserting the exact allow-list is
  // portable and still fails if a renderer ever starts writing progress.
  const APPROVED_WRITERS = [
    "completeModule", "completePhase", "examSubmitRequest", "flushQuickCheckDraft",
    "loadQuickCheckClass", "markClassComplete", "restoreProgression", "submitQuickCheck",
  ];

  const writers = (text) => {
    const t = stripComments(text);
    const map = {};
    const re = /(completed|examAttempts)\.(add|delete|clear|push|set)\(/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const prev = t.lastIndexOf("function ", m.index);
      const name = prev < 0 ? "(top level)"
        : (t.slice(prev + 9).match(/^[A-Za-z0-9_$]+/) || ["(anon)"])[0];
      (map[name] = map[name] || []).push(m[0]);
    }
    for (const k of Object.keys(map)) map[k].sort();
    return map;
  };

  const now = writers(html);
  assert.deepEqual(Object.keys(now).sort(), APPROVED_WRITERS,
    "the progression writers must stay exactly the approved set; a renderer must never write progress");
  assert.match(htmlNoComments, /function restoreProgression\(snap\)\{completed\.clear\(\)[\s\S]*?completed\.add\(/,
    "restoreProgression must restore completed from the snapshot");
  // ...and it is reachable only from the guard.
  const callers = [];
  // Check all function definitions in the file for calls to restoreProgression.
  const allFnRe = /function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let m;
  while ((m = allFnRe.exec(htmlNoComments)) !== null) {
    const name = m[1];
    if (name === "restoreProgression") continue;
    const fn = extractFunction(name);
    const bodyStart = fn.indexOf("{");
    if (bodyStart > 0 && fn.slice(bodyStart + 1).includes("restoreProgression(")) callers.push(name);
  }
  assert.deepEqual(callers, ["guardProgression"],
    "only guardProgression may undo progression");
});

// ---------------------------------------------------------------------------
// E — the approved lessons are not redesigned by this pass
// ---------------------------------------------------------------------------
test("E: the portal pass touches no lesson presentation", () => {
  const families = [
    ".lessonShell", ".lessonSection", ".conceptGrid", ".shiftCompare", ".workflow",
    ".laneExplorer", ".signalPath", ".ownershipFormula", ".weekMap", ".focusStage",
    ".focusSplit", ".manualSignalMap", ".emailTriage", ".vbrandLesson", ".lessonThesis",
    ".quiz", ".answers", ".qcMount", ".brandQuiz",
  ];
  for (const fam of families) {
    const escaped = fam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only rules in the portal block count, and comments are stripped first.
    const re = new RegExp("(^|[\\s,>}])\\s*" + escaped + "(?=\\s*[,{]|\\.[a-zA-Z-])", "m");
    assert.equal(re.test(PORTAL_NO_COMMENTS), false,
      "the desktop portal pass must not restyle the approved lesson family " + fam);
  }
  // All 90 renderers survive.
  const renderers = (html.match(/function renderLesson\d+\(/g) || []).length;
  assert.ok(renderers >= 90, "all 90 lesson renderers must survive the portal pass, found " + renderers);
  // The Quick Check is untouched: single-column, server-graded.
  assert.match(htmlNoComments, /\.quiz\{gap:14px\}/,
    "the Quick Check question flow must stay a single vertical column (gap indicates vertical stacking)");
  assert.equal(/\[data-qc-section\][^{]*\.answers\{grid-template-columns:\s*repeat/.test(htmlNoComments), false,
    "Quick Check answers must never be placed in desktop columns");
  // Functional wiring survives.
  assert.match(html, /VERIFIED_SLIDE_DRIVE_IDS/, "the verified slide map must survive");
  assert.match(html, /function qcRunCheck\(/, "server-authoritative Quick Check grading must survive");
  assert.match(html, /function mountQuickCheck\(/, "the shared Quick Check mount must survive");
  assert.match(html, /function submitQuickCheck\(/, "server-owned Quick Check submission must survive");
});

// ---------------------------------------------------------------------------
// F — the four required viewports
// ---------------------------------------------------------------------------
test("F: the pass declares intentional layouts for 390 / 768 / 1366 / 1920", () => {
  // 390 and 768 are handled by the shipped <=850px phone/tablet treatment plus
  // the new browse-bar rules; 1366 and 1920 by the desktop blocks.
  assert.ok(html.indexOf("@media(max-width:850px)") > 0, "the shipped 850px page breakpoint must remain the phone boundary");
  assert.equal(/@media\s*\(min-width:\s*901px\)/.test(html), false,
    "the shipped single 850px page breakpoint must not be split");
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:1181px\)/,
    "the laptop/desktop composition must start above the phone breakpoint");
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:1601px\)/,
    "a very wide desktop step must be declared");
  assert.match(PORTAL_NO_COMMENTS, /@media\(min-width:701px\) and \(max-width:850px\)/,
    "the tablet band must be intentional");
  assert.match(PORTAL_NO_COMMENTS, /@media\(max-width:850px\)\{[\s\S]*?\.browseBar\{/,
    "the phone treatment must be declared");
});
