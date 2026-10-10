"use strict";

// masterclass-identity.test.js — verified attendee identity resolution.
//
// The personal livestream link is /live?t=<token>. This function maps that
// token to the attendee's verified registered FIRST name (never a surname,
// full name, or email) so the live chat can auto-identify them. It only ever
// reports success for a token that matches an existing masterclass_signups row.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const site = path.join(root, "assistara-local-v9");
const fnPath = path.join(site, "api", "masterclass-identity.js");

function loadHandler(env = {}) {
  delete require.cache[require.resolve(fnPath)];
  process.env.SUPABASE_URL = env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "service-key";
  process.env.ACADEMY_COOKIE_SECRET = env.ACADEMY_COOKIE_SECRET || "test-cookie-secret-with-32-plus-characters";
  return require(fnPath);
}

const H = loadHandler();

function mockReq({ method = "GET", url = "/", headers = {}, body } = {}) {
  return { method, url, headers, body: body === undefined ? "" : body };
}

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    payload: "",
    setHeader(k, v) { headers[k] = v; },
    end(payload) { this.payload = payload === undefined ? "" : String(payload); },
    json() { try { return JSON.parse(this.payload); } catch { return null; } },
  };
}

// Returns a fetch mock that answers the masterclass_signups lookup with `row`.
function mockFetch(row) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/rest/v1/masterclass_events")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (String(url).includes("/rest/v1/masterclass_signups")) {
      return { ok: true, status: 200, json: async () => (row ? [row] : []) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test("resolves a valid token to the registered FIRST name only", async () => {
  const { fetchImpl } = mockFetch({ name: "Maria Santos" });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ url: "/api/masterclass-identity?token=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.identified, true);
  assert.equal(body.name, "Maria"); // surname never returned
});

test("returns identified:false for an invalid token format without hitting the DB", async () => {
  const { fetchImpl, calls } = mockFetch({ name: "Maria" });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ url: "/api/masterclass-identity?token=not-a-valid-token" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().identified, false);
  assert.equal(calls.length, 0); // no database work for a malformed token
});

test("returns identified:false when no signup matches the token", async () => {
  const { fetchImpl } = mockFetch(null);
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ url: "/api/masterclass-identity?token=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().identified, false);
});

test("returns identified:false for an empty token", async () => {
  const { fetchImpl } = mockFetch({ name: "Maria" });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ url: "/api/masterclass-identity?token=" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().identified, false);
});

test("accepts the token via a JSON POST body", async () => {
  const { fetchImpl } = mockFetch({ name: "James" });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-identity",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().name, "James");
});

test("OPTIONS preflight succeeds and unknown methods are rejected", async () => {
  const { fetchImpl } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ method: "OPTIONS", headers: { origin: "https://www.getassistara.com" } }), res);
  assert.equal(res.statusCode, 204);
  const res2 = mockRes();
  await H(mockReq({ method: "PUT" }), res2);
  assert.equal(res2.statusCode, 405);
});

test("vercel serves the identity function and keeps it behind the shared security module", () => {
  const fs = require("node:fs");
  const vercel = JSON.parse(fs.readFileSync(path.join(site, "vercel.json"), "utf8"));
  const build = (vercel.builds || []).find((b) => b.src === "api/masterclass-identity.js");
  assert.ok(build, "identity function must be a declared build");
  assert.ok((build.config.includeFiles || []).includes("api/_academy-security.js"));
  const route = (vercel.routes || []).find((r) => r.src === "/api/masterclass-identity");
  assert.equal(route && route.dest, "/api/masterclass-identity.js");
  const src = fs.readFileSync(fnPath, "utf8");
  assert.match(src, /masterclass_signups\?attendee_token=eq/);
  assert.ok(src.includes("name.split(") && src.includes("[0]"), "must extract the first name");
  assert.doesNotMatch(src, /select=.*email/); // never selects email
});
