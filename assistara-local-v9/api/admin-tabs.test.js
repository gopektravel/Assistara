const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "assistara-local-v9", "admin.html"), "utf8");

function between(startAnchor, endAnchor) {
  const a = html.indexOf(startAnchor);
  const b = html.indexOf(endAnchor, a + 1);
  assert.ok(a >= 0 && b > a, `could not slice ${startAnchor}..${endAnchor}`);
  return html.slice(a, b);
}

test("one central reset owns every tab-scoped container", () => {
  const scaffold = between("function resetTabScaffold()", "async function render()");
  assert.match(scaffold, /\$\("capacityPanel"\)\.style\.display = "none"/);
  assert.match(scaffold, /\$\("signupGoal"\)\.innerHTML = ""/);
  assert.match(scaffold, /\$\("pendingBox"\)\.innerHTML = ""/);
  assert.match(scaffold, /\$\("studentFilters"\)[\s\S]*?style\.display = "none"/);
});

test("render() resets the scaffold before rendering the active tab", () => {
  const renderStart = html.indexOf("async function render()");
  const body = html.slice(renderStart, renderStart + 260);
  const reset = body.indexOf("resetTabScaffold()");
  const firstBranch = body.indexOf('if (tab === "applicants")');
  assert.ok(reset >= 0 && reset < firstBranch, "resetTabScaffold() must run before any branch");
});

test("the B2B render override uses the same central reset (no leak into B2B)", () => {
  const override = between("render = () => {", "};");
  assert.match(override, /if \(tab !== "b2b"\) return previousRender\(\);/);
  assert.match(override, /resetTabScaffold\(\);/);
});

test("each tab only enables its own tab-scoped containers", () => {
  const applicants = between('if (tab === "applicants")', 'if (tab === "students")');
  assert.match(applicants, /\$\("capacityPanel"\)\.style\.display = "block"/);
  assert.doesNotMatch(applicants, /signupGoal"\)\.innerHTML = `/); // never sets the webinar block

  const students = between('if (tab === "students")', 'if (tab === "webinar")');
  assert.match(students, /\$\("studentFilters"\)\.style\.display = "flex"/);
  assert.doesNotMatch(students, /capacityPanel"\)\.style\.display = "block"/);

  const webinar = between('if (tab === "webinar")', '$("capacityPanel").style.display = "none";');
  assert.match(webinar, /signupGoal"\)\.innerHTML=`<div class="signupGoal">/);
  assert.doesNotMatch(webinar, /capacityPanel"\)\.style\.display = "block"/);
});

test("no scattered per-branch filter toggling remains", () => {
  // the nav handler must not toggle the filters directly anymore
  const nav = between("document.querySelectorAll(\".nav button[data-tab]\")", "$(\"search\").oninput");
  assert.doesNotMatch(nav, /studentFilters"\)\.style\.display/);
});
