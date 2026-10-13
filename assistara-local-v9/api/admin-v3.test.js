const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const admin = read("admin.html");
const v3 = read("admin-v3.css");
const vercel = JSON.parse(read("vercel.json"));

test("every admin surface loads the shared V3 visual system", () => {
  for (const file of [
    "admin.html",
    "admin-finance.html",
    "admin-email.html",
    "admin-acquisition.html",
    "admin-masterclass-event.html",
    "admin-template-studio.html",
  ]) {
    assert.match(read(file), /\/admin-v3\.css/, `${file} must load Admin V3`);
  }
  assert.match(admin, /fetch\("\/admin-v3\.css"/);
  assert.match(admin, /shared\.textContent = await loadSharedV3\(\)/);
});

test("Vercel builds and routes the shared V3 stylesheet as a static asset", () => {
  assert.ok(vercel.builds.some((entry) => entry.src === "admin-v3.css" && entry.use === "@vercel/static"));
  assert.ok(vercel.routes.some((entry) => entry.src === "/admin-v3.css" && entry.dest === "/admin-v3.css"));
});

test("search is inside the content toolbar beside section filters", () => {
  const toolbar = admin.slice(admin.indexOf('<div class="content-toolbar"'), admin.indexOf('<div id="signupGoal"'));
  assert.match(toolbar, /id="searchWrap"/);
  assert.match(toolbar, /id="studentFilters"/);
  assert.match(toolbar, /id="couponFilters"/);
  assert.match(toolbar, /id="appFilters"/);
  const top = admin.slice(admin.indexOf('<div class="workspace-top"'), admin.indexOf('<header class="page-header"'));
  assert.doesNotMatch(top, /id="searchWrap"/);
});

test("dashboard sections are populated from real loaded records", () => {
  const paint = admin.slice(admin.indexOf("function paintOverview(data)"), admin.indexOf("function paintOverviewState"));
  for (const id of ["ovEnrollFlow", "ovPipeline", "ovRevenue", "ovStudents", "ovActivity", "ovEmail"]) {
    assert.match(paint, new RegExp('\\$\\("' + id + '"\\)\\.innerHTML'), `${id} must be painted`);
  }
  assert.match(paint, /const knownLeads = visibleSignups\.length \+ b2b\.length/);
  assert.match(paint, /currentDecision\(x\) === "accepted"/);
  assert.match(paint, /data\.capacity\.paid/);
  assert.match(paint, /ovKnownRevenue/);
  assert.match(paint, /computeStudentProgress/);
  assert.doesNotMatch(paint, /Math\.random|fake|mock/i);
});

test("delivery attention states remain accurate and actionable", () => {
  const paint = admin.slice(admin.indexOf("const naItems = []"), admin.indexOf("if (naBox && naList)"));
  assert.match(paint, /inviteFailed.*appAcceptanceEmail\(x\)\.failed/);
  assert.match(paint, /openTool\(\\'email\\'\)/);
  assert.match(paint, /inviteUnconfirmed.*appAcceptanceEmail\(x\)\.unresolved/);
  assert.doesNotMatch(paint, /!appAcceptanceEmail\(x\)\.delivered/);
});

test("V3 is responsive, Manrope-only and reserves red for semantic states", () => {
  assert.match(v3, /@media \(max-width: 720px\)/);
  assert.match(v3, /@media \(max-width: 430px\)/);
  assert.match(v3, /font-family: "Manrope", sans-serif/);
  assert.doesNotMatch(v3, /DM Sans|\bInter\b|Arial|Helvetica|system-ui/i);
  assert.match(v3, /\.btn-success[\s\S]*background: var\(--admin-green\)/);
  assert.match(v3, /\.overview-grid/);
  assert.match(v3, /\.content-toolbar/);
});
