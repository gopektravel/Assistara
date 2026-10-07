"use strict";

// Founding Cohort Community join state QA.
// Run: node --test assistara-local-v9/api/community.test.js
//
// Proves, without a live database:
//   1. the /api/academy-community endpoint only answers a valid, sealed,
//      entitled learner session and never writes with client-held credentials;
//   2. state/confirm round-trip through the service role against the
//      learner's own user_id only;
//   3. the dashboard wires both joined / not-joined states and keeps the write
//      server-side;
//   4. the migration keeps the table server-writable and client-locked.

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
// community table is only ever touched under the service role, scoped to the
// learner's own user_id.
function setMockFetch({ entitled = true, joined = false } = {}) {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    const authorization = String((init.headers || {}).Authorization || "");
    calls.push({ url, method: init.method || "GET", bearer: authorization.replace(/^Bearer\s+/i, ""), body: init.body });
    if (url.endsWith("/auth/v1/user")) return response({ id: "auth-user-1", email: "learner@example.test" });
    if (url.includes("/auth/v1/admin/users/")) return response({ user: { id: "auth-user-1", deleted_at: null, banned_until: null } });
    if (url.endsWith("/rest/v1/rpc/academy_has_access")) return response(entitled);
    if (url.includes("/rest/v1/academy_student_community")) {
      if ((init.method || "GET") === "GET") {
        return response(joined ? [{ community_joined: true, joined_at: "2026-10-07T00:00:00.000Z" }] : []);
      }
      return response([{ user_id: "auth-user-1", community_joined: true }], 201);
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

test("GET is refused; the endpoint only speaks POST", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-community");
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
  const handler = require("./academy-community");

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
  const handler = require("./academy-community");

  const unknown = await post(handler, '{"action":"join_community"}', learnerCookie());
  assert.equal(unknown.statusCode, 400);
  assert.match(unknown.body, /Unknown action/);

  const stray = await post(handler, '{"action":"confirm","community_joined":true}', learnerCookie());
  assert.equal(stray.statusCode, 400);
  assert.match(stray.body, /Unexpected field/);

  const broken = await post(handler, "{not json", learnerCookie());
  assert.equal(broken.statusCode, 400);
});

test("state reads the persisted flag under the service role, never the anon key", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const calls = setMockFetch({ entitled: true, joined: true });
  const handler = require("./academy-community");

  const res = await post(handler, '{"action":"state"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, joined: true });

  const read = calls.find(c => c.url.includes("academy_student_community") && c.method === "GET");
  assert.ok(read, "a community read must happen");
  assert.equal(read.bearer, SERVICE_KEY, "the community read must use the service role");
  assert.ok(read.url.includes("user_id=eq.auth-user-1"), "the read must be scoped to the validated learner");
  assert.equal(calls.some(c => c.url.includes("academy_student_community") && c.method !== "GET"), false,
    "a state read must never write");
});

test("state reports not-joined when no row exists", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true, joined: false });
  const handler = require("./academy-community");
  const res = await post(handler, '{"action":"state"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, joined: false });
});

test("confirm persists an idempotent service-role upsert for the validated learner", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const calls = setMockFetch({ entitled: true, joined: false });
  const handler = require("./academy-community");

  const res = await post(handler, '{"action":"confirm"}', learnerCookie());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, joined: true });

  const write = calls.find(c => c.url.includes("academy_student_community") && c.method === "POST");
  assert.ok(write, "a community write must happen");
  assert.equal(write.bearer, SERVICE_KEY, "the write must use the service role, not client credentials");
  assert.ok(write.url.includes("on_conflict=user_id"), "confirmation must be an idempotent upsert");
  const payload = JSON.parse(write.body);
  assert.equal(payload.user_id, "auth-user-1");
  assert.equal(payload.community_joined, true);
  assert.ok(Number.isFinite(Date.parse(payload.joined_at)), "joined_at must be a valid timestamp");
});

test("confirm and state are refused when the learner is not entitled", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: false });
  const handler = require("./academy-community");
  const confirm = await post(handler, '{"action":"confirm"}', learnerCookie());
  assert.equal(confirm.statusCode, 403);
  const state = await post(handler, '{"action":"state"}', learnerCookie());
  assert.equal(state.statusCode, 403);
});

test("a cookie bound to a different user cannot read or confirm another account's flag", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true });
  const handler = require("./academy-community");
  const otherCookie = learnerCookie({ user_id: "someone-else" });
  const res = await post(handler, '{"action":"confirm"}', otherCookie);
  assert.equal(res.statusCode, 403, "the endpoint binds every action to the validated learner's own id");
});

test("the dashboard keeps the community write server-side and wires both states", () => {
  const html = fs.readFileSync(path.join(v9Root, "academy-dashboard.html"), "utf8");
  // The client may only SELECT its own row, and only for rendering the card.
  assert.match(html, /client\.from\("academy_student_community"\)\.select\("community_joined"\)/,
    "the dashboard must read its own join flag");
  assert.equal(/client\.from\(["']academy_student_community["']\)\.(insert|upsert|update|delete)/.test(html), false,
    "the dashboard must never write the community flag directly");
  // Confirmation always round-trips through the server API.
  assert.match(html, /fetch\("\/api\/academy-community",\{method:"POST"/,
    "I've joined must post to the server API");
  // The Test Student Portal drives the same UI from a local flag.
  assert.match(html, /assistara_preview_community/,
    "the preview portal must support both community states locally");
  assert.match(html, /id="communityJoinedBtn"/, "the secondary confirmation action must exist");
  assert.match(html, /id="communityNav"[^>]*hidden/, "the nav link must default to hidden until joined");
  assert.match(html, /updateCommunityUI\(\)/, "the joined/not-joined UI must be re-rendered");
});

test("the community persistence migration keeps the table client-locked and server-writable", () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, "supabase", "migrations", "202610070001_academy_student_community.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.academy_student_community/);
  assert.match(sql, /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /community_joined boolean NOT NULL DEFAULT false/);

  // Whole-table + column-level revoke from the client roles.
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.academy_student_community\s+FROM PUBLIC, anon, authenticated;/i);
  assert.match(sql, /REVOKE SELECT \(%1\$I\), INSERT \(%1\$I\), UPDATE \(%1\$I\)/i);

  // No learner policies, no authenticated grants.
  const policies = [...sql.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(m => m[0]);
  assert.equal(policies.length, 0, "no learner policies on the community table");
  assert.equal(/GRANT[^;]*\bTO\s+authenticated\b/i.test(sql), false, "no authenticated grants");

  // Service role is the only writer.
  const grants = [...sql.matchAll(/GRANT\s+([^;]+?)\s+ON TABLE public\.academy_student_community\s+TO\s+([^;]+);/gi)];
  assert.ok(grants.length >= 1, "service_role grants must exist");
  for (const [, , roles] of grants) {
    assert.equal(roles.trim().toLowerCase(), "service_role");
  }

  // Join-row consistency + RLS on.
  assert.match(sql, /ON CONFLICT|community_joined AND joined_at IS NOT NULL/);
  assert.match(sql, /NOT community_joined AND joined_at IS NULL/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("DEPLOY: vercel.json builds and routes the community API", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(v9Root, "vercel.json"), "utf8"));
  const srcs = (vercel.builds || []).map(b => b.src);
  assert.ok(srcs.includes("api/academy-community.js"), "no build entry for api/academy-community.js");
  const build = (vercel.builds || []).find(b => b.src === "api/academy-community.js");
  assert.ok(Array.isArray(build.config.includeFiles) && build.config.includeFiles.includes("api/_academy-security.js"),
    "the build must bundle _academy-security.js");
  const routes = (vercel.routes || []).map(r => r.src);
  assert.ok(routes.includes("/api/academy-community"), "no route for /api/academy-community");
});