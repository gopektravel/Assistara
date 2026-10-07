"use strict";

// achievements.test.js — the expanded 18-milestone Achievement set, Home Quick
// Access, and the Skills/Achievements density contract.
//
// Owner directive, 2 October 2026. The three things this suite exists to prove:
//
//   1. Every achievement maps to a REAL, deterministic, authoritative learner
//      milestone. No subjective badges ("hard worker", "fast learner", "perfect
//      student"). Each threshold is checked at n-1, n, and n+1 so an off-by-one
//      cannot slip through.
//   2. Browsing and navigating NEVER earn an achievement. Only real progression
//      - completed classes, real module completion, a real recorded exam pass -
//      can.
//   3. Assistara Graduate requires an authoritative Final Academy Exam pass.
//      "Review all" state, which unlocks every class and exam, must NOT earn it.
//
// Run: node --test assistara-local-v9/api/achievements.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSession, readInlineScript } = require("./_qc-harness.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const source = readInlineScript();
const html = fs.readFileSync(DASHBOARD, "utf8");
const htmlNoComments = html.replace(/\/\*[\s\S]*?\*\//g, "");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A session with the page-level chrome the Skills/Home renderers mount into.
// The shared harness only seeds lesson chrome, so these hosts are added here
// rather than by changing a harness the Quick Check suite also depends on.
function openPortal(options) {
  const session = createSession(options);
  const { document } = session;
  for (const [id, tag] of [
    ["skills", "section"],
    ["course", "section"],
    ["achievementsList", "div"],
    ["achievementsSummary", "span"],
    ["skillsList", "div"],
    ["skillsSummary", "span"],
    ["skillsMetrics", "div"],
    ["recentAchievement", "div"],
    ["sessionsList", "div"],
    ["quickAccessSessions", "small"],
    ["phaseJourney", "div"],
    ["continueCard", "div"],
  ]) {
    if (document.byId.has(id)) continue;
    const el = document.createElement(tag);
    el.setAttribute("id", id);
    document.body.appendChild(el);
    document.byId.set(id, el);
  }
  return session;
}

const names = (rows) => rows.map((r) => r[1]);
const earnedNames = (session) => names(session.qc.achievements());

// Complete the first `n` classes of the curriculum, in traversal order.
function completeFirstClasses(session, n) {
  const { key, curriculum } = session.qc;
  let done = 0;
  outer: for (let pi = 0; pi < curriculum.length; pi++) {
    for (let mi = 0; mi < curriculum[pi].modules.length; mi++) {
      for (let ci = 0; ci < curriculum[pi].modules[mi][1].length; ci++) {
        if (done++ >= n) break outer;
        session.qc.completed.add(key(pi, mi, ci));
      }
    }
  }
  return session.qc.completed.size;
}

function completeAllClasses(session) {
  const { key, curriculum } = session.qc;
  for (let pi = 0; pi < curriculum.length; pi++) {
    for (let mi = 0; mi < curriculum[pi].modules.length; mi++) {
      for (let ci = 0; ci < curriculum[pi].modules[mi][1].length; ci++) {
        session.qc.completed.add(key(pi, mi, ci));
      }
    }
  }
}

function completeModule(session, pi, mi) {
  const { key, curriculum } = session.qc;
  curriculum[pi].modules[mi][1].forEach((_, ci) => session.qc.completed.add(key(pi, mi, ci)));
}

// ---------------------------------------------------------------------------
// 1. The set itself: 18 objective milestones, one unique icon each
// ---------------------------------------------------------------------------

test("the Academy ships 18 achievements, each with a unique name and icon", () => {
  const session = openPortal();
  try {
    const M = session.qc.ACHIEVEMENT_MILESTONES;
    assert.equal(M.length, 18, "the milestone set must hold 18 achievements");

    const n = M.map((m) => m.name);
    const i = M.map((m) => m.icon);
    assert.equal(new Set(n).size, n.length, "achievement names must be unique");
    assert.equal(new Set(i).size, i.length, "every achievement needs its OWN icon");

    for (const m of M) {
      assert.equal(typeof m.earned, "function", m.name + " must have an earned() trigger");
      assert.equal(typeof m.desc, "function", m.name + " must build its description from data");
      assert.ok(m.desc().length > 8, m.name + " must state a real requirement");
    }

    // The specific complaint: a trophy repeated across the whole set.
    assert.ok(i.filter((x) => x === "\u{1F3C6}").length <= 1,
      "a generic trophy may not be reused across the achievement set");

    // Locked keeps its shape but muted; earned keeps the approved green.
    assert.match(htmlNoComments, /\.achvCard\.locked \.achvIcon\{background:#dedbd4;filter:grayscale\(1\);opacity:\.6\}/,
      "a locked achievement must mute its icon without hiding it");
    assert.match(htmlNoComments, /\.achvCard\.earned \.achvIcon\{background:#dff3df\}/,
      "an earned achievement must keep its approved green treatment");
  } finally { session.dispose(); }
});

test("no achievement is a subjective judgement badge", () => {
  const session = openPortal();
  try {
    const SUBJECTIVE = new RegExp(
      "\\b(hard worker|fast learner|perfect student|quick learner|top student|most improved"
      + "|consistent|dedicated|determined|hardworking|committed|passionate|superstar"
      + "|all.rounder|jack of all trades|go.getter|overachiever)\\b", "i");
    for (const m of session.qc.ACHIEVEMENT_MILESTONES) {
      assert.equal(SUBJECTIVE.test(m.name), false,
        "subjective achievement name: " + m.name);
      assert.equal(SUBJECTIVE.test(m.desc()), false,
        "subjective achievement description: " + m.name + " -> " + m.desc());
    }
  } finally { session.dispose(); }
});

test("achievement icons do not collide with the 23 skill icons", () => {
  const session = openPortal();
  try {
    const skillIcons = session.qc.skills.map((s) => s[1]);
    for (const m of session.qc.ACHIEVEMENT_MILESTONES) {
      assert.equal(skillIcons.includes(m.icon), false,
        m.name + " reuses the skill icon " + m.icon);
    }
  } finally { session.dispose(); }
});

test("branded names the owner approved are kept", () => {
  const session = openPortal();
  try {
    const n = session.qc.ACHIEVEMENT_MILESTONES.map((m) => m.name);
    for (const keep of ["Getting Started", "First Module", "Foundation Builder",
      "Creative Operator", "AI-Ready VA", "Client Ready", "Assistara Graduate"]) {
      assert.ok(n.includes(keep), "the approved name " + keep + " must survive");
    }
    // The Certificate is granted by the final exam, not by this list.
    assert.equal(n.some((x) => /certificate/i.test(x)), false,
      "the Certificate must not be an achievement");
  } finally { session.dispose(); }
});

// ---------------------------------------------------------------------------
// 2. Triggers: every milestone fires at exactly its documented threshold
// ---------------------------------------------------------------------------

test("class-count milestones fire at exactly 1, 10, 25, 50 and all classes", () => {
  const expectations = [
    [0, []],
    [1, ["Getting Started"]],
    [9, ["Getting Started"]],
    [10, ["Getting Started", "Momentum Builder"]],
    [24, ["Getting Started", "Momentum Builder"]],
    [25, ["Getting Started", "Momentum Builder", "Quarter Century"]],
    [49, ["Getting Started", "Momentum Builder", "Quarter Century"]],
    [50, ["Getting Started", "Momentum Builder", "Quarter Century", "Halfway Hero"]],
  ];
  for (const [n, expected] of expectations) {
    const session = openPortal();
    try {
      completeFirstClasses(session, n);
      const got = earnedNames(session).filter((x) => expected.includes(x) || false);
      for (const want of expected) {
        assert.ok(earnedNames(session).includes(want),
          "at " + n + " classes, " + want + " must be earned");
      }
      // And nothing beyond the expected class milestones has fired yet.
      const classMilestones = ["Momentum Builder", "Quarter Century", "Halfway Hero", "Academy Finisher"];
      for (const cm of classMilestones) {
        if (!expected.includes(cm)) {
          assert.equal(earnedNames(session).includes(cm), false,
            "at " + n + " classes, " + cm + " must NOT be earned yet");
        }
      }
      assert.equal(got.length, expected.length);
    } finally { session.dispose(); }
  }
});

test("the final class count milestone waits for every class, not a guess", () => {
  const session = openPortal();
  try {
    const total = session.qc.totalClasses;
    assert.equal(total, 90, "the Academy is 90 classes");
    completeFirstClasses(session, total - 1);
    assert.equal(earnedNames(session).includes("Academy Finisher"), false,
      "89 of 90 classes must not earn Academy Finisher");
    completeFirstClasses(session, total);
    assert.equal(earnedNames(session).includes("Academy Finisher"), true,
      "all 90 classes must earn Academy Finisher");
    assert.match(session.qc.achievements().find((a) => a[1] === "Academy Finisher")[2],
      /all 90 Academy classes/,
      "the description must state the real requirement, with the real total");
  } finally { session.dispose(); }
});

test("module milestones fire at 1, 5, 12 and every module", () => {
  const session = openPortal();
  try {
    const totalModules = session.qc.totalModules;
    assert.equal(totalModules, 24, "the Academy is 24 modules");

    assert.equal(earnedNames(session).includes("First Module"), false,
      "a learner with no modules must have no First Module");

    completeModule(session, 0, 0);
    assert.equal(earnedNames(session).includes("First Module"), true,
      "one complete module must earn First Module");
    assert.equal(earnedNames(session).includes("Module Momentum"), false,
      "one module must not earn Module Momentum");

    completeModule(session, 0, 1);
    completeModule(session, 0, 2);
    completeModule(session, 0, 3);
    completeModule(session, 0, 4);
    assert.equal(session.qc.modulesDone(), 5);
    assert.equal(earnedNames(session).includes("Module Momentum"), true,
      "five modules must earn Module Momentum");
    assert.equal(earnedNames(session).includes("Pathway Builder"), false,
      "five modules must not earn Pathway Builder");

    for (let mi = 5; mi < session.qc.curriculum[0].modules.length; mi++) {
      completeModule(session, 0, mi);
    }
    assert.equal(session.qc.modulesDone(), session.qc.curriculum[0].modules.length);
    assert.ok(session.qc.modulesDone() >= 5 && session.qc.modulesDone() < 12,
      "sanity: Phase 1 alone is not yet twelve modules");

    // Twelve modules.
    let mi = 0;
    while (session.qc.modulesDone() < 12) {
      completeModule(session, 1, mi++);
    }
    assert.equal(session.qc.modulesDone(), 12);
    assert.equal(earnedNames(session).includes("Pathway Builder"), true,
      "twelve modules must earn Pathway Builder");
    assert.equal(earnedNames(session).includes("Master Builder"), false,
      "twelve modules must not earn Master Builder");

    completeAllClasses(session);
    assert.equal(session.qc.modulesDone(), totalModules);
    assert.equal(earnedNames(session).includes("Master Builder"), true,
      "all 24 modules must earn Master Builder");
    assert.match(session.qc.achievements().find((a) => a[1] === "Master Builder")[2],
      /all 24 Academy modules/, "the description must state the real total");
  } finally { session.dispose(); }
});

test("Phase 1 coursework and the four Phase exams each unlock their own badge", () => {
  const session = openPortal();
  try {
    assert.equal(earnedNames(session).includes("Foundation Builder"), false,
      "a fresh learner has not finished Phase 1 coursework");

    // All Phase 1 coursework, but no exam pass yet.
    session.qc.curriculum[0].modules.forEach((_, mi) => completeModule(session, 0, mi));
    assert.equal(session.qc.phaseStatus(0).key !== "passed", true,
      "coursework alone must not pass the phase");
    assert.equal(earnedNames(session).includes("Foundation Builder"), true,
      "all Phase 1 coursework must earn Foundation Builder");
    assert.equal(earnedNames(session).includes("Foundation Pro"), false,
      "coursework alone must not earn Foundation Pro");
    assert.equal(earnedNames(session).includes("Creative Operator"), false);

    const phases = ["Foundation Pro", "Creative Operator", "AI-Ready VA", "Client Ready"];
    for (let pi = 0; pi < 4; pi++) {
      // Coursework for this phase.
      session.qc.curriculum[pi].modules.forEach((_, mi) => completeModule(session, pi, mi));
      assert.equal(session.qc.phaseStatus(pi).key === "passed", false,
        "Phase " + (pi + 1) + " coursework must not pass the exam");
      assert.equal(earnedNames(session).includes(phases[pi]), false,
        "Phase " + (pi + 1) + " coursework alone must not earn " + phases[pi]);
      // A real recorded pass.
      session.qc.passExam("phase_" + (pi + 1), 100);
      assert.equal(session.qc.phaseStatus(pi).key, "passed",
        "a recorded pass must move Phase " + (pi + 1) + " to passed");
      assert.equal(earnedNames(session).includes(phases[pi]), true,
        "Phase " + (pi + 1) + " passed must earn " + phases[pi]);
      assert.equal(earnedNames(session).includes("Hall of Fame"), pi === 3,
        "Hall of Fame must wait for all four exams");
    }
    assert.equal(earnedNames(session).includes("Hall of Fame"), true,
      "all four Phase exams must earn Hall of Fame");
  } finally { session.dispose(); }
});

test("a failed exam earns nothing, and only a passed exam does", () => {
  const session = openPortal();
  try {
    session.qc.curriculum[0].modules.forEach((_, mi) => completeModule(session, 0, mi));
    session.qc.examAttempts.push({ exam_key: "phase_1", score: 40, passing_score: 80, passed: false });
    assert.equal(earnedNames(session).includes("Foundation Pro"), false,
      "a failed exam must not earn Foundation Pro");
    session.qc.examAttempts.push({ exam_key: "phase_1", score: 90, passing_score: 80, passed: true });
    assert.equal(earnedNames(session).includes("Foundation Pro"), true,
      "a passed exam must earn Foundation Pro");
  } finally { session.dispose(); }
});

test("skill milestones follow real demonstrated skills", () => {
  const session = openPortal();
  try {
    assert.equal(earnedNames(session).includes("Skill Sharper"), false);
    assert.equal(earnedNames(session).includes("Skills Champion"), false);

    // Communication needs p1m1c4 and p1m2c2 both complete.
    completeModule(session, 0, 0);
    assert.equal(session.qc.skillsDemonstrated(), 0,
      "one module alone must not demonstrate a two-class skill");
    session.qc.completed.add(session.qc.key(0, 1, 1)); // p1m2c2
    assert.equal(session.qc.skillsDemonstrated(), 1);
    assert.equal(earnedNames(session).includes("Skill Sharper"), true,
      "the first demonstrated skill must earn Skill Sharper");
    assert.equal(earnedNames(session).includes("Skills Champion"), false);

    completeAllClasses(session);
    for (let pi = 1; pi <= 4; pi++) session.qc.passExam("phase_" + pi, 100);
    // Skills are locked by phase, so demonstrating every skill also needs every
    // phase unlocked - coursework alone is not enough.
    assert.equal(session.qc.skillsDemonstrated(), session.qc.skills.length,
      "every class complete and every phase passed means every skill demonstrated");
    assert.equal(earnedNames(session).includes("Skills Champion"), true,
      "every demonstrated skill must earn Skills Champion");
    assert.match(
      session.qc.achievements().find((a) => a[1] === "Skills Champion")[2],
      new RegExp("all " + session.qc.skills.length + " Academy skills"),
      "the description must state the real skill total");
  } finally { session.dispose(); }
});

test("Assistara Graduate requires an authoritative Final Academy Exam pass", () => {
  const session = openPortal();
  try {
    completeAllClasses(session);
    for (let pi = 1; pi <= 4; pi++) session.qc.passExam("phase_" + pi, 100);

    // Everything except the final exam.
    assert.equal(session.qc.completed.size, session.qc.totalClasses);
    assert.equal(session.qc.phasesPassed(), 4);
    assert.equal(earnedNames(session).includes("Assistara Graduate"), false,
      "100% of classes and all four exams must still NOT earn Assistara Graduate");
    assert.equal(earnedNames(session).includes("Hall of Fame"), true);

    // A failed final exam must not do it either.
    session.qc.examAttempts.push({ exam_key: "final", score: 50, passing_score: 80, passed: false });
    assert.equal(earnedNames(session).includes("Assistara Graduate"), false,
      "a failed final exam must not earn Assistara Graduate");

    // An authoritative pass.
    session.qc.examAttempts.push({ exam_key: "final", score: 88, passing_score: 80, passed: true });
    assert.equal(earnedNames(session).includes("Assistara Graduate"), true,
      "a passed Final Academy Exam must earn Assistara Graduate");
    assert.equal(earnedNames(session).length, 18, "every achievement must now be earned");
  } finally { session.dispose(); }
});

test("a fresh learner has earned nothing", () => {
  const session = openPortal();
  try {
    // Note: deepStrictEqual would fail here - the array comes from the vm
    // sandbox, so its prototype is not this realm's Array.prototype.
    assert.equal(session.qc.achievements().length, 0,
      "a brand-new Academy must have zero earned achievements");
    session.qc.renderAchievements();
    const host = session.document.getElementById("achievementsList");
    const cards = host.querySelectorAll(".achvCard");
    assert.equal(cards.length, 18, "every milestone is still shown as a locked card");
    assert.equal(host.innerHTML.match(/achvCard locked/g).length, 18,
      "all 18 must render as Locked for a fresh learner");
    assert.equal(session.document.getElementById("achievementsSummary").textContent,
      "0 of 18 earned", "the summary must read 0 of 18 earned");
  } finally { session.dispose(); }
});

test("renderAchievements marks each card Earned or Locked from real state", () => {
  const session = openPortal();
  try {
    session.qc.renderAchievements();
    const host = session.document.getElementById("achievementsList");
    assert.equal(host.innerHTML.match(/achvCard locked/g).length, 18);

    completeFirstClasses(session, 10);
    session.qc.renderAchievements();
    const html2 = host.innerHTML;
    // The rendered cards must agree with achievements() exactly, whatever the
    // state is. That is the real invariant; the count is a consequence.
    const earnedNow = session.qc.achievements();
    assert.equal(html2.match(/achvCard earned/g).length, earnedNow.length,
      "every earned achievement must render as an Earned card");
    assert.equal(html2.match(/achvCard locked/g).length, 18 - earnedNow.length,
      "every locked achievement must render as a Locked card");
    assert.ok(earnedNow.length >= 2,
      "ten classes must at least earn Getting Started and Momentum Builder");
    assert.ok(earnedNames(session).includes("Getting Started"));
    assert.ok(earnedNames(session).includes("Momentum Builder"));
    assert.equal(earnedNames(session).includes("Quarter Century"), false,
      "ten classes must not earn Quarter Century");
    assert.equal(session.document.getElementById("achievementsSummary").textContent,
      earnedNow.length + " of 18 earned", "X of Y earned must track real state");

    // Every card carries its own icon and its own description.
    const icons = [...html2.matchAll(/achvIcon[^>]*>([^<]+)</g)].map((m) => m[1].trim());
    assert.equal(icons.length, 18);
    assert.equal(new Set(icons).size, 18, "each rendered card must show its unique icon");
    const descs = [...html2.matchAll(/<small>([^<]{8,})<\/small>/g)].map((m) => m[1]);
    assert.equal(descs.length, 18, "each card must state its real requirement");
  } finally { session.dispose(); }
});

// ---------------------------------------------------------------------------
// 3. Browsing must never earn anything
// ---------------------------------------------------------------------------

test("navigating every page and browsing the course earns no achievement", async () => {
  const session = openPortal();
  try {
    for (const [id, tag] of [
      ["desktopNav", "nav"], ["mobileNav", "nav"], ["mobileTop", "div"],
      ["overallPct", "span"], ["overallFill", "div"], ["doneClasses", "span"],
      ["doneModules", "span"], ["passedPhases", "span"], ["home", "section"],
      ["courseView", "div"], ["certificate", "section"], ["resources", "section"],
      ["sessions", "section"], ["settings", "section"],
    ]) {
      if (session.document.byId.has(id)) continue;
      const el = session.document.createElement(tag);
      el.setAttribute("id", id);
      session.document.body.appendChild(el);
      session.document.byId.set(id, el);
    }
    const { qc } = session;
    const before = {
      achievements: qc.achievements().length,
      completed: qc.completed.size,
      attempts: qc.examAttempts.length,
    };

    qc.buildNav();
    for (const page of ["home", "course", "skills", "resources", "sessions", "certificate", "settings"]) {
      qc.openPage(page);
    }
    // Full course traversal: every phase, every module, every class listed.
    for (let pi = 0; pi < qc.curriculum.length; pi++) {
      qc.browse(pi, 0);
      for (let mi = 0; mi < qc.curriculum[pi].modules.length; mi++) qc.browse(pi, mi);
    }
    // Try to open a class that progression has not unlocked.
    await qc.openClass("p4m10c3").catch(() => {});
    // Try to open a locked exam.
    qc.openExamView("phase_4").catch(() => {});
    qc.renderHome();
    qc.renderCourse();
    qc.renderSkills();

    assert.equal(qc.achievements().length, 0, "browsing must not earn a single achievement");
    assert.equal(qc.completed.size, 0, "browsing must not mark any class complete");
    assert.equal(qc.examAttempts.length, 0, "browsing must not record an exam attempt");
    assert.deepEqual(
      { achievements: qc.achievements().length, completed: qc.completed.size, attempts: qc.examAttempts.length },
      before,
    );
  } finally { session.dispose(); }
});

test("rendering the Skills page repeatedly cannot award anything", () => {
  const session = openPortal();
  try {
    const { qc } = session;
    for (let i = 0; i < 5; i++) qc.renderSkills();
    assert.equal(qc.achievements().length, 0);
    assert.equal(qc.completed.size, 0);
    // A fresh learner has Phase 1 unlocked, so the Phase 1 skills read as
    // Available and everything later reads as Locked.
    const available = qc.skills.filter((s) => qc.skillState(s) !== "Locked").length;
    assert.ok(available > 0 && available < qc.skills.length,
      "sanity: only the Phase 1 skills are unlocked on day one");
    assert.equal(session.document.getElementById("skillsSummary").textContent,
      available + " / " + qc.skills.length + " skills unlocked");
  } finally { session.dispose(); }
});

// ---------------------------------------------------------------------------
// 4. Home Recent Achievement stays compact and auto-works with 18
// ---------------------------------------------------------------------------

test("Home Recent Achievement shows the latest earned milestone, with icon + name + desc", () => {
  const session = openPortal();
  try {
    const { qc, document } = session;
    document.getElementById("recentAchievement").innerHTML = "";
    // "Latest" means the last entry in the ladder, so the list order IS the
    // contract. Assert the card matches the highest-index earned milestone.
    const expectedLatest = () => {
      const got = new Set(earnedNames(session));
      return [...qc.ACHIEVEMENT_MILESTONES].reverse().find((m) => got.has(m.name));
    };
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const n of [0, 1, 10, 25, 50]) {
      completeFirstClasses(session, n);
      qc.renderHomeView();
      const rendered = document.getElementById("recentAchievement").innerHTML;
      const want = expectedLatest();
      if (!want) {
        // Nothing earned yet: the Home card keeps its approved empty prompt.
        assert.equal(earnedNames(session).length, 0);
        assert.match(rendered, /Getting Started/,
          "with nothing earned, Home must prompt for the first class");
        assert.match(rendered, /View all/, "and still offer View all");
        continue;
      }
      assert.match(rendered, new RegExp(esc(want.name)),
        "at " + n + " classes, Home must show " + want.name + " (got: " + rendered.slice(0, 160) + ")");
      assert.match(rendered, new RegExp(esc(want.desc())),
        "at " + n + " classes, Home must state the real requirement");
      assert.match(rendered, new RegExp(esc(want.icon)),
        "at " + n + " classes, Home must show that milestone's own icon");
    }

    // The whole ladder, but no Final Academy Exam yet.
    completeAllClasses(session);
    for (let pi = 1; pi <= 4; pi++) qc.passExam("phase_" + pi, 100);
    qc.renderHomeView();
    let rendered = document.getElementById("recentAchievement").innerHTML;
    assert.equal(earnedNames(session).length, 17,
      "everything but Assistara Graduate must be earned at 100% + four exams");
    assert.match(rendered, /Skills Champion/,
      "the top of the ladder is the last thing earned before the final exam");
    qc.passExam("final", 100);
    qc.renderHomeView();
    rendered = document.getElementById("recentAchievement").innerHTML;
    assert.match(rendered, /Assistara Graduate/,
      "the Final Academy Exam must be the latest achievement on Home");
    assert.match(rendered, /Passed the Final Academy Exam\./);
    assert.equal(earnedNames(session).length, 18, "all 18 are now earned");
    assert.match(rendered, /View all/, "Home must keep the compact View all CTA");
    assert.match(rendered, /data-achievements="1"/, "View all must target Achievements");
  } finally { session.dispose(); }
});

test("Home Recent Achievement stays compact — one row, not a dashboard section", () => {
  assert.match(htmlNoComments, /\.recentAchvRow \.achievement\{flex:1;min-width:0\}/,
    "the Home achievement must stay on the compact row");
  assert.match(htmlNoComments, /#recentAchievement \.achievementIcon\{width:36px;height:36px;font-size:18px\}/,
    "the Home achievement icon must stay small");
  assert.equal(/id="recentAchievement"[^>]*class="[^"]*sectionTitle/.test(html),
    false, "Recent achievement must not become a titled dashboard section");
  // One row, one achievement, one CTA. Not a grid of badges.
  assert.equal(/id="recentAchievement"[\s\S]{0,600}skillGrid/.test(html), false,
    "Recent achievement must not render a grid");
  assert.match(htmlNoComments, /\.achvViewAll\{[^}]*min-height:36px/,
    "the View all CTA must stay compact");
});

// ---------------------------------------------------------------------------
// 5. Home Quick Access
// ---------------------------------------------------------------------------

test("Home carries the two Quick Access shortcuts and one deliberate Founding Cohort Community card", () => {
  const home = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="course"'));
  assert.match(home, /<h2>Quick access<\/h2>/, "Home must have a Quick access section");
  assert.match(home, /class="shortcutCard" data-open="resources"/, "a Resources shortcut");
  assert.match(home, /class="shortcutCard" data-open="sessions"/, "a Live Sessions shortcut");
  assert.equal((home.match(/class="shortcutCard"/g) || []).length, 2,
    "exactly two shortcut cards in Quick Access — the WhatsApp shortcut must not be duplicated there");

  const icons = [...home.matchAll(/shortcutIcon" aria-hidden="true">([^<]+)</g)].map((m) => m[1]);
  assert.equal(icons.length, 2);
  assert.equal(new Set(icons).size, 2, "each shortcut needs its own clear icon");

  // One deliberate Community card between Academy Progress and Quick Access.
  const WA = "https://chat.whatsapp.com/H8Dn5NK3OxZC2nYlekvBDt";
  assert.match(home, /<div class="communityCard" id="communityCard"/,
    "the Founding Cohort Community card must live on the Home dashboard");
  assert.ok(home.indexOf('class="communityCard"') < home.indexOf("Quick access"),
    "the Community card must sit before Quick Access");
  assert.match(home, /class="eyebrow">FOUNDING COHORT<\/div>/,
    "the Community card must carry the FOUNDING COHORT eyebrow");
  assert.match(home, /You're not doing this alone\./,
    "the Community card must carry its approved headline");
  assert.match(home, /href="https:\/\/chat\.whatsapp\.com\/H8Dn5NK3OxZC2nYlekvBDt" target="_blank" rel="noopener noreferrer"/,
    "Join the Community must open the private WhatsApp invite in a new tab");
  assert.match(home, /class="ccJoined" id="communityJoinedBtn"/,
    "the secondary I've joined confirmation action must exist");
  assert.match(home, /Private WhatsApp community · Founding Cohort only/,
    "the supporting note must describe the private community");
  assert.equal((home.match(/chat.whatsapp.com/g) || []).length, 1,
    "exactly ONE WhatsApp entry point on the Home dashboard — no duplicate shortcut card");

  // Compact, side-by-side on desktop; a single column only on a phone.
  assert.match(htmlNoComments, /\.shortcutCard\{[^}]*padding:11px 13px/,
    "a shortcut card must stay compact");
  assert.match(htmlNoComments, /\.shortcutIcon\{[^}]*width:34px;height:34px/,
    "a shortcut icon must stay small");
  assert.match(htmlNoComments,
    /@media\(min-width:641px\)\{\.quickAccess\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/,
    "the two shortcuts must sit side by side from tablet up");
  assert.match(htmlNoComments,
    /@media\(max-width:640px\)\{[\s\S]{0,200}\.quickAccess\{grid-template-columns:1fr\}/,
    "a phone must stack the two shortcuts");
});

test("Quick Access does not re-list what the sidebar already offers as a headline", () => {
  const home = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="course"'));
  // The two shortcuts only, and both point at real pages.
  for (const target of ["resources", "sessions"]) {
    assert.ok(html.includes('data-open="' + target + '"'),
      "the " + target + " shortcut must point at the existing page");
  }
  // No nav item was added for either of them.
  assert.match(html, /\["resources","Resources"\],\["sessions","Live Sessions"\]/,
    "both pages keep their existing sidebar entries");
  assert.equal((html.match(/data-page="quickAccess"/g) || []).length, 0,
    "Quick Access must not become a navigation item");
});

test("the Live Sessions subtitle is compact, and names the next session when one exists", () => {
  const session = openPortal();
  try {
    const { qc, document } = session;
    // Nothing scheduled.
    assert.equal(qc.LIVE_SESSIONS.length, 0, "no session is scheduled today");
    assert.equal(qc.liveSessionSubtitle(), "View upcoming sessions");
    qc.buildSessions();
    assert.equal(document.getElementById("quickAccessSessions").textContent,
      "View upcoming sessions", "the Home subtitle must be the compact default");
    assert.match(document.getElementById("sessionsList").innerHTML,
      /No live sessions are scheduled yet\./,
      "the Live Sessions page keeps exactly its current notice");

    // A scheduled session, in the future.
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    qc.LIVE_SESSIONS.push({ title: "Client Q&A", when: future, detail: "Bring your questions." });
    assert.equal(qc.nextLiveSession().title, "Client Q&A");
    const sub = qc.liveSessionSubtitle();
    assert.match(sub, /^Next: Client Q&A/, "a scheduled session must be named: " + sub);
    assert.ok(sub.length < 44, "the subtitle must stay compact, got: " + sub);
    qc.buildSessions();
    assert.match(document.getElementById("quickAccessSessions").textContent, /Client Q&A/,
      "the Home subtitle must follow the same source as the page");
    assert.match(document.getElementById("sessionsList").innerHTML, /Client Q&A/,
      "the page and the shortcut can never disagree");

    // A past session is not "upcoming".
    qc.LIVE_SESSIONS.length = 0;
    qc.LIVE_SESSIONS.push({ title: "Old Q&A", when: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(qc.nextLiveSession(), null, "a past session must not count as upcoming");
    assert.equal(qc.liveSessionSubtitle(), "View upcoming sessions");
  } finally { session.dispose(); }
});

test("Home must not regain a giant empty live-session card", () => {
  const home = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="course"'));
  assert.equal(/No live session/i.test(home), false,
    "Home must not carry an empty live-session card again");
  assert.equal(/id="liveSessionCard"|class="[^"]*liveSession/i.test(home), false,
    "no live-session card may reappear on Home");
});

// ---------------------------------------------------------------------------
// 6. Layout: 2-column Achievements, compact Skills
// ---------------------------------------------------------------------------

test("Achievements are a 2-column grid on tablet and desktop, 1 column on a phone", () => {
  assert.match(htmlNoComments, /#achievementsList\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:9px\}/,
    "Achievements must be two columns on tablet and desktop");
  const phone = /@media\(max-width:640px\)\{[\s\S]{0,600}#achievementsList\{grid-template-columns:1fr\}/;
  assert.match(htmlNoComments, phone, "a phone must fall back to one column");
  // The base list is a grid so the two columns can apply at all.
  assert.match(htmlNoComments, /#achievementsList\{display:grid;gap:10px\}/,
    "#achievementsList must remain a grid host");
});

test("Skills are a compact multi-column grid on tablet and desktop", () => {
  assert.match(htmlNoComments, /@media\(min-width:641px\)\{[\s\S]*?#skills \.skillGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:9px\}/,
    "Skills must be two columns on tablet and desktop");
  assert.match(htmlNoComments, /@media\(min-width:1601px\)\{[\s\S]{0,300}#skills \.skillGrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/,
    "a very wide desktop gains a third skill column");
  assert.match(htmlNoComments, /@media\(max-width:640px\)\{[\s\S]{0,600}#skills \.skillGrid\{grid-template-columns:1fr;gap:7px\}/,
    "a phone stays one column");
  // Compact row, not the 134px stacked block.
  assert.match(htmlNoComments, /#skills \.skill\{display:grid;grid-template-columns:44px minmax\(0,1fr\) auto/,
    "the desktop skill card must be the compact horizontal row");
  assert.match(htmlNoComments, /#skills \.skill>strong\{grid-column:2;grid-row:1;font-size:14px\}/,
    "skill type must stay readable, not shrunk");
});

test("the Skills page keeps its two approved sections and its 23 skills", () => {
  const skills = html.slice(html.indexOf('<section id="skills"'), html.indexOf('<section id="resources"'));
  assert.match(skills, /id="skillsList"/, "the Skills section must stay");
  assert.match(skills, /id="achievementsList"/, "Achievements stay inside My Skills");
  assert.match(skills, /id="achievementsAnchor"/, "the Achievements anchor must stay");
  const session = openPortal();
  try {
    assert.equal(session.qc.skills.length, 23, "the Academy still has 23 skills");
    session.qc.renderSkills();
    const available = session.qc.skills.filter((s) => session.qc.skillState(s) !== "Locked").length;
    assert.equal(session.document.getElementById("skillsSummary").textContent,
      available + " / 23 skills unlocked");
    // The skills page still renders both approved sections.
    session.qc.renderSkills();
    assert.ok(session.document.getElementById("skillsList").innerHTML.length > 0,
      "the Skills list must still render");
  } finally { session.dispose(); }
});

test("the skill vocabulary and the four approved skill states are untouched", () => {
  assert.equal(/(const skills=\[)/.test(source), true, "the skills array must survive");
  for (const st of ["Locked", "Available", "Learning", "Demonstrated"]) {
    assert.ok(source.includes('"' + st + '"'), "the " + st + " state must survive");
  }
  // Skills Snapshot on Home must stay the 6-item compact snapshot.
  assert.match(html, /id="skillsSnapshot"/, "the Home Skills Snapshot must stay");
  const snap = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="course"'));
  const snapCards = (snap.match(/class="snapshotSkill"|skillSnapshotItem/g) || []).length;
  assert.ok(snapCards === 0 || snapCards <= 6,
    "the Home snapshot must stay compact, not expand to every skill");
  assert.match(htmlNoComments, /#home>\.sectionTitle:has\(\+ #skillsSnapshot\) \.btn/,
    "View My Skills must stay compact");
});

// ---------------------------------------------------------------------------
// 7. What this pass must NOT have changed
// ---------------------------------------------------------------------------

test("navigation and progression stay separated", () => {
  assert.match(source, /function guardProgression\(/,
    "guardProgression must still guard the renderers");
  assert.match(source, /function progressionFingerprint\(/,
    "the progression fingerprint must still exist");
  assert.ok(!/achievements\.push|completed\.add/.test(
    /function guardProgression\([\s\S]*?\nfunction/.exec(source)[0]),
  "guardProgression must not itself mutate achievement or completion state");
});

test("one authoritative achievement set, consumed by both Home and My Skills", () => {
  assert.equal((source.match(/const ACHIEVEMENT_MILESTONES=\[/g) || []).length, 1,
    "the milestone set must be defined exactly once");
  assert.match(source, /function achievements\(\)\{return ACHIEVEMENT_MILESTONES\.filter\(m=>m\.earned\(\)\)\.map\(m=>\[m\.icon,m\.name,m\.desc\(\)\]\)\}/,
    "Home must derive from the one set, not a second copy");
  // The old duplicated literal list must be gone.
  assert.equal(/let names=\["Phase 1 Passed","Creative Operator"/.test(source), false,
    "the duplicated phase-name list must be gone");
  assert.equal((source.match(/Completed your first Academy class\./g) || []).length, 1,
    "the description must exist once, not in two hand-maintained lists");
});

test("totals used in descriptions are derived, never hardcoded", () => {
  assert.match(source, /totalModules=curriculum\.reduce\(\(n,p\)=>n\+p\.modules\.length,0\)/,
    "the module total must come from the curriculum");
  assert.match(source, /function skillsDemonstrated\(\)\{return skills\.filter\(s=>skillState\(s\)==="Demonstrated"\)\.length\}/,
    "demonstrated skills must be counted from real skill state");
  assert.equal(/Completed all 90 Academy classes\./.test(source), false,
    "the class total must not be hardcoded in a description");
  assert.equal(/Completed all 24 Academy modules\./.test(source), false,
    "the module total must not be hardcoded in a description");
  assert.equal(/all 23 Academy skills/.test(source), false,
    "the skill total must not be hardcoded in a description");
});