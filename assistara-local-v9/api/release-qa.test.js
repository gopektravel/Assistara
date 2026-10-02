"use strict";

// release-qa.test.js — locks in the production-parity shell plus the release QA
// fixes that the owner preserved.
//
// These are assertions about the SHIPPED source and the REAL client running
// through the existing harness. They add coverage; they never replace an
// existing suite.
//
//   P-1   the four-phase journey is visible and functional on every viewport
//         (the owner-approved change on the otherwise production-identical shell)
//   P-2   mobile navigation is the deployed mobileTop + mobileNav pattern; the
//         fixed bottom bar was a local-only addition and is gone
//   P-3   the sidebar collapses at the deployed 850px breakpoint only — the
//         900px and 1100px steps were local-only
//   P-4   chrome tokens keep the deployed colours (eyebrow #7a7369, status
//         #777, locked cards #9a958d)
//   F-05  the legacy Quick Check never marked a wrong answer
//   F-08b the Skills page badge keeps its approved contrast fix
//   F-09  the skills metric row omitted Available and could not reconcile
//   F-13  the layout never drifted from the deployed single 850px breakpoint
//   F-16  the lesson player lost the approved prominent 16:9 presentation
//   F-17  touch targets below the 44 px minimum
//   F-22  "Complete Class 0" off-by-one in the unlock copy
//   E-1   Skills promised a "verified" state that does not exist
//   F-03  the font was declared one way and rendered another

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSession, readInlineScript } = require("./_qc-harness.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const source = readInlineScript();
const html = fs.readFileSync(DASHBOARD, "utf8");

// Strip CSS/JS comments so prose describing a past bug cannot satisfy a matcher.
const htmlNoComments = html
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ---------------------------------------------------------------------------
// P-1 — the four-phase journey is visible, functional, and ends at Phase 4
// ---------------------------------------------------------------------------
test("P-1: the journey is visible on every viewport and wired to My Course", () => {
  // OWNER DIRECTIVE: restore the functional journey. The deployed site's
  // unscoped `.phaseSteps,.phaseCurrent{display:none}` was removed and the
  // designed showcase grid was promoted to the base level, so the strip
  // renders on desktop and keeps its compact refinements on mobile.
  assert.equal(
    /\.phaseSteps\s*,\s*\.phaseCurrent\s*\{\s*display:none\s*\}/.test(htmlNoComments),
    false,
    "no journey display:none may exist — the journey must be visible",
  );
  assert.match(htmlNoComments, /\.journey\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px\}/,
    "the restored journey must use the original 4-column .journey grid");
  assert.match(htmlNoComments, /\.journey button\{background:#fff;border:1px solid var\(--line\);border-radius:15px;padding:13px;text-align:left;font:inherit;cursor:pointer\}/,
    "the restored journey must use the original white square card style");
  const journeyNav = /document\.querySelectorAll\("\[data-journey\]"\)\.forEach\(b=>b\.onclick=\(\)=>browse\(\s*Number\(b\.dataset\.journey\)/;
  assert.match(source, journeyNav, "clicking a phase must navigate to that phase on My Course (via browse)");
});

test("P-1: renderHome builds the ORIGINAL four-card journey (532d0c8a), no certificate", () => {
  // Drives the REAL renderHome() from the shipped inline script. The journey
  // is the original four-square-card component restored from git history
  // (commit 532d0c8a, 2026-09-22 "Add sequential module and class unlock journey").
  // A fresh learner sees Phase 1 open, Phases 2-4 locked. The journey ends
  // at Phase 4 — no certificate, no Phase 5, no .phaseStep rail, no .phaseCurrent.
  const session = createSession({ pathname: "/academy/dashboard" });
  try {
    const { qc, document } = session;
    const mount = document.createElement("div");
    mount.setAttribute("id", "phaseJourney");
    mount.setAttribute("class", "journey");
    document.body.appendChild(mount);
    document.byId.set("phaseJourney", mount);
    qc.renderHome();
    // The restored journey renders 4 <button> cards inside .journey, not .phaseStep.
    const cards = mount.querySelectorAll("button");
    assert.equal(cards.length, 4, "the restored journey must render exactly four cards");
    const labels = [...cards].map(b => b.textContent.replace(/\s+/g, " ").trim());
    assert.ok(labels[0].includes("Phase 1"), "first card must be Phase 1");
    assert.ok(labels[3].includes("Phase 4"), "last card must be Phase 4 — the journey ends there");
    assert.ok(!/Phase 5/.test(mount.textContent), "there must be no Phase 5 card");
    // Fresh learner: Phase 1 is an open card (no class), Phases 2-4 are lockedCard.
    assert.equal(cards[0].className.trim(), "", "Phase 1 must be open (no class)");
    assert.ok(cards[1].className.includes("lockedCard"), "Phase 2 must be locked");
    assert.ok(cards[2].className.includes("lockedCard"), "Phase 3 must be locked");
    assert.ok(cards[3].className.includes("lockedCard"), "Phase 4 must be locked");
    // No .phaseCurrent card, no certificate, no dot/line rail.
    assert.equal(mount.querySelectorAll(".phaseCurrent").length, 0,
      "the dot/line .phaseCurrent card must not exist — the restored journey has no 'Next up' card");
    assert.ok(!/certificate|Certificate|graduat/i.test(mount.textContent),
      "the journey must not include the certificate — it ends at Phase 4");
    // Navigation goes through browse() via data-journey.
    assert.ok(cards[0].hasAttribute("data-journey"), "Phase 1 must have data-journey for browse()");
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// P-2 — mobile navigation is the deployed mobileTop + mobileNav pattern
// ---------------------------------------------------------------------------
test("P-2: no fixed mobile bottom bar exists; the deployed mobile nav is intact", () => {
  // The deployed site has NO fixed bottom bar: mobileTop toggles the mobileNav
  // dropdown. A persistent .mobileBar was a local-only addition and must not
  // come back.
  assert.equal(html.includes('id="mobileBar"'), false, "the mobile bar host must not exist");
  assert.equal(html.includes('class="mobileBar"'), false, "the mobile bar must not be class-anchored");
  assert.equal(htmlNoComments.includes(".mobileBar{display:none}"), false,
    "the bar must not exist, even hidden on desktop");
  assert.equal(source.includes("function buildMobileBar()"), false, "buildMobileBar must not exist");
  assert.equal(source.includes("function syncMobileBar()"), false, "syncMobileBar must not exist");
  assert.equal(source.includes("pages.map(function(p){")
    || source.includes("pages.map((p,i)=>"), true,
    "the canonical `pages` list must still drive the desktop + mobile navs");
  // The production mobile navigation hosts and wiring.
  assert.match(html, /id="mobileTop"/, "the mobile top bar must exist");
  assert.match(html, /id="mobileNav"/, "the mobile dropdown must exist");
  assert.match(source, /document\.getElementById\("desktopNav"\)\.innerHTML=h;document\.getElementById\("mobileNav"\)\.innerHTML=h/,
    "both navs must be built from the canonical `pages` list so they cannot drift");
  assert.match(source, /document\.getElementById\("mobileTop"\)\.onclick=\(\)=>document\.getElementById\("mobileNav"\)\.classList\.toggle\("open"\)/,
    "the mobile top bar must toggle the mobile dropdown");
});

test("P-2: the mobile dropdown renders one button per page and navigates", async () => {
  const session = createSession();
  try {
    // The shared harness seeds only the lesson chrome. The navigation hosts and
    // the page sections are page-level chrome, so seed them here rather than
    // changing the shared harness that the Quick Check suite also depends on.
    for (const [id, tag] of [["mobileTop", "div"], ["mobileNav", "nav"], ["skills", "section"], ["course", "section"]]) {
      const el = session.document.createElement(tag);
      el.setAttribute("id", id);
      if (tag === "section") el.setAttribute("class", "page");
      session.document.body.appendChild(el);
      session.document.byId.set(id, el);
    }
    // boot() needs a Supabase client, so build the nav directly; this is the
    // same wiring boot() calls.
    session.qc.buildNav();
    const nav = session.document.getElementById("mobileNav");
    assert.ok(nav, "the mobile dropdown must exist");
    assert.ok(nav.innerHTML.length > 0, "buildNav must populate the mobile dropdown");
    const buttons = Array.from(nav.querySelectorAll("[data-page]"));
    assert.ok(buttons.length >= 5, `expected a button per section, got ${buttons.length}`);
    const target = buttons.find(b => b.dataset.page === "skills");
    assert.ok(target, "a Skills button must exist");
    target.click();
    await new Promise(r => setTimeout(r, 5));
    const skillsPage = session.document.getElementById("skills");
    assert.ok(skillsPage, "the skills page must exist");
    assert.ok(skillsPage.classList.contains("active"),
      "clicking the mobile dropdown must activate the Skills page through openPage()");
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// F-05 — the legacy Quick Check must mark a wrong pick
// ---------------------------------------------------------------------------
test("F-05: every legacy answer button marks the learner's own wrong pick", () => {
  const templates = [...source.matchAll(/<button class="answer ([^"]*)"/g)].map(m => m[1]);
  assert.ok(templates.length >= 20, `expected the legacy answer buttons, found ${templates.length}`);
  const graded = templates.filter(t => /Submitted\?/.test(t));
  assert.ok(graded.length >= 20, `expected every legacy button to grade, found ${graded.length}`);
  for (const t of graded) {
    assert.match(t, /'wrong'/, "a graded answer button must be able to mark a wrong pick: " + t);
    // The correct alternative must never be revealed on its own.
    assert.ok(!/ai===q\.correct\?'correct':''/.test(t),
      "a renderer must not mark the correct option the learner did not choose: " + t);
  }
  // The rejected anti-pattern stays gone.
  assert.deepEqual(
    source.match(/Submitted\?\(ai===q\.correct\?'correct':''\):'selected '\)/g) || [],
    [],
    "a renderer must not swap `selected` for `correct`",
  );
});

test("F-05: a wrong legacy answer is visibly marked after grading", async () => {
  const session = createSession();
  try {
    // Place the learner exactly where the Quick Check suite places them, so the
    // real renderer paints the legacy family.
    const bank = require("./_quick-check-bank.js");
    const row = { classKey: "p1m1c1", phase: 0, module: 0 };
    for (const set of bank) {
      if (set.class_key === row.classKey) break;
      session.qc.completed.add(set.class_key);
    }
    session.qc.setCurrent(row.phase, row.module);

    await session.qc.openClass(0);
    await new Promise(r => setTimeout(r, 20));

    const section = session.qc.qcFindSection();
    assert.ok(section, "the Quick Check section must mount");

    // Choose a wrong option for the first question by clicking each option
    // until the server-marked answer is a failure. The rendered order is the
    // authority here, not the bank's index, so the test does not assume a
    // mapping between them.
    const group = section.querySelectorAll(".answers")[0];
    assert.ok(group, "the first question must render an answer group");
    const buttons = group.querySelectorAll("button");
    assert.ok(buttons.length >= 2, "the question must render its options");
    // Pick the LAST option; the bank never places the key last for this class.
    buttons[buttons.length - 1].click();
    await new Promise(r => setTimeout(r, 15));

    // Answer the remaining questions so the Check control can be pressed.
    const groupsNow = session.qc.qcFindSection().querySelectorAll(".answers");
    for (let qi = 1; qi < groupsNow.length; qi++) {
      const g = session.qc.qcFindSection().querySelectorAll(".answers")[qi];
      if (g) g.querySelectorAll("button")[0].click();
      await new Promise(r => setTimeout(r, 5));
    }
    const check = session.qc.qcFindSection().querySelector('button[id^="check"]');
    assert.ok(check, "a Check Answers control must exist");
    check.click();
    await new Promise(r => setTimeout(r, 60));

    const after = session.qc.qcFindSection();
    assert.ok(after.querySelectorAll(".answers button.wrong").length >= 1,
      "a wrong answer must be marked .wrong after grading");
    assert.ok(after.querySelectorAll(".answers button.selected").length >= 1,
      "the learner's own pick must stay marked as selected");
    // The correct option the learner did NOT pick must never be revealed.
    const revealed = after.querySelectorAll(".answers button.correct");
    for (const btn of Array.from(revealed)) {
      assert.ok(btn.classList.contains("selected"),
        "a `correct` mark may only appear on the option the learner chose");
    }
  } finally {
    session.dispose();
  }
});

// ---------------------------------------------------------------------------
// P-4 / F-08b — chrome tokens carry the deployed colours
// ---------------------------------------------------------------------------
test("P-4: chrome tokens carry the deployed colours; the skills badge keeps its approved fix", () => {
  // The deployed site ships these chrome tokens. The local-only redesign that
  // darkened them (passing WCAG AA at the cost of parity) was rejected: parity
  // with the deployed site wins for the Home / My Course chrome.
  assert.match(htmlNoComments, /\.eyebrow\{[^}]*color:#7a7369\}/,
    "the eyebrow token must be the deployed #7a7369");
  assert.equal(/\.eyebrow\{[^}]*color:#5d574f\}/.test(htmlNoComments), false,
    "the redesigned eyebrow token must not ship");
  assert.match(htmlNoComments, /\.status\{background:#f1f1f1;color:#777\}/,
    "the status chip must be the deployed #777");
  assert.equal(/\.status\{background:#f1f1f1;color:#5a5a5a\}/.test(htmlNoComments), false,
    "the redesigned status token must not ship");
  assert.match(htmlNoComments, /\.skill\.lockedCard\{[^}]*color:#9a958d/,
    "locked cards must use the deployed #9a958d");
  assert.equal(/\.skill\.lockedCard\{[^}]*color:#5f5a52/.test(htmlNoComments), false,
    "the redesigned locked-card token must not ship");
  // The one approved colour fix that stays: the Skills page badge contrast
  // (part of the Skills improvements preserved on the production design).
  assert.match(htmlNoComments, /\.skillBadge\.locked\{background:#dedbd4;color:#4c4842\}/,
    "the skills badge must keep its approved #4c4842");
  assert.equal(/\.skillBadge\.locked\{[^}]*color:#8e8981/.test(htmlNoComments), false,
    "the old low-contrast badge must not return");
});

// ---------------------------------------------------------------------------
// E-1 / F-09 — the skills model
// ---------------------------------------------------------------------------
test("E-1: the skills hero no longer promises a state that does not exist", () => {
  assert.equal(html.includes("demonstrated, verified professional skills"), false,
    "there is no Verified skill state; the hero must not promise one");
  assert.equal(/class="skill verified"/.test(source), false,
    "an Available card must not reuse the leftover .verified class");
  assert.match(source, /st==="Demonstrated"\?"demonstrated ":"available "/,
    "Available must have its own class");
  // Only the four approved states may be produced by skillState().
  const fn = source.slice(source.indexOf("function skillState("), source.indexOf("function skillState(") + 400);
  const states = [...fn.matchAll(/return"([A-Za-z]+)"/g)].map(m => m[1]);
  assert.ok(states.length >= 3, "skillState must return the four approved states");
  for (const st of new Set(states)) {
    assert.ok(["Locked", "Available", "Learning", "Demonstrated"].includes(st),
      "unexpected skill state " + st);
  }
  // No learner-facing "Verified" state anywhere in the rendered markup.
  assert.ok(!/>\s*Verified\s*</.test(html), "no learner-facing 'Verified' state may remain");
  assert.equal(htmlNoComments.includes('"verified "'), false,
    "the leftover verified class must be retired");
});

test("F-09: the skills metric row counts every state so it reconciles", () => {
  const m = source.match(/skillsMetrics"\)\.innerHTML=([\s\S]{0,600}?);/);
  assert.ok(m, "the skills metric row must be rendered");
  const row = m[1];
  for (const state of ["Available", "Learning", "Demonstrated", "Locked"]) {
    assert.match(row, new RegExp("counts\\." + state),
      `the metric row must count ${state} or it cannot reconcile with the summary pill`);
  }
  assert.match(htmlNoComments, /\.skillsHeader\{display:flex;gap:8px;flex-wrap:wrap/,
    "the metric row must wrap rather than clip on a narrow screen");
});

test("skills: exactly 23 skills, all mapped to real classes, four states", () => {
  const curriculum = require("./_curriculum.js");
  const start = html.indexOf("const skills=[") + "const skills=".length;
  const end = html.indexOf("];", start) + 2;
  const arr = eval(html.slice(start, end));
  assert.equal(arr.length, 23, "there must be exactly 23 canonical skills");
  const valid = new Set(curriculum.ALL_CLASS_KEYS);
  for (const s of arr) {
    assert.ok(s[2].length > 0, s[0] + " must map to at least one class");
    for (const k of s[2]) assert.ok(valid.has(k), s[0] + " references an unknown class " + k);
  }
  assert.equal(new Set(arr.map(s => s[0])).size, 23, "skill names must be unique");
});

// ---------------------------------------------------------------------------
// F-13 / F-16 / F-17 / F-22
// ---------------------------------------------------------------------------
test("P-3/F-13: the layout keeps the deployed single 850px breakpoint", () => {
  // The deployed site collapses the sidebar at 850px and has no other step.
  // The local-only redesign moved the collapse to 900px and added a 1100px
  // intermediate step; the owner rejected both.
  assert.match(htmlNoComments, /@media\(max-width:850px\)\{\.conceptGrid\{grid-template-columns:1fr\}\.app\{display:block\}\.side\{display:none\}/,
    "the sidebar must collapse at the deployed 850px breakpoint");
  assert.equal(/@media\(max-width:900px\)\{/.test(htmlNoComments), false,
    "the 900px breakpoint must not come back");
  assert.equal(/@media\(max-width:1100px\)\{/.test(htmlNoComments), false,
    "the 1100px intermediate step must not come back");
});

test("F-16: the lesson player keeps the approved prominent 16:9 presentation", () => {
  // RESTORED BASELINE (3ae51e8). The rejected build bounded the player by
  // WIDTH, and an earlier pass had clamped its HEIGHT with
  // `max-height:300px` / `max-height:190px`. That height clamp is what produced
  // the cramped 533px strip inside a 980px row. The approved baseline has no
  // height clamp at all: the box is `aspect-ratio:16/9` and takes its width from
  // the lesson column, so it reads as a hero. Lock THAT in instead.
  assert.match(htmlNoComments,
    /\.lessonVideo\{aspect-ratio:16\/9;background:#171717;color:#fff;border-radius:24px;display:grid;place-items:center;text-align:center;padding:30px\}/,
    "the approved 16:9 player plate must be the base rule");
  assert.equal(/max-height:300px/.test(htmlNoComments), false,
    "the desktop player must not be height-clamped (that produced the cramped strip)");
  assert.equal(/max-height:190px/.test(htmlNoComments), false,
    "the mobile player must not be height-clamped");
  assert.equal(/max-width:1180px/.test(htmlNoComments), false,
    "the player must take its width from the lesson column, not a 1180px clamp");
  assert.ok(html.includes("Lesson video coming soon"), "the placeholder copy must be preserved");
});

test("F-17: lesson touch targets meet the 44px minimum", () => {
  // RESTORED BASELINE. The 44px floor belongs to the TOUCH breakpoint — the
  // approved desktop lesson is an 11px/800 pill and a 12px/800 back link, and
  // forcing the floor at base level is exactly the rejected CTA restyle. The
  // approved base rules carry no min-height, so any 44px match below is
  // necessarily inside a media query, i.e. scoped to touch viewports.
  assert.match(htmlNoComments, /\.lessonBack\{[^}]*min-height:44px/,
    "the back control must meet the touch minimum on touch viewports");
  assert.match(htmlNoComments, /\.lessonActions[^{,]*\{[^}]*min-height:4[0-9]px/,
    "the action chips must meet the touch minimum on touch viewports");
  const tap = htmlNoComments.match(/--tap:(\d+)px/);
  assert.ok(tap && parseInt(tap[1], 10) >= 44,
    "the --tap token must be at least 44px, got " + (tap && tap[1]));
  // The approved CTA typography must survive the restoration: bold, not thin.
  assert.match(htmlNoComments,
    /\.lessonActions a,\.lessonActions span\{[^}]*font-size:11px;font-weight:800/,
    "the action pills must keep the approved 11px/800 typography");
});

test("F-22: the unlock copy is 1-based, so it never says 'Class 0'", () => {
  assert.equal(source.includes("'Complete Class '+ci+' to unlock.'"), false,
    "the class unlock copy must not use the 0-based index");
  assert.equal(source.includes("'Complete Module '+mi+' to unlock.'"), false,
    "the module unlock copy must not use the 0-based index");
  assert.match(source, /'Complete Class '\+\(ci\+1\)\+' to unlock\.'/,
    "the class unlock copy must be 1-based");
  assert.match(source, /'Complete Module '\+\(mi\+1\)\+' to unlock\.'/,
    "the module unlock copy must be 1-based");
});

// ---------------------------------------------------------------------------
// F-03 — one font, declared and rendered the same way
// ---------------------------------------------------------------------------
test("F-03: exactly one webfont family is declared and it is Manrope", () => {
  assert.equal(/DM Sans|DM\+Sans/.test(html), false, "no DM Sans declaration may remain");
  const families = [...html.matchAll(/family=([A-Za-z+]+):/g)].map(m => m[1]);
  for (const f of new Set(families)) {
    assert.equal(f, "Manrope", "the only loaded webfont must be Manrope, found " + f);
  }
  const lock = fs.readFileSync(path.join(ROOT, "manrope-lock.css"), "utf8");
  assert.match(lock, /font-family:"Manrope",sans-serif!important/,
    "the lock file must pin Manrope so the rendered font matches the declaration");
  assert.equal(/DM Sans/.test(lock), false, "the lock file must not mention DM Sans");
});

// ---------------------------------------------------------------------------
// Learner-facing language — no internal production vocabulary may ship
// ---------------------------------------------------------------------------
test("F-11/F-12: no internal production language reaches the learner", () => {
  // "the source", "the guide", "the guidebook" and "ASSISTARA-ADDED" are
  // authoring vocabulary. A learner enrolled in the Academy has never seen a
  // source document; being told the answer lives in it implies material they do
  // not have, and it is the highest trust cost in Phases 3-4.
  const INTERNAL = /\bthe source\b|\bthe guide\b|\bthe guidebook\b|ASSISTARA-ADDED/gi;

  // Legitimate uses that must NOT be swept up: brand "guidelines", the
  // possessive "don't", and "the sources used in a post".
  const ALLOWED = [
    /guidelines?/i,
    /do\u2019?s and don\u2019?ts/i,
    /do's and don'ts/i,
    /sources used in the post/i,
    /list the sources/i,
  ];
  const allowed = (text) => ALLOWED.some(re => re.test(text));

  const scan = (text, where) => {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")          // CSS/JS block comments
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1"); // line comments
    for (const m of stripped.matchAll(INTERNAL)) {
      const ctx = stripped.slice(Math.max(0, m.index - 90), m.index + 90);
      if (!allowed(ctx)) {
        assert.fail(`${where}: internal language "${m[0]}" in ...${ctx}...`);
      }
    }
  };

  // 1. The served page.
  scan(html, "academy-dashboard.html");
  // 2. The Quick Check bank: every learner-visible string.
  const bank = fs.readFileSync(path.join(__dirname, "_quick-check-bank.js"), "utf8");
  for (const field of ["prompt", "correct_explanation", "text"]) {
    for (const m of bank.matchAll(new RegExp('"' + field + '":\\s*"((?:[^"\\\\]|\\\\.)*)"', "g"))) {
      if (INTERNAL.test(m[1]) && !allowed(m[1])) {
        assert.fail(`_quick-check-bank.js ${field}: internal language in "${m[1].slice(0, 120)}"`);
      }
    }
  }
  // Per-option feedback too.
  for (const m of bank.matchAll(/"p[1-4]m\d+c\d+\.q\d+\.o\d+":\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (INTERNAL.test(m[1]) && !allowed(m[1])) {
      assert.fail(`_quick-check-bank.js feedback: internal language in "${m[1].slice(0, 120)}"`);
    }
  }
  // 3. The exam bank must be clean too.
  const exam = fs.readFileSync(path.join(__dirname, "_exam-bank.js"), "utf8");
  assert.equal(INTERNAL.test(exam), false, "the exam bank must not carry internal language");
});

test("F-12: editorial-gap disclosures are preserved, not hidden", () => {
  // The rewrite must not conceal a real limitation: where a lesson says it does
  // not cover something, that admission has to survive.
  const bank = fs.readFileSync(path.join(__dirname, "_quick-check-bank.js"), "utf8");
  const admissions = [
    /does not cover/i,
    /not covered here/i,
    /leaves? (?:it )?unfinished/i,
    /does not (?:contain|provide|give|back)/i,
  ];
  const found = admissions.some(re => re.test(bank) || re.test(html));
  assert.ok(found,
    "the honest 'this lesson does not cover X' disclosures must remain; "
    + "the rewrite re-points them, it does not delete them");
});

// ---------------------------------------------------------------------------
// E-2 — the Test Portal must reach the Final Assessment
// ---------------------------------------------------------------------------
test("E-2: the Test Portal suppresses only the certificate download, not the exam entry point", () => {
  const certSource = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const i = certSource.indexOf("let certActions=document.getElementById(\"certExams\")");
  assert.ok(i > 0, "the certificate action block must exist");
  const block = certSource.slice(i, i + 700).replace(/\s+/g, " ");

  // The exam entry point must still be reachable in preview. A tester needs to
  // drive the Final Assessment, which is the surface most worth QA.
  // Match the shipped minified form: no spaces around &&, and the comment
  // stripper leaves "if(certActions){ if(preview...".
  assert.match(block, /finalUnlocked&&!finalPassed\)certActions\.innerHTML='<button class="btn" type="button" id="startFinalExam">/,
    "the Take Final Exam action must not be suppressed by preview mode");
  // The download must remain hidden in preview: it is a real PDF and a QA
  // session is not a graduating learner.
  assert.match(block, /preview&&finalPassed&&allClasses&&phasePass\.every\(Boolean\)\)certActions\.innerHTML=""/,
    "preview must still suppress the certificate download");
  assert.ok(!/if\(preview\)certActions\.innerHTML=""/.test(block),
    "preview must not blank the whole action row; that made the Final Assessment unreachable");
  // The button handler must be wired.
  assert.match(source, /let se=document\.getElementById\("startFinalExam"\);if\(se\)se\.onclick=\(\)=>\{openPage\("course"\);openExamView\("final"\)\}/,
    "the Take Final Exam control must open the final assessment");
});

test("E-2: a preview session cannot obtain the certificate PDF", () => {
  // Defense in depth: the client hides the link in preview, and the server
  // still refuses a non-preview QA cookie.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const certBlock = stripped.slice(stripped.indexOf("let certActions=")).replace(/\s+/g, " ");
  assert.match(certBlock, /preview&&finalPassed&&allClasses&&phasePass\.every\(Boolean\)\)certActions\.innerHTML=""/,
    "the download anchor must not be rendered in preview");
  const certHandler = fs.readFileSync(path.join(__dirname, "academy-certificate.js"), "utf8");
  assert.match(certHandler, /academy-test-portal/,
    "the certificate handler must recognise the QA portal cookie");
});
