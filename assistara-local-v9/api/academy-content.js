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

async function readWelcomeHtml() {
  for (const root of projectRoots()) {
    try { return await fs.readFile(path.join(root, "academy-welcome.html"), "utf8"); } catch {}
  }
  return null;
}

async function welcomeState(userId, cfg) {
  const response = await fetch(
    `${cfg.url}/rest/v1/academy_applications?auth_user_id=eq.${encodeURIComponent(userId)}&select=enrollment_token,welcome_seen_at&limit=1`,
    {
      headers: {
        apikey: cfg.service,
        Authorization: `Bearer ${cfg.service}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const rows = await response.json();
  const application = Array.isArray(rows) ? rows[0] : null;
  if (!application || !application.enrollment_token) return null;
  return application;
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
  if (audience === "learner" || audience === "welcome") {
    const saved = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
    if (!saved || saved.aud !== "academy") return deny(res, "/login");

    const session = await validatedLearnerSession(saved, cfg);
    if (!session) return deny(res, "/login");

    issueCookie(res, ACADEMY_COOKIE, {
      aud: "academy",
      access_token: session.access_token,
      user_id: session.user_id,
      exp: session.expires_at,
    }, cfg.cookieSecret, COOKIE_TTL_SECONDS);

    const welcome = await welcomeState(session.user_id, cfg);
    if (!welcome) return deny(res, "/login");

    if (audience === "learner" && !welcome.welcome_seen_at) {
      res.statusCode = 302;
      res.setHeader("Location", "/academy/welcome");
      res.setHeader("Content-Length", "0");
      return res.end();
    }

    if (audience === "welcome") {
      if (welcome.welcome_seen_at) {
        res.statusCode = 302;
        res.setHeader("Location", "/academy/dashboard");
        res.setHeader("Content-Length", "0");
        return res.end();
      }
      try {
        const html = await readWelcomeHtml();
        if (!html) throw new Error("Bundled Academy welcome HTML is unavailable");
        const rendered = html.replace(
          "const token = params.get('token') || '';",
          `const token = ${JSON.stringify(welcome.enrollment_token)};`,
        );
        const bytes = Buffer.from(rendered, "utf8");
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Length", String(bytes.length));
        return req.method === "HEAD" ? res.end() : res.end(bytes);
      } catch (error) {
        console.error("academy-welcome asset", error);
        res.statusCode = 503;
        return res.end();
      }
    }

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
