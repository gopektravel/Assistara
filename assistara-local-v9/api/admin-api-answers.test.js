"use strict";

const assert = require("node:assert");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ADMIN_API_PATH = path.join(__dirname, "..", "..", "supabase", "functions", "admin-api", "index.ts");

function source() {
  return fs.readFileSync(ADMIN_API_PATH, "utf8");
}

test("answers select includes id column", () => {
  const src = source();
  assert.ok(
    src.includes('.select("id,"+ANSWER_FIELDS.join(","))'),
    "answers query must select id plus answer fields"
  );
});

test("answers select does NOT use select('*')", () => {
  const src = source();
  const answersBlock = src.slice(
    src.indexOf('if(action==="answers")'),
    src.indexOf('if(action==="notes")')
  );
  assert.ok(!answersBlock.includes("select(*)"), "must not use select('*')");
});

test("answer allowlist remains exactly the seven approved fields", () => {
  const src = source();
  const match = src.match(/const ANSWER_FIELDS=\[([^\]]+)\]/);
  assert.ok(match, "ANSWER_FIELDS must be defined");
  const fields = match[1].split(",").map(s => s.trim().replace(/"/g, ""));
  assert.deepStrictEqual(fields, [
    "current_situation",
    "why_remote_work",
    "what_tried",
    "biggest_obstacle",
    "remote_work_interest",
    "weekly_commitment",
    "payment_readiness",
  ]);
});

test("answers response maps results by application id", () => {
  const src = source();
  assert.ok(
    src.includes("byId.set(String(row.id),answers)"),
    "answers must be keyed by application id"
  );
  assert.ok(
    src.includes("answers:safeIds.map(id=>byId.get(id)||null)"),
    "response must map ids to answers"
  );
});

test("answers skips rows without valid id", () => {
  const src = source();
  assert.ok(
    src.includes("if(!row||row.id===undefined||row.id===null) continue"),
    "rows without valid id must be skipped"
  );
});

test("notes action remains unchanged", () => {
  const src = source();
  assert.ok(src.includes('if(action==="notes")'), "notes action must exist");
  assert.ok(src.includes('sub==="write"'), "notes write subaction must exist");
  assert.ok(src.includes("admin_notes"), "notes must reference admin_notes column");
});

test("existing admin actions remain present", () => {
  const src = source();
  assert.ok(src.includes('if(action==="login")'), "login action must exist");
  assert.ok(src.includes('if(action==="list")'), "list action must exist");
  assert.ok(src.includes('if(action==="decision")'), "decision action must exist");
});

test("verifyToken is required for answers", () => {
  const src = source();
  const answersBlock = src.slice(
    src.indexOf('if(action==="answers")'),
    src.indexOf('if(action==="notes")')
  );
  // verifyToken is called before any action handler
  const verifyIdx = src.indexOf("if(!await verifyToken(auth))");
  const answersIdx = src.indexOf('if(action==="answers")');
  assert.ok(verifyIdx < answersIdx, "verifyToken must be called before answers handler");
});

test("no arbitrary academy_applications columns exposed in answers", () => {
  const src = source();
  const answersBlock = src.slice(
    src.indexOf('if(action==="answers")'),
    src.indexOf('if(action==="notes")')
  );
  // The select must be explicit, not *
  assert.ok(!answersBlock.includes("select('*')"), "must not use select('*')");
  assert.ok(!answersBlock.includes('select("*")'), "must not use select(\"*\")");
  // Must reference ANSWER_FIELDS for the column list
  assert.ok(answersBlock.includes("ANSWER_FIELDS.join"), "must use ANSWER_FIELDS allowlist");
});
