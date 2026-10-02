"use strict";

// dashboard-layout.test.js — protects the original, production dashboard shell.
//
// Mandate (owner directive): the Academy dashboard must look EXACTLY like the
// version deployed on getassistara.com. That deployed version is the committed
// academy-dashboard.html (HEAD == origin/main, and the auth-gated routing model
// — login.html / admin.html / api/academy-content.js — is in HEAD), and the
// working tree's Home page, sidebar, navigation, typography, spacing, cards,
// colors, phase overview, and responsive behavior must stay pixel-for-pixel
// aligned with it.
//
// A redesign pass once drifted the working tree away from the shipped site
// (breakpoints moved 850 -> 900px, a 1100px sidebar step appeared, chrome
// tokens were recolored, and a fixed bottom mobile bar was added). The owner
// rejected that drift. The one approved dashboard change is the functional
// four-phase journey, so this suite locks in the production shell while
// asserting the journey is visible and correct on top of it.
//
// Run: node --test assistara-local-v9/api/dashboard-layout.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { readInlineScript } = require("./_qc-harness.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const source = readInlineScript();
const html = fs.readFileSync(DASHBOARD, "utf8");

// Strip CSS/JS comments so prose describing a past bug cannot satisfy a matcher.
const htmlNoComments = html
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const count = (text, needle) => (text.split(needle).length - 1);

// ---------------------------------------------------------------------------
// The production shell — sidebar, desktop nav, mobile nav, Home, My Course
// ---------------------------------------------------------------------------
test("the sidebar, desktop nav and mobile nav hosts are the production ones", () => {
  // Sidebar + desktop nav.
  assert.match(html, /class="side"/, "the sidebar must exist");
  assert.match(html, /class="nav"/, "the sidebar nav must exist");
  assert.match(html, /id="desktopNav"/, "the desktop nav host must exist");
  // Mobile nav: the production pattern is a top bar (mobileTop) that toggles a
  // dropdown (mobileNav). There is no fixed bottom bar on the deployed site.
  assert.match(html, /id="mobileTop"/, "the mobile top bar host must exist");
  assert.match(html, /id="mobileNav"/, "the mobile dropdown host must exist");
  assert.match(
    source,
    /document\.getElementById\("desktopNav"\)\.innerHTML=h;document\.getElementById\("mobileNav"\)\.innerHTML=h/,
    "both the desktop and the mobile nav must be built from the same `pages` list",
  );
  assert.match(
    source,
    /document\.getElementById\("mobileTop"\)\.onclick=\(\)=>document\.getElementById\("mobileNav"\)\.classList\.toggle\("open"\)/,
    "the mobile top bar must toggle the mobile dropdown",
  );
});

test("the Home and My Course shells are present and unchanged", () => {
  // Home page.
  assert.match(html, /id="home"/, "the Home section must exist");
  assert.match(html, /class="hero"/, "the Home hero must exist");
  assert.match(html, /dashboardGrid/, "the dashboard grid must exist on Home");
  assert.match(html, /continueCard/, "the Continue card must exist on Home");
  assert.match(html, /dashboardFlow/, "the dashboard flow must exist on Home");
  assert.match(html, /phaseJourney/, "the Home phase journey mount must exist");
  // My Course.
  assert.match(html, /id="courseView"/, "the My Course (courseView) section must exist");
  assert.match(source, /function renderCourse\(\)/, "renderCourse must exist");
  // The full page set, in the production order and ids.
  for (const id of ["home", "courseView", "skills", "resources", "sessions", "certificate", "settings"]) {
    assert.match(html, new RegExp('id="' + id + '"'), "the " + id + " section must exist");
  }
});

// ---------------------------------------------------------------------------
// Responsive behavior — the production breakpoint (850px) and no others
// ---------------------------------------------------------------------------
test("the sidebar collapses at exactly the production 850px breakpoint", () => {
  assert.match(
    htmlNoComments,
    /@media\(max-width:850px\)\{\.conceptGrid\{grid-template-columns:1fr\}\.app\{display:block\}\.side\{display:none\}/,
    "the sidebar must collapse at the deployed 850px breakpoint",
  );
  assert.equal(count(html, "max-width:900px"), 0,
    "no 900px breakpoint may exist; the deployed site uses 850px");
  assert.equal(count(html, "max-width:1100px"), 0,
    "no 1100px intermediate step may exist; it is not part of the deployed site");
});

// ---------------------------------------------------------------------------
// Chrome colors — the exact deployed tokens
// ---------------------------------------------------------------------------
test("chrome colors are the deployed tokens", () => {
  assert.match(
    htmlNoComments,
    /\.eyebrow\{font-size:11px;font-weight:800;letter-spacing:\.12em;color:#7a7369\}/,
    "the eyebrow token must be the deployed #7a7369",
  );
  assert.equal(count(htmlNoComments, "color:#5d574f"), 0,
    "the redesigned eyebrow token must not ship");
  assert.match(
    htmlNoComments,
    /\.status\{background:#f1f1f1;color:#777\}/,
    "the status chip must be the deployed #777",
  );
  assert.equal(count(htmlNoComments, ".status{background:#f1f1f1;color:#5a5a5a}"), 0,
    "the redesigned status token must not ship");
  assert.match(
    htmlNoComments,
    /\.skill\.lockedCard\{background:#efede8;border-color:#ddd9d1;color:#9a958d;cursor:not-allowed;box-shadow:none\}/,
    "locked cards must use the deployed #9a958d text colour",
  );
  assert.equal(
    count(htmlNoComments, ".skill.lockedCard{background:#efede8;border-color:#ddd9d1;color:#5f5a52;"),
    0,
    "the redesigned locked-card token must not ship",
  );
});

// ---------------------------------------------------------------------------
// Phase overview — the owner-approved functional four-phase journey
// ---------------------------------------------------------------------------
test("the functional four-phase journey is visible on every viewport", () => {
  // OWNER DIRECTIVE: the journey must be displayed, not hidden. The old
  // unscoped `.phaseSteps,.phaseCurrent{display:none}` hid it on desktop; it is
  // gone, and the designed showcase grid lives at the base level so the journey
  // renders on desktop while keeping its compact refinements on mobile.
  assert.equal(
    count(htmlNoComments, ".phaseSteps,.phaseCurrent{display:none}"),
    0,
    "no journey display:none rule may exist — the journey must be visible",
  );
  assert.match(htmlNoComments, /\.journey\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px\}/,
    "the restored journey must use the original 4-column .journey grid at the base level");
  assert.match(htmlNoComments, /\.journey button\{background:#fff;border:1px solid var\(--line\);border-radius:15px;padding:13px;text-align:left;font:inherit;cursor:pointer\}/,
    "each restored journey card must be styled at the base level");
  // renderHome still builds the four-card journey and wires the phase navigation.
  assert.match(
    source,
    /getElementById\("phaseJourney"\)\.innerHTML=curriculum\.map\(\(p,pi\)=>/,
    "renderHome must render the journey steps",
  );
  assert.match(
    source,
    /document\.querySelectorAll\("\[data-journey\]"\)\.forEach\(b=>b\.onclick=\(\)=>browse\(\s*Number\(b\.dataset\.journey\)/,
    "clicking a phase step must navigate to that phase on My Course (via browse)",
  );
  // The container and its Home composition remain intact.
  assert.match(htmlNoComments, /#phaseJourney\{/, "the phase journey container must be styled");
});

test("the journey is exactly the four phases and never includes the certificate", () => {
  // The restored journey builder (532d0c8a) uses curriculum.map directly without
  // a .phaseSteps wrapper and without a .phaseCurrent card.
  const start = source.indexOf('getElementById("phaseJourney").innerHTML=curriculum.map((p,pi)=>');
  assert.ok(start > 0, "the journey builder must exist");
  const end = source.indexOf('document.querySelectorAll("[data-journey]")', start);
  assert.ok(end > start, "the journey builder must end before the navigation wiring");
  const steps = source.slice(start, end);
  assert.match(steps, /curriculum\.map\(\(p,pi\)=>/, "one step per curriculum phase");
  assert.ok(!/certificate|certificat/i.test(steps),
    "the journey steps must not reference the certificate — the journey ends at Phase 4");
  assert.match(steps, /Phase '\+\(pi\+1\)/, "phase steps must be 1-based (Phase 1..4)");
  // No .phaseSteps wrapper, no .phaseCurrent card, no .phaseStep/.phaseDot classes.
  assert.ok(!/phaseSteps|phaseCurrent|phaseStep|phaseDot/.test(steps),
    "the restored journey must not contain dot/line rail markers");
});

// ---------------------------------------------------------------------------
// Mobile navigation — the production pattern, no bottom bar
// ---------------------------------------------------------------------------
test("no fixed mobile bottom bar exists (it is not part of the deployed site)", () => {
  assert.equal(count(html, 'id="mobileBar"'), 0, "the mobile bar host must not exist");
  assert.equal(count(html, 'class="mobileBar"'), 0, "the mobile bar class must not exist");
  assert.equal(count(htmlNoComments, ".mobileBar{"), 0, "the mobile bar CSS must not exist");
  assert.equal(count(source, "buildMobileBar"), 0, "buildMobileBar must not exist");
  assert.equal(count(source, "syncMobileBar"), 0, "syncMobileBar must not exist");
});

// ---------------------------------------------------------------------------
// Lesson chrome — production layout
// ---------------------------------------------------------------------------
test("the lesson shell keeps the approved baseline width and flow", () => {
  // RESTORED BASELINE (3ae51e8). The approved lesson is a CENTRED column: a
  // `max-width:920px;margin:0 auto` base refined to `max-width:980px` at the
  // head of the second style block. The rejected build replaced both with a
  // full-bleed `width:100%;max-width:none` shell inside a two-column grid, and
  // a later local pass had deleted the 920px base entirely. Lock the approved
  // pair, and lock the rejected shell out.
  assert.match(htmlNoComments, /\.lessonShell\{max-width:980px\}/,
    "the approved 980px lesson shell refinement must be present");
  assert.match(htmlNoComments, /\.lessonShell\{max-width:920px;margin:0 auto\}/,
    "the approved centred 920px shell base must be present");
  assert.equal(/\.lessonShell\{width:100%;max-width:none/.test(htmlNoComments), false,
    "the rejected full-bleed lesson shell must not ship");
  // The rejected architecture: a generic two-column lesson grid.
  assert.equal(/\.lessonShell\s*\{\s*display:grid/.test(htmlNoComments), false,
    "no generic two-column lesson architecture may exist");
  assert.equal(htmlNoComments.includes(".lessonShell>*{grid-column:1/-1}"), false,
    "teaching sections must not be auto-flowed side-by-side");
  assert.equal(htmlNoComments.includes(".lessonShell>.lessonSection{grid-column:auto}"), false,
    "teaching sections must not opt into the two-column grid");
  assert.equal(htmlNoComments.includes("RESPONSIVE LESSON ARCHITECTURE"), false,
    "the rejected architecture block must not ship");
  // The approved player: prominent 16:9, width from the lesson column.
  assert.match(htmlNoComments,
    /\.lessonVideo\{aspect-ratio:16\/9;background:#171717;color:#fff;border-radius:24px;display:grid;place-items:center;text-align:center;padding:30px\}/,
    "the approved 16:9 player must be the base rule");
  assert.equal(/max-height:300px|max-height:190px/.test(htmlNoComments), false,
    "the player must not be height-clamped");
  // Touch floor still enforced where it applies. The approved desktop back link
  // carries no min-height, so any `min-height:44px` match is necessarily inside
  // a media query — i.e. the floor is scoped to touch viewports.
  assert.match(htmlNoComments, /\.lessonBack\{[^}]*min-height:44px/,
    "the lesson back control must meet the touch minimum on touch viewports");
  assert.match(htmlNoComments, /\.lessonActions[^{,]*\{[^}]*min-height:4[0-9]px/,
    "the lesson action chips must meet the touch minimum on touch viewports");
});

// ---------------------------------------------------------------------------
// Typography — Manrope only, no malformed shorthand
// ---------------------------------------------------------------------------
test("typography is Manrope-only and every font shorthand is well-formed", () => {
  assert.equal(/DM Sans|DM\+Sans/.test(html), false, "no DM Sans declaration may exist");
  assert.match(html, /family=Manrope:/, "the only loaded webfont must be Manrope");
  assert.match(html, /manrope-lock\.css/, "the Manrope lock stylesheet must be referenced");
  // The font sweep once joined the line-height onto the family token
  // (`font:600 15px/1.55system-ui`), silently invalidating the shorthand. That
  // must never come back.
  assert.equal(/[\d.]+(?:px)?system-ui/.test(htmlNoComments), false,
    "no font shorthand may glue a number onto 'system-ui'");
  // A `font:` shorthand without a family (`font:800 12px`) is INVALID css too:
  // browsers drop the whole declaration, so the button weight silently fell
  // back to the inherited 400 and CTA text rendered thin. Every shorthand must
  // carry the Manrope family so its weight is actually applied.
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const fontRe = /(?:^|[;{}])\s*(font\s*:\s*[^;}]+)/g;
  let fm;
  const bad = [];
  while ((fm = fontRe.exec(style))) {
    const decl = fm[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (/^font:inherit/i.test(decl)) continue; // keyword form is valid
    const body = decl.slice(5).trim();
    const hasSize = /\d+(?:\.\d+)?px/.test(body);
    const stripped = body
      .replace(/^\s*(?:italic\s+|bold\s+|[0-9]+\s+)?/, "")
      .replace(/^\d+(?:\.\d+)?px\s*(\/\s*[\d.]+)?\s*/, "");
    const hasFamily = /^[A-Za-z"'][A-Za-z ,"'\-\s]*$/.test(stripped) && stripped.trim().length > 0;
    if (!hasSize || !hasFamily) bad.push(decl);
  }
  assert.deepEqual(bad, [],
    "every font shorthand must carry a font family so its weight is applied: " + JSON.stringify(bad));
});

// ---------------------------------------------------------------------------
// Functional layers must sit intact on the production shell
// ---------------------------------------------------------------------------
test("the functional layers (slides, Quick Checks, exams, graduation, skills) remain", () => {
  // Slides.
  assert.match(source, /function openLessonSlidesPreview\(/, "the slide preview opener must exist");
  assert.match(source, /VERIFIED_SLIDE_DRIVE_IDS=/, "the verified Drive slide map must exist");
  assert.match(source, /resolveSlideFileId/, "the slide file ID resolver must exist");
  // Quick Checks.
  assert.match(source, /const QC_ADAPTERS/, "the Quick Check adapters must exist");
  assert.match(source, /function submitQuickCheck\(/, "the Quick Check submitter must exist");
  // Exams + graduation + certificate.
  assert.match(source, /function openExamView\(/, "the exam view must exist");
  assert.match(source, /startFinalExam/, "the Final Assessment control must exist");
  assert.match(source, /function renderCertificate\(/, "the certificate renderer must exist");
  assert.match(source, /certActions/, "the certificate action block must exist");
  // Skills (approved improvements preserved on the production Skills page).
  assert.match(source, /function renderSkills\(/, "the skills renderer must exist");
  assert.match(source, /function skillState\(/, "skillState must exist");
});

test("the curriculum, Quick Check bank, exam bank and skills count stay at release size", () => {
  // 90 lessons across 4 phases.
  const lessons = count(source, "key:\"p");
  assert.ok(lessons >= 90, "expected at least 90 lesson keys, found " + lessons);
  // 23 canonical skills (approved heading: `0 / 23 unlocked` on the Skills page).
  assert.match(html, /0 \/ 23 unlocked/, "the skills summary must read '0 / 23 unlocked'");
  const skills = count(source, "const skills=[");
  assert.equal(skills, 1, "exactly one skills array must exist");
});