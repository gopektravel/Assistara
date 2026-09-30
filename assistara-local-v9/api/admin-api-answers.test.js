"use strict";

const assert = require("node:assert");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ADMIN_API_PATH = path.join(__dirname, "..", "..", "supabase", "functions", "admin-api", "index.ts");
const ADMIN_HTML_PATH = path.join(__dirname, "..", "admin.html");

function source() {
  return fs.readFileSync(ADMIN_API_PATH, "utf8");
}

function adminHtml() {
  return fs.readFileSync(ADMIN_HTML_PATH, "utf8");
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
  assert.ok(!answersBlock.includes('select("*")'), 'must not use select("*")');
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

test("answers response uses old client-compatible {fields, applications} contract", () => {
  const src = source();
  assert.ok(
    src.includes("{ok:true,fields:ANSWER_FIELD_SCHEMA,applications}"),
    "response must use {ok, fields, applications} shape"
  );
});

test("answers response includes found flag for existing applications", () => {
  const src = source();
  assert.ok(
    src.includes("found:true"),
    "existing applications must have found:true"
  );
  assert.ok(
    src.includes("found:false"),
    "missing applications must have found:false"
  );
});

test("answers response includes id in application objects", () => {
  const src = source();
  assert.ok(
    src.includes("{id,answers:{},found:false}"),
    "missing applications must include id"
  );
});

test("answers response includes nested answers object", () => {
  const src = source();
  assert.ok(
    src.includes('byId.set(String(row.id),{id:String(row.id),answers});'),
    "existing applications must be stored as id plus nested answers"
  );
});

test("found application answers expose only the seven approved fields", () => {
  const src = source();
  const answersBlock = src.slice(
    src.indexOf('if(action==="answers")'),
    src.indexOf('if(action==="notes")')
  );
  assert.ok(
    answersBlock.includes("for(const field of ANSWER_FIELDS) answers[field]=row[field]??null;"),
    "found answers must be projected through ANSWER_FIELDS"
  );
  assert.ok(
    answersBlock.includes("{id:String(row.id),answers}"),
    "found applications must contain id and nested answers"
  );
});

test("answers field schema preserves human-readable labels", () => {
  const src = source();
  assert.ok(src.includes("What best describes your current situation?"), "label 1 must exist");
  assert.ok(src.includes("Why do you want to start working remotely?"), "label 2 must exist");
  assert.ok(src.includes("What have you already tried to get a remote job or client?"), "label 3 must exist");
  assert.ok(src.includes("What is your biggest obstacle right now?"), "label 4 must exist");
  assert.ok(src.includes("What type of remote work interests you most?"), "label 5 must exist");
  assert.ok(src.includes("Can you commit consistent time every week to complete the Academy and take action?"), "label 6 must exist");
  assert.ok(src.includes("If selected, would you be ready to join at ₱6,900?"), "label 7 must exist");
});

test("answers field schema preserves field ordering", () => {
  const src = source();
  const schemaMatch = src.match(/const ANSWER_FIELD_SCHEMA=\[([\s\S]*?)\];/);
  assert.ok(schemaMatch, "ANSWER_FIELD_SCHEMA must be defined");
  const schema = schemaMatch[1];
  const order = [
    "current_situation",
    "why_remote_work",
    "what_tried",
    "biggest_obstacle",
    "remote_work_interest",
    "weekly_commitment",
    "payment_readiness",
  ];
  let lastIdx = -1;
  for (const field of order) {
    const idx = schema.indexOf(`field:"${field}"`);
    assert.ok(idx > lastIdx, `field ${field} must appear in correct order`);
    lastIdx = idx;
  }
});

test("answers response defines exactly seven canonical fields", () => {
  const src = source();
  const schemaMatch = src.match(/const ANSWER_FIELD_SCHEMA=\[([\s\S]*?)\];/);
  assert.ok(schemaMatch, "ANSWER_FIELD_SCHEMA must be defined");
  assert.strictEqual(
    (schemaMatch[1].match(/\{field:/g) || []).length,
    7,
    "response schema must contain exactly seven field definitions"
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
});

test("duplicate application-decision emails were removed from admin-api", () => {
  const src = source();
  assert.ok(!src.includes('if(action==="decision")'), "admin-api must not own application decisions");
  assert.ok(!src.includes("api.resend.com"), "admin-api must not send email");
  assert.ok(!src.includes("emailShell"), "the duplicate email shell must be gone");
});

test("verifyToken is required for answers", () => {
  const src = source();
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
  assert.ok(!answersBlock.includes("select('*')"), "must not use select('*')");
  assert.ok(!answersBlock.includes('select("*")'), 'must not use select("*")');
  assert.ok(answersBlock.includes("ANSWER_FIELDS.join"), "must use ANSWER_FIELDS allowlist");
});

test("fetchAppAnswers consumes fields and applications contract", () => {
  const src = adminHtml();
  const block = src.slice(src.indexOf("async function fetchAppAnswers"), src.indexOf("function hydrateOpenApps"));
  assert.ok(block.includes("answerSchema = Array.isArray(data.fields) ? data.fields : [];"), "client must populate answerSchema from data.fields");
  assert.ok(block.includes("Array.isArray(data.applications)"), "client must consume data.applications");
  assert.ok(!block.includes("data.answers"), "client must not depend on obsolete data.answers");
  assert.ok(block.includes("answerCache.set(String(row.id), row)"), "application id must be the cache key");
  assert.ok(block.includes("answers: {}"), "missing applications must retain a safe nested answers fallback");
});

test("paintAnswers uses populated schema and nested answers", () => {
  const src = adminHtml();
  const block = src.slice(src.indexOf("function paintAnswers"), src.indexOf("function paintAppAnswers"));
  assert.ok(block.includes("answerSchema.map"), "paintAnswers must render the populated schema");
  assert.ok(block.includes("record.answers || {}"), "paintAnswers must read nested answers");
});
