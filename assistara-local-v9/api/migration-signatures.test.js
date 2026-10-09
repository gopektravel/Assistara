"use strict";

// migration-signatures.test.js — REGRESSION for the finalize_academy_payment
// privilege/signature mismatch.
//
// 202610080003_academy_capacity_waitlist.sql defined
// finalize_academy_payment(uuid,numeric,text,text,text,text,text) but its
// REVOKE/GRANT referenced a 9-argument signature that the file never creates,
// so a clean apply aborts with "function ... does not exist".
//
// This test only compares signatures WITHIN a file when a function is both
// defined and granted/revoked there, so grants that legitimately target
// functions defined in other migrations or live-only functions are ignored.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS = path.join(__dirname, "..", "..", "supabase", "migrations");

function typeList(args) {
  return String(args)
    .split(",")
    .map((param) => {
      let s = param.trim().toLowerCase();
      s = s.replace(/\s+default\s+[\s\S]*$/, ""); // drop a trailing DEFAULT clause
      const parts = s.split(/\s+/).filter(Boolean);
      if (parts.length > 1) parts.shift(); // drop the leading parameter name
      return parts.join(" ");
    })
    .map((t) =>
      t
        .replace(/\binteger\b/g, "int")
        .replace(/\bbigint\b/g, "int8")
        .replace(/\btimestamp with time zone\b/g, "timestamptz")
        .replace(/\btimestamp without time zone\b/g, "timestamp"),
    )
    .join(",");
}

function scan(sql) {
  const defined = new Map();
  const grants = [];
  let m;
  const defRe = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
  while ((m = defRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (!defined.has(name)) defined.set(name, new Set());
    defined.get(name).add(typeList(m[2]));
  }
  const grantRe = /(?:grant|revoke)\s+execute\s+on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
  while ((m = grantRe.exec(sql)) !== null) {
    grants.push({ name: m[1].toLowerCase(), sig: typeList(m[2]) });
  }
  return { defined, grants };
}

test("every function defined and granted in the same migration has a matching signature", () => {
  const problems = [];
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    const { defined, grants } = scan(sql);
    for (const grant of grants) {
      if (!defined.has(grant.name)) continue; // defined elsewhere / live-only
      if (!defined.get(grant.name).has(grant.sig)) {
        problems.push(`${file}: grant/revoke ${grant.name}(${grant.sig}) has no matching definition`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("finalize_academy_payment privileges use the 7-argument signature it defines", () => {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS, "202610080003_academy_capacity_waitlist.sql"),
    "utf8",
  );
  assert.match(
    sql,
    /grant execute on function public\.finalize_academy_payment\(uuid,numeric,text,text,text,text,text\) to service_role/,
    "grant must match the defined 7-argument function",
  );
  assert.doesNotMatch(
    sql,
    /finalize_academy_payment\(uuid,numeric,text,text,text,text,text,boolean,text\)/,
    "the stale 9-argument signature must be gone",
  );
});
