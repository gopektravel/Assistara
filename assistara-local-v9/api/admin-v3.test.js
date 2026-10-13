const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const admin = read("admin.html");
const v3 = read("admin-v3.css");
const vercel = JSON.parse(read("vercel.json"));
const components = read("admin-components.css");
const charts = read("admin-charts.css");
const tokens = read("admin-tokens.css");
const layout = read("admin-layout.css");
const currency = read("admin-currency.css");

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

test("Overview charts replace label/number rows with real visualisations", () => {
  // Chart helpers must exist and be used by the painters.
  for (const fn of ["ovFunnel", "ovColumns", "ovDistribution", "ovWeekly"]) {
    assert.ok(admin.includes("function " + fn), "missing chart helper " + fn);
  }
  assert.match(admin, /\$\("ovPipeline"\)\.innerHTML = ovFunnel\(/);
  assert.match(admin, /\$\("ovTrend"\)\.innerHTML =/);
  assert.match(admin, /ovDistribution\(progressBuckets/);
  assert.match(admin, /Applications &amp; payments/);

  // The label/number row pairs are gone.
  assert.doesNotMatch(admin, /<div class="overviewRow"><span>Average course progress/);
  assert.doesNotMatch(admin, /<div class="overviewRow"><span>Started \/ completed/);

  // Every chart has styling, so a new panel is never unstyled markup.
  for (const cls of [
    ".ovFunnelBar",
    ".ovFunnelLegend",
    ".ovColumnChart",
    ".ovCol",
    ".ovMoneyPair",
    ".ovStatStrip",
    ".statShare",
  ]) {
    assert.ok(charts.includes(cls), "chart CSS missing " + cls);
  }

  // Money inside a chart must render in the display currency, never raw PHP.
  assert.match(admin, /\{ format: ovMoney \}/);
  assert.match(admin, /typeof opts\.format === "function" \? opts\.format : ovNum/);
});

test("the dashboard uses only brand colours: no off-brand blue", () => {
  // The Google-blue info tokens were the source of the blue text. The
  // categorical chart palette stays multi-hue on purpose, so only the
  // status/info tokens are constrained here.
  assert.match(tokens, /--info-dark: #4a4741;/);
  assert.doesNotMatch(tokens, /--info-dark: #08/);
  assert.doesNotMatch(tokens, /--info-light: #e8f4fd/);
  // Applicant stages must not reach for a blue information tone.
  assert.doesNotMatch(components, /\.stage-new \{[^}]*--info-dark/);
  assert.doesNotMatch(components, /\.stage-onboarding \{[^}]*--info-dark/);
  assert.doesNotMatch(components, /\.action-applicant \.actionLabel \{ color: var\(--info-dark\)/);

  for (const file of ["admin.html", "admin-components.css", "admin-currency.css"]) {
    const body = read(file);
    assert.doesNotMatch(body, /#0a58b0/, file + " still has a blue capacity value");
    assert.doesNotMatch(body, /#1a73e8/, file + " still has a blue badge");
    assert.doesNotMatch(body, /#d7eaff/, file + " still has a blue waitlist badge");
    assert.doesNotMatch(body, /#5d3a9b/, file + " still has a purple badge");
    assert.doesNotMatch(body, /#a8c7fa/, file + " still has a blue border");
  }

  // Scheduled coupons are upcoming, not a problem: amber.
  assert.match(admin, /\.badge\.scheduled \{\s*background: var\(--warning-light\)/);

  // An anchor inside Admin content must never fall back to the UA link blue.
  assert.match(components, /\.enrollmentFootnote a \{/);
  assert.match(components, /\.workspace a:not\(\[class\]\)/);
});

test("a stat value can never widen its card and overlap a neighbour", () => {
  // "Unavailable" is longer than a 4-up grid track and used to spill outside
  // its card, overlapping whatever sat next to it.
  assert.match(admin, /const ovValueIsText = \(v\) =>/);
  assert.match(admin, /<div class="stat-value' \+/);
  assert.match(components, /\.stat-value\.is-text \{/);
  assert.match(components, /\.stat-value \{\s*overflow-wrap: anywhere/);
});

test("auto-fit grid tracks can shrink instead of overflowing a narrow panel", () => {
  // minmax(140px, 1fr) cannot collapse below 140px, so it overflowed a 6-column
  // overview span on a tablet. The minimum must be capped by the container.
  for (const file of ["admin-charts.css", "admin-v3.css", "admin-components.css", "admin-layout.css"]) {
    assert.doesNotMatch(
      read(file),
      /repeat\(auto-fit,\s*minmax\(\d+px,\s*1fr\)\)/,
      file + " has an uncapped auto-fit track",
    );
  }
  assert.match(v3, /repeat\(auto-fit, minmax\(min\(140px, 100%\), 1fr\)\)/);
});

test("a text-truncating label is a block so the ellipsis actually applies", () => {
  // text-overflow has no effect on an inline element, so the label overflowed.
  assert.match(charts, /\.ovStatStrip span \{\s*display: block;/);
});

test("the sidebar currency control is centred and labelled", () => {
  assert.match(admin, /class="currencySelect"/);
  assert.match(admin, /currencySelectLabel/);
  // No inline alignment override left over from the old left-hugging control.
  assert.doesNotMatch(admin, /id="sidebarCurrencySwitch"[^>]*style="[^"]*justify-content/);
  assert.match(currency, /\.currencySelect \{[^}]*align-items: center/);
  assert.match(currency, /\.currencySelect \.currencySwitch \{[^}]*width: 100%/);
});

test("collapsed coupon cards carry redemption facts and fill the row", () => {
  // The collapsed card used to be identity plus five buttons, leaving a wide
  // empty gap and hiding the redemption data behind an Expand button.
  for (const part of ["cpCode", "cpCampaign", "cpFacts", "cpMeta", "cpBarTrack"]) {
    assert.ok(admin.includes(part), "coupon card missing " + part);
  }
  assert.match(admin, /<em>Confirmed <b>\$\{confirmed\}<\/b><\/em>/);
  assert.match(admin, /<em>Revenue <b>\$\{MONEY_PHP\(c\.revenue_php \|\| 0\)\}<\/b><\/em>/);
  // Three columns so the facts absorb the slack instead of leaving a gap.
  assert.match(
    admin,
    /\.couponCard \.cpRow \{\s*display: grid;\s*grid-template-columns: minmax\(0, auto\) minmax\(0, 1fr\) minmax\(0, auto\)/,
  );
});

test("the Overview email panel survives a partial email payload", () => {
  // An email response carrying an overview but no totals used to throw and
  // take the whole dashboard down, because each field was guarded only against
  // the overview being null and not against its own property being missing.
  assert.match(admin, /const totals = \(ov && ov\.totals\) \|\| \{\};/);
  assert.match(admin, /const measured = \(ov && ov\.measured\) \|\| \{\};/);
  assert.match(admin, /const rates = \(ov && ov\.rates\) \|\| \{\};/);
  assert.match(admin, /const av = \(ov && ov\.availability\) \|\| \{\};/);
  // delivered30d reads the payload directly rather than a later binding.
  assert.match(admin, /data\.email\.overview\.measured &&\s*data\.email\.overview\.measured\.delivered != null/);
});

test("a sparse or partial expenses payload cannot take the Overview down", () => {
  // A null/undefined entry in the expense list threw
  // "Cannot read properties of null (reading 'amount')" and replaced the whole
  // dashboard with "Overview could not be rendered".
  assert.match(
    admin,
    /for \(const e of expenses\) \{\s*\/\/ A sparse or partially-null expense list must degrade to zero,[\s\S]*?if \(!e \|\| typeof e !== "object"\) continue;/,
  );
  // And a non-array finance payload must not be walked at all.
  assert.match(admin, /Array\.isArray\(fin\.value && fin\.value\.expenses\)/);
});

test("every admin surface is checked for off-brand colour, not just the shell", () => {
  // The tool pages load admin-tokens.css and admin-v3.css through the shell, so
  // a token change reaches them. None of them may rely on the old blue info
  // tone for meaning.
  for (const file of [
    "admin-acquisition.html",
    "admin-email.html",
    "admin-finance.html",
    "admin-masterclass-event.html",
    "admin-template-studio.html",
  ]) {
    const body = read(file);
    assert.doesNotMatch(body, /var\(--info-dark\)/, file + " relies on the info token");
    // These are the shell-only classes whose behaviour changed; a tool page
    // using one would silently pick up the new styling.
    for (const cls of ["stage-onboarding", "enrollmentFootnote", "ovStats"]) {
      assert.ok(!body.includes(cls), file + " uses shell-only class " + cls);
    }
  }
});

test("shared CSS cannot overflow a narrow panel after the shrinkable-track fix", () => {
  // Every auto-fit grid in the shared sheets must cap its minimum by the
  // container, otherwise it overflows instead of collapsing to fewer columns.
  for (const file of [
    "admin-charts.css",
    "admin-v3.css",
    "admin-components.css",
    "admin-layout.css",
  ]) {
    const body = read(file);
    assert.doesNotMatch(
      body,
      /repeat\(auto-fit,\s*minmax\(\d+px,\s*1fr\)\)/,
      file + " still has an uncapped auto-fit track",
    );
  }
});
