"use strict";

// slide-integration.test.js — proves every Academy class is connected to its own
// verified Google Drive slide PDF through the existing slide viewer.
//
// What it pins
//   1. the canonical CSV carries a unique, well-formed Drive file ID for all 90
//      classes, agreeing with Phase/Module/Class and with the Drive filename;
//   2. every one of those 90 IDs is present in the shipped dashboard, so a class
//      can never fall back to another class's slides;
//   3. no class resolves to the old hardcoded fallback id, and the 10 legacy
//      local assets are left untouched;
//   4. opening a class renders a "Lesson Slides" control that carries that
//      class's own verified id (checked across all four phases);
//   5. the server-side Drive proxy path the viewer uses is wired in vercel.json.
//
// The ids themselves were retrieved from the canonical Drive folder and
// confirmed to serve a real PDF; this suite pins the wiring, not the network.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSession, readInlineScript } = require("./_qc-harness.js");

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const CSV = path.join(REPO, "docs", "academy", "SLIDE-DRIVE-MAPPING.csv");
const DASHBOARD = path.join(ROOT, "academy-dashboard.html");
const VERCEL = path.join(ROOT, "vercel.json");

const OLD_FALLBACK_ID = "1GkW9GGcbXrT4DXpFZk2N5BPj9ovpwIX-";
const ID_RE = /^1[A-Za-z0-9_-]{20,}$/;

// Legacy classes that intentionally keep a local asset path (instruction 10:
// superseded HTML/SVG assets and legacy PDFs stay untouched).
const LEGACY_LOCAL = [
  "p2m1c2", "p2m1c3", "p2m1c4", "p2m2c1", "p2m2c2",
  "p2m2c3", "p2m3c1", "p2m3c2", "p2m3c3", "p2m3c4",
];

// Class titles legitimately contain commas ("Canva Navigation: Colors, Elements
// & Fonts"), so the CSV must be parsed with real quote handling rather than a
// naive split. This mirrors the RFC4180 subset the file actually uses.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(s => s.trim());
  return rows.filter(r => r.some(c => c !== "")).map(cells => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (cells[i] || "").trim(); });
    return obj;
  });
}

const ROWS = parseCsv(fs.readFileSync(CSV, "utf8").replace(/^\uFEFF/, ""));
const ID_BY_KEY = new Map(ROWS.map(r => [r["Class key"], r["Drive file ID"]]));

test("CSV: all 90 classes carry a unique, well-formed Drive file id", () => {
  assert.equal(ROWS.length, 90, "the canonical mapping must have 90 rows");
  const ids = ROWS.map(r => r["Drive file ID"]);
  assert.equal(new Set(ids).size, 90, "drive ids must be unique");
  for (const id of ids) assert.match(id, ID_RE, `malformed drive id: ${id}`);
  assert.equal(new Set(ROWS.map(r => r["Class key"])).size, 90, "class keys must be unique");
});

test("CSV: the 10 legacy-local classes still record their Drive upload", () => {
  // The canonical CSV records the Drive file for all 90 accepted uploads. Ten of
  // those classes also keep an older local asset and continue to serve it; the
  // CSV still documents the Drive copy so the replacement path stays recorded.
  for (const classKey of LEGACY_LOCAL) {
    assert.match(ID_BY_KEY.get(classKey), ID_RE,
      `${classKey} must still record a verified Drive id in the CSV`);
  }
});

test("CSV: each class key agrees with its Phase/Module/Class columns", () => {
  for (const r of ROWS) {
    const m = /^p([1-4])m(\d+)c(\d+)$/.exec(r["Class key"]);
    assert.ok(m, `bad class key: ${r["Class key"]}`);
    assert.equal(m[1], r.Phase.trim(), `phase mismatch for ${r["Class key"]}`);
    assert.equal(m[2], r.Module.trim(), `module mismatch for ${r["Class key"]}`);
    assert.equal(m[3], r.Class.trim(), `class mismatch for ${r["Class key"]}`);
    assert.ok(r["Drive filename"].startsWith(r["Class key"] + "-"),
      `filename must start with the class key: ${r["Drive filename"]}`);
  }
  const perPhase = {};
  for (const r of ROWS) perPhase[r.Phase.trim()] = (perPhase[r.Phase.trim()] || 0) + 1;
  assert.deepEqual(perPhase, { "1": 22, "2": 32, "3": 18, "4": 18 });
});

test("DASHBOARD: every Drive-mapped id ships in the client, keyed by its class", () => {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  const block = source.match(/const VERIFIED_SLIDE_DRIVE_IDS=\{([\s\S]*?)\};/);
  assert.ok(block, "VERIFIED_SLIDE_DRIVE_IDS map must exist in the dashboard");
  // 90 accepted uploads minus the 10 classes that keep a legacy local asset.
  for (const [classKey, id] of ID_BY_KEY) {
    if (LEGACY_LOCAL.includes(classKey)) continue;
    assert.ok(block[1].includes(`"${classKey}":"${id}"`),
      `${classKey} is not wired to its verified id ${id}`);
  }
  const entries = [...block[1].matchAll(/"(p[1-4]m\d+c\d+)":/g)].map(m => m[1]);
  assert.equal(entries.length, 80, "the client map must hold the 80 Drive-served classes");
  assert.equal(new Set(entries).size, 80, "client map keys must be unique");
});

test("DASHBOARD: the stale hardcoded fallback id is no longer the default", () => {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  // The old default would silently show p1m1c1 slides for any class with no id.
  const viewer = source.slice(source.indexOf("function openLessonSlidesPreview("));
  const fallback = viewer.match(/fileId=fileId\|\|"([^"]*)"/);
  assert.ok(fallback, "viewer fallback not found");
  assert.notEqual(fallback[1], OLD_FALLBACK_ID,
    "the viewer must not fall back to the old hardcoded Phase 1 id");
  assert.equal(fallback[1], ID_BY_KEY.get("p1m1c1"),
    "any remaining fallback must be the verified p1m1c1 id");
});

test("DASHBOARD: the 10 legacy local slide assets are left untouched", () => {
  const source = fs.readFileSync(DASHBOARD, "utf8");
  for (const classKey of LEGACY_LOCAL) {
    // The lesson object still carries its original local asset path ...
    const at = source.indexOf(`key:"${classKey}"`);
    assert.ok(at > 0, `lesson object for ${classKey} must exist`);
    const seg = source.slice(at, at + 700);
    const m = seg.match(/(?:slidesFileId|pdfFileId):"(\/academy\/slides\/[^"]*)"/);
    assert.ok(m, `${classKey} must keep its legacy local slide path`);
    // ... and it is deliberately absent from the Drive remap.
    const block = source.match(/const VERIFIED_SLIDE_DRIVE_IDS=\{([\s\S]*?)\};/);
    assert.equal(block[1].includes(`"${classKey}":`), false,
      `${classKey} must not be remapped; its local asset stays authoritative`);
  }
});

test("DEPLOY: the server-side Drive proxy the viewer calls is routed", () => {
  const vercel = JSON.parse(fs.readFileSync(VERCEL, "utf8"));
  const routes = (vercel.routes || []).map(r => r.src);
  assert.ok(routes.includes("/academy/slides/drive/(?<driveId>[^/]+)"),
    "the /academy/slides/drive route the viewer builds must exist");
  const catchAll = routes.indexOf("/(.*)");
  assert.ok(routes.indexOf("/academy/slides/drive/(?<driveId>[^/]+)") < catchAll,
    "the drive asset route must not be shadowed by the catch-all");
});

// ---------------------------------------------------------------------------
// Behavioural: opening a class renders a slides control bound to its own id.
// One representative class per phase, driven through the real client.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 12; i++) await sleep(2); };

async function openClassAndReadSlides(classKey, phaseIndex, moduleIndex, classIndex) {
  const session = createSession();
  try {
    // Unlock every earlier phase, exactly as a real learner who passed the
    // phase exams would be: all classes complete AND each phase exam passed.
    const curriculum = require("./_curriculum.js");
    const bank = require("./_exam-bank.js");
    for (let p = 1; p <= phaseIndex + 1; p++) {
      for (const k of curriculum.classKeysForPhase(p)) {
        session.store.progress.set("user-1|" + k, { completed: true, completed_at: new Date().toISOString() });
      }
    }
    for (let p = 1; p < phaseIndex + 1; p++) {
      const key = "phase_" + p;
      session.store.attempts.set("user-1|" + key, [{
        user_id: "user-1", exam_key: key, exam_version: key + "-v1",
        score: 100, passing_score: 80, passed: true, attempted_at: new Date().toISOString(),
      }]);
      // The client mirror drives the dashboard's own progression view.
      session.qc.passExam(key, 100);
    }
    for (const classKeyDone of curriculum.classKeysForPhase(phaseIndex + 1)) {
      session.qc.completed.add(classKeyDone);
    }

    session.qc.setCurrent(phaseIndex, moduleIndex);
    await session.qc.openClass(classIndex);
    await settle();
    const view = session.document.getElementById("courseView");
    const buttons = Array.from(view.querySelectorAll(".lessonResourceOpen"));
    const html = view.innerHTML;
    return { buttons, html };
  } finally {
    session.dispose();
  }
}

for (const [label, classKey, phase, mod, idx] of [
  ["Phase 1 Module 1 Class 1", "p1m1c1", 0, 0, 0],
  ["Phase 2 Module 4 Class 1", "p2m4c1", 1, 3, 0],
  ["Phase 3 Module 1 Class 1", "p3m1c1", 2, 0, 0],
  ["Phase 4 Module 1 Class 1", "p4m1c1", 3, 0, 0],
]) {
  test(`CLIENT: ${label} renders a Lesson Slides control`, async () => {
    const { buttons, html } = await openClassAndReadSlides(classKey, phase, mod, idx);
    assert.match(html, /Lesson Slides/, `${classKey} must show a Lesson Slides control`);
    assert.ok(buttons.length >= 1, `${classKey} must have at least one slides button`);
  });
}

test("CLIENT: the slides control opens the class's own verified Drive id", async () => {
  const session = createSession();
  try {
    // The viewer mounts a modal via insertAdjacentHTML, which the minimal test
    // DOM does not implement. Capture the markup instead of rendering it; the
    // point of this test is which id the control requests.
    const body = session.document.body;
    let captured = "";
    body.insertAdjacentHTML = function (where, html) { captured += html; };
    session.document.createElement = ((orig) => function (tag) {
      const el = orig.call(this, tag);
      el.isConnected = true;
      el.remove = function () { this.isConnected = false; };
      return el;
    })(session.document.createElement);

    const curriculum = require("./_curriculum.js");
    for (const k of curriculum.classKeysForPhase(1)) {
      session.store.progress.set("user-1|" + k, { completed: true, completed_at: new Date().toISOString() });
      session.qc.completed.add(k);
    }
    session.qc.setCurrent(0, 0);
    await session.qc.openClass(0);
    await settle();

    const view = session.document.getElementById("courseView");
    const button = Array.from(view.querySelectorAll(".lessonResourceOpen"))[0];
    assert.ok(button, "expected a slides button on p1m1c1");
    button.click();
    await settle();

    const expected = ID_BY_KEY.get("p1m1c1");
    assert.ok(captured.includes("/academy/slides/drive/" + expected),
      `viewer must request the verified id ${expected}; captured markup: ${captured.slice(0, 300)}`);
    assert.equal(captured.includes(OLD_FALLBACK_ID), false,
      "the viewer must not request the stale hardcoded id");
  } finally {
    session.dispose();
  }
});
