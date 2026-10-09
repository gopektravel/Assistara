"use strict";

// vercel-build-sanity.test.js — offline stand-in for "the production build".
//
// Vercel's v2 `builds` array fails (or silently mis-routes) when a `src` or an
// `includeFiles` entry points at a file that does not exist. This exact class of
// drift previously shipped two dead entries (api/admin-application-answers.js
// and api/admin-application-notes.js). This test asserts every referenced file
// resolves, so the same drift cannot return unnoticed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const V9 = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(V9, "vercel.json"), "utf8"));

function exists(rel) {
  return fs.existsSync(path.join(V9, rel.replace(/^\//, "")));
}

function globHasMatch(pattern) {
  // Minimal support for the only glob used here: dir/**/*.ext
  const star = pattern.indexOf("**");
  if (star < 0) return exists(pattern);
  const base = pattern.slice(0, star).replace(/\/$/, "");
  const ext = path.extname(pattern);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(full)) return true;
      } else if (full.endsWith(ext)) {
        return true;
      }
    }
    return false;
  };
  return walk(path.join(V9, base));
}

test("every vercel build src resolves to a real file", () => {
  const missing = (config.builds || []).map((b) => b.src).filter((src) => !exists(src));
  assert.deepEqual(missing, [], "build src files missing: " + missing.join(", "));
});

test("every vercel includeFiles entry resolves (glob-aware)", () => {
  const missing = [];
  for (const build of config.builds || []) {
    for (const file of build.config?.includeFiles || []) {
      const ok = file.includes("*") ? globHasMatch(file) : exists(file);
      if (!ok) missing.push(`${build.src} -> ${file}`);
    }
  }
  assert.deepEqual(missing, [], "includeFiles not resolvable: " + missing.join(", "));
});

test("every vercel route dest resolves to a real file", () => {
  const missing = [];
  for (const route of config.routes || []) {
    const dest = String(route.dest || "").split("?")[0];
    if (!/\.(html|js|css|svg|png|txt|xml|json)$/i.test(dest)) continue; // function/special dest
    if (!exists(dest)) missing.push(`${route.src} -> ${dest}`);
  }
  assert.deepEqual(missing, [], "route dests not resolvable: " + missing.join(", "));
});

test("no stale admin-application Vercel build or route remains", () => {
  const text = JSON.stringify(config);
  assert.equal(text.includes("admin-application-answers"), false);
  assert.equal(text.includes("admin-application-notes"), false);
});
