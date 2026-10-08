"use strict";

// Authenticated Admin Test Portal preview for the public Academy experience.
// Serves the REAL Academy page (never a mockup) with a preview flag the page
// reads to force a Masterclass state (scheduled | live | ended) or an Academy
// capacity state (open | one | full). Access requires the sealed QA session
// minted from a valid Admin token; public visitors are redirected to /admin.
// It never reads or writes production event state, seats, payments or leads.

const fs = require("node:fs/promises");
const path = require("node:path");
const { QA_COOKIE, QA_COOKIE_TTL_SECONDS, config, unseal, cookieValue, issueCookie, noStore } = require("./_academy-security");

const MC_STATES = ["scheduled", "live", "ended"];
const CAP_STATES = ["open", "one", "full"];

function deny(res, destination) {
  noStore(res);
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
  return [...new Set([path.resolve(__dirname, ".."), process.cwd(), __dirname])];
}

async function readPage(name) {
  for (const root of projectRoots()) {
    try { return await fs.readFile(path.join(root, name), "utf8"); } catch {}
  }
  return null;
}

function qaBar(page, mc, cap) {
  const link = (label, params, active) =>
    `<a href="/academy/preview?page=${page}&mc=${mc}&cap=${cap}${params}" style="text-decoration:none;padding:6px 11px;border-radius:999px;font-weight:800;font-size:12px;${active ? "background:#ffd51f;color:#151515" : "background:#2a2a2a;color:#fff"}">${label}</a>`;
  return `<div id="qaPreviewBar" style="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:6px;align-items:center;background:#171717;color:#fff;border-radius:999px;padding:7px 9px;font:800 11px/1 Manrope,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 20px)"><span style="color:#ffd51f;padding:0 4px">QA PREVIEW</span>` +
    `<span style="opacity:.6;padding:0 4px">Masterclass</span>` +
    MC_STATES.map((s) => link(s, "", mc === s)).join("") +
    `<span style="opacity:.6;padding:0 6px">Academy</span>` +
    CAP_STATES.map((s) => link(s, "&page=apply", page === "apply" && cap === s)).join("") +
    `<a href="/admin" style="text-decoration:none;padding:6px 11px;border-radius:999px;font-weight:800;font-size:12px;background:#3c3c3c;color:#fff">Exit</a>` +
    `</div>`;
}

module.exports = async function academyPreview(req, res) {
  noStore(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    return res.end();
  }

  let cfg;
  try { cfg = config(); } catch (error) {
    console.error("academy-preview configuration", error.message);
    res.statusCode = 503;
    return res.end();
  }

  const saved = unseal(cookieValue(req, QA_COOKIE), cfg.cookieSecret);
  if (!saved || saved.aud !== "academy-test-portal") return deny(res, "/admin");

  const expiry = Math.min(saved.exp, Date.now() + QA_COOKIE_TTL_SECONDS * 1000);
  issueCookie(res, QA_COOKIE, { aud: "academy-test-portal", exp: expiry }, cfg.cookieSecret, QA_COOKIE_TTL_SECONDS);

  const mc = MC_STATES.includes(query(req, "mc")) ? query(req, "mc") : "scheduled";
  const cap = CAP_STATES.includes(query(req, "cap")) ? query(req, "cap") : "open";
  const page = query(req, "page") === "apply" ? "apply" : "academy";
  const file = page === "apply" ? "academy-apply.html" : "academy.html";

  const html = await readPage(file);
  if (!html) {
    res.statusCode = 503;
    return res.end();
  }

  const inject = `<script>window.__ASSISTARA_QA_PREVIEW__={masterclass:${JSON.stringify(mc)},capacity:${JSON.stringify(cap)}};window.__ASSISTARA_QA_CAPACITY__=${JSON.stringify(cap)};</script>`;
  let out = html.replace("</head>", `${inject}</head>`);
  out = out.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs}>${qaBar(page, mc, cap)}`);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(out)));
  return req.method === "HEAD" ? res.end() : res.end(out);
};
