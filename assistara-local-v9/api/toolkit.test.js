"use strict";

// Founding Cohort Toolkit + Tool Voting QA.
// Run: node --test assistara-local-v9/api/toolkit.test.js
//
// Proves, without a live database:
//   1. the Toolkit renders Client Finder, all 10 roadmap tools, and Suggest a Tool;
//   2. Suggest a Tool uses the canonical Community WhatsApp URL;
//   3. the /api/academy-tool-votes endpoint only answers a valid, sealed,
//      entitled learner session and never writes with client-held credentials;
//   4. state/add/remove round-trip through the service role against the
//      learner's own user_id only;
//   5. the migration keeps the table server-writable and client-locked;
//   6. the Test Portal drives voting from local state, never production.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const security = require("./_academy-security");

const COOKIE_SECRET = "local-test-cookie-secret-32-bytes-minimum";
const SERVICE_KEY = "local-test-service-role-key";
const ORIGIN = "https://www.getassistara.com";

const repoRoot = path.resolve(__dirname, "..", "..");
const v9Root = path.resolve(__dirname, "..");

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function configEnv() {
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_ANON_KEY = "local-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.ACADEMY_COOKIE_SECRET = COOKIE_SECRET;
}

function userAccessToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "auth-user-1", exp })).toString("base64url");
  return `${header}.${payload}.local-test-signature`;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(value = "") { this.body = Buffer.isBuffer(value) ? value.toString("utf8") : String(value); },
  };
}

// Stub Supabase + Auth. Records every outbound call so tests can assert the
// votes table is only ever touched under the service role, scoped to the
// learner's own user_id.
function setMockFetch({ entitled = true, votes = [], myVoted = [] } = {}) {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    const authorization = String((init.headers || {}).Authorization || "");
    calls.push({ url, method: init.method || "GET", bearer: authorization.replace(/^Bearer\s+/i, ""), body: init.body });
    if (url.endsWith("/auth/v1/user")) return response({ id: "auth-user-1", email: "learner@example.test" });
    if (url.includes("/auth/v1/admin/users/")) return response({ user: { id: "auth-user-1", deleted_at: null, banned_until: null } });
    if (url.endsWith("/rest/v1/rpc/academy_has_access")) return response(entitled);
    if (url.includes("/rest/v1/academy_tool_votes")) {
      if ((init.method || "GET") === "GET") {
        if (url.includes("user_id=eq.")) {
          return response(myVoted.map(t => ({ tool_id: t })));
        }
        return response(votes);
      }
      if ((init.method || "GET") === "POST") {
        return response([{ user_id: "auth-user-1", tool_id: "offer-builder" }], 201);
      }
      if ((init.method || "GET") === "DELETE") {
        return response([]);
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return calls;
}

function learnerCookie(overrides = {}) {
  return security.seal(
    { aud: "academy", access_token: userAccessToken(), user_id: "auth-user-1", exp: Date.now() + 60_000, ...overrides },
    COOKIE_SECRET
  );
}

async function post(handler, body, cookie, origin = ORIGIN) {
  const req = { method: "POST", headers: {} };
  if (origin !== null) req.headers.origin = origin;
  if (cookie) req.headers.cookie = `assistara_academy=${cookie}`;
  if (body !== undefined) req.body = body;
  const res = mockResponse();
  await handler(req, res);
  return res;
}

// ==========================================================================
// API endpoint tests
// ==========================================================================

test("GET is refused; the endpoint only speaks POST", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-tool-votes");
  const res = mockResponse();
  await handler({ method: "GET", headers: { origin: ORIGIN }, body: "{}" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: "Method not allowed" });
});

test("unknown origins and missing cookies are refused before any work", async t => {
  configEnv();
  const before = global.fetch;
  global.fetch = async () => { throw new Error("must not reach Supabase"); };
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-tool-votes");

  const evilOrigin = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://evil.example" }, body: '{"action":"state"}' }, evilOrigin);
  assert.equal(evilOrigin.statusCode, 403);

  const noCookie = mockResponse();
  await handler({ method: "POST", headers: { origin: ORIGIN }, body: '{"action":"state"}' }, noCookie);
  assert.equal(noCookie.statusCode, 403);
  assert.deepEqual(JSON.parse(noCookie.body), { ok: false, error: "Academy session required" });

  const expired = mockResponse();
  const stale = security.seal({ aud: "academy", access_token: userAccessToken(), user_id: "auth-user-1", exp: Date.now() - 5_000 }, COOKIE_SECRET);
  await handler({ method: "POST", headers: { origin: ORIGIN, cookie: `assistara_academy=${stale}` }, body: '{"action":"state"}' }, expired);
  assert.equal(expired.statusCode, 403);

  const forged = mockResponse();
  const tampered = `assistara_academy=${learnerCookie().slice(0, -2)}xx`;
  await handler({ method: "POST", headers: { origin: ORIGIN, cookie: tampered }, body: '{"action":"state"}' }, forged);
  assert.equal(forged.statusCode, 403, "a tampered cookie must be refused");
});

test("actions are allow-listed and stray fields are rejected", async t => {
  configEnv();
  const before = global.fetch;
  global.fetch = async () => { throw new Error("must not reach Supabase"); };
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-tool-votes");

  const unknown = await post(handler, '{"action":"delete_all"}', learnerCookie());
  assert.equal(unknown.statusCode, 400);
  assert.match(unknown.body, /Unknown action/);

  const stray = await post(handler, '{"action":"state","user_id":"someone-else"}', learnerCookie());
  assert.equal(stray.statusCode, 400);
  assert.match(stray.body, /Unexpected field/);

  const broken = await post(handler, "{not json", learnerCookie());
  assert.equal(broken.statusCode, 400);
});

test("state returns aggregate counts and the learner's voted tool IDs", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const allVotes = [
    { tool_id: "offer-builder" },
    { tool_id: "offer-builder" },
    { tool_id: "profile-builder" },
    { tool_id: "proposal-builder" },
  ];
  const calls = setMockFetch({ entitled: true, votes: allVotes, myVoted: ["offer-builder", "profile-builder"] });
  const handler = require("./academy-tool-votes");

  const res = await post(handler, '{"action":"state"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.votes["offer-builder"], 2);
  assert.equal(body.votes["profile-builder"], 1);
  assert.equal(body.votes["proposal-builder"], 1);
  assert.equal(body.votes["rate-calculator"], 0);
  assert.deepEqual(body.voted.sort(), ["offer-builder", "profile-builder"]);

  // Verify the read used the service role
  const readCalls = calls.filter(c => c.url.includes("academy_tool_votes") && c.method === "GET");
  assert.ok(readCalls.length >= 2, "must read both aggregate and learner votes");
  for (const call of readCalls) {
    assert.equal(call.bearer, SERVICE_KEY, "all reads must use the service role");
  }
});

test("add persists a vote under the service role for the validated learner", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const calls = setMockFetch({ entitled: true, votes: [{ tool_id: "offer-builder" }], myVoted: [] });
  const handler = require("./academy-tool-votes");

  const res = await post(handler, '{"action":"add","tool_id":"offer-builder"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.toolId, "offer-builder");
  assert.equal(body.voted, true);
  assert.equal(body.count, 1);

  const write = calls.find(c => c.url.includes("academy_tool_votes") && c.method === "POST");
  assert.ok(write, "a vote write must happen");
  assert.equal(write.bearer, SERVICE_KEY, "the write must use the service role");
  assert.ok(write.url.includes("on_conflict=user_id,tool_id"), "must use idempotent upsert");
  const payload = JSON.parse(write.body);
  assert.equal(payload.user_id, "auth-user-1");
  assert.equal(payload.tool_id, "offer-builder");
});

test("remove deletes a vote under the service role for the validated learner", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const calls = setMockFetch({ entitled: true, votes: [], myVoted: ["offer-builder"] });
  const handler = require("./academy-tool-votes");

  const res = await post(handler, '{"action":"remove","tool_id":"offer-builder"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.toolId, "offer-builder");
  assert.equal(body.voted, false);
  assert.equal(body.count, 0);

  const del = calls.find(c => c.url.includes("academy_tool_votes") && c.method === "DELETE");
  assert.ok(del, "a vote delete must happen");
  assert.equal(del.bearer, SERVICE_KEY, "the delete must use the service role");
  assert.ok(del.url.includes("user_id=eq.auth-user-1"), "must be scoped to the learner");
  assert.ok(del.url.includes("tool_id=eq.offer-builder"), "must be scoped to the tool");
});

test("invalid tool IDs are rejected", async t => {
  configEnv();
  const before = global.fetch;
  global.fetch = async () => { throw new Error("must not reach Supabase"); };
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-tool-votes");

  const invalid = await post(handler, '{"action":"add","tool_id":"malicious-tool"}', learnerCookie());
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body, /Invalid tool_id/);

  const missing = await post(handler, '{"action":"add"}', learnerCookie());
  assert.equal(missing.statusCode, 400);
  assert.match(missing.body, /tool_id is required/);
});

test("a cookie bound to a different user cannot vote as another learner", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true });
  const handler = require("./academy-tool-votes");
  const otherCookie = learnerCookie({ user_id: "someone-else" });
  const res = await post(handler, '{"action":"add","tool_id":"offer-builder"}', otherCookie);
  assert.equal(res.statusCode, 403, "the endpoint binds every action to the validated learner's own id");
});

test("votes are refused when the learner is not entitled", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: false });
  const handler = require("./academy-tool-votes");
  const res = await post(handler, '{"action":"state"}', learnerCookie());
  assert.equal(res.statusCode, 403);
});

// ==========================================================================
// Dashboard HTML tests
// ==========================================================================

test("Toolkit renders Client Finder as available", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /id:"client-finder"/);
  assert.match(html, /status:"available"/);
  assert.match(html, /featured:true/);
  assert.match(html, /Open Client Finder/);
});

test("all 10 roadmap tools render", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  const tools = [
    "offer-builder", "profile-builder", "job-post-analyzer", "proposal-builder",
    "portfolio-builder", "rate-calculator", "discovery-call-prep",
    "client-interview-simulator", "outreach-tracker", "client-red-flag-checker"
  ];
  for (const tool of tools) {
    assert.match(html, new RegExp('id:"' + tool + '"'), `tool ${tool} must be in config`);
    assert.match(html, new RegExp('status:"roadmap"'), `tool ${tool} must have roadmap status`);
  }
});

test("Suggest a Tool exists and uses canonical Community URL", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /What are we missing/);
  assert.match(html, /Suggest a tool/);
  assert.match(html, /WA_COMMUNITY_URL/);
  // The canonical WhatsApp URL must be used
  assert.match(html, /https:\/\/chat\.whatsapp\.com\/H8Dn5NK3OxZC2nYlekvBDt/);
});

test("Client Finder CTA links to the existing tool", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /href:"\/academy\/tools\/client-finder"/);
});

test("Resources page structure remains valid", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  // No duplicate #resources
  const resourcesMatches = html.match(/id="resources"/g);
  assert.equal(resourcesMatches.length, 1, "exactly one #resources section");
  // No nested #home
  const homeMatches = html.match(/id="home"/g);
  assert.equal(homeMatches.length, 1, "exactly one #home section");
  // All .page sections are proper siblings (not nested)
  const pageSections = html.match(/<section id="[^"]+" class="page[^"]*">/g);
  assert.ok(pageSections.length >= 7, "all 7 pages must exist");
});

test("Test Portal vote simulation uses localStorage, not production API", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  // Preview mode must use localStorage for votes
  assert.match(html, /assistara_preview_tool_votes/);
  // The preview path must not call the production API
  assert.match(html, /if\(preview\)\{/);
  assert.match(html, /setPreviewVotes/);
  assert.match(html, /setPreviewVoted/);
});

test("vote button is a semantic button with proper ARIA", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /<button class="tool-vote-btn/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /aria-label/);
  assert.match(html, /data-vote/);
});

test("vote count displays with correct singular/plural", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /voteCountText/);
  assert.match(html, /1 vote/);
  assert.match(html, /votes/);
});

test("journey visualization renders", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /toolkit-journey/);
  assert.match(html, /FIND/);
  assert.match(html, /POSITION/);
  assert.match(html, /PITCH/);
  assert.match(html, /FOLLOW UP/);
  assert.match(html, /WIN/);
});

test("downloads section renders with In development status", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  assert.match(html, /DOWNLOADS & TEMPLATES/);
  assert.match(html, /Remote Career Roadmap/);
  assert.match(html, /CV & Profile Checklist/);
  assert.match(html, /Application & Outreach Templates/);
  assert.match(html, /Interview Preparation Workbook/);
  assert.match(html, /In development/);
});

// ==========================================================================
// Migration tests
// ==========================================================================

test("the tool votes migration keeps the table client-locked and server-writable", () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, "supabase", "migrations", "202610080002_academy_tool_votes.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.academy_tool_votes/);
  assert.match(sql, /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /tool_id text NOT NULL/);
  assert.match(sql, /UNIQUE \(user_id, tool_id\)/);

  // Whole-table + column-level revoke from the client roles.
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.academy_tool_votes\s+FROM PUBLIC, anon, authenticated;/i);
  assert.match(sql, /REVOKE SELECT \(%1\$I\), INSERT \(%1\$I\), UPDATE \(%1\$I\)/i);

  // No learner policies, no authenticated grants.
  const policies = [...sql.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(m => m[0]);
  assert.equal(policies.length, 0, "no learner policies on the votes table");
  assert.equal(/GRANT[^;]*\bTO\s+authenticated\b/i.test(sql), false, "no authenticated grants");

  // Service role is the only writer.
  const grants = [...sql.matchAll(/GRANT\s+([^;]+?)\s+ON TABLE public\.academy_tool_votes\s+TO\s+([^;]+);/gi)];
  assert.ok(grants.length >= 1, "service_role grants must exist");
  for (const [, , roles] of grants) {
    assert.equal(roles.trim().toLowerCase(), "service_role");
  }

  // Indexes for aggregate count and learner vote lookup.
  assert.match(sql, /academy_tool_votes_tool_id_idx/);
  assert.match(sql, /academy_tool_votes_user_id_idx/);

  // RLS on.
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

// ==========================================================================
// Vercel deployment tests
// ==========================================================================

test("DEPLOY: vercel.json builds and routes the tool votes API", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(v9Root, "vercel.json"), "utf8"));
  const srcs = (vercel.builds || []).map(b => b.src);
  assert.ok(srcs.includes("api/academy-tool-votes.js"), "no build entry for api/academy-tool-votes.js");
  const build = (vercel.builds || []).find(b => b.src === "api/academy-tool-votes.js");
  assert.ok(Array.isArray(build.config.includeFiles) && build.config.includeFiles.includes("api/_academy-security.js"),
    "the build must bundle _academy-security.js");
  const routes = (vercel.routes || []).map(r => r.src);
  assert.ok(routes.includes("/api/academy-tool-votes"), "no route for /api/academy-tool-votes");
});
