"use strict";

const crypto = require("node:crypto");

const ACADEMY_COOKIE = "assistara_academy";
const QA_COOKIE = "assistara_qa";
const COOKIE_TTL_SECONDS = 30 * 60;
const QA_COOKIE_TTL_SECONDS = 10 * 60;

function config() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cookieSecret = process.env.ACADEMY_COOKIE_SECRET;
  if (!url || !anon || !service || !cookieSecret || cookieSecret.length < 32) {
    throw new Error("Missing server-side Academy gate configuration");
  }
  return { url: url.replace(/\/$/, ""), anon, service, cookieSecret };
}

function cookieKey(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function seal(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cookieKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function unseal(value, secret) {
  try {
    const packed = Buffer.from(String(value || ""), "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", cookieKey(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const data = JSON.parse(plaintext.toString("utf8"));
    if (!data || !Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    return part.slice(i + 1).trim();
  }
  return "";
}

function setCookie(res, name, value, maxAge) {
  const cookie = `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}; Secure; HttpOnly; SameSite=Lax`;
  const previous = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", previous ? [].concat(previous, cookie) : cookie);
}

function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function allowedOrigin(origin) {
  if (!origin) return false;
  const builtIn = [
    "https://getassistara.com",
    "https://www.getassistara.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ];
  const configured = (process.env.ACADEMY_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return builtIn.includes(origin) || configured.includes(origin);
}

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function authUser(accessToken, cfg = config()) {
  if (!accessToken) return null;
  const { response, body } = await fetchJSON(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.anon,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok || !body.id) return null;

  // Check the live Auth record too; an unexpired JWT alone must not preserve
  // access after the Auth user has been banned or deleted.
  const admin = await fetchJSON(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(body.id)}`, {
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
    },
    cache: "no-store",
  });
  if (!admin.response.ok) return null;
  const liveUser = admin.body.user || admin.body;
  if (!liveUser || liveUser.id !== body.id || liveUser.deleted_at) return null;
  if (liveUser.banned_until) {
    const until = new Date(liveUser.banned_until).getTime();
    if (!Number.isFinite(until) || until > Date.now()) return null;
  }
  return body;
}

function tokenExpiryMs(accessToken) {
  try {
    const part = String(accessToken || "").split(".")[1];
    if (!part) return 0;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) return 0;
    return exp < 1e12 ? exp * 1000 : exp;
  } catch {
    return 0;
  }
}

async function academyHasAccess(userId, cfg = config()) {
  if (!userId) return false;
  const { response, body } = await fetchJSON(`${cfg.url}/rest/v1/rpc/academy_has_access`, {
    method: "POST",
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: userId }),
    cache: "no-store",
  });
  return response.ok && body === true;
}

async function validatedLearnerSession(tokens, cfg = config()) {
  const accessToken = tokens && tokens.access_token;
  const expiresAt = tokenExpiryMs(accessToken);
  if (!expiresAt || expiresAt <= Date.now()) return null;
  const user = await authUser(accessToken, cfg);
  if (!user || !(await academyHasAccess(user.id, cfg))) return null;
  return { access_token: accessToken, user_id: user.id, expires_at: expiresAt };
}

function adminTokenClaims(token, serviceKey) {
  if (!token || !serviceKey) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;

  const decodeBase64Url = value => {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const bytes = Buffer.from(value, "base64url");
    return bytes.toString("base64url") === value ? bytes : null;
  };
  const payloadBytes = decodeBase64Url(payloadPart);
  const signatureBytes = decodeBase64Url(signaturePart);
  if (!payloadBytes || !payloadBytes.length || !signatureBytes || signatureBytes.length !== 32) return null;

  let payload;
  try { payload = JSON.parse(payloadBytes.toString("utf8")); } catch { return null; }
  if (!payload || payload.u !== "admin") return null;

  const expected = crypto.createHmac("sha256", serviceKey).update(payloadPart, "utf8").digest();
  if (!crypto.timingSafeEqual(expected, signatureBytes)) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp < 1e12 || payload.exp <= Date.now()) return null;
  return { ...payload, expiry_ms: payload.exp };
}

function issueCookie(res, cookieName, payload, secret, ttlSeconds) {
  const now = Date.now();
  const exp = Math.min(payload.exp || now + ttlSeconds * 1000, now + ttlSeconds * 1000);
  const sealed = seal({ ...payload, exp }, secret);
  setCookie(res, cookieName, sealed, Math.floor((exp - now) / 1000));
}

module.exports = {
  ACADEMY_COOKIE,
  QA_COOKIE,
  COOKIE_TTL_SECONDS,
  QA_COOKIE_TTL_SECONDS,
  config,
  seal,
  unseal,
  cookieValue,
  setCookie,
  clearCookie,
  noStore,
  allowedOrigin,
  authUser,
  tokenExpiryMs,
  academyHasAccess,
  validatedLearnerSession,
  adminTokenClaims,
  issueCookie,
};
