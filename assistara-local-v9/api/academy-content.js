"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ACADEMY_COOKIE,
  QA_COOKIE,
  COOKIE_TTL_SECONDS,
  QA_COOKIE_TTL_SECONDS,
  config,
  unseal,
  cookieValue,
  issueCookie,
  clearCookie,
  noStore,
  validatedLearnerSession,
} = require("./_academy-security");

function deny(res, destination) {
  noStore(res);
  clearCookie(res, destination === "/admin" ? QA_COOKIE : ACADEMY_COOKIE);
  res.statusCode = 302;
  res.setHeader("Location", destination);
  res.setHeader("Content-Length", "0");
  res.end();
}

function query(req, key) {
  if (req.query && typeof req.query[key] === "string") return req.query[key];
  try { return new URL(req.url, "http://localhost").searchParams.get(key) || ""; } catch { return ""; }
}

function projectRoots() {
  return [...new Set([
    path.resolve(__dirname, ".."),
    process.cwd(),
    __dirname,
  ])];
}

async function readProtectedAsset(assetName) {
  if (!assetName || path.basename(assetName) !== assetName || !/^[a-zA-Z0-9._-]+\.pdf$/.test(assetName)) {
    return null;
  }
  for (const root of projectRoots()) {
    const slidesRoot = path.resolve(root, "academy", "slides");
    const target = path.resolve(slidesRoot, assetName);
    if (!target.startsWith(slidesRoot + path.sep)) continue;
    try { return await fs.readFile(target); } catch {}
  }
  return null;
}

async function readDashboardHtml() {
  for (const root of projectRoots()) {
    try { return await fs.readFile(path.join(root, "academy-dashboard.html")); } catch {}
  }
  return null;
}

async function readDriveAsset(fileId) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId || "")) return null;
  try {
    const upstream = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok || /text\/html/i.test(upstream.headers.get("content-type") || "")) return null;
    const size = Number(upstream.headers.get("content-length") || 0);
    if (size > 32 * 1024 * 1024) return null;
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length < 4 || bytes.length > 32 * 1024 * 1024 || bytes.subarray(0, 4).toString("ascii") !== "%PDF") return null;
    return bytes;
  } catch {
    return null;
  }
}

module.exports = async function academyContent(req, res) {
  noStore(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    return res.end();
  }

  let cfg;
  try { cfg = config(); } catch (error) {
    console.error("academy-content configuration", error.message);
    res.statusCode = 503;
    return res.end();
  }

  const audience = query(req, "audience");
  if (audience === "learner") {
    const saved = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
    if (!saved || saved.aud !== "academy") return deny(res, "/login");

    const session = await validatedLearnerSession(saved, cfg);
    if (!session) return deny(res, "/login");

    issueCookie(res, ACADEMY_COOKIE, {
      aud: "academy",
      access_token: session.access_token,
      exp: session.expires_at,
    }, cfg.cookieSecret, COOKIE_TTL_SECONDS);

    const asset = query(req, "asset");
    const driveId = query(req, "drive");
    if (asset || driveId) {
      const bytes = driveId ? await readDriveAsset(driveId) : await readProtectedAsset(asset);
      if (!bytes) {
        res.statusCode = 404;
        return res.end();
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      const filename = asset || `${driveId}.pdf`;
      res.setHeader("Content-Disposition", `${query(req, "download") === "1" ? "attachment" : "inline"}; filename="${filename}"`);
      res.setHeader("Content-Length", String(bytes.length));
      return req.method === "HEAD" ? res.end() : res.end(bytes);
    }

    try {
      const html = await readDashboardHtml();
      if (!html) throw new Error("Bundled Academy HTML is unavailable");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", String(html.length));
      return req.method === "HEAD" ? res.end() : res.end(html);
    } catch (error) {
      console.error("academy-content asset", error);
      res.statusCode = 503;
      return res.end();
    }
  }

  if (audience === "qa") {
    // The QA session is a value this deployment sealed itself, after
    // api/test-portal-session.js had the Admin token confirmed by the Admin
    // API. Unsealing with the server-only secret is the whole check: a forged,
    // replayed or tampered cookie cannot produce readable plaintext, and
    // unseal() already refuses an expired one. Nothing here depends on an
    // Admin token, and nothing here can be used to obtain one.
    const saved = unseal(cookieValue(req, QA_COOKIE), cfg.cookieSecret);
    if (!saved || saved.aud !== "academy-test-portal") return deny(res, "/admin");

    const expiry = Math.min(saved.exp, Date.now() + QA_COOKIE_TTL_SECONDS * 1000);
    issueCookie(res, QA_COOKIE, {
      aud: "academy-test-portal",
      exp: expiry,
    }, cfg.cookieSecret, QA_COOKIE_TTL_SECONDS);

    try {
      const html = await readDashboardHtml();
      if (!html) throw new Error("Bundled Academy HTML is unavailable");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", String(html.length));
      return req.method === "HEAD" ? res.end() : res.end(html);
    } catch (error) {
      console.error("academy-test-portal asset", error);
      res.statusCode = 503;
      return res.end();
    }
  }

  res.statusCode = 404;
  return res.end();
};
