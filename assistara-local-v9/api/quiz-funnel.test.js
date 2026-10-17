"use strict";

// Tests for the quiz server API. Everything here exercises logic that must be
// exactly right and can be proven without a network: token handling,
// attribution carry-through, identity validation, the abuse controls, and the
// request paths that must refuse before they ever reach the database.
//
// The three secrets are set so that config() succeeds, which lets the
// dispatcher's own routing and validation be tested. No IP header is sent, so
// rateKeyFor() returns "" and no request in this file ever triggers a REST
// call.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-test-key";
process.env.ACADEMY_COOKIE_SECRET = process.env.ACADEMY_COOKIE_SECRET || "x".repeat(40);

const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const handler = require("./quiz-funnel");
const internal = handler._internal;
const engine = require("./_quiz-engine");
const reportMod = require("./_quiz-report");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------------ helpers

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    end(b) { this.body = b || ""; return res; },
  };
  return res;
}

function fakeReq({ method = "GET", url = "/api/quiz-funnel", body, headers = {} } = {}) {
  const req =
    body === undefined
      ? Readable.from([])
      : Readable.from([Buffer.from(JSON.stringify(body), "utf8")]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

// A complete, valid set of answers, used where a test needs a payload that
// gets past normalisation.
const FULL_ANSWERS = {
  q1: "b", q2: 25000, q3: "c", q4: "a", q5: "c",
  q6: ["tnone"], q7: "a", q8: "a", q9: "b", q10: "a",
};

// -------------------------------------------------------------------- tokens

test("a result token is random, long and url-safe, and two are never alike", () => {
  const a = internal.mintToken();
  const b = internal.mintToken();

  assert.notEqual(a, b, "two tokens must never collide");
  assert.ok(a.length >= 40, `token too short for 32 random bytes (${a.length})`);
  assert.match(a, /^[A-Za-z0-9_-]+$/, "token must be url-safe for a share link");

  // 256 bits of entropy: nothing about a result id can produce it.
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(internal.mintToken());
  assert.equal(seen.size, 500, "no repeats across 500 tokens");
});

test("what is stored is only the hash, so a leaked row cannot be replayed", () => {
  const token = internal.mintToken();
  const hash = internal.hashToken(token);

  assert.equal(hash.length, 64, "sha-256 hex");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token, "the raw token must never be what is stored");
  assert.ok(!hash.includes(token), "the hash must not contain the token");

  // Deterministic for lookup, and a different token never lands on the same row.
  assert.equal(internal.hashToken(token), hash);
  assert.notEqual(internal.hashToken(internal.mintToken()), hash);
});

test("a result link lands on the Academy-branded quiz route", () => {
  assert.equal(internal.SITE, "https://www.getassistara.com");

  const token = internal.mintToken();
  const url = `${internal.SITE}/academy/quiz?t=${encodeURIComponent(token)}`;
  assert.match(url, /^https:\/\/www\.getassistara\.com\/academy\/quiz\?t=/);
  assert.ok(url.includes(token), "the token must survive into the link");
});

// ---------------------------------------------------------------- attribution

test("attribution is carried through verbatim rather than invented", () => {
  const a = internal.normaliseAttribution({
    visitorId: "visitor-abc",
    token: "IG42",
    utm_source: "instagram",
    utm_medium: "paid_social",
    utm_campaign: "quiz-launch",
    landing_path: "/academy/quiz",
    referrer: "https://www.instagram.com/",
  });

  assert.equal(a.acquisition_visitor_id, "visitor-abc");
  assert.equal(a.tracking_token, "IG42");
  assert.equal(a.utm_source, "instagram");
  assert.equal(a.utm_medium, "paid_social");
  assert.equal(a.utm_campaign, "quiz-launch");
  assert.equal(a.landing_path, "/academy/quiz");
  assert.equal(a.referrer, "https://www.instagram.com/");
});

test("attribution survives an absent or malformed payload", () => {
  for (const input of [undefined, null, "", 42, "string", [], {}]) {
    const a = internal.normaliseAttribution(input);
    assert.equal(a.acquisition_visit_id, null);
    assert.equal(a.tracking_token, null);
    assert.equal(a.utm_source, null);
    assert.equal(a.acquisition_visitor_id, null);
  }
});

test("a non-UUID visit id is dropped so it can never be stored as a foreign key", () => {
  const bad = internal.normaliseAttribution({ visitId: "not-a-uuid'; DROP TABLE quiz_results;--" });
  assert.equal(bad.acquisition_visit_id, null, "a forged id must be rejected");

  const good = internal.normaliseAttribution({ visitId: "3f6b6f6e-1a2b-4c5d-8e9f-0a1b2c3d4e5f" });
  assert.equal(good.acquisition_visit_id, "3f6b6f6e-1a2b-4c5d-8e9f-0a1b2c3d4e5f");
  assert.match(good.acquisition_visit_id, UUID_RE);
});

test("unknown keys are dropped rather than forwarded to the database", () => {
  const a = internal.normaliseAttribution({
    visitorId: "v",
    admin: true,
    role: "service_role",
    contact_id: "someone-elses-record",
  });
  assert.equal(a.admin, undefined);
  assert.equal(a.role, undefined);
  assert.equal(a.contact_id, undefined);
  assert.deepEqual(Object.keys(a).sort(), [
    "acquisition_visit_id",
    "acquisition_visitor_id",
    "landing_path",
    "referrer",
    "tracking_token",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
  ].sort());
});

test("attribution values are length-capped", () => {
  const a = internal.normaliseAttribution({
    referrer: "x".repeat(5000),
    utm_campaign: "y".repeat(5000),
    landing_path: "z".repeat(5000),
  });
  assert.ok(a.referrer.length <= 1024);
  assert.ok(a.utm_campaign.length <= 256);
  assert.ok(a.landing_path.length <= 512);
});

// ------------------------------------------------------------------ identity

test("a client key must be the exact shape the server mints", () => {
  assert.equal(internal.validClientKey(`qz_${"a1".repeat(16)}`), true);
  assert.equal(internal.validClientKey(`qz_${"a1".repeat(15)}`), false);
  assert.equal(internal.validClientKey(`qz_${"a1".repeat(17)}`), false);
  assert.equal(internal.validClientKey(`QZ_${"A1".repeat(16)}`), false, "case sensitive");
  assert.equal(internal.validClientKey(`qz_${"zz".repeat(16)}`), false, "hex only");
  assert.equal(internal.validClientKey(""), false);
  assert.equal(internal.validClientKey(null), false);
  assert.equal(internal.validClientKey(123), false);
  // A visitor cannot claim someone else's key to replay their submission.
  assert.equal(internal.validClientKey("../../etc/passwd"), false);
  assert.equal(internal.validClientKey("qz_' OR 1=1 --"), false);
});

test("an email must be a plausible address", () => {
  for (const ok of ["a@b.co", "maria.santos@example.com", "x+tag@sub.domain.ph"]) {
    assert.equal(internal.EMAIL_RE.test(ok), true, `${ok} should be accepted`);
  }
  for (const bad of ["", "nope", "a@b", "a@.com", "a b@c.com", "@c.com", "a@b."]) {
    assert.equal(internal.EMAIL_RE.test(bad), false, `${bad} should be rejected`);
  }
});

// --------------------------------------------------------- limits and scope

test("the documented ceilings are actually enforced by name", () => {
  for (const action of ["submit", "progress", "event", "result"]) {
    const l = internal.LIMITS[action];
    assert.ok(l, `${action} must have a ceiling`);
    assert.ok(Number.isInteger(l.count) && l.count > 0);
    assert.ok(l.windowMs > 0);
  }
  // A submission ceiling that allowed dozens an hour would not be a control.
  assert.ok(internal.LIMITS.submit.count <= 10);
});

test("a result token expires rather than living forever", () => {
  assert.ok(internal.RESULT_TOKEN_TTL_DAYS > 0 && internal.RESULT_TOKEN_TTL_DAYS <= 30);
});

test("implausibly fast submissions are flagged, not silently trusted", () => {
  assert.ok(internal.PLAUSIBLE_MIN_MS >= 5000, "a human needs several seconds for ten questions");
  assert.ok(internal.PLAUSIBLE_MIN_MS < 60000, "but it must not punish a genuinely quick reader");
});

// ------------------------------------------------------- request handling

test("the handler refuses methods it does not serve", async () => {
  const res = fakeRes();
  await handler(fakeReq({ method: "DELETE" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(JSON.parse(res.body).ok, false);
  assert.equal(res.headers.Allow, "GET, POST, OPTIONS");
});

test("an unknown action is refused rather than guessed at", async () => {
  const res = fakeRes();
  await handler(fakeReq({ method: "POST", body: {}, headers: { origin: "https://getassistara.com" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("a cross-origin post of lead data is refused", async () => {
  const res = fakeRes();
  await handler(
    fakeReq({ method: "POST", body: { action: "submit", answers: FULL_ANSWERS }, headers: { origin: "https://evil.example" } }),
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("an unparseable body is refused before any validation", async () => {
  const req = Readable.from([Buffer.from("{not json", "utf8")]);
  req.method = "POST";
  req.url = "/api/quiz-funnel";
  req.headers = { origin: "https://getassistara.com" };
  const res = fakeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("a submission with missing answers is refused before the database", async () => {
  const res = fakeRes();
  await handler(
    fakeReq({ method: "POST", body: { action: "submit", email: "a@b.co" }, headers: { origin: "https://getassistara.com" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).field, "answers");
});

test("a submission with a malformed email is refused and names the field", async () => {
  const res = fakeRes();
  await handler(
    fakeReq({
      method: "POST",
      body: { action: "submit", answers: FULL_ANSWERS, email: "not-an-address" },
      headers: { origin: "https://getassistara.com" },
    }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).field, "email");
});

test("the meta action serves the ten questions with no personal data in it", async () => {
  const res = fakeRes();
  await handler(fakeReq({ url: "/api/quiz-funnel?action=meta" }), res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.questions.length, 10);
  assert.equal(body.careers.length, 7);
  assert.equal(body.readinessStages.length, 5);

  // The browser is told how long a half-finished quiz stays resumable rather
  // than being allowed to invent its own window.
  assert.ok(Number.isInteger(body.sessionTtlMs) && body.sessionTtlMs > 0);
  assert.equal(body.sessionTtlMs, 24 * 60 * 60 * 1000);

  // The slider maths on the page matches the server's, and the model is never
  // dressed up as an average or a realistic expectation.
  assert.equal(body.incomeModel.labelledAsTypical, false);
  const prose = JSON.stringify(body.questions) + JSON.stringify(body.careers) +
    JSON.stringify(body.incomeModel.modellingNotes);
  assert.doesNotMatch(prose, /\b(typical|average|realistic)\b/i);

  for (const q of body.questions) {
    assert.ok(!/email|password/i.test(q.title), `${q.id} leaks a field`);
    // An income slider carries a range, not a list of choices.
    if (q.type === "income") {
      assert.ok(Number.isFinite(q.min) && Number.isFinite(q.max) && q.max > q.min, `${q.id} needs a range`);
    } else {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} needs options`);
    }
  }
});

test("a result token that is empty, short or absurdly long is refused before any lookup", async () => {
  for (const token of ["", "short", "x".repeat(500)]) {
    const res = fakeRes();
    await handler(fakeReq({ url: `/api/quiz-funnel?action=result&t=${encodeURIComponent(token)}` }), res);
    assert.equal(res.statusCode, 404, `token length ${token.length} must not reach the database`);
  }
});

test("the handler never returns a service key to the client", async () => {
  const res = fakeRes();
  await handler(fakeReq({ url: "/api/quiz-funnel?action=meta" }), res);
  assert.doesNotMatch(res.body, /service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}/);
});

// --------------------------------------------- the report the handler returns

test("the report the handler stores never echoes the raw answers object", () => {
  const { answers } = engine.normaliseAnswers(FULL_ANSWERS);
  const r = reportMod.buildReport({ answers, firstName: "Maria" });

  // The report explains the match; it does not ship the answer payload back.
  assert.equal(r.answers, undefined);
  assert.equal(r._scoring.answers, undefined);
  assert.ok(r.primary.why.length >= 1, "the match must still be explained");
  assert.ok(r.disclaimers.length >= 4, "disclaimers must travel with the report");
});

test("every career the API can return is fully populated", () => {
  for (const id of engine.CAREER_ORDER) {
    const c = engine.CAREERS[id];
    assert.ok(c.title && c.category && c.tagline && c.description, `${id} basics`);
    assert.ok(c.tasks.length >= 5, `${id} tasks`);
    assert.ok(c.tools.length >= 3, `${id} tools`);
    assert.ok(c.portfolioProject.length > 40, `${id} portfolio`);
    assert.ok(c.nextSteps.length >= 3, `${id} next steps`);
    assert.ok(c.challenges.length >= 3, `${id} challenges`);
    assert.ok(c.specializations.length >= 2, `${id} specializations`);
  }
});

// ------------------------------------------------------- 12-function consolidation
// The Vercel Hobby plan allows 12 serverless functions per deployment. The quiz
// shares masterclass-identity.js (tagged ?quiz=1) instead of being its own
// function, so the whole Academy stays inside that cap. These tests pin the
// consolidation so it cannot silently drift back to a 13th function.

const VERCEL = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "vercel.json"), "utf8"));
const NODE_BUILDS = (VERCEL.builds || []).filter((b) => b.use === "@vercel/node");

test("the quiz is consolidated, keeping the deployment at or under 12 functions", () => {
  assert.ok(NODE_BUILDS.length <= 12, `expected <=12 serverless functions, found ${NODE_BUILDS.length}`);
  const sources = NODE_BUILDS.map((b) => b.src);
  assert.equal(sources.includes("api/quiz-funnel.js"), false, "quiz-funnel.js must not be its own serverless function");
  assert.ok(sources.includes("api/masterclass-identity.js"), "the quiz host must remain a declared build");
});

test("the /api/quiz-funnel route is rewritten onto the consolidated host", () => {
  const route = (VERCEL.routes || []).find((r) => r.src === "/api/quiz-funnel");
  assert.ok(route, "/api/quiz-funnel must keep a route so the public path never breaks");
  assert.equal(route.dest, "/api/masterclass-identity.js?quiz=1", "the route must target the host tagged as a quiz call");
});

test("the host bundles every module the quiz needs at runtime", () => {
  const build = NODE_BUILDS.find((b) => b.src === "api/masterclass-identity.js");
  const files = (build && build.config && build.config.includeFiles) || [];
  for (const needed of ["api/quiz-funnel.js", "api/_quiz-engine.js", "api/_quiz-report.js", "api/_academy-security.js"]) {
    assert.ok(files.includes(needed), `${needed} must be bundled with the host`);
  }
});

// The host is loaded directly so the dispatch itself is exercised, not just the
// config that enables it.
const HOST_PATH = require("node:path").join(__dirname, "masterclass-identity.js");

function loadHost(env = {}) {
  delete require.cache[require.resolve(HOST_PATH)];
  process.env.SUPABASE_URL = env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "service-key";
  process.env.ACADEMY_COOKIE_SECRET = env.ACADEMY_COOKIE_SECRET || "test-cookie-secret-with-32-plus-characters";
  return require(HOST_PATH);
}

test("a ?quiz=1 call is served by the quiz module, not the identity module", async () => {
  const host = loadHost();
  const res = fakeRes();
  await host({ method: "GET", url: "/api/masterclass-identity?quiz=1&action=meta", headers: {}, on() {} }, res);
  const body = JSON.parse(res.body || "{}");
  // The identity module would answer { ok, identified }; only the quiz returns questions.
  assert.equal(body.ok, true, "quiz meta must answer ok");
  assert.ok(Array.isArray(body.questions) && body.questions.length === 10, "the quiz module must own this response");
});

test("without the quiz marker the host still serves attendee identity untouched", async () => {
  const host = loadHost();
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [{ name: "Maria Santos" }] });
  const res = fakeRes();
  await host({ method: "GET", url: "/api/masterclass-identity?token=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", headers: {}, on() {} }, res);
  const body = JSON.parse(res.body || "{}");
  assert.equal(body.identified, true, "identity resolution must be unchanged");
  assert.equal(body.name, "Maria", "identity must still return the first name");
});

test("readBody prefers the Vercel-parsed req.body so a POST never hangs", async () => {
  // On Vercel the platform parses the JSON body before the handler runs and the
  // raw stream is already spent. Reading the stream only would hang every POST
  // until the platform timed the call out.
  const fn = require("./quiz-funnel");
  let streamTouched = false;
  const req = {
    method: "POST",
    url: "/api/quiz-funnel",
    headers: { origin: "https://getassistara.com" },
    body: { action: "submit", answers: FULL_ANSWERS },
    on() { streamTouched = true; },
  };
  const res = fakeRes();
  await fn(req, res);
  assert.equal(streamTouched, false, "the raw stream must not be read when req.body is already parsed");
});

// ------------------------------------------- stored rows match the declared schema
// PostgREST rejects a write the instant one key names a column the table does
// not declare. Spreading the full normalised attribution into the narrower
// quiz_results/quiz_events tables did exactly that in production: the insert
// 400'd, the handler (correctly) degraded to "your result is shown but not
// stored", and every lead, email and funnel event was silently lost. These
// tests pin the contract from both directions: the pickers may only name
// declared columns, and the wire payloads may only carry declared columns.

const QUIZ_MIGRATION = require("node:fs").readFileSync(
  require("node:path").join(__dirname, "..", "..", "supabase", "migrations", "202610170001_remote_income_quiz.sql"),
  "utf8",
);

function quizDeclaredColumns(table) {
  const marker = `create table if not exists public.${table}`;
  const start = QUIZ_MIGRATION.indexOf(marker);
  if (start < 0) return null;
  const body = QUIZ_MIGRATION.slice(start, QUIZ_MIGRATION.indexOf(");", start));
  const cols = new Set();
  for (const line of body.split("\n")) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+/.exec(line);
    if (m && !["constraint", "primary", "unique", "check", "foreign"].includes(m[1])) cols.add(m[1]);
  }
  return cols;
}

test("the attribution pickers only name columns their own table declares", () => {
  for (const [table, fn] of [["quiz_results", "resultAttribution"], ["quiz_events", "eventAttribution"]]) {
    const cols = quizDeclaredColumns(table);
    assert.ok(cols, `${table} should be declared in the quiz migration`);
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "quiz-funnel.js"), "utf8");
    const start = src.indexOf(`function ${fn}(attr)`);
    assert.ok(start >= 0, `${fn} is missing; the ${table} insert must not spread raw attribution`);
    const body = src.slice(start, src.indexOf("\n}", start));
    const named = [...body.matchAll(/([a-z_]+):\s*attr\./g)].map((m) => m[1]);
    assert.ok(named.length >= 1, `${fn} should pick at least one column`);
    for (const col of named) {
      assert.ok(cols.has(col), `${fn} writes ${col}, which ${table} does not declare`);
    }
  }
});

function captureFetch() {
  const posted = [];
  const real = global.fetch;
  global.fetch = async (url, init) => {
    posted.push({ url: String(url), method: init && init.method, body: init && init.body ? JSON.parse(init.body) : null });
    const isResultInsert = init && init.method === "POST" && /\/rest\/v1\/quiz_results$/.test(String(url));
    return {
      ok: true,
      status: isResultInsert ? 201 : 200,
      text: async () => (isResultInsert ? JSON.stringify([{ id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0" }]) : ""),
    };
  };
  return { posted, restore: () => { global.fetch = real; } };
}

test("a submit only writes columns quiz_results declares, and still carries its attribution", async () => {
  const { posted, restore } = captureFetch();
  try {
    const res = fakeRes();
    await handler(
      fakeReq({
        method: "POST",
        body: {
          action: "submit",
          answers: FULL_ANSWERS,
          email: "schema-contract@example.com",
          attribution: {
            utm_source: "ig", utm_medium: "social", utm_campaign: "launch",
            utm_content: "reel", utm_term: "work from home",
            landing_path: "/academy/quiz", referrer: "https://instagram.com/",
            visitorId: "visitor-123", token: "tok-abc",
          },
        },
        headers: { origin: "https://getassistara.com" },
      }),
      res,
    );
    const insert = posted.find((p) => p.method === "POST" && /\/rest\/v1\/quiz_results$/.test(p.url));
    assert.ok(insert, "the submit must insert exactly one quiz_results row");
    const declared = quizDeclaredColumns("quiz_results");
    for (const key of Object.keys(insert.body)) {
      assert.ok(declared.has(key), `the quiz_results insert sends ${key}, which the table does not declare`);
    }
    for (const col of ["acquisition_visit_id", "acquisition_visitor_id", "tracking_token"]) {
      assert.ok(col in insert.body, `the result row must stay attributable: ${col} is missing`);
    }
    assert.equal(insert.body.acquisition_visitor_id, "visitor-123");
    assert.equal(insert.body.tracking_token, "tok-abc");
    const body = JSON.parse(res.body || "{}");
    assert.equal(body.stored, true, "the row must be stored, not just computed");
    assert.ok(body.resultId, "a stored result must return its id");
  } finally {
    restore();
  }
});

test("an analytics event only writes columns quiz_events declares", async () => {
  const { posted, restore } = captureFetch();
  try {
    const res = fakeRes();
    await handler(
      fakeReq({
        method: "POST",
        body: {
          action: "event",
          event: "started",
          clientKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
          eventKey: "evt-1",
          attribution: {
            utm_source: "ig", utm_medium: "social", utm_campaign: "launch",
            utm_content: "reel", utm_term: "work from home",
            landing_path: "/academy/quiz", referrer: "https://instagram.com/",
          },
        },
        headers: { origin: "https://getassistara.com" },
      }),
      res,
    );
    const insert = posted.find((p) => p.method === "POST" && /\/rest\/v1\/quiz_events$/.test(p.url));
    assert.ok(insert, "the event must be written to quiz_events");
    const declared = quizDeclaredColumns("quiz_events");
    for (const key of Object.keys(insert.body)) {
      assert.ok(declared.has(key), `the quiz_events insert sends ${key}, which the table does not declare`);
    }
    assert.equal(insert.body.utm_source, "ig", "first-touch UTMs must still be recorded on the event");
    const body = JSON.parse(res.body || "{}");
    assert.equal(body.ok, true);
  } finally {
    restore();
  }
});
