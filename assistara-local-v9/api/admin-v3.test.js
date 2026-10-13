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

test("the canonical Dashboard URL survives a direct load and refresh", () => {
  assert.ok(vercel.routes.some((entry) => entry.src === "/admin/overview" && entry.dest === "/admin.html"));
  assert.ok(vercel.routes.some((entry) => entry.src === "/admin/overview/" && entry.dest === "/admin.html"));
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

test("every dashboard counter reads the canonical lifecycle helper", () => {
  // A panel that derives its own stage from ad-hoc fields silently disagrees
  // with the enrollment tiles and the funnel (this shipped once: "Enrolled 0"
  // while the tiles and funnel both said 2). All counts must go through
  // appStage(), and the lead->application denominator must be the same
  // `knownLeads` figure the funnel's first step counts.
  const paint = admin.slice(admin.indexOf("function paintOverview(data)"), admin.indexOf("function paintOverviewState"));
  const progress = paint.slice(paint.indexOf("const progApps"), paint.indexOf('id="ovActionProgress"'));
  assert.match(progress, /const stageOf = \(x\) =>/);
  assert.match(progress, /return appStage\(x\)/);
  assert.match(progress, /stageOf\(x\) === "onboarding"/);
  assert.match(progress, /stageOf\(x\) === "enrolled"/);
  // The old, drift-prone derivations must be gone from the filters. The
  // `stageOf` fallback may still read raw fields, but no filter may.
  assert.doesNotMatch(progress, /x\.enrollment/);
  assert.doesNotMatch(progress, /progApps\.filter\(\(x\) => \{ const s = String/);
  assert.doesNotMatch(progress, /payment_status\)\.toLowerCase\(\) === "paid"/);

  const acq = paint.slice(paint.indexOf('const acqEl = $("ovAcq")'), paint.indexOf('paintEnrollment(data.capacity'));
  assert.match(acq, /const leads = knownLeads/);
  assert.match(acq, /known leads/);
  // The B2B-only figure must no longer be presented as the lead denominator.
  assert.doesNotMatch(acq, /const leads = Array\.isArray/);
});

test("the acquisition pipeline is one component with no dead cells", () => {
  const page = read("admin-acquisition.html");

  // The loose stat/metric squares are gone: one funnel plus one per-link bar.
  assert.doesNotMatch(page, /<div class="stat"><b>/);
  assert.doesNotMatch(page, /<div class="metric"><b>/);
  assert.match(page, /class="acqFunnel"/);
  assert.match(page, /class="acqPipe"/);
  assert.match(page, /acqPipeLegend/);

  // A B2B link only ever has two real figures. The old code padded it out with
  // four permanent "-" cells, which is exactly the empty space we removed.
  assert.doesNotMatch(page, /\["-",\s*"(Applied|Accepted|Paid|Revenue)"\]/);
  assert.match(
    page,
    /\[\["Visitors",Number\(x\.visits\|\|0\)\],\["B2B leads",Number\(x\.b2b_leads\|\|0\)\]\]/
  );

  // Both components must span the full card. Without this they fall into the
  // first of the legacy six-column grids and leave five dead columns beside them.
  assert.match(page, /\.acqFunnel\{grid-column:1\/-1/);
  assert.match(page, /\.acqPipe\{grid-column:1\/-1/);
  assert.match(page, /\.row\{grid-template-columns:minmax\(0,1fr\) auto/);

  // Every count the page has must still be reachable in the new layout.
  for (const stage of [
    "Visits",
    "Masterclass",
    "Applications",
    "Accepted",
    "Paid",
  ]) {
    assert.ok(page.includes(`"${stage}"`), `missing funnel stage ${stage}`);
  }
  assert.match(page, /\["Applied",Number\(x\.applications\|\|0\)\]/);
  assert.match(page, /\["Accepted",Number\(x\.accepted\|\|0\)\]/);
  assert.match(page, /\["Paid",Number\(x\.paid\|\|0\)\]/);
  assert.match(page, /Revenue <b>\$/);

  // Money must never be presented as a share of the visit count.
  assert.match(page, /acqMoney/);
  assert.match(page, /acqMoneyLabel/);
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
