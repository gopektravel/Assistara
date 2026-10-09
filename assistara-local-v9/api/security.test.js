"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const security = require("./_academy-security");

const COOKIE_SECRET = "local-test-cookie-secret-32-bytes-minimum";
const SERVICE_KEY = "local-test-service-role-key";

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

function setMockFetch({ entitled = false, banned = false, welcomeSeen = true } = {}) {
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return response({ id: "auth-user-1", email: "not-used-for-entitlement@example.test" });
    if (url.includes("/auth/v1/admin/users/")) {
      return response({ user: {
        id: "auth-user-1",
        deleted_at: null,
        banned_until: banned ? new Date(Date.now() + 60_000).toISOString() : null,
      } });
    }
    if (url.endsWith("/rest/v1/rpc/academy_has_access")) {
      assert.deepEqual(JSON.parse(init.body), { p_user_id: "auth-user-1" });
      return response(entitled);
    }
    if (url.includes("/rest/v1/academy_applications?auth_user_id=")) {
      return response([{
        enrollment_token: "11111111-1111-1111-1111-111111111111",
        welcome_seen_at: welcomeSeen ? "2026-10-07T12:00:00.000Z" : null,
      }]);
    }
    if (url.startsWith("https://drive.google.com/uc?export=download&id=")) {
      return new Response(Buffer.from("%PDF-1.7\nlocal fixture"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }
    if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
      return response({ access_token: "refreshed-access", refresh_token: "refreshed-refresh" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

// Stands in for the `admin-api` Edge Function, which is the only holder of the
// Admin token signing key. It confirms exactly one token, returns nothing but
// an acknowledgement, and refuses everything else the way the deployed gate
// does.
function setMockAdminApi(validToken) {
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/functions/v1/admin-api")) {
      assert.equal(JSON.parse(init.body).action, "session-check");
      const presented = String((init.headers || {}).Authorization || "").replace(/^Bearer\s+/i, "");
      return presented && presented === validToken
        ? response({ ok: true })
        : response({ ok: false, error: "Session expired" }, 401);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

function cookieValueFrom(setCookie, name) {
  const match = new RegExp(`${name}=([^;]*)`).exec(String(setCookie || ""));
  return match ? match[1] : "";
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

function productionBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function adminToken(payload = { u: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 }) {
  const encoded = productionBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = productionBase64Url(crypto.createHmac("sha256", SERVICE_KEY).update(encoded, "utf8").digest());
  return `${encoded}.${signature}`;
}

function userAccessToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "auth-user-1", exp })).toString("base64url");
  return `${header}.${payload}.local-test-signature`;
}

test("sealed cookies reject tampering and expired sessions", () => {
  const token = security.seal({ aud: "academy", exp: Date.now() + 60_000 }, COOKIE_SECRET);
  assert.equal(security.unseal(token, COOKIE_SECRET).aud, "academy");
  assert.equal(security.unseal(`${token.slice(0, -2)}xx`, COOKIE_SECRET), null);
  assert.equal(security.unseal(security.seal({ aud: "academy", exp: Date.now() - 1 }, COOKIE_SECRET), COOKIE_SECRET), null);
});

test("session exchange origin checks do not trust arbitrary Vercel subdomains", () => {
  delete process.env.ACADEMY_ALLOWED_ORIGINS;
  assert.equal(security.allowedOrigin("https://www.getassistara.com"), true);
  assert.equal(security.allowedOrigin("https://attacker.vercel.app"), false);
  process.env.ACADEMY_ALLOWED_ORIGINS = "https://assistara-preview.vercel.app";
  assert.equal(security.allowedOrigin("https://assistara-preview.vercel.app"), true);
  delete process.env.ACADEMY_ALLOWED_ORIGINS;
});

test("Admin QA token accepts only production two-part unpadded Base64URL payload.signature HMAC", () => {
  const valid = adminToken();
  const [payloadPart, signaturePart, extra] = valid.split(".");
  assert.equal(extra, undefined);
  assert.match(payloadPart, /^[A-Za-z0-9_-]+$/);
  assert.match(signaturePart, /^[A-Za-z0-9_-]+$/);
  assert.equal(payloadPart.includes("="), false);
  assert.equal(signaturePart.includes("="), false);
  assert.equal(signaturePart, productionBase64Url(crypto.createHmac("sha256", SERVICE_KEY).update(payloadPart, "utf8").digest()));
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(claims), ["u", "exp"]);
  assert.equal(claims.u, "admin");
  assert.ok(claims.exp > Date.now() && claims.exp > 1e12);
  assert.ok(security.adminTokenClaims(valid, SERVICE_KEY));

  // adminTokenClaims verifies HMAC and token format only; username policy is
  // enforced by the Edge Function that holds the signing key.
  assert.ok(security.adminTokenClaims(adminToken({ u: "learner", exp: Date.now() + 60_000 }), SERVICE_KEY));
  assert.ok(security.adminTokenClaims(adminToken({ u: "any-username", exp: Date.now() + 60_000 }), SERVICE_KEY));

  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({ u: "admin", exp: Date.now() + 60_000 })).toString("base64url");
  const jwtSignature = crypto.createHmac("sha256", SERVICE_KEY).update(`${header}.${jwtPayload}`).digest("base64url");
  assert.equal(security.adminTokenClaims(`${header}.${jwtPayload}.${jwtSignature}`, SERVICE_KEY), null, "JWT serialization is rejected");
  assert.equal(security.adminTokenClaims(adminToken({ u: "admin", exp: Date.now() - 1 }), SERVICE_KEY), null);
  assert.equal(security.adminTokenClaims(adminToken({ u: "admin", expiry: Date.now() + 60_000 }), SERVICE_KEY), null, "alternate expiry fields are rejected");
  assert.equal(security.adminTokenClaims(adminToken({ u: "admin", exp: Math.floor(Date.now() / 1000) + 60 }), SERVICE_KEY), null, "seconds-based expiry is rejected");
  assert.equal(security.adminTokenClaims(`${valid}.extra`, SERVICE_KEY), null, "extra token segments are rejected");
  const decodedPayload = Buffer.from(payloadPart, "base64").toString("utf8");
  const rawPayloadSignature = crypto.createHmac("sha256", SERVICE_KEY).update(decodedPayload).digest("base64url");
  assert.equal(security.adminTokenClaims(`${payloadPart}.${rawPayloadSignature}`, SERVICE_KEY), null, "decoded-payload signing is rejected");
  const standardPayload = Buffer.from(JSON.stringify({ u: "admin", exp: Date.now() + 60_000 }), "utf8").toString("base64");
  const standardSignature = crypto.createHmac("sha256", SERVICE_KEY).update(standardPayload, "utf8").digest("base64");
  assert.equal(security.adminTokenClaims(`${standardPayload}.${standardSignature}`, SERVICE_KEY), null, "standard Base64 is rejected");
  const hexSignature = crypto.createHmac("sha256", SERVICE_KEY).update(payloadPart, "utf8").digest("hex");
  assert.equal(security.adminTokenClaims(`${payloadPart}.${hexSignature}`, SERVICE_KEY), null, "hex signatures are rejected");
  assert.equal(security.adminTokenClaims(`${payloadPart}=.${signaturePart}`, SERVICE_KEY), null, "padded payload is rejected");
  assert.equal(security.adminTokenClaims(`${payloadPart}.${signaturePart}=`, SERVICE_KEY), null, "padded signature is rejected");
  assert.equal(security.adminTokenClaims("", SERVICE_KEY), null);
});

test("learner session is denied when the canonical database predicate is false", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: false });
  assert.equal(await security.validatedLearnerSession({ access_token: userAccessToken() }), null);
});

test("linked, active learner session is allowed only when server predicate returns true", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true });
  const session = await security.validatedLearnerSession({ access_token: userAccessToken() });
  assert.equal(session.user_id, "auth-user-1");
});

test("banned Auth users are denied even if the enrollment predicate returns true", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true, banned: true });
  assert.equal(await security.validatedLearnerSession({ access_token: userAccessToken() }), null);
});

test("canonical enrollment predicate denies every incomplete, mismatched, and duplicate fixture", () => {
  const userId = "auth-user-1";
  const entitled = {
    auth_user_id: userId,
    status: "onboarded",
    payment_status: "paid",
    onboarding_completed_at: "2026-09-27T10:00:00Z",
    suspended_at: null,
  };
  const predicate = rows => {
    const linked = rows.filter(row => row.auth_user_id === userId);
    return linked.length === 1
      && linked[0].status === "onboarded"
      && linked[0].payment_status === "paid"
      && !!linked[0].onboarding_completed_at
      && linked[0].suspended_at == null;
  };

  assert.equal(predicate([entitled]), true, "fully onboarded paid binding is allowed");
  assert.equal(predicate([]), false, "missing application is denied");
  assert.equal(predicate([{ ...entitled, auth_user_id: null, email: "not-used@example.test" }]), false, "email-only match is denied");
  assert.equal(predicate([{ ...entitled, auth_user_id: null, user_metadata: { role: "academy_student" } }]), false, "metadata-only match is denied");
  for (const status of ["new", "reviewing", "accepted", "waitlisted", "rejected", "declined", "archived"]) {
    assert.equal(predicate([{ ...entitled, status }]), false, `${status} is denied`);
  }
  for (const payment_status of ["not_requested", "pending", "failed", "refunded"]) {
    assert.equal(predicate([{ ...entitled, payment_status }]), false, `${payment_status} is denied`);
  }
  assert.equal(predicate([{ ...entitled, onboarding_completed_at: null }]), false, "incomplete onboarding is denied");
  assert.equal(predicate([{ ...entitled, suspended_at: "2026-09-27T10:00:00Z" }]), false, "suspended is denied");
  assert.equal(predicate([entitled, { ...entitled }]), false, "duplicate bindings are denied");
});

test("expired access is denied without server-side refresh-token rotation", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  global.fetch = async () => { throw new Error("expired access must be rejected before fetch"); };
  const expired = userAccessToken(Math.floor(Date.now() / 1000) - 10);
  assert.equal(await security.validatedLearnerSession({ access_token: expired }), null);
});

test("direct learner dashboard request returns no protected HTML without a cookie", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-content");
  const res = mockResponse();
  await handler({ method: "GET", url: "/api/academy-content?audience=learner", headers: {}, query: { audience: "learner" } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/login");
  assert.equal(res.body, "");
  assert.match(res.headers["Cache-Control"], /no-store/);
});

test("authorized learner gate serves the existing dashboard HTML and protects slide assets", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true });
  const handler = require("./academy-content");
  const value = security.seal({ aud: "academy", access_token: userAccessToken(), exp: Date.now() + 60_000 }, COOKIE_SECRET);
  const req = { method: "GET", url: "/api/academy-content?audience=learner", headers: { cookie: `assistara_academy=${value}` }, query: { audience: "learner" } };
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /text\/html/);
  assert.match(res.body, /Assistara Academy/);

  req.query.asset = "p2m2c1-brand-strategy.pdf";
  req.url += "&asset=p2m2c1-brand-strategy.pdf";
  const pdfRes = mockResponse();
  await handler(req, pdfRes);
  assert.equal(pdfRes.statusCode, 200);
  assert.equal(pdfRes.headers["Content-Type"], "application/pdf");
  assert.ok(pdfRes.body.startsWith("%PDF"));

  req.query.asset = "";
  req.query.drive = "1VerifiedDriveFileId";
  const driveRes = mockResponse();
  await handler(req, driveRes);
  assert.equal(driveRes.statusCode, 200);
  assert.equal(driveRes.headers["Content-Type"], "application/pdf");
  assert.ok(driveRes.body.startsWith("%PDF"));

  req.query.asset = "../academy-dashboard.html";
  req.query.drive = "";
  req.url += "&asset=..%2Facademy-dashboard.html";
  const assetRes = mockResponse();
  await handler(req, assetRes);
  assert.equal(assetRes.statusCode, 404);
  assert.equal(assetRes.body, "");
});

test("authenticated learner with unseen welcome is redirected once without exposing the token", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true, welcomeSeen: false });
  const handler = require("./academy-content");
  const value = security.seal({ aud: "academy", access_token: userAccessToken(), exp: Date.now() + 60_000 }, COOKIE_SECRET);
  const headers = { cookie: `assistara_academy=${value}` };

  const dashboard = mockResponse();
  await handler({ method: "GET", url: "?audience=learner", headers, query: { audience: "learner" } }, dashboard);
  assert.equal(dashboard.statusCode, 302);
  assert.equal(dashboard.headers.Location, "/academy/welcome");
  assert.doesNotMatch(dashboard.headers.Location, /token=/);

  const welcome = mockResponse();
  await handler({ method: "GET", url: "?audience=welcome", headers, query: { audience: "welcome" } }, welcome);
  assert.equal(welcome.statusCode, 200);
  assert.match(welcome.body, /Welcome to Assistara Academy/);
  assert.match(welcome.body, /const token = "11111111-1111-1111-1111-111111111111";/);
});

test("authenticated learner who has seen welcome skips it on later login", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  setMockFetch({ entitled: true, welcomeSeen: true });
  const handler = require("./academy-content");
  const value = security.seal({ aud: "academy", access_token: userAccessToken(), exp: Date.now() + 60_000 }, COOKIE_SECRET);
  const res = mockResponse();
  await handler({ method: "GET", url: "?audience=welcome", headers: { cookie: `assistara_academy=${value}` }, query: { audience: "welcome" } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/academy/dashboard");
});

test("Test Portal requires a valid Admin QA cookie and never learner entitlement", async t => {
  configEnv();
  const previous = global.fetch;
  global.fetch = async () => { throw new Error("Test Portal must not call learner entitlement"); };
  t.after(() => { global.fetch = previous; });
  const handler = require("./academy-content");
  const cookie = security.seal({ aud: "academy-test-portal", exp: Date.now() + 60_000 }, COOKIE_SECRET);
  const okRes = mockResponse();
  await handler({ method: "GET", url: "?audience=qa", headers: { cookie: `assistara_qa=${cookie}` }, query: { audience: "qa" } }, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.match(okRes.body, /Assistara Academy/);

  const noRes = mockResponse();
  await handler({ method: "GET", url: "?audience=qa", headers: {}, query: { audience: "qa" } }, noRes);
  assert.equal(noRes.statusCode, 302);
  assert.equal(noRes.headers.Location, "/admin");
  assert.equal(noRes.body, "");
});

test("session exchange denies arbitrary Auth users and issues a hardened cookie only on access", async t => {
  configEnv();
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  const handler = require("./academy-session");
  setMockFetch({ entitled: false });
  const denied = mockResponse();
  await handler({ method: "POST", headers: { origin: "http://localhost:3000" }, body: { action: "exchange", access_token: userAccessToken(), user_id: "client-supplied-eligible-id" } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.match(denied.headers["Set-Cookie"], /Max-Age=0/);

  setMockFetch({ entitled: true });
  const allowed = mockResponse();
  const accessToken = userAccessToken();
  await handler({ method: "POST", headers: { origin: "http://localhost:3000" }, body: { action: "exchange", access_token: accessToken } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.match(allowed.headers["Set-Cookie"], /Secure/);
  assert.match(allowed.headers["Set-Cookie"], /HttpOnly/);
  assert.match(allowed.headers["Set-Cookie"], /SameSite=Lax/);
  assert.match(allowed.headers["Set-Cookie"], /Max-Age=1800/);
  assert.equal(allowed.headers["Set-Cookie"].includes(accessToken), false);
});

test("Admin-token exchange creates a separate short-lived QA cookie", async t => {
  configEnv();
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  const valid = adminToken();
  setMockAdminApi(valid);
  const handler = require("./test-portal-session");
  const ok = mockResponse();
  await handler({
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: { action: "exchange", token: valid },
  }, ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers["Set-Cookie"], /assistara_qa=/);
  assert.match(ok.headers["Set-Cookie"], /HttpOnly/);
  assert.match(ok.headers["Set-Cookie"], /Max-Age=(5[0-9]|60)/);
  assert.equal(ok.headers["Set-Cookie"].includes(valid), false, "the QA cookie must not carry the Admin token");

  const invalid = mockResponse();
  await handler({
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: { action: "exchange", token: adminToken({ u: "admin", exp: Date.now() - 1 }) },
  }, invalid);
  assert.equal(invalid.statusCode, 403);
  assert.match(invalid.headers["Set-Cookie"], /Max-Age=0/);
});

// Regression: the Test Portal used to be gated by re-deriving the Admin
// token's HMAC signature on the Vercel side, using a second copy of the
// service-role key. The two copies are configured independently, so a
// perfectly valid Admin token was rejected and the portal never opened. The
// token is now confirmed by the Admin API that actually signs it, and the QA
// session is sealed with the server-only cookie secret.
test("the QA gate authorizes from its own sealed session, never from a second copy of the Admin signing key", () => {
  const edge = fs.readFileSync(path.join(__dirname, "../../supabase/functions/admin-api/index.ts"), "utf8");
  const verifyIdx = edge.indexOf("if(!await verifyToken(auth))");
  const sessionCheckIdx = edge.indexOf('if(action==="session-check")');
  const clientIdx = edge.indexOf("createClient(SUPABASE_URL,SERVICE_KEY");
  assert.ok(verifyIdx >= 0 && sessionCheckIdx > verifyIdx, "session-check must sit behind verifyToken()");
  assert.ok(clientIdx > sessionCheckIdx, "session-check must answer before any database client exists");
  assert.match(edge.slice(sessionCheckIdx, clientIdx), /\{ok:true\}/, "session-check must return nothing");
  assert.doesNotMatch(edge.slice(sessionCheckIdx, clientIdx), /db\.|academy_applications|admin_notes/);

  // The three functions that serve the Test Portal must not re-derive the Admin
  // HMAC signature here. That is what silently failed when the two configured
  // copies of the signing key drifted apart.
  for (const name of ["test-portal-session.js", "academy-content.js", "academy-quick-check.js"]) {
    const source = fs.readFileSync(path.join(__dirname, name), "utf8");
    assert.doesNotMatch(source, /adminTokenClaims/, `${name} must not verify the Admin token locally`);
    assert.doesNotMatch(source, /token: saved\.token|token: body\.token/, `${name} must not store an Admin token in the QA cookie`);
  }
  const exchange = fs.readFileSync(path.join(__dirname, "test-portal-session.js"), "utf8");
  assert.match(exchange, /await adminTokenAuthorized\(body\.token, cfg\)/);
  assert.ok(
    exchange.indexOf("adminTokenAuthorized(body.token, cfg)") < exchange.indexOf("issueCookie(res, QA_COOKIE"),
    "the QA cookie may only be minted after the Admin API has confirmed the token"
  );
});

test("regression: a valid Admin token opens the Test Portal and no weaker authorization does", async t => {
  configEnv();
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });

  const valid = adminToken();
  setMockAdminApi(valid);
  const exchange = require("./test-portal-session");
  const content = require("./academy-content");

  // 1. A valid Admin token opens the Academy as the test learner.
  const opened = mockResponse();
  await exchange({ method: "POST", headers: { origin: "https://getassistara.com" }, body: { action: "exchange", token: valid } }, opened);
  assert.equal(opened.statusCode, 200);
  const qaCookie = cookieValueFrom(opened.headers["Set-Cookie"], "assistara_qa");
  assert.ok(qaCookie, "no QA cookie was issued");
  assert.ok(qaCookie.length > 0);
  assert.equal(security.unseal(qaCookie, COOKIE_SECRET).aud, "academy-test-portal");
  assert.equal(security.unseal(qaCookie, COOKIE_SECRET).token, undefined, "the QA session must not embed the Admin token");

  // The dashboard is then served with no further call to the Admin API.
  global.fetch = async () => { throw new Error("an open Test Portal must not re-verify the Admin token"); };
  const dashboard = mockResponse();
  await content({ method: "GET", url: "?audience=qa", headers: { cookie: `assistara_qa=${qaCookie}` }, query: { audience: "qa" } }, dashboard);
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /Assistara Academy/);

  // 2, 3, 4. Missing, malformed, expired, wrongly signed and learner
  // credentials are all refused, and the refused exchange clears the cookie.
  setMockAdminApi(valid);
  const learnerAccessToken = userAccessToken();
  // The shape of a real Admin token, signed with a key the Admin API does not
  // use: exactly what a stale copy of the signing key used to produce.
  const foreignKeyPayload = productionBase64Url(Buffer.from(JSON.stringify({ u: "admin", exp: Date.now() + 60_000 }), "utf8"));
  const foreignKeyToken = `${foreignKeyPayload}.${productionBase64Url(crypto.createHmac("sha256", "some-other-service-role-key").update(foreignKeyPayload, "utf8").digest())}`;
  const refused = {
    "no token at all": undefined,
    "an empty token": "",
    "a learner Supabase access token": learnerAccessToken,
    "a learner-claimed Admin token": adminToken({ u: "learner", exp: Date.now() + 60_000 }),
    "an expired Admin token": adminToken({ u: "admin", exp: Date.now() - 1 }),
    "an Admin token signed with another key": foreignKeyToken,
    "an object instead of a token": { token: "nope" },
  };
  for (const [label, token] of Object.entries(refused)) {
    const res = mockResponse();
    await exchange({ method: "POST", headers: { origin: "https://getassistara.com" }, body: { action: "exchange", token } }, res);
    assert.equal(res.statusCode, 403, `${label} must be refused`);
    assert.equal(res.body.includes("Valid Admin authorization is required"), true);
    assert.match(res.headers["Set-Cookie"], /assistara_qa=.*Max-Age=0/, `${label} must not leave a QA cookie`);
  }

  // A learner cannot reach the Test Portal by replaying their own session, and
  // a QA cookie that was not sealed by this deployment is refused.
  global.fetch = async () => { throw new Error("the QA audience must never touch learner entitlement"); };
  const learnerCookie = security.seal({ aud: "academy", access_token: learnerAccessToken, user_id: "auth-user-1", exp: Date.now() + 60_000 }, COOKIE_SECRET);
  const asQa = mockResponse();
  await content({ method: "GET", url: "?audience=qa", headers: { cookie: `assistara_academy=${learnerCookie}` }, query: { audience: "qa" } }, asQa);
  assert.equal(asQa.statusCode, 302);
  assert.equal(asQa.headers.Location, "/admin");

  const forged = mockResponse();
  await content({
    method: "GET",
    url: "?audience=qa",
    headers: { cookie: `assistara_qa=${security.seal({ aud: "academy-test-portal", exp: Date.now() + 60_000 }, "a-different-secret-that-is-long-enough-32")}` },
    query: { audience: "qa" },
  }, forged);
  assert.equal(forged.statusCode, 302);
  assert.equal(forged.headers.Location, "/admin");

  const wrongAudience = mockResponse();
  await content({
    method: "GET",
    url: "?audience=qa",
    headers: { cookie: `assistara_qa=${security.seal({ aud: "academy", exp: Date.now() + 60_000 }, COOKIE_SECRET)}` },
    query: { audience: "qa" },
  }, wrongAudience);
  assert.equal(wrongAudience.statusCode, 302);
  assert.equal(wrongAudience.headers.Location, "/admin");

  const expired = mockResponse();
  await content({
    method: "GET",
    url: "?audience=qa",
    headers: { cookie: `assistara_qa=${security.seal({ aud: "academy-test-portal", exp: Date.now() - 1 }, COOKIE_SECRET)}` },
    query: { audience: "qa" },
  }, expired);
  assert.equal(expired.statusCode, 302);
  assert.equal(expired.headers.Location, "/admin");
});

test("logout clears both server cookie scopes", async () => {
  const learner = mockResponse();
  await require("./academy-session")({
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: { action: "logout" },
  }, learner);
  assert.equal(learner.statusCode, 200);
  assert.match(learner.headers["Set-Cookie"], /assistara_academy=.*Max-Age=0/);

  const qa = mockResponse();
  await require("./test-portal-session")({
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: { action: "logout" },
  }, qa);
  assert.equal(qa.statusCode, 200);
  assert.match(qa.headers["Set-Cookie"], /assistara_qa=.*Max-Age=0/);
});

test("migration encodes exact binding, status, payment, onboarding, suspension and exam-write restrictions", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/202609270001_academy_access_and_exam_write_lockdown.sql"), "utf8");
  for (const required of [
    "count(*) = 1",
    "a.auth_user_id = p_user_id",
    "a.status = 'onboarded'",
    "a.payment_status = 'paid'",
    "a.onboarding_completed_at IS NOT NULL",
    "a.suspended_at IS NULL",
    "REVOKE INSERT, UPDATE, DELETE",
    "DROP POLICY IF EXISTS students_insert_own_exam_attempts",
    "ON public.academy_exam_attempts",
    "GRANT INSERT ON TABLE public.academy_exam_attempts TO service_role",
  ]) assert.ok(migration.includes(required), `migration missing ${required}`);
  const droppedPolicies = [...migration.matchAll(/DROP POLICY IF EXISTS\s+([a-z_]+)/gi)].map(match => match[1]);
  assert.deepEqual(droppedPolicies, ["students_insert_own_exam_attempts"]);
  assert.doesNotMatch(migration, /students_read_own_exam_attempts/i);
  assert.match(migration, /REVOKE INSERT \(%I\).*FROM PUBLIC, anon, authenticated/s);
  assert.match(migration, /REVOKE UPDATE \(%I\).*FROM PUBLIC, anon, authenticated/s);
  assert.doesNotMatch(migration, /(?:masterclass_signups|webinar_events|acquisition|contacts|\bb2b\b|stripe|gcash)/i);
  assert.doesNotMatch(migration, /CREATE\s+(UNIQUE\s+)?INDEX/i);
  assert.doesNotMatch(migration, /CREATE\s+TABLE\s+public\.academy_exam_attempts/i);
});

test("versioned academy-login checks the Auth user and entitlement before returning tokens", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../supabase/functions/academy-login/index.ts"), "utf8");
  const authCheck = source.indexOf("getUserById(data.user.id)");
  const entitlementCheck = source.indexOf('"academy_has_access"');
  const tokenReturn = source.indexOf("access_token: data.session.access_token");
  assert.ok(authCheck >= 0 && entitlementCheck > authCheck && tokenReturn > entitlementCheck);
  assert.match(source, /p_user_id:\s*data\.user\.id/);
  assert.doesNotMatch(source, /user_metadata/);
});

test("dashboard lesson-slide preview no longer sends users directly to Google Drive", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "../academy-dashboard.html"), "utf8");
  assert.doesNotMatch(dashboard, /drive\.google\.com\/(?:file\/d|uc\?export=download)/);
  assert.match(dashboard, /\/academy\/slides\/drive\//);
});

test("every local slide the dashboard requests exists for the gate to serve", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "../academy-dashboard.html"), "utf8");
  const referenced = [...new Set([...dashboard.matchAll(/slidesFileId:"(\/academy\/slides\/[^"]+)"/g)].map(match => match[1]))];
  assert.ok(referenced.length > 0, "no local lesson slides found in the dashboard");
  for (const slidePath of referenced) {
    const name = path.posix.basename(slidePath);
    assert.match(name, /^[a-zA-Z0-9._-]+\.pdf$/, `unsafe slide filename ${name}`);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "academy", "slides", name)), `missing bundled slide ${name}`);
  }
});

test("Vercel routes never serve the learner dashboard as an unguarded static build", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
  assert.equal((config.builds || []).some(build => build.src === "academy-dashboard.html" && build.use === "@vercel/static"), false);
  const routes = config.routes || [];
  for (const src of ["/academy/dashboard", "/academy/dashboard/", "/academy-dashboard.html", "/academy/test-portal", "/academy/test-portal/"]) {
    assert.ok(routes.some(route => route.src === src && route.dest.includes("/api/academy-content")), `missing protected route ${src}`);
  }
  assert.ok(routes.some(route => route.src.includes("/academy/slides/") && route.dest.includes("audience=learner")));
  assert.ok(routes.some(route => route.src.includes("/academy/slides/drive/") && route.dest.includes("drive=$driveId")));
});

test("Vercel builds deploy the gate functions and never publish protected Academy files", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
  const builds = config.builds || [];
  const byBuilder = use => builds.filter(build => build.use === use);

  const nodeBuilds = byBuilder("@vercel/node").map(build => build.src);
  for (const required of ["api/academy-content.js", "api/academy-session.js", "api/test-portal-session.js"]) {
    assert.ok(nodeBuilds.includes(required), `missing serverless function build ${required}`);
  }
  for (const build of byBuilder("@vercel/node")) {
    assert.ok(
      (build.config?.includeFiles || []).includes("api/_academy-security.js"),
      `${build.src} must bundle the shared gate module explicitly`
    );
  }
  assert.ok(
    builds.find(build => build.src === "api/academy-content.js")
      .config.includeFiles.includes("academy-dashboard.html")
  );

  const published = builds.filter(build => build.use === "@vercel/static").map(build => build.src);
  for (const protectedPath of ["academy-dashboard.html", "academy-beta-account.html", "payment-review.html"]) {
    assert.equal(published.includes(protectedPath), false, `${protectedPath} must not be a static build`);
  }
  assert.equal(
    published.some(src => src.startsWith("academy/slides/")),
    false,
    "no lesson PDF may be published as a static build; slides are served only through the gate"
  );

  // No route may hand a protected path back to the static filesystem.
  const routes = config.routes || [];
  for (const route of routes) {
    if (typeof route.src !== "string" || typeof route.dest !== "string") continue;
    const exposesDashboard = /\/(academy-dashboard\.html|academy\/dashboard)/.test(route.dest);
    const exposesPdf = /\/academy\/slides\/[^?]*\.pdf$/.test(route.dest);
    const exposesHelper = /_academy-security/.test(route.dest);
    assert.equal(exposesDashboard || exposesPdf || exposesHelper, false, `route leaks protected content: ${route.src} -> ${route.dest}`);
  }

  // The first matching slide route must be the authenticated gate.
  const slideRoutes = routes.map((route, index) => ({ route, index })).filter(entry => /^\/academy\/slides\//.test(entry.route.src || ""));
  assert.ok(slideRoutes.length >= 2);
  for (const entry of slideRoutes) {
    assert.match(entry.route.dest, /\/api\/academy-content\.js\?audience=learner/);
  }
});
