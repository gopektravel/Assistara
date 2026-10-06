"use strict";

const {
  ACADEMY_COOKIE,
  COOKIE_TTL_SECONDS,
  config,
  allowedOrigin,
  validatedLearnerSession,
  issueCookie,
  clearCookie,
  noStore,
} = require("./_academy-security");

function json(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async function academySession(req, res) {
  noStore(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST" || !allowedOrigin(req.headers.origin)) {
    return json(res, 403, { ok: false, error: "Forbidden" });
  }

  let body;
  try {
    body = typeof req.body === "object" && req.body !== null
      ? req.body
      : JSON.parse(String(req.body || "{}"));
  } catch {
    return json(res, 400, { ok: false, error: "Invalid request" });
  }

  if (body.action === "logout") {
    clearCookie(res, ACADEMY_COOKIE);
    return json(res, 200, { ok: true });
  }

  if (body.action !== "exchange" || !body.access_token) {
    clearCookie(res, ACADEMY_COOKIE);
    return json(res, 400, { ok: false, error: "A Supabase session is required" });
  }

  try {
    const cfg = config();
    const session = await validatedLearnerSession({
      access_token: body.access_token,
    }, cfg);

    if (!session) {
      clearCookie(res, ACADEMY_COOKIE);
      return json(res, 403, { ok: false, error: "Academy access is not available for this account" });
    }

    issueCookie(res, ACADEMY_COOKIE, {
      aud: "academy",
      access_token: session.access_token,
      user_id: session.user_id,
      exp: session.expires_at,
    }, cfg.cookieSecret, COOKIE_TTL_SECONDS);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("academy-session", error);
    clearCookie(res, ACADEMY_COOKIE);
    return json(res, 503, { ok: false, error: "Academy session could not be verified" });
  }
};
