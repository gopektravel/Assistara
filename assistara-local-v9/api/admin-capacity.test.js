const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const adminHtml = fs.readFileSync(path.join(root, "assistara-local-v9", "admin.html"), "utf8");

test("the separate Capacity tab/panel is gone", () => {
  assert.doesNotMatch(adminHtml, /data-tab="capacity"/);
  assert.doesNotMatch(adminHtml, /tab === "capacity"/);
  assert.doesNotMatch(adminHtml, />Capacity<\/button>/);
});

test("capacity info and actions are integrated into the Applicants view", () => {
  // shown from the applicants branch of render()
  const applicantsIdx = adminHtml.indexOf('if (tab === "applicants")');
  const showIdx = adminHtml.indexOf('$("capacityPanel").style.display = "block"');
  const studentsIdx = adminHtml.indexOf('if (tab === "students")');
  assert.ok(applicantsIdx >= 0 && showIdx > applicantsIdx && showIdx < studentsIdx, "capacity must render inside the Applicants branch");
  assert.match(adminHtml, /if \(capacityDirty\) \{ capacityDirty = false; renderCapacity\(\); \}/);
  // the panel is still hidden for every other tab
  assert.match(adminHtml, /\$\("capacityPanel"\)\.style\.display = "none";/);
});

test("capacity management actions and the enforcement API are preserved", () => {
  for (const id of ["capacityGrid", "waitlistTable", "exceptionsTable", "inviteNextBtn"]) {
    assert.match(adminHtml, new RegExp(`id="${id}"`), `expected #${id} to remain`);
  }
  assert.match(adminHtml, /admin-academy-capacity/);
  assert.match(adminHtml, /req\("invite_next"/);
  assert.match(adminHtml, /req\("exception_resolve"/);
  assert.match(adminHtml, /req\("overview", \{ cohort_code: "founding-2026" \}/);
});

test("admin navigation keeps the other sections and the tool routes", () => {
  for (const tab of ["applicants", "students", "webinar", "b2b"]) {
    assert.match(adminHtml, new RegExp(`data-tab="${tab}"`), `expected the ${tab} tab`);
  }
  // Finance / Acquisition / Masterclass Event are reached client-side through
  // the shell router (data-tool + TOOLS map), not by full-page links.
  assert.match(adminHtml, /data-tool="masterclass"/);
  assert.match(adminHtml, /data-tool="acquisition"/);
  assert.match(adminHtml, /data-tool="finance"/);
  assert.match(adminHtml, /masterclass: \{ path: "\/admin\/masterclass-event"/);
  assert.match(adminHtml, /acquisition: \{ path: "\/admin\/acquisition"/);
  assert.match(adminHtml, /finance: \{ path: "\/admin\/finance"/);
});
