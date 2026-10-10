"use strict";

// Masterclass attendee identity resolution.
//
// A registered attendee's personal livestream link is /live?t=<token>, where
// <token> is the opaque masterclass_signups.attendee_token. This function
// maps that token to the attendee's verified registered first name so the live
// chat can label them without asking them to re-enter their name.
//
//   GET  /api/masterclass-identity?token=...   public read (no-store)
//
// It never returns an email or any field beyond the verified first name, and it
// only ever reports success for a token that matches an existing signup row.
// An absent/invalid token simply reports identified:false so the caller can
// fall back to its guest name-entry flow.

const { allowedOrigin, config, noStore } = require("./_academy-security");

// Same token shape the attendance endpoint validates: 32-64 hex characters.
const TOKEN_RE = /^[a-f0-9]{32,64}$/;

function send(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async function masterclassIdentity(req, res) {
  noStore(res);
  const origin = req.headers && req.headers.origin ? String(req.headers.origin) : "";
  const good = allowedOrigin(origin);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": good ? origin : "https://www.getassistara.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  }

  // Accept the token from the query string (GET) or a JSON body (POST).
  let token = "";
  if (req.method === "GET") {
    token = req.query && typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      try {
        token = new URL(req.url, "http://localhost").searchParams.get("token") || "";
      } catch {
        token = "";
      }
    }
  } else {
    let body;
    try {
      body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
    } catch {
      return send(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    token = String(body.token || "");
  }
  token = token.trim();

  // Never hit the database for a token that cannot be valid.
  if (!TOKEN_RE.test(token)) {
    return send(res, 200, { ok: true, identified: false });
  }

  let cfg;
  try {
    cfg = config();
  } catch {
    return send(res, 503, { ok: false, error: "Identity service unavailable" });
  }

  try {
    const url =
      cfg.url +
      "/rest/v1/masterclass_signups?attendee_token=eq." +
      encodeURIComponent(token) +
      "&select=name&limit=1";
    const r = await fetch(url, {
      headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service },
      cache: "no-store",
    });
    const rows = await r.json().catch(() => []);
    const name = Array.isArray(rows) && rows[0] && typeof rows[0].name === "string" ? rows[0].name.trim() : "";
    if (!name) return send(res, 200, { ok: true, identified: false });
    // Use only the registered first name; never expose the full name or email.
    const first = name.split(/\s+/)[0];
    return send(res, 200, { ok: true, identified: true, name: first });
  } catch (error) {
    console.error("masterclass-identity", error && error.message ? error.message : "read failed");
    return send(res, 503, { ok: false, error: "Could not resolve attendee identity" });
  }
};
