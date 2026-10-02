"use strict";

// boot-bootstrap.test.js — REGRESSION for the whole-Academy startup failure the
// owner saw in a real browser at http://localhost:8791/academy/test-portal:
//
//     "Academy could not load. Please refresh or contact support."
//
// THE EXACT FAILURE
//   boot() runs:
//       buildNav(); buildResources();
//       await loadProgress();
//       updateProgress();                 // renderHome(); renderCertificate(); ...
//       document.getElementById("app").hidden = false;
//       document.getElementById("loading").style.display = "none";
//   renderCertificate() ended with:
//       document.getElementById("homeCertificate").textContent = ...
//   #homeCertificate lived inside the Home "Certificate journey" card, which had
//   been removed as redundant. The lookup returned null, so the assignment threw
//   and boot()'s promise rejected:
//
//       TypeError: Cannot set properties of null (setting 'textContent')
//           at renderCertificate -> updateProgress -> boot
//
//   renderHome() had ALREADY run, so the dashboard content looked correct in the
//   DOM while #app stayed hidden and #loading stayed visible. The learner saw the
//   fallback instead of the Academy.
//
// WHY 692 EXISTING TESTS MISSED IT
//   api/_qc-harness.js REPLACES the `boot().catch(...)` call with its export
//   bridge:
//
//       const bootCall = /boot\(\)\.catch\(\(\)=>\{[\s\S]*?\}\);/;
//       return source.replace(bootCall, bridge);
//
//   So NO test ever executes boot(). renderCertificate() is reachable only
//   through boot() -> updateProgress(), and the suites that do exercise it call
//   renderHome()/renderCourse() directly. The entire bootstrap path was
//   untested — which is exactly why the suite stayed green while the owner's
//   browser was dead.
//
// WHAT THIS SUITE DOES
//   1. Runs the REAL, UNINSTRUMENTED inline script in the stub DOM and asserts
//      boot() completes: #app is un-hidden, #loading is hidden, and the fallback
//      text is never written. This is the owner's screenshot, made executable.
//   2. Statically asserts the precise mechanism: every element id the boot
//      renderers WRITE to must exist in the shipped markup. That is the class of
//      bug — a write to a removed element — not a generic smoke test.
//
// Run: node --test assistara-local-v9/api/boot-bootstrap.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createWindow, parseInto } = require("./_qc-dom.js");

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const html = fs.readFileSync(DASHBOARD, "utf8");

const FALLBACK = "Academy could not load. Please refresh or contact support.";
const inlineScript = () => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];

// The ids the shipped static markup actually provides.
const STATIC_IDS = new Set([...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));

// ---------------------------------------------------------------------------
// Helper: run the REAL script, uninstrumented, exactly as the browser does.
// ---------------------------------------------------------------------------
function runBoot() {
  const window = createWindow({ pathname: "/academy/test-portal" });
  const { document } = window;

  // Parse the SHIPPED body markup into the stub document, so boot() writes into
  // the real page structure. This is what makes "#app is hidden" a meaningful
  // assertion rather than an artefact of a hand-built fixture. It also means a
  // renderer targeting an element that was deleted from the markup really does
  // hit null, exactly as it does in the browser.
  const bodyHtml = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "");
  parseInto(document.body, bodyHtml);

  // boot() in preview requires the Test Portal session token, exactly as the
  // real page does after /admin sets it.
  window.sessionStorage.setItem("assistara_admin_token", "local-preview-admin-token");

  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message || e)));
  window.console = Object.assign(Object.create(console), {
    error: (...a) => errors.push(a.map(String).join(" ")),
    warn: () => {}, log: () => {}, info: () => {}, debug: () => {},
  });
  // The Test Portal preview never contacts Supabase; boot() must not need to.
  window.supabase = undefined;
  window.fetch = async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" });

  const sandbox = vm.createContext(window);
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.queueMicrotask = queueMicrotask;
  sandbox.fetch = window.fetch;
  sandbox.structuredClone = structuredClone;

  const timers = [];
  const bootSource = inlineScript();
  try {
    vm.runInContext(bootSource, sandbox, { filename: "academy-dashboard.inline.uninstrumented.js" });
  } catch (e) {
    return { document, window, threw: e, errors };
  }
  return { document, window, threw: null, errors, timers };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 250));

// ---------------------------------------------------------------------------
// 1. boot() must complete — the owner's screenshot, made executable.
// ---------------------------------------------------------------------------
test("boot() completes: the Academy becomes visible instead of the fallback", async () => {
  const run = runBoot();
  assert.equal(run.threw, null,
    "the inline script must not throw at parse/run time: " + (run.threw && run.threw.message));
  await settle();

  const app = run.document.getElementById("app");
  const loading = run.document.getElementById("loading");

  // The exact failure: boot() rejected and the catch wrote the fallback text.
  assert.notEqual(loading.textContent, FALLBACK,
    "boot() must not fall back to \"" + FALLBACK + "\" — the learner's Academy failed to start");
  assert.deepEqual(run.errors, [],
    "boot() must complete without console errors; got:\n  " + run.errors.slice(0, 3).join("\n  "));

  // The consequence of the owner's screenshot: #app hidden, #loading visible.
  // boot() sets the `hidden` PROPERTY. In a real browser that reflects to the
  // content attribute; in the stub DOM it is a plain own property, so assert the
  // property the code actually sets.
  assert.equal(app.hidden, false,
    "#app must be un-hidden after boot(); if it is still hidden the learner sees only the fallback");
  assert.equal(loading.style.display, "none",
    "#loading must be hidden after boot()");

  // And the dashboard really rendered.
  assert.equal(run.document.querySelectorAll("#phaseJourney button").length, 4,
    "the Phase Journey must render exactly four cards during boot");
  assert.ok(run.document.getElementById("desktopNav").children.length > 0,
    "the sidebar navigation must be built during boot");
  assert.ok(run.document.getElementById("resourcesList").innerHTML.length > 0,
    "Resources must be built during boot");
  assert.ok(run.document.getElementById("achievementsList").innerHTML.length > 0,
    "the Achievements area must render during boot");
});

// ---------------------------------------------------------------------------
// 2. The precise mechanism: no renderer writes to a removed element.
// ---------------------------------------------------------------------------
test("every element the boot renderers write to exists in the shipped markup", () => {
  // The bug class is "a renderer keeps writing to markup that was removed", so
  // guard it structurally rather than relying on one boot() run to notice.
  const WRITERS = ["renderCertificate", "updateProgress", "renderHome", "renderSkills",
    "renderAchievements", "renderCourse", "renderHomeView", "renderCourseView", "boot"];
  const src = html;
  const fnBody = (name) => {
    const at = src.indexOf("function " + name + "(");
    assert.ok(at > 0, name + " must exist");
    const next = src.indexOf("\nfunction ", at + 10);
    return src.slice(at, next < 0 ? at + 30000 : next);
  };

  const missing = [];
  for (const name of WRITERS) {
    const body = fnBody(name);
    // getElementById("x") followed by a WRITE (.textContent=, .innerHTML=,
    // .className=, .style., .value=, .hidden=, appendChild)
    const re = /getElementById\("([A-Za-z0-9_-]+)"\)\s*(?:\.\s*(textContent|innerHTML|className|value|hidden)\s*=|\.style\.|\.appendChild\(|\.classList\.)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const id = m[1];
      if (!STATIC_IDS.has(id)) missing.push(name + " -> #" + id + "  (" + m[2].trim() + ")");
    }
  }
  assert.deepEqual(missing, [],
    "these boot renderers write to ids that do not exist in the markup. A null lookup here is " +
    "exactly what produced the owner's bootstrap failure:\n  " + missing.join("\n  "));
});

test("the removed Home Certificate-journey card is not written to", () => {
  // Named explicitly so the regression is unmistakable if it ever returns.
  assert.equal(html.includes("homeCertificate"), false,
    "#homeCertificate was removed with the redundant Home Certificate-journey card; " +
    "no code may reference it again");
  assert.equal(html.includes("Certificate journey"), false,
    "the redundant Certificate-journey card must stay off Home");
  // The Certificate page keeps its own real status copy.
  for (const id of ["certificateStatus", "finalExamTitle", "finalExamText", "certificateRequirements", "certExams"]) {
    assert.ok(STATIC_IDS.has(id), "the Certificate page must keep #" + id);
    assert.ok(html.includes('getElementById("' + id + '")'),
      "the Certificate page must still be driven by #" + id);
  }
});

test("boot() must not be removed from the instrumented harness path", () => {
  // The reason 692 tests were green while the browser was broken: the harness
  // deletes the boot() call. If a future harness stops doing that, the blind
  // spot closes — so assert the splice still exists AND that boot() is called
  // exactly once in the shipped source.
  const harness = fs.readFileSync(path.join(__dirname, "_qc-harness.js"), "utf8");
  assert.match(harness, /boot\\\(\\\)\\\.catch/,
    "the harness must still be aware of the boot() call it splices out");
  const calls = (inlineScript().match(/boot\(\)\.catch\(/g) || []).length;
  assert.equal(calls, 1,
    "the shipped script must invoke boot() exactly once (found " + calls + ")");
  // This suite is the counterpart that DOES execute it.
  assert.ok(FALLBACK.length > 0 && html.includes(FALLBACK),
    "the fallback string must still exist in the page so this test can detect it");
});
