const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const admin = read("assistara-local-v9/admin.html");
const components = read("assistara-local-v9/admin-components.css");
const tokens = read("assistara-local-v9/admin-tokens.css");

test("applicants are a full-width, single-column list — one applicant per row", () => {
  // The three-column applicant card grid is gone.
  assert.doesNotMatch(admin, /class="card applicationCard/);
  // One record per row: a single vertical stack of rows, not a CSS card grid.
  const markup = admin.slice(admin.indexOf('<div id="appFilters"'), admin.indexOf("</main>"));
  assert.match(markup, /<div id="cards"><\/div>/);
  // Each row renders the collapsed summary inside one row element.
  assert.match(admin, /function appCard\(x\) \{[\s\S]*?'<div class="applicantRow'/);
  assert.match(admin, /class="applicantRowMain"/);
  // Rows never leave the grid layout that made them three-across.
  assert.doesNotMatch(admin, /#cards\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
});

test("every collapsed applicant row shows identity, date, stage and next action", () => {
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));
  assert.match(card, /applicantName/);
  assert.match(card, /applicantSub/);
  // Application date comes from the real created_at.
  assert.match(card, /submitted\s*=\s*x\.created_at \? "Applied " \+ esc\(formatDate\(x\.created_at\)\) : ""/);
  assert.match(card, /applicantStage/);
  assert.match(card, /applicantNextAction/);
  // One chevron that expands the record, and nothing else that looks like one.
  const chevrons = (card.match(/expandArrow/g) || []).length;
  assert.equal(chevrons, 1, "exactly one expand chevron per row");
});

test("an applicant row only reserves the space it actually uses", () => {
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));

  // A record whose state matches none of the branches used to fall through to
  // an em-dash stage with no stage class, rendering an unstyled bare badge.
  assert.match(card, /if \(!stageClass\) \{/);
  assert.match(card, /const canonical = appStage\(x\);/);
  assert.match(card, /stage = LABELS\[canonical\] \|\| "Unclassified";/);

  // The next-action column carries min-width: 200px, so it must not be
  // emitted for a row with no action to name (an enrolled learner).
  assert.match(card, /const showNextAction = actionClass !== "action-none" && !!nextAction/);
  assert.match(card, /showNextAction\s*\? '<div class="applicantNextAction/);
});

test("expanding an applicant row keeps every existing record section and action", () => {
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));
  for (const section of [
    "ACQUISITION SOURCE",
    "APPLICATION ANSWERS",
    "INTERNAL NOTES",
    "PAYMENT & ENROLLMENT",
    "ACADEMY ACCOUNT",
    "ACTIVITY",
  ]) {
    assert.ok(card.includes(section), `expanded row must keep ${section}`);
  }
  // The full action set is unchanged and still rendered from the same guards.
  // The strip is now conditional: it carries a border-top, margin and padding,
  // so an empty one drew a bare rule under rows that have no buttons.
  assert.match(card, /const actionButtons = applicationActions\(x\);/);
  assert.match(card, /actionButtons \? '<div class="applicantActions">' \+ actionButtons \+ '<\/div>' : ''/);
  for (const action of [
    "decision('",
    "approvePay('",
    "rejectPay('",
    "noResponsePay('",
    "onboard('",
    "deleteApplication('",
  ]) {
    assert.ok(admin.includes(action), `the ${action} action must survive`);
  }
  // Answers and reviewer notes hydrate from the same per-card endpoints.
  assert.match(card, /id="answers-' \+ esc\(key\)/);
  assert.match(card, /id="notes-' \+ esc\(key\)/);
});

test("the applicant lifecycle is a UI label derived from persisted fields only", () => {
  const helpers = admin.slice(admin.indexOf("function appStage(x)"), admin.indexOf("const APP_FILTERS"));
  // Derived from persisted fields only — decision comes from the canonical reader.
  for (const field of ["currentDecision(x)", "x.status", "x.payment_status", "x.onboarding_completed_at", "x.auth_user_id", "x.suspended_at"]) {
    assert.ok(helpers.includes(field), `stage must read ${field}`);
  }
  assert.doesNotMatch(helpers, /\.update\(/, "the lifecycle must never write to the database");
  assert.doesNotMatch(helpers, /\b(insert|patch)\s*\(/, "no persistence inside the UI lifecycle");
  // Never infer payment from an acceptance email.
  assert.doesNotMatch(helpers, /email_sent/, "payment state must never come from an email log");
  assert.doesNotMatch(helpers, /decision_email_sent/, "the lifecycle must never read the email log");

  // Stage → next action pairs are explicit for the whole lifecycle.
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));
  for (const cls of [
    "stage-new",
    "stage-awaiting-payment",
    "stage-payment-pending",
    "stage-onboarding",
    "stage-enrolled",
    "stage-declined",
    "stage-suspended",
  ]) {
    assert.ok(card.includes(cls), `missing stage ${cls}`);
  }
  assert.ok(card.includes("Admin: Verify GCash payment"), "a pending GCash payment is an admin action");
  assert.ok(card.includes("Applicant: Complete onboarding"), "a learner without onboarding is an applicant action");

  // An applicant owing a payment is not an administrator action, so the row
  // names no next action at all; the stage badge carries that information.
  assert.doesNotMatch(card, /Applicant: Complete payment/);
  assert.match(card, /nextAction = isGcashPending \? "Admin: Verify GCash payment" : "";/);
  assert.match(card, /actionClass = isGcashPending \? "action-admin" : "action-none";/);
  // The email overrides in the accepted-unpaid branch stay admin actions.
  assert.match(card, /if \(emailInfo\.failed\) \{ nextAction = "Admin: Resend acceptance email"; actionClass = "action-admin"; \}/);
  assert.match(card, /else if \(emailInfo\.unresolved\) \{ nextAction = "Admin: Confirm invitation delivery"; actionClass = "action-admin"; \}/);
  // An empty next action must not reserve the 200px column.
  assert.match(card, /const showNextAction = actionClass !== "action-none" && !!nextAction/);
});

test("applicants filter and sort use the real records and default to admin action first", () => {
  const branch = admin.slice(admin.indexOf('if (tab === "applicants") {'), admin.indexOf('if (tab === "students") {'));
  // Filters with counts derived from the loaded records.
  assert.match(branch, /const counts = \{\};[\s\S]*?counts\[key\] = allApps\.filter/);
  assert.ok(branch.includes("counts[key] + ')</option>'"), "each filter option shows its real record count");
  assert.match(branch, /appMatchesFilter\(x, filterKey\)/);
  // Every required filter exists and comes from the ONE canonical helper.
  for (const key of ["all", "needs_action", "new", "awaiting_payment", "paid", "enrolled", "closed"]) {
    assert.ok(admin.includes(`["${key}",`), `filter ${key} must exist`);
  }
  // Default + explicit sorts, including stage and application age.
  assert.match(admin, /applicantSortKey = "action";/);
  for (const sort of ["action", "newest", "oldest", "stage"]) {
    assert.ok(branch.includes(`value="${sort}"`), `sort ${sort} must exist`);
  }
  // The default (no explicit sort chosen) is still admin-action first.
  assert.match(branch, /else sorted\.sort\(\(m, n\) => appPriority\(m\) - appPriority\(n\)[\s\S]*?\);[\r]?\n/);
  assert.match(branch, /appPriority\(m\) - appPriority\(n\)/);
  assert.match(branch, /Date\.parse\(m\.created_at \|\| ""\) - Date\.parse\(n\.created_at \|\| ""\)/);
  assert.match(branch, /Date\.parse\(n\.created_at \|\| ""\) - Date\.parse\(m\.created_at \|\| ""\)/, "newest sort exists");

  // A filter/sort change re-renders and persists, matching every other tab.
  assert.match(branch, /\$\("applicantFilter"\)\.onchange = \(e\) => \{ applicantFilterKey = e\.target\.value; render\(\); saveUiState\(\); \};/);
  assert.match(branch, /\$\("applicantSort"\)\.onchange = \(e\) => \{ applicantSortKey = e\.target\.value; render\(\); saveUiState\(\); \};/);
  assert.match(admin, /applicantFilter: applicantFilterKey,/);
  assert.match(admin, /applicantSort: applicantSortKey,/);
});

test("the applicants filter bar is tab-scoped and hidden everywhere else", () => {
  // Registered in the one central reset, so it can never leak into another tab.
  const reset = admin.slice(admin.indexOf("function resetTabScaffold()"), admin.indexOf("async function render()"));
  assert.match(reset, /const af = \$\("appFilters"\);\s*\n\s*if \(af\) af\.hidden = true;/);
  assert.doesNotMatch(reset, /appFilters\)\.style\.display = "none";/, "filter bar uses the hidden attribute");
  assert.match(admin, /<div id="appFilters" class="filterBar" hidden><\/div>/);
});

test("Overview is a Command Center: every metric card navigates through the router", () => {
  const paint = admin.slice(admin.indexOf("function paintOverview(data)"), admin.indexOf("async function renderOverview("));
  // Clickable whole-surface KPI cards, one per required destination.
  assert.match(paint, /const kpiCards = \[/);
  assert.match(paint, /'<a class="stat-card card-interactive" href="#" data-action="' \+ c\.a \+ '"'/);
  assert.match(paint, /overviewRoute\(\\'' \+ c\.a \+ '\\',\\'' \+ \(c\.f \|\| ""\) \+ '\\'\)/);
  assert.match(paint, /a: "applicants"/);
  assert.match(paint, /a: "finance"/);
  // Navigation goes through the existing shell: no hard reloads, no new router.
  assert.doesNotMatch(paint, /location\.reload/);
  assert.doesNotMatch(paint, /location\.href/);
  // Tools still open through the one mounted-tool router.
  assert.match(admin, /function overviewRoute\(action, filter\)/);
  assert.match(admin, /return openTool\(action\)/);
});

test("Overview keeps only actionable content: no visit tracking, no duplicate Finance entry", () => {
  // Visit tracking belongs to the Acquisition Tracker only.
  assert.match(admin, /\/\/ Visit tracking lives in the Acquisition Tracker; not shown here\./);
  assert.doesNotMatch(admin, /id="ovFunnel"><\/div>/, "no empty funnel card");
  assert.doesNotMatch(admin, /Open Finance/, "no redundant Finance button");
  assert.match(admin, /\/\/ Finance is reached from the KPI cards above; no separate summary block\./);
  // The tracker itself still owns visit recording.
  assert.match(admin, /acquisition: \{ path: "\/admin\/acquisition", src: "\/admin-acquisition\.html" \}/);
});

test("the redesigned Admin stays Manrope-only and keeps the token shell", () => {
  // The single official Assistara font declaration (Manrope and nothing else).
  const flatTokens = tokens.replace(/\r/g, "");
  assert.match(flatTokens, /Typography — Assistara's single official web font/);
  assert.match(flatTokens, /--font-family: "Manrope", sans-serif;/);
  // Every font declaration resolves to Manrope, in both Admin stylesheets.
  for (const sheet of [flatTokens, components.replace(/\r/g, "")]) {
    const declared = [...sheet.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim());
    assert.ok(declared.length > 0, "expected font-family declarations");
    for (const font of declared) {
      assert.ok(
        /^"Manrope"(, sans-serif)?$|^var\(--font-family\)$|^Manrope/.test(font),
        `non-Manrope font declaration introduced: ${font}`,
      );
    }
    assert.doesNotMatch(sheet, /DM Sans|\bInter\b|Arial|Helvetica|system-ui/i);
  }
  // Only ONE font family is imported by the Admin shell.
  const lock = read("assistara-local-v9/manrope-lock.css");
  assert.match(admin, /\/manrope-lock\.css/, "the shell loads the Manrope lock stylesheet");
  const fontLinks = [...lock.matchAll(/fonts\.googleapis\.com[^"']*/g)].map((m) => m[0]);
  assert.equal(fontLinks.length, 1, "the Admin shell must import exactly one font");
  assert.match(fontLinks[0], /family=Manrope/);
  assert.doesNotMatch(fontLinks[0], /DM Sans|\bInter\b/i);
  // The shell's verified display fix and single guarded boot are untouched.
  assert.match(admin, /\$\("dash"\)\.style\.display = "block";/);
  assert.doesNotMatch(admin, /\$\("dash"\)\.style\.display = "";/);
  assert.equal((admin.match(/restoreSession\(\)\.catch/g) || []).length, 1, "session restore must boot exactly once");
  // No timer-based boot fallback: no setTimeout arrow callback invokes enterApp.
  assert.doesNotMatch(admin, /setTimeout\(\s*\(\)\s*=>\s*enterApp/);
});

test("the Academy Enrollment section shows the real, mutually exclusive pipeline stages", () => {
  const paint = admin.slice(admin.indexOf("function enrollmentTile("), admin.indexOf("function paintCapacityBits()"));
  // All eight primary metrics, in the order the Admin reads them.
  for (const label of [
    "Total Applications",
    "New / Unreviewed",
    "Invited / Accepted",
    "Needs Admin Action",
    "Awaiting Payment",
    "Paid / Confirmed",
    "Enrolled",
  ]) {
    assert.ok(paint.includes('"' + label + '"'), `missing metric tile ${label}`);
  }
  // Every tile navigates through the router to Applications + filter.
  // The tiles are built by enrollmentTile(), which emits goApplicants('<filter>').
  assert.match(paint, /function enrollmentTile\(value, label, sub, filterKey\)/);
  assert.match(paint, /goApplicants\(\\'' \+ filterKey \+ '\\'\)/);
  for (const filter of ["all", "new", "awaiting_payment", "needs_action", "paid", "enrolled"]) {
    assert.ok(paint.includes('enrollmentTile(') && paint.includes('"' + filter + '"') || paint.includes("'" + filter + "'"), `tile must navigate with filter ${filter}`);
  }
  // Counts come from the SAME derivation as the filters and the list.
  assert.match(paint, /allApps\.filter\(\(x\) => appStage\(x\) === "new"\)\.length/);
  assert.match(paint, /allApps\.filter\(\(x\) => appStage\(x\) === "onboarding"\)\.length/);
  assert.match(paint, /allApps\.filter\(\(x\) => appStage\(x\) === "enrolled"\)\.length/);
  assert.match(paint, /allApps\.filter\(\(x\) => \["awaiting_payment", "payment_pending"\]\.includes\(appStage\(x\)\)\)\.length/);
  assert.match(paint, /allApps\.filter\(appNeedsAdmin\)\.length/);
  // Awaiting payment means invited AND unconfirmed — never a generic not_requested.
  assert.ok(paint.includes('["awaiting_payment", "payment_pending"].includes(appStage(x))'), "awaiting payment uses the canonical stage");
  // Available seats come from the capacity API, never invented.
  assert.match(paint, /cap \? ovNum\(cap\.available\) : loading \? ovSkeleton\(\) : "Unavailable"/);
  assert.match(paint, /id="enrollmentSeats"/);
  assert.ok(paint.includes("<span>Available Seats</span>"), "Available Seats tile label");
});

test("invitation metrics distinguish an accepted decision from a delivered email", () => {
  const helper = admin.slice(admin.indexOf("function appAcceptanceEmail(x)"), admin.indexOf("function appNeedsAdmin(x)"));
  // Issued = accepted decision; delivered = a provider-confirmed delivery.
  assert.match(helper, /issued: currentDecision\(x\) === "accepted"/);
  assert.match(helper, /delivered: state === "delivered",/);
  assert.match(helper, /acceptance_email/);
  // A missing signal is NEVER a failure: it is unresolved.
  assert.match(helper, /state === "unresolved" \|\| state === "not_issued"/);
  // The activity/email log is never read here, and payment state is never inferred.
  assert.doesNotMatch(helper, /email_sent/);
  assert.doesNotMatch(helper, /decision_email_sent/);
  assert.doesNotMatch(helper, /payment_status/);

  // Enrollment indicators count real delivery state; a delivered invitation can
  // never be counted as an issue.
  const paint = admin.slice(admin.indexOf("function paintEnrollment("), admin.indexOf("function paintCapacityBits()"));
  assert.match(paint, /const accepted = allApps\.filter\(\(x\) => appAcceptanceEmail\(x\)\.issued\)/);
  assert.match(paint, /const delivered = accepted\.filter\(\(x\) => appAcceptanceEmail\(x\)\.delivered\)/);
  assert.match(paint, /\[emailFailed, "invitation delivery failure", "needs_action"\]/);
  assert.match(paint, /\[emailUnconfirmed, "unconfirmed invitation", "needs_action"\]/);
  assert.match(paint, /\[emailDelayed, "temporary invitation delay", "all"\]/);
  assert.doesNotMatch(paint, /accepted\.length - delivered\.length/);
  assert.doesNotMatch(paint, /"invitation delivery issue"/);
});

test("the paid-seat progress bar and exception indicators are compact and conditional", () => {
  const paint = admin.slice(admin.indexOf("function paintEnrollment(cap"), admin.indexOf("function paintOverviewState"));
  // Simple paid-seat progress bar: confirmed paid seats / cohort capacity.
  assert.match(paint, /class="progress-track"><div class="progress-fill success" id="seatProgressFill"/);
  assert.match(paint, /\(cap\.paid \|\| 0\) \/ cap\.capacity/);
  assert.match(paint, /Confirmed paid seats/);
  // Indicators render only when there is something actionable.
  assert.match(paint, /\.filter\(\(\[n\]\) => n > 0\)/);
  assert.match(paint, /class="enrollmentIndicators" id="enrollmentIndicators"/);
  assert.match(admin, /id="capacityIndicators"/);
  const css = components.replace(/\r/g, "");
  assert.match(css, /\.enrollmentIndicators:empty \{ display: none; \}/);
});

test("capacity enforcement, waitlist and payment exceptions stay accessible in an expandable details section", () => {
  // The oversized panels are gone from the main view — replaced by a toggle.
  assert.doesNotMatch(admin, /<h3>Cohort Capacity<\/h3>/);
  assert.match(admin, /<button class="capacityToggle" id="capacityToggle"/);
  assert.match(admin, /id="capacityDetails"[^>]*hidden/);
  // The waitlist and exceptions tables live INSIDE the collapsed details.
  const detailsOpen = admin.indexOf('id="capacityDetails"');
  assert.ok(detailsOpen !== -1, "capacity details container exists");
  assert.ok(admin.indexOf('id="waitlistTable"') > detailsOpen, "waitlist table is inside the expandable");
  assert.ok(admin.indexOf('id="exceptionsTable"') > detailsOpen, "exceptions table is inside the expandable");
  // Every existing capacity element survives inside the expandable.
  for (const id of ["capacityGrid", "waitlistTable", "inviteNextBtn", "exceptionsTable"]) {
    assert.ok(admin.includes('id="' + id + '"'), `${id} must survive inside Capacity Details`);
  }
  // renderCapacity still paints all three tables (functionality preserved).
  const rc = admin.slice(admin.indexOf("async function renderCapacity()"), admin.indexOf("async function renderOverview("));
  assert.match(rc, /\$\("capacityGrid"\)\.innerHTML = grid/);
  assert.match(rc, /\$\("waitlistTable"\)\.innerHTML/);
  assert.match(rc, /\$\("exceptionsTable"\)\.innerHTML/);
  assert.match(rc, /invite_next/);
  assert.match(rc, /exception_resolve/);
  assert.match(rc, /window\.resolveException = async \(id\)/);
  // The toggle wires the expand/collapse behaviour.
  assert.match(admin, /\$\("capacityToggle"\)\.onclick = \(\) => \{[\s\S]*?cd\.hidden = !open;/);
  // Navigating via Available Seats expands the details after render.
  assert.match(admin, /expandCapacityDetails = !!options\.capacity;/);
  assert.match(admin, /if \(expandCapacityDetails\) \{[\s\S]*?cd\.hidden = false;/);
});

test("enrolled learners stay visible in the Applications list so the Enrolled stage and filter work", () => {
  // The pipeline must reach Enrolled inside Applications — the record is no
  // longer filtered out, and its row carries no action buttons.
  assert.match(admin, /function activeApps\(\) \{[\s\S]*?return records\.filter/);
  assert.doesNotMatch(admin, /filter out fully enrolled students/);
  const actions = admin.slice(admin.indexOf("function applicationActions(x)"), admin.indexOf("function paymentEnrollmentInfo(x)"));
  assert.match(actions, /if \(x\.suspended_at \|\| isActiveLearner\) return "";/);
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));
  assert.match(card, /stage = "Enrolled"; stageClass = "stage-enrolled";/);
  assert.match(card, /nextAction = "No action needed"; actionClass = "action-none";/);
});

test("a delivered invitation is never an admin action, but a failed or unconfirmed one is", () => {
  const needs = admin.slice(admin.indexOf("function appNeedsAdmin(x)"), admin.indexOf("function appPriority(x)"));
  // Only a confirmed provider failure or a genuinely unconfirmed send asks for a
  // human; a delivered invitation and an in-flight delay never do.
  assert.match(needs, /if \(email\.failed \|\| email\.unresolved\) return true;/);
  assert.doesNotMatch(needs, /!appAcceptanceEmail\(x\)\.delivered/);
  const card = admin.slice(admin.indexOf("function appCard(x)"), admin.indexOf("function appStage(x)"));
  assert.match(card, /if \(emailInfo\.failed\) \{ nextAction = "Admin: Resend acceptance email"; actionClass = "action-admin"; \}/);
  assert.match(card, /else if \(emailInfo\.unresolved\) \{ nextAction = "Admin: Confirm invitation delivery"; actionClass = "action-admin"; \}/);
  assert.doesNotMatch(card, /Admin: Resolve email delivery/);
  // The row badge reports the real provider outcome, never an inferred failure.
  assert.match(card, /badge-success">Email delivered/);
  assert.match(card, /badge-danger">Email failed/);
  assert.match(card, /badge">Email delayed/);
  assert.match(card, /badge">Email unconfirmed/);
});

test("enrollment metrics navigate through the existing router", () => {
  const nav = admin.slice(admin.indexOf("function goApplicants("), admin.indexOf("function stat(a)"));
  assert.match(nav, /showDashboard\(\{ push: true \}\);/);
  assert.match(nav, /tab = "applicants";/);
  assert.match(nav, /applicantFilterKey = /);
  assert.match(nav, /render\(\);/);
  assert.match(nav, /saveUiState\(\);/);
  // No hard reloads and no second router.
  assert.doesNotMatch(nav, /location\.reload|location\.href/);
  // The Enrollment card used to end in a "View enrolled learners in
  // Students" footnote link. It duplicated navigation the sidebar and the
  // KPI cards already provide, so it was removed; the card must not
  // reintroduce a cross-tab link of its own.
  const paint = admin.slice(admin.indexOf("function paintOverview(data)"), admin.indexOf("async function renderOverview("));
  assert.doesNotMatch(paint, /View enrolled learners in Students/);
  assert.doesNotMatch(paint, /enrollmentFootnote/);
});
