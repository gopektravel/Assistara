"use strict";

// Masterclass YouTube Live configuration.
//
// Gives the public /live page a runtime-configurable YouTube player: an Admin
// pastes a livestream URL once in the Admin dashboard and the public page
// embeds it — no code change, no redeploy, no environment variable. The
// public page reads this function's GET; the Admin dashboard writes through
// the configure action below.
//
//   GET  /api/masterclass-youtube?domain=...   public config read (no-store)
//   POST /api/masterclass-youtube              action=configure (Admin only)
//
// Storage: the JSON config {youtube_url, chat, replay} lives in
// masterclass_events.live_destination_url — the event row the masterclass-status
// edge function already reads for the public site. The column already exists
// (no DDL needed) and the service role bypasses RLS, so this function can
// upsert it safely. Nothing else reads that column.
//
// Auth: configure writes require a live Admin token. Verification is delegated
// to the admin-api edge function (the holder of the signing key) via its
// session-check action — the same gate every other Vercel Admin API uses, so
// there is no second copy of the signing key on Vercel.

const { allowedOrigin, config, adminTokenAuthorized, noStore } = require("./_academy-security");

const DEFAULT_EVENT_KEY = "founding-masterclass-2026";
const SITE_ORIGIN = "https://www.getassistara.com";
const SITE_DOMAIN = "www.getassistara.com";
const EVENT_KEY_RE = /^[A-Za-z0-9_-]{1,120}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Live-chat session (Railway WebSocket server). Admin Start/End/Reset clears the
// active chat via a monotonic epoch (idempotent server-side). CHAT_SECRET also
// gates HOST presenter access. Reset is best-effort so a chat hiccup never
// blocks a stream-state change or the YouTube player.
const CHAT_SECRET = process.env.CHAT_SECRET || "";
const CHAT_RESET_URL =
  process.env.CHAT_RESET_URL ||
  "https://assistara-live-chat-production.up.railway.app/internal/reset";
// Session-scoped live viewer presence (independent from the chat reset and
// untouched attendance fields). Lives in the Railway server I deploy.
const RAILWAY_BASE = process.env.CHAT_BASE_URL || "https://assistara-live-chat-production.up.railway.app";
const CHAT_VIEWER_SESSION_URL = `${RAILWAY_BASE}/internal/viewer-session`;
const CHAT_VIEWER_STATS_URL = `${RAILWAY_BASE}/internal/viewer-stats`;

// "Not Yet Joined" must match the 6:07 PM reminder's eligibleNotJoined() EXACTLY,
// so the dashboard and the reminder email always agree on who has never joined.
// These are cumulative/historical and are NEVER reset when a session resets.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_TOKEN_RE = /^[a-f0-9]{32,64}$/;
const WATCHING_TIMEOUT_MS = 60000; // a live viewer counts for 60s (heartbeat window)

// Cumulative attendance metrics over the signup rows (preserved across resets).
function computeAttendanceStats(signups) {
  const valid = (Array.isArray(signups) ? signups : []).filter(
    (x) => EMAIL_RE.test(String(x.email || "")) && SIGNUP_TOKEN_RE.test(String(x.attendee_token || ""))
  );
  const hasJoined = (x) =>
    !!x.joined_at ||
    !!x.last_joined_at ||
    Number(x.join_clicks) > 0 ||
    Number(x.attendance_seconds) > 0;
  const joined = valid.filter(hasJoined);
  const registrations = valid.length;
  const notYetJoined = registrations - joined.length;

  return {
    unique_attendees: joined.length,
    registrations,
    not_yet_joined: notYetJoined,
    watching_timeout_ms: WATCHING_TIMEOUT_MS,
  };
}

// Reset the live viewer session (admin "back to Waiting"). Monotonic epoch; the
// Railway side applies only if it advances, so a retry cannot erase a newer
// session's viewers. Best-effort — never blocks the stream-state change.
async function resetViewerSession(epoch) {
  if (!CHAT_SECRET) {
    console.error("masterclass-youtube: CHAT_SECRET not set; viewer session reset skipped");
    return;
  }
  try {
    await requestJSON(CHAT_VIEWER_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-reset-token": CHAT_SECRET },
      body: JSON.stringify({ epoch }),
    });
  } catch (e) {
    console.error("masterclass-youtube: viewer session reset failed", e && e.message ? e.message : e);
  }
}

// Current-session viewer counts from the Railway presence store. Returns zeros
// on any error or epoch mismatch (e.g. after a Railway restart) so stale data
// never leaks and never blocks the admin dashboard.
async function fetchViewerStats(epoch) {
  const zero = { watching: 0, unique: 0 };
  if (!CHAT_SECRET) return zero;
  try {
    const { response, body } = await requestJSON(CHAT_VIEWER_STATS_URL, {
      headers: { "x-reset-token": CHAT_SECRET },
    });
    if (!response.ok || !body || body.ok !== true) return zero;
    if (Number(body.epoch) !== Number(epoch)) return zero; // session mismatch -> nothing trustworthy
    return { watching: Number(body.watching) || 0, unique: Number(body.unique) || 0 };
  } catch {
    return zero;
  }
}

// Accepts watch URLs (any youtube.com host), youtu.be, /live/, /embed/,
// /shorts/, /v/ URLs and bare 11-character video IDs. Returns the video ID or
// null. The result always matches VIDEO_ID_RE, so it is safe to interpolate
// into embed URLs.
function extractVideoId(input) {
  let raw = String(input || "").trim();
  if (!raw) return null;
  if (VIDEO_ID_RE.test(raw)) return raw; // bare video ID
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw; // be liberal: youtu.be/ID
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!(host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"))) return null;
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0] || "";
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && VIDEO_ID_RE.test(v)) return v;
  const m = u.pathname.match(/^\/(live|embed|shorts|v)\/([A-Za-z0-9_-]{11})\/?$/);
  if (m) return m[2];
  return null;
}

function canonicalWatchUrl(id) {
  return "https://www.youtube.com/watch?v=" + id;
}

// Muted autoplay: browsers block unmuted autoplay, so the player starts muted
// with one tap to unmute — the standard YouTube live-embed behavior.
function buildEmbedUrl(id) {
  return "https://www.youtube.com/embed/" + id + "?rel=0&autoplay=1&mute=1&playsinline=1&modestbranding=1&enablejsapi=1";
}

function buildChatUrl(id, domain) {
  return "https://www.youtube.com/live_chat?v=" + id + "&embed_domain=" + domain + "&dark_theme=1";
}

function safeDomain(input) {
  const d = String(input || "").trim().toLowerCase();
  return DOMAIN_RE.test(d) ? d : SITE_DOMAIN;
}

// Valid livestream display states (admin-controlled, independent of event schedule)
const DISPLAY_STATES = ["waiting", "live", "ended"];
const DEFAULT_DISPLAY_STATE = "waiting";

// Chat provider options
const CHAT_PROVIDERS = ["assistara", "youtube", "off"];
const DEFAULT_CHAT_PROVIDER = "assistara";

// The stored column holds our JSON config. Tolerate a legacy/plain-URL value
// and treat anything unreadable as "no stream configured".
function parseConfig(raw) {
  const out = {
    youtube_url: null,
    video_id: null,
    chat_enabled: true,
    replay_enabled: false, // replay disabled per requirements
    display_state: DEFAULT_DISPLAY_STATE,
    chat_provider: DEFAULT_CHAT_PROVIDER,
    viewer_session: 0, // session epoch; viewer counters reset when this advances
  };
  if (!raw || typeof raw !== "string") return out;
  let cfg = null;
  try {
    cfg = JSON.parse(raw);
  } catch {
    cfg = null;
  }
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const id = extractVideoId(cfg.youtube_url);
    if (id) {
      out.video_id = id;
      out.youtube_url = canonicalWatchUrl(id);
    }
    if (typeof cfg.chat === "boolean") out.chat_enabled = cfg.chat;
    if (typeof cfg.replay === "boolean") out.replay_enabled = cfg.replay;
    if (typeof cfg.display_state === "string" && DISPLAY_STATES.includes(cfg.display_state)) {
      out.display_state = cfg.display_state;
    }
    if (typeof cfg.chat_provider === "string" && CHAT_PROVIDERS.includes(cfg.chat_provider)) {
      out.chat_provider = cfg.chat_provider;
    }
    if (Number.isFinite(Number(cfg.viewer_session)) && Number(cfg.viewer_session) > 0) {
      out.viewer_session = Math.floor(Number(cfg.viewer_session));
    }
    // Derive chat_enabled from chat_provider only if chat not explicitly set
    if (typeof cfg.chat !== "boolean") {
      out.chat_enabled = cfg.chat_provider !== 'off';
    }
    return out;
  }
  const id = extractVideoId(raw); // legacy: plain URL or bare ID
  if (id) {
    out.video_id = id;
    out.youtube_url = canonicalWatchUrl(id);
  }
  return out;
}

function send(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseBody(req) {
  let body;
  try {
    body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return { error: "Invalid JSON body" };
  }
  if (!plainObject(body)) return { error: "Body must be a JSON object" };
  return { body };
}

function query(req, key) {
  if (req.query && typeof req.query[key] === "string") return req.query[key];
  try {
    return new URL(req.url, "http://localhost").searchParams.get(key) || "";
  } catch {
    return "";
  }
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let body = null;
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

function serviceHeaders(cfg, extra = {}) {
  return {
    apikey: cfg.service,
    Authorization: `Bearer ${cfg.service}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function corsHeaders(origin) {
  const good = !!origin && (allowedOrigin(origin) || origin.endsWith(".vercel.app"));
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": good ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
}

function eventKey(input) {
  const key = String(input || "").trim();
  return EVENT_KEY_RE.test(key) ? key : DEFAULT_EVENT_KEY;
}

function publicConfig(row, domain) {
  const cfg = parseConfig(row ? row.live_destination_url : null);
  return {
    ok: true,
    event_key: row ? row.event_key : null,
    title: row ? row.title : null,
    youtube_url: cfg.youtube_url,
    video_id: cfg.video_id,
    embed_url: cfg.video_id ? buildEmbedUrl(cfg.video_id) : null,
    chat_enabled: cfg.chat_enabled,
    replay_enabled: cfg.replay_enabled,
    display_state: cfg.display_state,
    chat_provider: cfg.chat_provider,
    viewer_session_id: cfg.viewer_session,
    chat_url: cfg.video_id ? buildChatUrl(cfg.video_id, domain) : null,
  };
}

async function readEventRow(cfg, key) {
  const url =
    cfg.url +
    "/rest/v1/masterclass_events?select=event_key,title,live_destination_url&event_key=eq." +
    encodeURIComponent(key);
  const { response, body } = await requestJSON(url, {
    method: "GET",
    headers: serviceHeaders(cfg),
  });
  if (!response.ok) throw new Error("Could not load the masterclass event");
  const rows = Array.isArray(body) ? body : [];
  return rows[0] || null;
}

async function configureAction(cfg, claims, body) {
  const key = eventKey(body.event_key);
  // Validate the URL BEFORE any DB work so an invalid paste costs nothing.
  const rawUrl = body.youtube_url === undefined || body.youtube_url === null ? "" : String(body.youtube_url).trim();
  let url = null;
  if (rawUrl) {
    const id = extractVideoId(rawUrl);
    if (!id) {
      return {
        status: 400,
        body: { ok: false, error: "That doesn't look like a YouTube livestream URL or video ID." },
      };
    }
    url = canonicalWatchUrl(id);
  }
  // Preserve the live viewer session: saving/clearing the URL must NOT reset it.
  const cur = await readEventRow(cfg, key);
  const next = {
    youtube_url: url,
    chat: true,
    replay: false,
    display_state: DEFAULT_DISPLAY_STATE,
    chat_provider: DEFAULT_CHAT_PROVIDER,
    viewer_session: parseConfig(cur ? cur.live_destination_url : null).viewer_session,
  };
  if (typeof body.chat_enabled === "boolean") next.chat = body.chat_enabled;
  // replay is always disabled per requirements — ignore any replay_enabled in request
  next.replay = false;
  if (typeof body.display_state === "string" && DISPLAY_STATES.includes(body.display_state)) {
    next.display_state = body.display_state;
  }
  if (typeof body.chat_provider === "string" && CHAT_PROVIDERS.includes(body.chat_provider)) {
    next.chat_provider = body.chat_provider;
  }

  const { response } = await requestJSON(
    cfg.url + "/rest/v1/masterclass_events?on_conflict=event_key",
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        event_key: key,
        live_destination_url: JSON.stringify(next),
        updated_at: new Date().toISOString(),
        updated_by: claims.u,
      }),
    }
  );
  if (!response.ok) return { status: 500, body: { ok: false, error: "Could not save the YouTube stream" } };

  const id = extractVideoId(next.youtube_url);
  return {
    status: 200,
    body: {
      ok: true,
      event_key: key,
      youtube_url: next.youtube_url,
      video_id: id,
      chat_enabled: next.chat,
      replay_enabled: next.replay,
      display_state: next.display_state,
      chat_provider: next.chat_provider,
    },
  };
}

async function startStreamAction(cfg, claims, body) {
  const key = eventKey(body.event_key);
  // Read current config to validate URL exists
  const row = await readEventRow(cfg, key);
  const current = parseConfig(row ? row.live_destination_url : null);
  if (!current.video_id) {
    return { status: 400, body: { ok: false, error: "No YouTube stream configured. Save a URL first." } };
  }
  const next = { ...current, display_state: "live" };
  const { response } = await requestJSON(
    cfg.url + "/rest/v1/masterclass_events?on_conflict=event_key",
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        event_key: key,
        live_destination_url: JSON.stringify(next),
        updated_at: new Date().toISOString(),
        updated_by: claims.u,
      }),
    }
  );
  if (!response.ok) return { status: 500, body: { ok: false, error: "Could not start the stream" } };
  await resetChatSession("start"); // fresh chat session for the new livestream
  return {
    status: 200,
    body: { ok: true, event_key: key, display_state: "live", message: "Stream is now LIVE" },
  };
}

async function endStreamAction(cfg, claims, body) {
  const key = eventKey(body.event_key);
  const row = await readEventRow(cfg, key);
  const current = parseConfig(row ? row.live_destination_url : null);
  const next = { ...current, display_state: "ended" };
  const { response } = await requestJSON(
    cfg.url + "/rest/v1/masterclass_events?on_conflict=event_key",
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        event_key: key,
        live_destination_url: JSON.stringify(next),
        updated_at: new Date().toISOString(),
        updated_by: claims.u,
      }),
    }
  );
  if (!response.ok) return { status: 500, body: { ok: false, error: "Could not end the stream" } };
  await resetChatSession("end"); // close + clear the chat session
  return {
    status: 200,
    body: { ok: true, event_key: key, display_state: "ended", message: "Stream ended" },
  };
}

async function resetStreamAction(cfg, claims, body) {
  const key = eventKey(body.event_key);
  const row = await readEventRow(cfg, key);
  const current = parseConfig(row ? row.live_destination_url : null);
  // Back to Waiting: start a fresh viewer session (monotonic epoch) so current
  // viewers, session uniques and any session counters reset to zero. Distinct
  // from the chat reset below. Retries can't lower the epoch (Math.max).
  const viewerEpoch = Math.max(Date.now(), (current.viewer_session || 0) + 1);
  const next = { ...current, display_state: "waiting", viewer_session: viewerEpoch };
  const { response } = await requestJSON(
    cfg.url + "/rest/v1/masterclass_events?on_conflict=event_key",
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        event_key: key,
        live_destination_url: JSON.stringify(next),
        updated_at: new Date().toISOString(),
        updated_by: claims.u,
      }),
    }
  );
  if (!response.ok) return { status: 500, body: { ok: false, error: "Could not reset the stream" } };
  await resetViewerSession(viewerEpoch); // clear live viewer presence + session counters
  await resetChatSession("reset"); // leave no previous chat history
  return {
    status: 200,
    body: { ok: true, event_key: key, display_state: "waiting", viewer_session: viewerEpoch, message: "Reset to waiting" },
  };
}

async function updateChatProviderAction(cfg, claims, body) {
  const key = eventKey(body.event_key);
  const provider = String(body.chat_provider || "").trim();
  if (!CHAT_PROVIDERS.includes(provider)) {
    return { status: 400, body: { ok: false, error: "Unknown chat provider" } };
  }
  const row = await readEventRow(cfg, key);
  const current = parseConfig(row ? row.live_destination_url : null);
  // Change ONLY the provider. Preserve the stream URL, video id, display_state
  // AND the viewer session so switching chat never resets the livestream or the
  // live viewer counters.
  const next = {
    youtube_url: current.youtube_url,
    chat: provider !== "off",
    replay: current.replay_enabled,
    display_state: current.display_state,
    chat_provider: provider,
    viewer_session: current.viewer_session,
  };
  const { response } = await requestJSON(
    cfg.url + "/rest/v1/masterclass_events?on_conflict=event_key",
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        event_key: key,
        live_destination_url: JSON.stringify(next),
        updated_at: new Date().toISOString(),
        updated_by: claims.u,
      }),
    }
  );
  if (!response.ok) return { status: 500, body: { ok: false, error: "Could not save the chat provider" } };
  return {
    status: 200,
    body: {
      ok: true,
      event_key: key,
      chat_provider: provider,
      chat_enabled: provider !== "off",
      display_state: current.display_state,
      video_id: current.video_id,
      youtube_url: current.youtube_url,
    },
  };
}

// Begin a fresh chat session for a new livestream (reason: start|end|reset).
// Idempotent by epoch on the server, so a retry cannot erase a newer session.
async function resetChatSession(reason) {
  if (!CHAT_SECRET) {
    console.error("masterclass-youtube: CHAT_SECRET not set; chat reset skipped");
    return;
  }
  try {
    const { response } = await requestJSON(CHAT_RESET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-reset-token": CHAT_SECRET },
      body: JSON.stringify({ reason, epoch: Date.now() }),
    });
    if (!response.ok) console.error("masterclass-youtube: chat reset status", response.status);
  } catch (e) {
    console.error("masterclass-youtube: chat reset failed", e && e.message ? e.message : e);
  }
}

// Admin-authed: hand the presenter secret to a logged-in admin so they get the
// HOST role on /live without a separate presenter link.
async function presenterKeyAction() {
  if (!CHAT_SECRET) return { status: 503, body: { ok: false, error: "Presenter access unavailable" } };
  return { status: 200, body: { ok: true, hostToken: CHAT_SECRET } };
}

// Admin-only live attendance metrics. Reads masterclass_signups and derives the
// numbers with the SAME filters the reminder uses, so "Not Yet Joined" always
// equals the 6:07 PM reminder's eligible set. Read-only — it never writes, so it
// cannot disturb attendance history or reminder eligibility.
async function masterclassStatsAction(cfg, body) {
  const key = eventKey(body.event_key);
  const url =
    cfg.url +
    "/rest/v1/masterclass_signups?status=in.(registered,purchased)&unsubscribed_at=is.null&source=neq.test_reminder&select=email,attendee_token,joined_at,last_joined_at,join_clicks,attendance_seconds";
  const [rowRes, signupRes] = await Promise.all([
    readEventRow(cfg, key),
    requestJSON(url, { headers: serviceHeaders(cfg) }),
  ]);
  if (!signupRes.response.ok) return { status: 502, body: { ok: false, error: "Could not load attendance" } };
  const epoch = parseConfig(rowRes ? rowRes.live_destination_url : null).viewer_session;
  const viewers = await fetchViewerStats(epoch); // session-scoped, zeroed unless Railway agrees on the epoch
  const stats = computeAttendanceStats(signupRes.body);
  return {
    status: 200,
    body: {
      ok: true,
      event_key: key,
      // session viewer counters (reset to zero on Waiting; counted from zero on Live)
      watching_now: viewers.watching,
      session_unique: viewers.unique,
      viewer_session_id: epoch,
      // cumulative / historical (never reset)
      ...stats,
      youtube_viewers_available: false, // no YouTube Data API credentials configured
      generated_at: new Date().toISOString(),
    },
  };
}

module.exports = async function masterclassYoutube(req, res) {
  noStore(res);
  const origin = req.headers && req.headers.origin ? String(req.headers.origin) : "";
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  let cfg;
  try {
    cfg = config();
  } catch {
    return send(res, 503, { ok: false, error: "Masterclass service unavailable" });
  }

  // Public read: the player config is public information (it is shown on the
  // public page), so GET needs no Admin session. no-store so a saved URL shows
  // up immediately instead of sitting in the CDN cache.
  if (req.method === "GET") {
    try {
      const row = await readEventRow(cfg, eventKey(query(req, "event_key")));
      return send(res, 200, publicConfig(row, safeDomain(query(req, "domain"))));
    } catch (error) {
      console.error("masterclass-youtube", error && error.message ? error.message : "read failed");
      return send(res, 503, { ok: false, error: "Could not load the YouTube configuration" });
    }
  }

  if (req.method === "POST") {
    // Writes are Admin-only. The origin check plus the admin-api session-check
    // gate mean a public visitor can never change the stream.
    if (!allowedOrigin(origin)) return send(res, 403, { ok: false, error: "Forbidden" });
    const parsed = parseBody(req);
    if (parsed.error) return send(res, 400, { ok: false, error: parsed.error });
    const { body } = parsed;
    const action = String(body.action || "configure").trim().toLowerCase();
    if (action !== "configure" && action !== "read" && action !== "start_stream" && action !== "end_stream" && action !== "reset_stream" && action !== "update_chat_provider" && action !== "presenter_key" && action !== "stats") {
      return send(res, 400, { ok: false, error: "Unknown action" });
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = await adminTokenAuthorized(token, cfg);
    if (!claims) return send(res, 401, { ok: false, error: "Admin session required" });
    if (action === "read") {
      try {
        const row = await readEventRow(cfg, eventKey(body.event_key));
        return send(res, 200, publicConfig(row, safeDomain(query(req, "domain"))));
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "read failed");
        return send(res, 503, { ok: false, error: "Could not load the YouTube configuration" });
      }
    }
    if (action === "start_stream") {
      try {
        const result = await startStreamAction(cfg, claims, body);
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "start_stream failed");
        return send(res, 503, { ok: false, error: "Could not start the stream" });
      }
    }
    if (action === "end_stream") {
      try {
        const result = await endStreamAction(cfg, claims, body);
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "end_stream failed");
        return send(res, 503, { ok: false, error: "Could not end the stream" });
      }
    }
    if (action === "reset_stream") {
      try {
        const result = await resetStreamAction(cfg, claims, body);
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "reset_stream failed");
        return send(res, 503, { ok: false, error: "Could not reset the stream" });
      }
    }
    if (action === "update_chat_provider") {
      try {
        const result = await updateChatProviderAction(cfg, claims, body);
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "update_chat_provider failed");
        return send(res, 503, { ok: false, error: "Could not save the chat provider" });
      }
    }
    if (action === "presenter_key") {
      try {
        const result = await presenterKeyAction();
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "presenter_key failed");
        return send(res, 503, { ok: false, error: "Could not load presenter access" });
      }
    }
    if (action === "stats") {
      try {
        const result = await masterclassStatsAction(cfg, body);
        return send(res, result.status, result.body);
      } catch (error) {
        console.error("masterclass-youtube", error && error.message ? error.message : "stats failed");
        return send(res, 503, { ok: false, error: "Could not load attendance" });
      }
    }
    try {
      const result = await configureAction(cfg, claims, body);
      return send(res, result.status, result.body);
    } catch (error) {
      console.error("masterclass-youtube", error && error.message ? error.message : "configure failed");
      return send(res, 503, { ok: false, error: "Could not save the YouTube stream" });
    }
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return send(res, 405, { ok: false, error: "Method not allowed" });
};

// Pure helpers, exported for unit tests.
module.exports.extractVideoId = extractVideoId;
module.exports.canonicalWatchUrl = canonicalWatchUrl;
module.exports.buildEmbedUrl = buildEmbedUrl;
module.exports.buildChatUrl = buildChatUrl;
module.exports.parseConfig = parseConfig;
module.exports.publicConfig = publicConfig;
module.exports.safeDomain = safeDomain;
module.exports.DEFAULT_EVENT_KEY = DEFAULT_EVENT_KEY;
module.exports.DISPLAY_STATES = DISPLAY_STATES;
module.exports.DEFAULT_DISPLAY_STATE = DEFAULT_DISPLAY_STATE;
module.exports.CHAT_PROVIDERS = CHAT_PROVIDERS;
module.exports.DEFAULT_CHAT_PROVIDER = DEFAULT_CHAT_PROVIDER;
module.exports.computeAttendanceStats = computeAttendanceStats;
module.exports.WATCHING_TIMEOUT_MS = WATCHING_TIMEOUT_MS;
