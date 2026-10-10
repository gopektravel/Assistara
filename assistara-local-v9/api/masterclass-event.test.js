const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const site = path.join(root, "assistara-local-v9");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const fn = read("supabase/functions/masterclass-status/index.ts");
const adminHtml = fs.readFileSync(path.join(site, "admin.html"), "utf8");
const eventPage = fs.readFileSync(path.join(site, "admin-masterclass-event.html"), "utf8");
const liveHtml = fs.readFileSync(path.join(site, "live.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(site, "vercel.json"), "utf8"));

test("login screen has no masterclass controls", () => {
  assert.doesNotMatch(adminHtml, /masterclassAdmin/);
  assert.doesNotMatch(adminHtml, /mcSet|mcStatus|Masterclass Event Control/);
  assert.doesNotMatch(adminHtml, /masterclass-status/);
  // and the dashboard opens it client-side via the shell router
  assert.match(adminHtml, /data-tool="masterclass"/);
  assert.match(adminHtml, /masterclass: \{ path: "\/admin\/masterclass-event"/);
});

test("event management is server-authorized, not client-hidden", () => {
  assert.match(fn, /Deno\.env\.get\("ADMIN_TOKEN_VERSION"\)/);
  assert.match(fn, /d\.v === TOKEN_VERSION && d\.u === USER && Date\.now\(\) < d\.exp/);
  assert.match(fn, /if \(!\(await adminAuth\(token\)\)\) return out\(\{ ok: false, error: "Unauthorized" \}, 401\)/);
  // the old spoofable check must be gone
  assert.doesNotMatch(fn, /auth\.includes\("Bearer "\)/);
  assert.doesNotMatch(fn, /auth\.includes\("assistara"\)/);
});

test("status is derived server-side; the schedule is the single authority", () => {
  assert.match(fn, /function deriveStatus/);
  assert.match(fn, /if \(row\.ended_at\) return "ended"/);
  assert.match(fn, /nowMs >= sched\) return "live"/);
  // no browser-authoritative or client-supplied status
  assert.doesNotMatch(fn, /new_status/);
  assert.doesNotMatch(fn, /toLocaleString\("en-US", \{ timeZone: "Asia\/Manila" \}\)/);
});

test("ending is admin-only, idempotent and cannot restart", () => {
  assert.match(fn, /if \(current\.status === "ended"\)/);
  assert.match(fn, /changed: false/);
  assert.match(fn, /\.is\("ended_at", null\)/);
  assert.match(fn, /ended_at: endedAt, ended_by: USER/);
  // no Go Live / pause / resume / restart controls
  assert.doesNotMatch(fn, /new_status|go_live|resume|restart/i);
  assert.doesNotMatch(eventPage, /Go Live|Pause|Resume|Restart/i);
});

test("standalone event page is authenticated and uses the shared admin session", () => {
  assert.match(eventPage, /localStorage\.getItem\(ADMIN_TOKEN_KEY\)/);
  assert.match(eventPage, /if \(!token\) location\.href = "\/admin"/);
  assert.match(eventPage, /Authorization: "Bearer " \+ token/);
  assert.match(eventPage, /confirm\("End the masterclass now/);
});

test("public event page reflects the authoritative server status", () => {
  assert.match(liveHtml, /masterclass-status/);
  assert.match(liveHtml, /action:'read'/);
  // countdown script only checks for ended status (live is controlled by display_state)
  assert.match(liveHtml, /status==='ended'/);
});

test("vercel serves the shell for the event route and keeps the standalone page routable", () => {
  const routes = vercel.routes || [];
  const shell = routes.some((r) => r.src === "/admin/masterclass-event" && r.dest === "/admin.html");
  assert.ok(shell, "expected /admin/masterclass-event to render the shared admin shell");
  const raw = routes.some((r) => r.src === "/admin-masterclass-event.html");
  assert.ok(raw, "the standalone event page must stay routable for the shell to fetch");
  const builds = vercel.builds || [];
  assert.ok(builds.some((b) => b.src === "admin-masterclass-event.html"), "expected a build entry");
});