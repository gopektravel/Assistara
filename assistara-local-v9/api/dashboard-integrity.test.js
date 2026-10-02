"use strict";

// dashboard-integrity.test.js — the shipped dashboard must PARSE, and the
// dashboard surfaces must actually render.
//
// WHY THIS SUITE EXISTS
//   Two real outages in one session were invisible to every other test:
//
//   1. A missing "+" between two adjacent string literals in renderHomeView,
//      and then a dropped closing brace. Both are JavaScript SYNTAX errors.
//      Nothing about the stub DOM catches them: the harness instruments and
//      runs the script, so a syntax error surfaces only as a thrown
//      vm.Script compile failure deep inside the harness - and the assertions
//      that "should" have failed instead all passed or misattributed. A broken
//      dashboard looks exactly like a test-harness problem unless something
//      parses the source directly.
//
//   2. CSS appended without a <style> wrapper rendered as visible text at the
//      top of the page. Structural checks now lock that down too.
//
// So this suite parses the real inline script with a real JS parser and
// asserts the dashboard's structural invariants. It has no stub DOM and no
// network, so it cannot be fooled by the app's own runtime.
//
// Run: node --test assistara-local-v9/api/dashboard-integrity.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const html = fs.readFileSync(DASHBOARD, "utf8");

// A single-pass JavaScript lexer that blanks out comments and string/template
// literals while PRESERVING length, so brace counting is meaningful.
//
// Chained regex replaces are NOT usable here: an apostrophe inside a
// double-quoted string (learner-facing copy such as "doesn't") ends the
// double-quoted region early, and the next quote swallows unrelated source —
// which silently made a function look missing. A real lexer cannot desync.
function stripLiterals(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      blank(i, nl < 0 ? src.length : nl);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const start = i;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (src[i] === "\n" && quote !== "`") break; // unterminated single line
        i++;
      }
      // Keep the delimiters so quote-adjacency checks still work elsewhere.
      out[start] = quote;
      for (let k = start + 1; k < i - 1 && k < out.length; k++) out[k] = " ";
      continue;
    }
    i++;
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// 1. The inline script must compile.
// ---------------------------------------------------------------------------
test("the inline dashboard script parses as JavaScript", () => {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, "expected exactly one inline <script> block");
  const src = blocks[0][1];
  assert.ok(src.trim().length > 0, "the inline script must not be empty");
  // A real parse. A missing concatenation operator or an unterminated function
  // throws here with a line number.
  assert.doesNotThrow(() => {
    new vm.Script(src, { filename: "academy-dashboard.inline.js" });
  }, "the shipped inline script must compile - a syntax error means the whole Academy is dead");
});

test("every render function body is brace-balanced", () => {
  // A cheap structural backstop that localises a dropped brace to a function
  // name, instead of reporting one opaque failure at end-of-file.
  const t = stripLiterals(html);
  const names = ["renderHomeView", "renderCourseView", "renderSkills", "renderAchievements",
    "openPageView", "browse", "browseBarHTML", "renderHome", "renderCourse", "openPage",
    "guardProgression", "restoreProgression", "progressState", "phaseStatus", "achievements"];
  for (const name of names) {
    const at = t.indexOf("function " + name + "(");
    assert.ok(at > 0, name + " must exist");
    const next = t.indexOf("\nfunction ", at + 10);
    const seg = t.slice(at, next < 0 ? at + 40000 : next);
    let open = 0, close = 0;
    for (const ch of seg) { if (ch === "{") open++; else if (ch === "}") close++; }
    assert.equal(open, close,
      name + "() must have balanced braces (found " + open + " open / " + close + " close) - " +
      "an unbalanced body means the function swallows the code after it");
  }
});

// ---------------------------------------------------------------------------
// 2. No string-literal adjacency without an operator.
// ---------------------------------------------------------------------------
test("no two string literals are juxtaposed without an operator", () => {
  // The exact shape of the regression: 'a''b' is a syntax error, and it is
  // invisible until the browser loads the page. The lexer keeps each literal's
  // delimiters and blanks only its contents, so adjacency is still visible.
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const stripped = stripLiterals(blocks[0][1]);
  const offenders = [];
  for (let i = 0; i < stripped.length - 1; i++) {
    if (stripped[i] !== "'" && stripped[i] !== '"') continue;
    if (stripped[i + 1] !== stripped[i]) continue;
    // '' is an EMPTY string literal and is legal. Only flag quote-quote where
    // the preceding meaningful char is also a quote (i.e. 'a''b').
    let p = i - 1;
    while (p >= 0 && stripped[p] === " ") p--;
    const prev = p >= 0 ? stripped[p] : "";
    if (prev === "'" || prev === '"') {
      offenders.push(stripped.slice(Math.max(0, i - 60), i + 20).replace(/\s+/g, " "));
    }
  }
  assert.deepEqual(offenders, [],
    "adjacent string literals are a syntax error; add the missing '+'. Offenders:\n" + offenders.slice(0, 3).join("\n"));
});

// ---------------------------------------------------------------------------
// 3. Stylesheet structure — the CSS-rendered-as-text bug.
// ---------------------------------------------------------------------------
test("all CSS lives inside <style> elements; none renders as page text", () => {
  const opens = (html.match(/<style/g) || []).length;
  const closes = (html.match(/<\/style>/g) || []).length;
  assert.equal(opens, closes, "every <style> must be closed (found " + opens + " open, " + closes + " close)");
  assert.ok(opens >= 5, "the dashboard must carry the base stylesheet plus its approved blocks, found " + opens);

  // Every style block must have balanced braces.
  let n = 0;
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    n++;
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
    let open = 0, close = 0;
    for (const ch of css) { if (ch === "{") open++; else if (ch === "}") close++; }
    assert.equal(open, close, "style block " + n + " must have balanced braces");
  }
  assert.equal(n, opens, "every <style> element must be counted");

  // Nothing that looks like CSS may sit in the head outside a <style>/<script>.
  const head = html.slice(0, html.indexOf("</head>"));
  const outside = head
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  assert.equal(
    /(^|[\s}])[.#a-zA-Z][^{}<>]{0,140}\{[^<>{}]*\}/.test(outside),
    false,
    "CSS source must not render as visible text at the top of the page",
  );
});

// ---------------------------------------------------------------------------
// 4. The approved dashboard surfaces the owner asked for.
// ---------------------------------------------------------------------------
test("Achievements live inside My Skills, with no new sidebar item", () => {
  // Mount point inside the skills page.
  const skills = html.slice(html.indexOf('<section id="skills"'), html.indexOf('<section id="resources"'));
  assert.ok(skills.length > 0, "the My Skills page section must exist");
  assert.match(skills, /id="achievementsList"/, "Achievements must render inside My Skills");
  assert.match(skills, /id="achievementsAnchor"/, "Achievements must have an anchor target for Home's View all");
  // Genuine milestones only, driven by progression.
  assert.match(html, /const ACHIEVEMENT_MILESTONES=\[/, "the milestone set must be defined once");
  assert.equal((html.match(/earned:function\(\)\{/g) || []).length, 18,
    "the milestone set must cover the 18 genuine Academy milestones");
  assert.equal((html.match(/icon:"[^"]+",name:"/g) || []).length, 18,
    "every milestone must carry an icon and a name");
  assert.equal((html.match(/desc:function\(\)\{/g) || []).length, 18,
    "every milestone description must be built at render time from the live totals");
  // One icon per milestone: a repeated generic trophy is what the owner called out.
  const milestoneIcons = [...html.matchAll(/icon:"([^"]+)",name:"/g)].map((m) => m[1]);
  assert.equal(new Set(milestoneIcons).size, milestoneIcons.length,
    "every achievement must have its own icon");
  const milestoneNames = [...html.matchAll(/icon:"[^"]+",name:"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(milestoneNames).size, milestoneNames.length,
    "achievement names must be unique");
  assert.match(html, /function renderAchievements\(\)/, "renderAchievements must exist");
  // No new navigation entry: Achievements is a section, not a page.
  assert.equal((html.match(/data-page="achievements"/g) || []).length, 0,
    "Achievements must NOT be a sidebar navigation item");
  assert.match(html, /\["skills","My Skills"\]/, "My Skills must remain its own nav item");
  // Rendered from real progression, and shown in both places.
  assert.match(html, /join\(""\);renderAchievements\(\)/, "renderSkills must render Achievements");
  assert.match(html, /renderSkills\(\);renderAchievements\(\)/, "Home must render Achievements too");
});

test("Home Recent Achievement is compact, latest-earned only, with a View all", () => {
  assert.match(html, /let earned=achievements\(\),last=earned\[earned\.length-1\]/,
    "Home must show only the LATEST earned achievement");
  assert.match(html, /class="recentAchvRow"/, "the Home achievement row must be the compact layout");
  assert.match(html, /data-achievements="1">View all<\/button>/,
    "Home must offer a View all action");
  // View all opens My Skills and moves to Achievements.
  assert.match(html,
    /b\.onclick=function\(\)\{\s*openPage\("skills"\);[\s\S]{0,160}achievementsAnchor/,
    "View all must open My Skills and scroll to Achievements");
  assert.match(html, /\.recentAchvRow\{display:flex/, "the compact row must be styled");
  assert.match(html, /\.achvViewAll\{flex:none/, "the View all button must be styled");
});

test("Home has no empty Coming Up block and no duplicate Certificate journey card", () => {
  const home = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="course"'));
  assert.equal(/<h2>Coming up<\/h2>/.test(home), false,
    "an empty Coming Up section must not dedicate dashboard space");
  assert.equal(/No live session scheduled yet\./.test(home), false,
    "the empty live-session card must be gone from Home");
  assert.equal(/Certificate journey/.test(home), false,
    "the Certificate journey card duplicates the Phase Journey and must be gone from Home");
  // Certificate keeps its own page and nav item.
  assert.match(html, /<section id="certificate"/, "Certificate must remain its own page");
  assert.match(html, /\["certificate","Certificate"\]/, "Certificate must remain its own nav item");
});

test("the certificate is not modelled as an achievement", () => {
  const start = html.indexOf("const ACHIEVEMENT_MILESTONES=[");
  const end = html.indexOf("function renderAchievements()");
  assert.ok(start > 0 && end > start, "the milestone block must exist");
  const block = html.slice(start, end);
  assert.equal(/certificate/i.test(block), false,
    "the certificate is granted by the final exam and has its own page; it must not be an achievement");
});

// ---------------------------------------------------------------------------
// 5. The restored historical journey, still intact and merely tightened.
// ---------------------------------------------------------------------------
test("Your Path is still the historical four-card component, tightened not redesigned", () => {
  const a = html.indexOf('getElementById("phaseJourney").innerHTML=');
  const b = html.indexOf('document.querySelectorAll("[data-journey]")', a);
  assert.ok(a > 0 && b > a, "the journey builder must exist");
  const journey = html.slice(a, b);
  assert.match(journey, /getElementById\("phaseJourney"\)\.innerHTML=curriculum\.map\(\(p,pi\)=>\{let s=phaseStatus\(pi\)/,
    "the journey must still be built straight off the four curriculum phases");
  assert.match(journey, /\+' class="'\+\(s\.key==="passed"\?"doneCard":locked\?"lockedCard":""\)/,
    "the historical doneCard/lockedCard states must be untouched");
  assert.match(journey, /<strong>'/, "the historical <strong> phase line must be untouched");
  // The rail must not have crept back.
  for (const gone of ["phaseSteps", "phaseStep", "phaseDot", "phaseCurrent"]) {
    assert.equal(html.includes(gone), false, gone + " must not reappear");
  }
  // Tightened: smaller padding than the first desktop pass, four equal cards.
  const noComments = html.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(noComments, /\.journey\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px\}/,
    "the original 4-column grid must remain the base rule");
  assert.match(noComments, /\.journey button\{padding:12px 14px 11px;border-radius:15px\}/,
    "the desktop journey card must use the tightened padding");
  assert.equal(/padding:18px 18px 16px/.test(noComments), false,
    "the first-pass 18px padding must be gone");
  assert.equal(/padding:22px 22px 20px/.test(noComments), false,
    "the first-pass 22px padding must be gone");
  assert.match(noComments, /\.journey\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/,
    "the four cards must stay equal and overflow-safe on desktop");
  // No Final Assessment / Certificate node in the journey itself.
  assert.equal(/final/i.test(journey), false, "no Final Assessment node in the journey");
  assert.equal(/certificate/i.test(journey), false, "no Certificate node in the journey");
});
