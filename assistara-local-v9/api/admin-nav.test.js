const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const admin = read("assistara-local-v9/admin.html");

test("returning visitors never see the login form flash", () => {
  // A token present at parse time marks the document before the form paints.
  assert.match(admin, /document\.documentElement\.setAttribute\("data-admin-session","1"\)/);
  assert.match(admin, /html\[data-admin-session="1"\] #login/);
  assert.match(admin, /html\[data-admin-session="1"\] #booting/);
  assert.match(admin, /id="booting"/);
  // show() clears the marker so the dashboard renders normally.
  assert.match(admin, /document\.documentElement\.removeAttribute\("data-admin-session"\)/);
});

test("dashboard UI state is persisted per tab and restored across navigations", () => {
  assert.match(admin, /const UI_KEY = "assistara_admin_ui"/);
  assert.match(admin, /function readUiState\(\)/);
  assert.match(admin, /function saveUiState\(\)/);
  assert.match(admin, /function applyUiState\(s\)/);
  assert.match(admin, /function applyRestoredView\(s\)/);
  assert.match(admin, /openApps: \[\.\.\.openApps\]/);
  assert.match(admin, /openStudents: \[\.\.\.openStudents\]/);
  assert.match(admin, /scroll: window\.scrollY/);
  // Restore is applied before load() (first render uses the restored tab) and
  // the expanded/scroll view is applied after it.
  const restore = admin.slice(admin.indexOf("async function restoreSession()"), admin.indexOf("if (token) restoreSession();"));
  assert.match(restore, /applyUiState\(ui\)[\s\S]*await load\(\)[\s\S]*applyRestoredView\(ui\)/);
});

test("tab, search, filters, expanded cards and scroll save their state", () => {
  assert.match(admin, /render\(\);\s*saveUiState\(\);/); // nav handler
  assert.match(admin, /\$\("search"\)\.oninput = \(\) => \{ render\(\); saveUiState\(\); \}/);
  assert.match(admin, /studentFilter\.onchange = \(\) => \{ render\(\); saveUiState\(\); \}/);
  assert.match(admin, /studentSort\.onchange = \(\) => \{ render\(\); saveUiState\(\); \}/);
  assert.match(admin, /window\.addEventListener\("pagehide", saveUiState\)/);
  // expanded applicants + students persist
  assert.match(admin, /openApps\.add\(key\)[\s\S]*saveUiState\(\)/);
  assert.match(admin, /openStudents\.add\(key\)[\s\S]*saveUiState\(\)/);
});

test("logout clears the session and the saved UI state without a pagehide re-save", () => {
  assert.match(admin, /adminSession\.clear\(\);\s*uiDisabled = true;\s*clearUiState\(\)/);
  assert.match(admin, /function saveUiState\(\) \{\s*if \(uiDisabled\) return;/);
});

test("standalone admin pages validate the shared session and never flash login", () => {
  for (const p of ["admin-finance.html", "admin-acquisition.html", "admin-masterclass-event.html"]) {
    const s = read("assistara-local-v9/" + p);
    assert.match(s, /if\s*\(!token\)\s*location\.href\s*=\s*"\/admin"/, `${p} must guard on the shared token`);
  }
});
