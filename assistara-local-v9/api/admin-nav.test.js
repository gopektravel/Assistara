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
  // The tool buttons are data-driven switches in the sidebar, not hard navigations.
  // Check that the sidebar contains the restored tool nav-items.
  assert.match(
    admin,
    /data-tool="acquisition"[\s\S]*data-tool="masterclass"[\s\S]*data-tool="email"/,
  );
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/finance"/);
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/acquisition"/);
  assert.doesNotMatch(admin, /location\.href\s*=\s*"\/admin\/masterclass-event"/);
  // One router maps the routes to their sources and pushes history.
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

test("the tool routes serve the shell while the tool sources stay fetchable", () => {
  const vercel = JSON.parse(read("assistara-local-v9/vercel.json"));
  const routes = vercel.routes;
  const dest = (src) => (routes.find((r) => r.src === src) || {}).dest;
  for (const p of ["/admin/acquisition", "/admin/finance", "/admin/masterclass-event", "/admin/email"]) {
    assert.equal(dest(p), "/admin.html", `${p} must render the shared shell`);
    assert.equal(dest(p + "/"), "/admin.html", `${p}/ must render the shared shell`);
  }
  for (const f of [
    "/admin-finance.html",
    "/admin-acquisition.html",
    "/admin-masterclass-event.html",
    "/admin-email.html",
  ]) {
    assert.ok(
      routes.some((r) => r.src === f),
      `${f} must stay routable so the shell can fetch it`,
    );
  }
});

test("every shared Admin stylesheet is built and routed before the catch-all", () => {
  const vercel = JSON.parse(read("assistara-local-v9/vercel.json"));
  const files = [
    "admin-tokens.css",
    "admin-components.css",
    "admin-charts.css",
    "admin-layout.css",
    "admin-sidebar.css",
    "admin-header.css",
  ];
  const catchAll = vercel.routes.findIndex((r) => r.src === "/(.*)");
  for (const file of files) {
    assert.ok(vercel.builds.some((b) => b.src === file), `${file} must be built`);
    const route = vercel.routes.findIndex((r) => r.src === `/${file}` && r.dest === `/${file}`);
    assert.ok(route >= 0 && route < catchAll, `${file} must be routed before the catch-all`);
  }
});

test("Admin pages use Manrope as the only font", () => {
  const files = ["admin.html", "admin-finance.html", "admin-email.html", "admin-acquisition.html", "admin-masterclass-event.html"];
  for (const file of files) {
    const source = read(`assistara-local-v9/${file}`);
    assert.match(source, /Manrope/i, `${file} must reference Manrope`);
    assert.doesNotMatch(source, /DM Sans|\bInter\b|\bArial\b|system-ui|-apple-system|Segoe UI|\bRoboto\b|\bHelvetica\b|\bmonospace\b/i, `${file} must not declare a competing font`);
    assert.match(source, /manrope-lock\.css/, `${file} must load the canonical Manrope lock`);
  }
  const tokens = read("assistara-local-v9/admin-tokens.css");
  assert.match(tokens, /--font-family:\s*"Manrope",\s*sans-serif/);
  assert.doesNotMatch(tokens, /DM Sans|\bInter\b|\bArial\b|system-ui|-apple-system|Segoe UI|\bRoboto\b|\bHelvetica\b|\bmonospace\b/i);
  const lock = read("assistara-local-v9/manrope-lock.css");
  assert.match(lock, /family=Manrope:wght@400;500;600;700;800/);
  assert.match(lock, /font-family:"Manrope",sans-serif!important/);
  assert.match(admin, /\.toolRoot \*,button,input,select,textarea,table,canvas\{font-family:"Manrope",sans-serif!important\}/);
});

test("embedded tools use one shared page title and Live Events UI naming", () => {
  assert.match(admin, /\.top,\.shell>\.head\{display:none!important\}/);
  assert.doesNotMatch(admin, /:host \.shell > \.head/);
  assert.match(admin, /data-tooltip="Live Events"/);
  assert.match(admin, /<span class="nav-item-label">Live Events<\/span>/);
  assert.match(admin, /crumb: \[\["Marketing", "Live Events"\]\]/);
  assert.match(admin, /title: "Live Events"/);
});

test("tool views keep 24px below the header without retaining hidden dashboard space", () => {
  assert.match(admin, /#toolView \{\s*padding: 0 0 40px;\s*\}/);
  assert.match(admin, /\.shell>\.head\+\*\{margin-top:0\}/);
  // The dashboard section owns a 60px bottom padding. It must be hidden while
  // a tool is mounted (its inline display wins over CSS), and restored by both
  // dashboard views so switching back never leaves it off-screen.
  assert.match(admin, /\$\("dashBody"\)\.style\.display = "none";\s*\n\s*\$\("dash"\)\.style\.display = "none";\s*\n\s*\$\("toolView"\)\.hidden = false;/);
  assert.equal(
    (admin.match(/\$\("dashBody"\)\.style\.display = "";\s*\n\s*\$\("dash"\)\.style\.display = "block";/g) || []).length,
    2,
    "both showOverview and showDashboard must visibly restore the dashboard section",
  );
  assert.doesNotMatch(
    admin,
    /\$\("dash"\)\.style\.display = "";/,
    "clearing the inline display revives the base #dash { display:none } rule",
  );
  const layout = admin.slice(admin.indexOf("#toolView {"), admin.indexOf(".toolError"));
  assert.doesNotMatch(layout, /margin-top:\s*-/i);
  assert.doesNotMatch(layout, /transform:/i);
});

test("standalone admin pages validate the shared session and never flash login", () => {
  for (const p of ["admin-finance.html", "admin-acquisition.html", "admin-masterclass-event.html", "admin-email.html"]) {
    const s = read("assistara-local-v9/" + p);
    assert.match(s, /if\s*\(!token\)\s*location\.href\s*=\s*"\/admin"/, `${p} must guard on the shared token`);
  }
});
