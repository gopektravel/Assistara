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

test("admin navigation keeps the other sections and the standalone event page", () => {
  for (const tab of ["applicants", "students", "webinar", "b2b"]) {
    assert.match(adminHtml, new RegExp(`data-tab="${tab}"`), `expected the ${tab} tab`);
  }
  assert.match(adminHtml, /location\.href='\/admin\/masterclass-event'/);
  assert.match(adminHtml, /location\.href='\/admin\/acquisition'/);
  assert.match(adminHtml, /location\.href='\/admin\/finance'/);
});
