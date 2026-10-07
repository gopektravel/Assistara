"use strict";

// Founding Cohort Community join state. Learner-owned, server-persisted.
//
//   action=state   -> { ok:true, joined:boolean }
//   action=confirm -> { ok:true, joined:true }
//
// The learner's intent ("I've joined") is confirmed ONLY through this API. The
// dashboard posts the sealed Academy cookie, the API validates the live,
// entitled learner session on the server (validatedLearnerSession), and the
// write happens under the service role - never with client-held credentials.
// The Test Student Portal never calls this endpoint: it drives the same UI
// from a local flag so QA can exercise both states without touching real rows.

const {
  ACADEMY_COOKIE,
  allowedOrigin,
  config,
  cookieValue,
  noStore,
  unseal,
  validatedLearnerSession,
} = require("./_academy-security");

const ALLOWED_ACTION_FIELDS = {
  state: new Set(["action"]),
  confirm: new Set(["action"]),
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
  const { response, body } = await requestJSON(
    `${cfg.url}/rest/v1/academy_student_community?user_id=eq.${encodeURIComponent(session.user_id)}&select=community_joined&limit=1`,
    { method: "GET", headers: serviceHeaders(cfg) }
  );
  if (!response.ok) throw new Error("Could not load community state");
  const row = Array.isArray(body) ? body[0] || null : null;
  return { status: 200, body: { ok: true, joined: !!row && row.community_joined === true } };
}

async function confirmAction(cfg, session) {
  // Idempotent: repeat confirmations keep joined_at of the first join.
  const { response } = await requestJSON(
    `${cfg.url}/rest/v1/academy_student_community?on_conflict=user_id`,
    {
      method: "POST",
      headers: serviceHeaders(cfg, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        user_id: session.user_id,
        community_joined: true,
        joined_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) throw new Error("Could not persist community confirmation");
  return { status: 200, body: { ok: true, joined: true } };
}

function authenticate(req, cfg) {
  const cookie = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
  if (!cookie || cookie.aud !== "academy" || !cookie.access_token) return null;
  return cookie;
}

module.exports = async function academyCommunity(req, res) {
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
    const result = await confirmAction(cfg, session);
    return send(res, result.status, result.body);
  } catch (error) {
    console.error("academy-community", error && error.message ? error.message : "request failed");
    return send(res, 503, { ok: false, error: "Academy community service unavailable" });
  }
};