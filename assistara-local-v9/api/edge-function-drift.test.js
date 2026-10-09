"use strict";

// edge-function-drift.test.js — guards against unversioned production functions.
//
// Three Edge Functions referenced by the shipped frontend (website-form-proxy,
// masterclass-attendance, track-acquisition) had no source in the repository at
// all; they were recovered from the deployed project. This test asserts every
// functions/v1/<slug> the frontend calls has a local source, so the same drift
// cannot silently return and break a rebuild-from-repo.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const V9 = path.join(__dirname, "..");
const FUNCTIONS = path.join(V9, "..", "supabase", "functions");

function frontendFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /\.(html|js)$/.test(f));
}

test("every Edge Function the frontend calls has a local source", () => {
  const slugs = new Set();
  for (const file of frontendFiles(V9)) {
    const text = fs.readFileSync(path.join(V9, file), "utf8");
    for (const m of text.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) slugs.add(m[1]);
  }
  assert.ok(slugs.size > 0, "expected to find Edge Function calls in the frontend");

  const missing = [];
  for (const slug of slugs) {
    if (!fs.existsSync(path.join(FUNCTIONS, slug, "index.ts"))) missing.push(slug);
  }
  assert.deepEqual(missing, [], "frontend calls unversioned Edge Functions: " + missing.join(", "));
});

test("the recovered functions are present and self-contained", () => {
  for (const slug of ["website-form-proxy", "masterclass-attendance", "track-acquisition"]) {
    const src = fs.readFileSync(path.join(FUNCTIONS, slug, "index.ts"), "utf8");
    assert.match(src, /Deno\.serve/, slug + " must be a real Edge Function");
    assert.match(src, /SUPABASE_URL/, slug + " must use the project URL");
  }
});

test("website-form-proxy forwards to the versioned website-form handler", () => {
  const proxy = fs.readFileSync(path.join(FUNCTIONS, "website-form-proxy", "index.ts"), "utf8");
  assert.match(proxy, /functions\/v1\/website-form/,
    "the apply form's proxy must forward to website-form so its dedupe applies");
});
