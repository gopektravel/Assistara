"use strict";

// masterclass-youtube.test.js — the runtime YouTube Live configuration.
//
// Covers the pure URL/config helpers, the Vercel function handler (auth gate,
// validation, upsert shape) with a mocked fetch, the vercel.json wiring, and
// the public/admin page contracts. No network or Admin credentials needed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const site = path.join(root, "assistara-local-v9");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const liveHtml = fs.readFileSync(path.join(site, "live.html"), "utf8");
const eventPage = fs.readFileSync(path.join(site, "admin-masterclass-event.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(site, "vercel.json"), "utf8"));

// --- pure helpers -------------------------------------------------------------

const fnPath = path.join(site, "api", "masterclass-youtube.js");
const src = fs.readFileSync(fnPath, "utf8");

function loadHandler(env = {}) {
  delete require.cache[require.resolve(fnPath)];
  process.env.SUPABASE_URL = env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "service-key";
  process.env.ACADEMY_COOKIE_SECRET = env.ACADEMY_COOKIE_SECRET || "test-cookie-secret-with-32-plus-characters";
  return require(fnPath);
}

const H = loadHandler();
const {
  extractVideoId,
  canonicalWatchUrl,
  buildEmbedUrl,
  buildChatUrl,
  parseConfig,
  publicConfig,
  safeDomain,
  DISPLAY_STATES,
  DEFAULT_DISPLAY_STATE,
} = H;

test("extractVideoId accepts every supported YouTube URL shape and bare IDs", () => {
  const good = [
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtube.com/watch?v=aqz-KE-bpKQ&list=PLabc&t=42s",
    "https://m.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://music.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ?t=99",
    "https://www.youtube.com/live/aqz-KE-bpKQ",
    "https://www.youtube.com/embed/aqz-KE-bpKQ",
    "https://www.youtube.com/shorts/aqz-KE-bpKQ",
    "https://www.youtube.com/v/aqz-KE-bpKQ",
    "youtube.com/watch?v=aqz-KE-bpKQ", // protocol-less paste
    "youtu.be/aqz-KE-bpKQ",
    "aqz-KE-bpKQ", // bare ID
  ];
  for (const input of good) assert.equal(extractVideoId(input), "aqz-KE-bpKQ", input);
});

test("extractVideoId rejects non-YouTube hosts, bad IDs and junk", () => {
  const bad = [
    "",
    "   ",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=waytoolongtobeavid",
    "https://notyoutube.com/watch?v=aqz-KE-bpKQ",
    "https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/",
    "https://youtu.be/",
    "javascript:alert(1)",
  ];
  for (const input of bad) assert.equal(extractVideoId(input), null, JSON.stringify(input));
});

test("embed and chat URLs use the official youtube.com endpoints with safe params", () => {
  assert.equal(canonicalWatchUrl("aqz-KE-bpKQ"), "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  const embed = buildEmbedUrl("aqz-KE-bpKQ");
  assert.match(embed, /^https:\/\/www\.youtube\.com\/embed\/aqz-KE-bpKQ\?/);
  assert.match(embed, /[?&]autoplay=1/);
  assert.match(embed, /[?&]mute=1/); // muted autoplay is the browser-compatible default
  assert.match(embed, /[?&]playsinline=1/); // mobile
  const chat = buildChatUrl("aqz-KE-bpKQ", "www.getassistara.com");
  assert.equal(chat, "https://www.youtube.com/live_chat?v=aqz-KE-bpKQ&embed_domain=www.getassistara.com&dark_theme=1");
});

test("safeDomain only allows bare domains and falls back to the site domain", () => {
  assert.equal(safeDomain("www.getassistara.com"), "www.getassistara.com");
  assert.equal(safeDomain("xxx.vercel.app"), "xxx.vercel.app");
  assert.equal(safeDomain(""), "www.getassistara.com");
  assert.equal(safeDomain("https://www.getassistara.com/live"), "www.getassistara.com");
  assert.equal(safeDomain("evil.com"), "evil.com"); // still a bare domain; used only as embed_domain
  assert.equal(safeDomain("javascript:alert(1)"), "www.getassistara.com");
});

test("parseConfig reads JSON config, legacy plain URLs, and empty storage", () => {
  const json = JSON.stringify({ youtube_url: "https://youtu.be/aqz-KE-bpKQ", chat: false, replay: true });
  const cfg = parseConfig(json);
  assert.equal(cfg.video_id, "aqz-KE-bpKQ");
  assert.equal(cfg.youtube_url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(cfg.chat_enabled, false);
  assert.equal(cfg.replay_enabled, true); // replay can be set but defaults to false
  assert.equal(cfg.display_state, "waiting");

  const legacy = parseConfig("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(legacy.video_id, "aqz-KE-bpKQ");
  assert.equal(legacy.chat_enabled, true); // defaults
  assert.equal(legacy.replay_enabled, false); // replay disabled by default
  assert.equal(legacy.display_state, "waiting");

  for (const empty of [null, undefined, "", "not json", "{broken", "123"]) {
    const cfg2 = parseConfig(empty);
    assert.equal(cfg2.video_id, null, JSON.stringify(empty));
    assert.equal(cfg2.chat_enabled, true);
    assert.equal(cfg2.replay_enabled, false);
    assert.equal(cfg2.display_state, "waiting");
  }

  // an invalid URL inside JSON is rejected, not passed through
  const bad = parseConfig(JSON.stringify({ youtube_url: "https://vimeo.com/1" }));
  assert.equal(bad.video_id, null);
});

test("parseConfig reads display_state from JSON config", () => {
  const json = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "live" });
  const cfg = parseConfig(json);
  assert.equal(cfg.display_state, "live");

  const json2 = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "ended" });
  const cfg2 = parseConfig(json2);
  assert.equal(cfg2.display_state, "ended");

  // invalid display_state falls back to default
  const json3 = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "invalid" });
  const cfg3 = parseConfig(json3);
  assert.equal(cfg3.display_state, "waiting");
});

test("DISPLAY_STATES and DEFAULT_DISPLAY_STATE are exported", () => {
  assert.deepEqual(DISPLAY_STATES, ["waiting", "live", "ended"]);
  assert.equal(DEFAULT_DISPLAY_STATE, "waiting");
});

test("publicConfig shapes the public read (includes display_state)", () => {
  const row = {
    event_key: "founding-masterclass-2026",
    title: "How to Land Your First Remote Client",
    live_destination_url: JSON.stringify({ youtube_url: "aqz-KE-bpKQ", chat: true, replay: false, display_state: "live" }),
  };
  const out = publicConfig(row, "www.getassistara.com");
  assert.equal(out.ok, true);
  assert.equal(out.video_id, "aqz-KE-bpKQ");
  assert.equal(out.embed_url, buildEmbedUrl("aqz-KE-bpKQ"));
  assert.equal(out.chat_url, buildChatUrl("aqz-KE-bpKQ", "www.getassistara.com"));
  assert.equal(out.replay_enabled, false);
  assert.equal(out.display_state, "live");
  assert.equal(publicConfig(null, "www.getassistara.com").display_state, "waiting");
});

// --- handler with mocked fetch ------------------------------------------------

function mockReq({ method = "GET", url = "/", headers = {}, body } = {}) {
  return { method, url, headers, body: body === undefined ? "" : body };
}

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    payload: "",
    setHeader(k, v) {
      headers[k] = v;
    },
    end(payload) {
      this.payload = payload === undefined ? "" : String(payload);
    },
    json() {
      try {
        return JSON.parse(this.payload);
      } catch {
        return null;
      }
    },
  };
}

function adminToken() {
  const payload = Buffer.from(JSON.stringify({ u: "admin", v: "1", exp: 9999999999999 })).toString("base64url");
  const sig = Buffer.alloc(32).toString("base64url");
  return `${payload}.${sig}`;
}

function mockFetch({ sessionCheckOk = true, row = null, upsertOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/functions/v1/admin-api")) {
      return {
        ok: sessionCheckOk,
        status: sessionCheckOk ? 200 : 401,
        json: async () => ({ ok: sessionCheckOk }),
      };
    }
    if (String(url).includes("/rest/v1/masterclass_events")) {
      if ((options.method || "GET") === "GET") {
        return { ok: true, status: 200, json: async () => (row ? [row] : []) };
      }
      return { ok: upsertOk, status: upsertOk ? 200 : 500, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test("GET returns the public config and never requires a session", async () => {
  const { fetchImpl } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: null } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(mockReq({ url: "/api/masterclass-youtube?domain=www.getassistara.com" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.equal(res.json().video_id, null);
  assert.equal(res.json().display_state, "waiting");
  assert.match(res.headers["Cache-Control"], /no-store/);
});

test("POST configure without a token is rejected before any database work", async () => {
  const { fetchImpl, calls } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: { origin: "https://www.getassistara.com", "content-type": "application/json" },
      body: JSON.stringify({ action: "configure", youtube_url: "aqz-KE-bpKQ" }),
    }),
    res
  );
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("POST configure with a token that fails admin-api session-check is rejected", async () => {
  const { fetchImpl, calls } = mockFetch({ sessionCheckOk: false });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "configure", youtube_url: "aqz-KE-bpKQ" }),
    }),
    res
  );
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 1); // only the session-check call happened
});

test("POST configure rejects an invalid YouTube URL with a clear 400", async () => {
  const { fetchImpl, calls } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "configure", youtube_url: "https://vimeo.com/123" }),
    }),
    res
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /doesn't look like a YouTube/);
  assert.equal(calls.length, 1); // session-check only; no write attempted
});

test("POST configure saves the normalized config with display_state and replay=false", async () => {
  const { fetchImpl, calls } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({
        action: "configure",
        youtube_url: "https://youtu.be/aqz-KE-bpKQ",
        chat_enabled: false,
        replay_enabled: true,
      }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.video_id, "aqz-KE-bpKQ");
  assert.equal(body.youtube_url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(body.chat_enabled, false);
  assert.equal(body.replay_enabled, false); // replay is forced to false
  assert.equal(body.display_state, "waiting"); // display_state defaults to waiting
  const write = calls.find((c) => String(c.url).includes("masterclass_events"));
  assert.ok(write, "expected an upsert call to masterclass_events");
  const sent = JSON.parse(write.options.body);
  const stored = JSON.parse(sent.live_destination_url);
  assert.equal(stored.youtube_url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(stored.chat, false);
  assert.equal(stored.replay, false);
  assert.equal(stored.display_state, "waiting");
  assert.equal(sent.event_key, "founding-masterclass-2026");
  assert.equal(sent.updated_by, "admin");
});

test("POST configure with an empty URL clears the stream and resets display_state", async () => {
  const { fetchImpl, calls } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "configure", youtube_url: "" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().video_id, null);
  assert.equal(res.json().display_state, "waiting");
  const write = calls.find((c) => String(c.url).includes("masterclass_events"));
  const stored = JSON.parse(JSON.parse(write.options.body).live_destination_url);
  assert.equal(stored.youtube_url, null);
  assert.equal(stored.display_state, "waiting");
});

test("POST start_stream without a configured URL returns 400", async () => {
  const { fetchImpl, calls } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: null } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "start_stream", event_key: "founding-masterclass-2026" }),
    }),
    res
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /No YouTube stream configured/);
  // Should not attempt a write
  const writeCalls = calls.filter((c) => String(c.url).includes("masterclass_events") && c.options.method === "POST");
  assert.equal(writeCalls.length, 0);
});

test("POST start_stream sets display_state to live when URL is configured", async () => {
  const existingConfig = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "waiting" });
  const { fetchImpl, calls } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: existingConfig } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "start_stream", event_key: "founding-masterclass-2026" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.display_state, "live");
  assert.match(body.message, /LIVE/);
  const write = calls.find((c) => String(c.url).includes("masterclass_events") && c.options.method === "POST");
  assert.ok(write);
  const sent = JSON.parse(write.options.body);
  const stored = JSON.parse(sent.live_destination_url);
  assert.equal(stored.display_state, "live");
  assert.equal(stored.youtube_url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
});

test("POST end_stream sets display_state to ended", async () => {
  const existingConfig = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "live" });
  const { fetchImpl, calls } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: existingConfig } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "end_stream", event_key: "founding-masterclass-2026" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.display_state, "ended");
  const write = calls.find((c) => String(c.url).includes("masterclass_events") && c.options.method === "POST");
  assert.ok(write);
  const sent = JSON.parse(write.options.body);
  const stored = JSON.parse(sent.live_destination_url);
  assert.equal(stored.display_state, "ended");
});

test("POST reset_stream sets display_state to waiting", async () => {
  const existingConfig = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "ended" });
  const { fetchImpl, calls } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: existingConfig } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "reset_stream", event_key: "founding-masterclass-2026" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.display_state, "waiting");
  const write = calls.find((c) => String(c.url).includes("masterclass_events") && c.options.method === "POST");
  assert.ok(write);
  const sent = JSON.parse(write.options.body);
  const stored = JSON.parse(sent.live_destination_url);
  assert.equal(stored.display_state, "waiting");
});

test("POST update_chat_provider changes only the provider and preserves stream state", async () => {
  const existingConfig = JSON.stringify({ youtube_url: "aqz-KE-bpKQ", display_state: "live", chat_provider: "assistara" });
  const { fetchImpl, calls } = mockFetch({ row: { event_key: "k", title: "T", live_destination_url: existingConfig } });
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "update_chat_provider", event_key: "founding-masterclass-2026", chat_provider: "youtube" }),
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.chat_provider, "youtube");
  assert.equal(body.chat_enabled, true);
  // Stream state and URL must be preserved — switching chat never resets the stream.
  assert.equal(body.display_state, "live");
  assert.equal(body.video_id, "aqz-KE-bpKQ");
  const write = calls.find((c) => String(c.url).includes("masterclass_events") && c.options.method === "POST");
  assert.ok(write);
  const sent = JSON.parse(write.options.body);
  const stored = JSON.parse(sent.live_destination_url);
  assert.equal(stored.chat_provider, "youtube");
  assert.equal(stored.display_state, "live");
  assert.equal(stored.youtube_url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
});

test("POST update_chat_provider rejects an unknown provider", async () => {
  const { fetchImpl } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: {
        origin: "https://www.getassistara.com",
        "content-type": "application/json",
        authorization: "Bearer " + adminToken(),
      },
      body: JSON.stringify({ action: "update_chat_provider", event_key: "founding-masterclass-2026", chat_provider: "twitch" }),
    }),
    res
  );
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.ok, false);
});

test("POST from a disallowed origin is forbidden", async () => {
  const { fetchImpl } = mockFetch();
  global.fetch = fetchImpl;
  const res = mockRes();
  await H(
    mockReq({
      method: "POST",
      url: "/api/masterclass-youtube",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "configure", youtube_url: "aqz-KE-bpKQ" }),
    }),
    res
  );
  assert.equal(res.statusCode, 403);
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

// --- deployment wiring --------------------------------------------------------

test("vercel serves the config function and keeps the public page routable", () => {
  const routes = vercel.routes || [];
  const builds = vercel.builds || [];
  assert.ok(
    routes.some((r) => r.src === "/api/masterclass-youtube" && r.dest === "/api/masterclass-youtube.js"),
    "expected a route for /api/masterclass-youtube"
  );
  const build = builds.find((b) => b.src === "api/masterclass-youtube.js");
  assert.ok(build, "expected a build entry for the config function");
  assert.ok(
    (build.config?.includeFiles || []).includes("api/_academy-security.js"),
    "the function must bundle the shared security module"
  );
  assert.ok(routes.some((r) => r.src === "/live" && r.dest === "/live.html"));
  assert.ok(builds.some((b) => b.src === "live.html"));
});

// --- public page contract -----------------------------------------------------

test("the public page reads the runtime config and only embeds a saved stream", () => {
  assert.match(liveHtml, /\/api\/masterclass-youtube/);
  assert.match(liveHtml, /cache:'no-store'/);
  assert.match(liveHtml, /domain='[+]encodeURIComponent\(location\.hostname\)/);
  // the player is rendered only when display_state === 'live'
  assert.match(liveHtml, /displayState==='live'/);
  // the static markup ships no iframe: nothing to break before a stream is saved
  const stripScripts = (html) => {
    let out = "";
    let rest = html;
    for (;;) {
      const start = rest.indexOf("<script");
      if (start < 0) { out += rest; break; }
      out += rest.slice(0, start);
      const end = rest.indexOf("</script>", start);
      if (end < 0) { out += rest.slice(start); break; }
      rest = rest.slice(end + 9);
    }
    return out;
  };
  assert.doesNotMatch(stripScripts(liveHtml), /<iframe/);
});

test("the public player uses the official embed with proper permissions", () => {
  assert.match(liveHtml, /class="yt-frame"/);
  assert.match(liveHtml, /allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"/);
  assert.match(liveHtml, /allowfullscreen/);
  assert.match(liveHtml, /referrerpolicy="strict-origin-when-crossorigin"/);
  // chat is now Assistara Live Chat (not YouTube iframe)
  assert.match(liveHtml, /id="assistara-live-chat"/);
  assert.match(liveHtml, /class="chat-frame-wrapper"/);
  // YouTube chat URL still built for fallback
  assert.match(src, /live_chat\?v="/);
  assert.match(src, /embed_domain=/);
});

test("the public page keeps a responsive layout for mobile", () => {
  // the mobile breakpoint stacks the grid and gives the chat a fixed height
  assert.match(liveHtml, /@media\(max-width:899px\)/);
  assert.match(liveHtml, /\.live-grid\{grid-template-columns:1fr/);
  assert.match(liveHtml, /\.chat-frame,\.chat-placeholder\{height:240px;min-height:240px\}/);
  // the player iframe fills its 16:9 container on every screen
  assert.match(liveHtml, /\.yt-frame\{position:absolute;inset:0;width:100%;height:100%/);
  assert.match(liveHtml, /\.video\{aspect-ratio:16\/9/);
});

test("the public page keeps its original waiting state and countdown", () => {
  assert.match(liveHtml, /id="preliveVideo"/);
  assert.match(liveHtml, /prelive-countdown/);
  assert.match(liveHtml, /WE GO LIVE IN/);
  assert.match(liveHtml, /masterclass-status/);
  assert.match(liveHtml, /action:'read'/);
  assert.match(liveHtml, /status==='ended'/); // countdown script only checks for ended
  // the countdown stays until the server says the event is live
  assert.match(liveHtml, /window\.__mcEventStatus='scheduled'/);
  // no misleading LIVE indicator: the pill only flips on server status
  assert.match(liveHtml, /id="livePillLabel"/);
  assert.match(liveHtml, /FREE LIVE MASTERCLASS/);
});

test("the public page countdown stops at zero and shows Starting Soon", () => {
  assert.match(liveHtml, /STARTING SOON/);
  assert.match(liveHtml, /countdownReachedZero/);
  assert.match(liveHtml, /showStartingSoon/);
});

test("the public page uses display_state from config for rendering", () => {
  assert.match(liveHtml, /display_state/);
  assert.match(liveHtml, /renderAll\(cfg\.display_state/);
  assert.match(liveHtml, /renderedVideoKey/); // video change detection
  assert.match(liveHtml, /renderedChatKey/); // chat change detection
});

// --- admin page contract ------------------------------------------------------

test("the admin event page has the YouTube configuration card with stream controls", () => {
  assert.match(eventPage, /id="mcYtUrl"/);
  assert.doesNotMatch(eventPage, /id="mcYtChat"/); // redundant checkbox removed
  assert.match(eventPage, /name="mcYtChatProvider"/); // three provider radios
  assert.doesNotMatch(eventPage, /Show live chat on the public page/);
  assert.doesNotMatch(eventPage, /\(Recommended\)/);
  assert.doesNotMatch(eventPage, /\(Fallback\)/);
  assert.doesNotMatch(eventPage, /id="mcYtReplay"/); // replay toggle removed
  assert.match(eventPage, /id="mcYtSave"/);
  assert.match(eventPage, /id="mcYtStart"/);
  assert.match(eventPage, /id="mcYtEnd"/);
  assert.match(eventPage, /id="mcYtReset"/);
  assert.match(eventPage, /id="mcYtStateBadge"/);
  assert.match(eventPage, /action: "configure"/);
  assert.match(eventPage, /action: "update_chat_provider"/); // provider auto-save
  assert.match(eventPage, /streamAction\("start_stream"/);
  assert.match(eventPage, /streamAction\("end_stream"/);
  assert.match(eventPage, /streamAction\("reset_stream"/);
  assert.match(eventPage, /Authorization: "Bearer " \+ token/);
  assert.match(eventPage, /const YT_ENDPOINT = "\/api\/masterclass-youtube"/);
});

test("the admin event page has the embedded presentation", () => {
  assert.match(eventPage, /id="mcPresentationCard"/);
  assert.match(eventPage, /id="mcPresentationFrame"/);
  assert.match(eventPage, /masterclass-presentation\.vercel\.app/);
  assert.match(eventPage, /id="mcPresentationReload"/);
  assert.match(eventPage, /id="mcPresentationFullscreen"/);
  assert.match(eventPage, /Open in New Tab/);
});

test("the admin event page stays admin-only", () => {
  assert.match(eventPage, /localStorage\.getItem\(ADMIN_TOKEN_KEY\)/);
  assert.match(eventPage, /if \(!token\) location\.href = "\/admin"/);
  // the public page never renders admin controls
  assert.doesNotMatch(liveHtml, /mcYtSave/);
  assert.doesNotMatch(liveHtml, /action: "configure"/);
});