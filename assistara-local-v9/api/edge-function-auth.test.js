"use strict";

// edge-function-auth.test.js — guards the lesson behind the missing-report bug.
//
// quiz-results used to gate itself by comparing the caller's Authorization
// header against its own copy of the service credential:
//
//   if (!SERVICE_KEY || !auth.endsWith(SERVICE_KEY)) return 401;
//
// The credential is configured twice (in the Vercel function's environment and
// in the Edge Function's environment) and the two copies can drift, so a caller
// that is genuinely privileged got a 401 and the report email silently never
// sent while the rest of the flow looked healthy. The same lesson is already
// written down for the Admin token in api/_academy-security.js: the
// server-to-server check must be made by the authority itself, never by
// string-comparing a second copy of a secret.
//
// This test keeps that pattern from coming back anywhere in supabase/functions.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const V9 = path.join(__dirname, "..");
const FUNCTIONS = path.join(V9, "..", "supabase", "functions");

function functionSources() {
  return fs
    .readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => ({ slug: e.name, file: path.join(FUNCTIONS, e.name, "index.ts") }))
    .filter((f) => fs.existsSync(f.file))
    .map((f) => ({ slug: f.slug, src: fs.readFileSync(f.file, "utf8") }));
}

// A comparison between the caller's presented credential and a second copy of
// the service credential. `.endsWith` is how the bug was written; the equality
// forms are the same mistake spelled differently.
const GATES = [
  /\.endsWith\(\s*SERVICE_KEY\s*\)/,
  /[=!]==?\s*SERVICE_KEY\b/,
  /SERVICE_KEY\s*[=!]==?/,
];

test("no Edge Function gates a caller by comparing their credential to the service key", () => {
  const offenders = [];
  for (const { slug, src } of functionSources()) {
    for (const gate of GATES) {
      if (gate.test(src)) offenders.push(slug + " matches " + gate);
    }
  }
  assert.deepEqual(offenders, [],
    "these Edge Functions compare a presented credential to the service key, which breaks on credential drift: " + offenders.join(", "));
});

test("quiz-results lets the database decide whether the caller is privileged", () => {
  const src = fs.readFileSync(path.join(FUNCTIONS, "quiz-results", "index.ts"), "utf8");
  // It must take the credential the caller presented, from either header the
  // Supabase client and our server send.
  assert.match(src, /req\.headers\.get\("authorization"\)/);
  assert.match(src, /req\.headers\.get\("apikey"\)/);
  // and use it for the privileged work.
  assert.match(src, /apikey:\s*presented/);
  assert.match(src, /Authorization:\s*`Bearer \$\{presented\}`/);
  // quiz_results is granted to service_role alone, so PostgREST refusing the
  // read is the authority check.
  assert.match(src, /res\.status === 401 \|\| res\.status === 403/);
  // and it must not hold a second copy of the secret any more.
  assert.doesNotMatch(src, /SERVICE_KEY/);
});

test("the lesson is written down where the next change will read it", () => {
  const security = fs.readFileSync(path.join(V9, "api", "_academy-security.js"), "utf8");
  assert.match(security, /the server-to-server check is[\s\S]{0,24}made by the authority itself/);
});
