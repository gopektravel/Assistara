const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const admin = read("assistara-local-v9/admin.html");

test("returning visitors see the app shell immediately, never a login or loading flash", () => {
  // A token present at parse time marks the document before anything paints, so
  // the shell (never the login form and never a placeholder) is what renders.
  assert.match(admin, /document\.documentElement\.setAttribute\("data-admin-session","1"\)/);
  assert.match(admin, /html\[data-admin-session="1"\] #login\s*\{\s*display: none;\s*\}/);
  assert.match(admin, /html\[data-admin-session="1"\] #dash\s*\{\s*display: block;\s*\}/);
  // The old boot placeholder is gone: there is no intermediate loading screen.
  assert.doesNotMatch(admin, /id="booting"/);
  // show() clears the marker so the dashboard renders normally afterwards.
  assert.match(admin, /document\.documentElement\.removeAttribute\("data-admin-session"\)/);
});

test("dashboard UI state is persisted per tab and restored after login/restore", () => {
  assert.match(admin, /const UI_KEY = "assistara_admin_ui"/);
  assert.match(admin, /function readUiState\(\)/);
  assert.match(admin, /function saveUiState\(\)/);
  assert.match(admin, /function applyUiState\(s\)/);
  assert.match(admin, /function applyRestoredView\(s\)/);
  assert.match(admin, /openApps: \[\.\.\.openApps\]/);
  assert.match(admin, /openStudents: \[\.\.\.openStudents\]/);
  // A mounted tool's scroll is never saved as the dashboard's own scroll.
  assert.match(
    admin,
    /scroll: agentView === "dashboard" \? \(window\.scrollY \|\| 0\) : \(viewScroll\.dashboard \|\| 0\)/,
  );
  // enterApp applies UI state before load() (first render uses the restored
  // tab) and re-applies the expanded/scroll view once the data is in.
  const enter = admin.slice(
    admin.indexOf("async function enterApp()"),
    admin.indexOf("</script>", admin.indexOf("async function enterApp()")),
  );
  assert.match(enter, /applyUiState\(ui\)[\s\S]*await load\(\)[\s\S]*applyRestoredView\(ui\)/);
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

test("admin tools are mounted by client-side routing, never by loading another document", () => {
  // The tool buttons are data-driven switches, not hard navigations.
  assert.match(
    admin,
    /data-tool="acquisition"[\s\S]*data-tool="finance"[\s\S]*data-tool="masterclass"/,
  );
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/finance"/);
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/acquisition"/);
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/masterclass-event"/);
  // One router maps the three routes to their sources and pushes history.
  assert.match(admin, /const TOOLS = \{/);
  assert.match(admin, /function openTool\(name, opts = \{\}\)/);
  assert.match(admin, /history\.pushState\(\{ view: name \}, "", t\.path\)/);
  assert.match(admin, /window\.addEventListener\("popstate"/);
  // Returning to the dashboard is also a pushState, not a navigation.
  assert.match(admin, /history\.pushState\(\{ view: "dashboard" \}, "", "\/admin"\)/);
});

test("tool views mount in an isolated shadow root, with no iframes and no shared DOM", () => {
  assert.doesNotMatch(admin, /<iframe/i);
  assert.match(admin, /host\.attachShadow\(\{ mode: "open" \}\)/);
  assert.match(admin, /function scopeToolCss\(css\)/);
  assert.match(admin, /new Function\(/);
  // Tool scripts run with `document` scoped to the shadow root so their
  // getElementById/querySelector* calls never touch the dashboard.
  assert.match(admin, /scopedDoc = new Proxy\(document/);
  assert.match(admin, /getElementById"\) return \(id\) => shadow\.getElementById\(id\)/);
});

test("each mounted tool is disposed cleanly (timers and listeners) when left", () => {
  assert.match(admin, /function disposeTool\(\)/);
  assert.match(admin, /toolCleanup\.timers\.forEach/);
  assert.match(admin, /toolCleanup\.listeners\.forEach/);
  assert.match(admin, /clearInterval\(id\) : clearTimeout\(id\)/);
  assert.match(admin, /if \(mountedTool\) disposeTool\(\)/); // showDashboard leaves the tool
});

test("the three tool routes serve the shell while the tool sources stay fetchable", () => {
  const vercel = JSON.parse(read("assistara-local-v9/vercel.json"));
  const routes = vercel.routes;
  const dest = (src) => (routes.find((r) => r.src === src) || {}).dest;
  for (const p of ["/admin/acquisition", "/admin/finance", "/admin/masterclass-event"]) {
    assert.equal(dest(p), "/admin.html", `${p} must render the shared shell`);
    assert.equal(dest(p + "/"), "/admin.html", `${p}/ must render the shared shell`);
  }
  for (const f of [
    "/admin-finance.html",
    "/admin-acquisition.html",
    "/admin-masterclass-event.html",
  ]) {
    assert.ok(
      routes.some((r) => r.src === f),
      `${f} must stay routable so the shell can fetch it`,
    );
  }
});

test("standalone admin pages validate the shared session and never flash login", () => {
  for (const p of ["admin-finance.html", "admin-acquisition.html", "admin-masterclass-event.html"]) {
    const s = read("assistara-local-v9/" + p);
    assert.match(s, /if\s*\(!token\)\s*location\.href\s*=\s*"\/admin"/, `${p} must guard on the shared token`);
  }
});
