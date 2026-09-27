"use strict";

const {
  QA_COOKIE,
  QA_COOKIE_TTL_SECONDS,
  config,
  allowedOrigin,
  adminTokenClaims,
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

module.exports = async function testPortalSession(req, res) {
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
    clearCookie(res, QA_COOKIE);
    return json(res, 200, { ok: true });
  }

  try {
    const cfg = config();
    const claims = adminTokenClaims(body.token, cfg.service);
    if (!claims) {
      clearCookie(res, QA_COOKIE);
      return json(res, 403, { ok: false, error: "Valid Admin authorization is required" });
    }

    const expiry = Math.min(claims.expiry_ms, Date.now() + QA_COOKIE_TTL_SECONDS * 1000);
    issueCookie(res, QA_COOKIE, {
      aud: "academy-test-portal",
      token: body.token,
      exp: expiry,
    }, cfg.cookieSecret, QA_COOKIE_TTL_SECONDS);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("test-portal-session", error);
    clearCookie(res, QA_COOKIE);
    return json(res, 503, { ok: false, error: "Admin authorization could not be verified" });
  }
};
