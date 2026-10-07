"use strict";

// Founding Cohort tool voting. Learner-owned, server-persisted.
//
//   action=state  -> { ok:true, votes:{toolId:count}, voted:[toolId,...] }
//   action=add    -> { ok:true, toolId, voted:true, count }
//   action=remove -> { ok:true, toolId, voted:false, count }
//
// The learner's vote intent is confirmed ONLY through this API. The
// dashboard posts the sealed Academy cookie, the API validates the live,
// entitled learner session on the server (validatedLearnerSession), and the
// write happens under the service role - never with client-held credentials.
// The Test Student Portal never calls this endpoint: it drives the same UI
// from local state so QA can exercise all voting states without touching
// real rows.

const {
  ACADEMY_COOKIE,
  allowedOrigin,
  config,
  cookieValue,
  noStore,
  unseal,
  validatedLearnerSession,
} = require("./_academy-security");

// Server-side allowlist of valid roadmap tool IDs.
const VOTABLE_TOOLS = new Set([
  "offer-builder",
  "profile-builder",
  "job-post-analyzer",
  "proposal-builder",
  "portfolio-builder",
  "rate-calculator",
  "discovery-call-prep",
  "client-interview-simulator",
  "outreach-tracker",
  "client-red-flag-checker",
]);

const ALLOWED_ACTION_FIELDS = {
  state: new Set(["action"]),
  add: new Set(["action", "tool_id"]),
  remove: new Set(["action", "tool_id"]),
};

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

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let body = {};
  try { body = await response.json(); } catch {}
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

async function stateAction(cfg, session) {
  // Fetch aggregate counts for all votable tools
  const countsResponse = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?select=tool_id`,
    { method: "GET", headers: serviceHeaders(cfg) }
  );
  if (!countsResponse.response.ok) throw new Error("Could not load vote counts");
  const countRows = Array.isArray(countsResponse.body) ? countsResponse.body : [];
  const votes = {};
  for (const tool of VOTABLE_TOOLS) votes[tool] = 0;
  for (const row of countRows) {
    if (row && VOTABLE_TOOLS.has(row.tool_id)) {
      votes[row.tool_id] = (votes[row.tool_id] || 0) + 1;
    }
  }

  // Fetch the current learner's voted tool IDs
  const votedResponse = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?user_id=eq.${encodeURIComponent(session.user_id)}&select=tool_id`,
    { method: "GET", headers: serviceHeaders(cfg) }
  );
  if (!votedResponse.response.ok) throw new Error("Could not load learner votes");
  const votedRows = Array.isArray(votedResponse.body) ? votedResponse.body : [];
  const voted = votedRows
    .map(r => r && r.tool_id)
    .filter(t => VOTABLE_TOOLS.has(t));

  return { status: 200, body: { ok: true, votes, voted } };
}

async function addAction(cfg, session, toolId) {
  const { response } = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?on_conflict=user_id,tool_id`,
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        user_id: session.user_id,
        tool_id: toolId,
      }),
    }
  );
  if (!response.ok) throw new Error("Could not persist vote");

  // Fetch the updated count for this tool
  const countResponse = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?tool_id=eq.${encodeURIComponent(toolId)}&select=id`,
    { method: "GET", headers: serviceHeaders(cfg) }
  );
  const countRows = countResponse.response.ok && Array.isArray(countResponse.body) ? countResponse.body : [];
  return { status: 200, body: { ok: true, toolId, voted: true, count: countRows.length } };
}

async function removeAction(cfg, session, toolId) {
  const { response } = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?user_id=eq.${encodeURIComponent(session.user_id)}&tool_id=eq.${encodeURIComponent(toolId)}`,
    { method: "DELETE", headers: serviceHeaders(cfg) }
  );
  if (!response.ok) throw new Error("Could not remove vote");

  // Fetch the updated count for this tool
  const countResponse = await requestJSON(
    `${cfg.url}/rest/v1/academy_tool_votes?tool_id=eq.${encodeURIComponent(toolId)}&select=id`,
    { method: "GET", headers: serviceHeaders(cfg) }
  );
  const countRows = countResponse.response.ok && Array.isArray(countResponse.body) ? countResponse.body : [];
  return { status: 200, body: { ok: true, toolId, voted: false, count: countRows.length } };
}

function authenticate(req, cfg) {
  const cookie = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
  if (!cookie || cookie.aud !== "academy" || !cookie.access_token) return null;
  return cookie;
}

module.exports = async function academyToolVotes(req, res) {
  noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!allowedOrigin(req.headers.origin)) return send(res, 403, { ok: false, error: "Forbidden" });

  const parsed = parseBody(req);
  if (parsed.error) return send(res, 400, { ok: false, error: parsed.error });
  const { body } = parsed;
  const allowed = ALLOWED_ACTION_FIELDS[body.action];
  if (!allowed) return send(res, 400, { ok: false, error: "Unknown action" });
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return send(res, 400, { ok: false, error: "Unexpected field" });
  }

  // Validate tool_id for add/remove actions
  if (body.action === "add" || body.action === "remove") {
    if (!body.tool_id || typeof body.tool_id !== "string") {
      return send(res, 400, { ok: false, error: "tool_id is required" });
    }
    if (!VOTABLE_TOOLS.has(body.tool_id)) {
      return send(res, 400, { ok: false, error: "Invalid tool_id" });
    }
  }

  let cfg;
  try { cfg = config(); } catch {
    return send(res, 503, { ok: false, error: "Academy service unavailable" });
  }
  try {
    const cookie = authenticate(req, cfg);
    if (!cookie) return send(res, 403, { ok: false, error: "Academy session required" });
    const session = await validatedLearnerSession({ access_token: cookie.access_token }, cfg);
    if (!session || session.user_id !== cookie.user_id) {
      return send(res, 403, { ok: false, error: "Something went wrong with this page. Please contact support@getassistara.com." });
    }
    if (body.action === "state") {
      const result = await stateAction(cfg, session);
      return send(res, result.status, result.body);
    }
    if (body.action === "add") {
      const result = await addAction(cfg, session, body.tool_id);
      return send(res, result.status, result.body);
    }
    const result = await removeAction(cfg, session, body.tool_id);
    return send(res, result.status, result.body);
  } catch (error) {
    console.error("academy-tool-votes", error && error.message ? error.message : "request failed");
    return send(res, 503, { ok: false, error: "Academy voting service unavailable" });
  }
};
