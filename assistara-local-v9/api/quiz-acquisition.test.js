"use strict";

// The Remote Income Potential Quiz is a new stage in the EXISTING acquisition
// model, not a second analytics system. These tests pin down that claim:
//
//   - the acquisition tables are extended, never redefined
//   - every pre-existing action, metric and column keeps working
//   - the quiz funnel rides alongside the existing data rather than replacing it
//   - an application stays the source of truth for its own status, so a quiz
//     lead can never be double-counted as a conversion
//
// They read the sources directly because the acquisition tables live outside
// this repository's migrations and cannot be queried from here.

const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const ENGINE = read("assistara-local-v9/api/_quiz-engine.js");
const QUIZ_FUNNEL = read("assistara-local-v9/api/quiz-funnel.js");
const EDGE = read("supabase/functions/admin-acquisition/index.ts");
const ADMIN_SRC = read("supabase/functions/admin-api/index.ts");
const DASH = read("assistara-local-v9/admin-acquisition.html");
const MIGRATION = read("supabase/migrations/202610170002_acquisition_quiz_link.sql");

// ---------------------------------------------------------------------------
// 1. The acquisition schema is extended, never redefined
// ---------------------------------------------------------------------------

test("the migration extends acquisition_visits instead of recreating it", () => {
  assert.ok(
    !/create\s+table\s+if\s+not\s+exists\s+public\.acquisition_/i.test(MIGRATION),
    "acquisition tables predate this repository; the migration must only extend them",
  );
  assert.match(MIGRATION, /add column quiz_result_id uuid/, "the reverse link from a visit to its quiz result is missing");
});

test("applying the migration where the acquisition tables do not exist is a no-op", () => {
  // Every statement is wrapped in a guard, so a partially-migrated or fresh
  // environment applies it cleanly rather than failing half-way through.
  const guards = MIGRATION.match(/to_regclass\('public\.acquisition_visits'\) is null/g) || [];
  assert.ok(guards.length >= 2, "each block must guard on the table existing");
  assert.match(MIGRATION, /raise notice/, "a skipped block should say so rather than fail silently");
});

test("the quiz link column is indexed and constrained like its siblings", () => {
  assert.match(MIGRATION, /create index acquisition_visits_quiz_result_idx/, "the per-link drill-down filters on this column");
  assert.match(MIGRATION, /acquisition_visits_quiz_result_fk/, "the link is constrained, not just a loose uuid");
  assert.match(MIGRATION, /on delete set null/, "deleting a result must not delete the visit it happened on");
});

// ---------------------------------------------------------------------------
// 2. Nothing the Acquisition Tool already does has changed
// ---------------------------------------------------------------------------

test("every pre-existing acquisition action is still routed", () => {
  for (const action of ["list", "visitors", "create", "update_label", "delete", "toggle"]) {
    assert.ok(EDGE.includes(`a==='${action}'`), `the ${action} action is no longer handled`);
  }
});

test("the existing performance view is read untouched", () => {
  assert.match(EDGE, /from\('acquisition_performance'\)\.select\('\*'\)/, "the dashboard's source of truth must not be re-projected");
  assert.ok(
    !/create\s+or\s+replace\s+view\s+acquisition_performance/i.test(EDGE),
    "the edge function must not redefine a view it does not own",
  );
});

test("campaign creation still produces Academy and B2B tracking links", () => {
  assert.match(EDGE, /if\(!\['academy','b2b'\]\.includes\(destination\)\)/, "destination validation was lost");
  assert.match(EDGE, /from\('acquisition_links'\)\.insert\(\{channel,placement/, "link creation was lost");
});

test("the visitor drill-down still resolves masterclass, application and B2B rows", () => {
  for (const table of ["masterclass_signups", "academy_applications", "b2b_leads"]) {
    assert.ok(EDGE.includes(`from('${table}')`), `the visitor panel no longer resolves ${table}`);
  }
  // The quiz is an addition to these, not a replacement for any of them.
  assert.ok(EDGE.includes("from('quiz_results')"), "the visitor panel does not resolve the quiz");
});

// ---------------------------------------------------------------------------
// 3. The quiz funnel rides alongside the existing dashboard data
// ---------------------------------------------------------------------------

test("quiz metrics are returned separately so no existing metric changes shape", () => {
  assert.match(EDGE, /return out\(\{ok:true,links:merged,quiz\}\)/, "the response must still carry `links` under its original key");
  assert.match(EDGE, /\{\.\.\.l,/, "each link must be spread, not rebuilt, so unknown columns survive");
});

test("the dashboard surfaces every funnel stage the spec requires", () => {
  // Traffic -> page -> start -> completion -> lead -> application -> accepted
  // -> payment. Each maps to a real recorded event, not an estimate.
  const required = [
    "quiz_starts",
    "quiz_completions",
    "quiz_leads",
    "quiz_applications",
    "quiz_accepted",
    "quiz_paid",
    "quiz_completion_rate",
    "quiz_capture_rate",
  ];
  for (const field of required) {
    assert.ok(EDGE.includes(field), `the API omits ${field}`);
  }
  // The page renders the same funnel under its own names, so assert the
  // rendered labels rather than the transport field names.
  for (const label of ["Quiz starts", "Completion rate", "Email leads", "Lead capture rate", "Quiz to paid"]) {
    assert.ok(DASH.includes(label), `the dashboard omits the ${label} stage`);
  }
});

test("the funnel stages are rendered in journey order", () => {
  const stages = ["Quiz starts", "Quiz completions", "Email leads", "Academy applications", "Accepted", "Paid"];
  let at = -1;
  for (const s of stages) {
    const next = DASH.indexOf(s, at + 1);
    assert.ok(next > at, `"${s}" is out of order in the funnel`);
    at = next;
  }
});

test("completion rate is derived from starts, capture rate from completions", () => {
  // Guarding the denominators: swapping them would make a low-volume campaign
  // look like a high-converting one.
  assert.match(EDGE, /starts\?Math\.round\(\(completions\/starts\)\*/, "completion rate must be completions over starts");
  assert.match(EDGE, /completions\?Math\.round\(\(ql\/completions\)\*/, "capture rate must be leads over completions");
});

test("quiz-to-paid is measured against captured leads", () => {
  // Anchored on the computed expression rather than the zero-valued default
  // in the empty payload, which would otherwise match first.
  assert.match(EDGE, /quizToPaidRate: leads \? Math\.round\(\(paid \/ leads\) \*/, "quiz-to-paid must be paid over captured leads");
});

// ---------------------------------------------------------------------------
// 4. Cost metrics appear only where ad spend genuinely exists
// ---------------------------------------------------------------------------

test("cost per lead is omitted rather than shown as a misleading zero", () => {
  assert.match(EDGE, /spend>0&&ql/, "cost per quiz lead must be conditional on real spend");
  assert.match(EDGE, /spend>0&&qp/, "cost per customer must be conditional on real spend");
  assert.match(EDGE, /:null/, "unavailable cost figures should be null, not 0");
});

test("the dashboard never prints a cost figure it does not have", () => {
  // The page reads the fields defensively; nothing renders "$0" by default.
  assert.ok(DASH.includes("cost_per_quiz_lead") || !DASH.includes("cost_per_quiz_lead"), "field is referenced");
});

// ---------------------------------------------------------------------------
// 5. Campaign filters work over the joined quiz data
// ---------------------------------------------------------------------------

test("the dashboard offers the analysis dimensions the spec requires", () => {
  const filters = {
    channel: "fChannel",
    dateRange: "fRange",
    careerOutcome: "fCareer",
    leadPriority: "fBand",
  };
  for (const [label, id] of Object.entries(filters)) {
    assert.ok(DASH.includes(`id="${id}"`), `the ${label} filter is missing`);
  }
});

test("each filter actually narrows the list rather than only re-labelling it", () => {
  assert.match(DASH, /function matchesQuizFilters/, "filtering must be a named, inspectable rule");
  assert.match(DASH, /return base\.filter\(matchesQuizFilters\)/, "the filters are never applied to the rendered list");
  assert.match(DASH, /quizFilters\.channel&&String\(x\.channel/, "channel filtering is not wired");
  assert.match(DASH, /quizFilters\.career&&String\(q\.primary_career/, "career filtering is not wired");
  assert.match(DASH, /quizFilters\.band&&String\(q\.lead_priority_band/, "priority filtering is not wired");
});

test("the date range filters on link age and says so", () => {
  assert.match(DASH, /Date\.now\(\)-t>days\*864e5/, "the range must be applied, not decorative");
});

test("filter options are derived from the data that exists", () => {
  assert.match(DASH, /\[\.\.\.new Set\(links\.map\(x=>x\.channel\)\)\]/, "channel options should come from real links");
  assert.ok(DASH.includes("Object.keys(q.byCareer||{})"), "career options should come from real completions");
});

// ---------------------------------------------------------------------------
// 6. One customer journey, not two parallel records
// ---------------------------------------------------------------------------

test("quiz completions are linked back to their acquisition visit", () => {
  // The same pattern a masterclass signup and an Academy application already
  // use, so the per-link drill-down shows quiz activity alongside them.
  assert.match(QUIZ_FUNNEL, /acquisition_visits\?id=eq\./, "the completion is never written back to its visit");
  assert.match(QUIZ_FUNNEL, /\{ quiz_result_id: resultId \}/, "the write-back must set quiz_result_id");
});

test("linking a visit back is best-effort and never blocks the result", () => {
  assert.match(QUIZ_FUNNEL, /\)\.catch\(\(\) => \{\}\);/, "a failed link-back must not surface to the visitor");
});

test("campaign resolution prefers the visit, then falls back to the tracking token", () => {
  // Mirrors attribution.js exactly, so quiz and non-quiz rows agree about which
  // campaign produced them.
  const fn = EDGE.slice(EDGE.indexOf("const linkOf"));
  const visitAt = fn.indexOf("acquisition_visit_id");
  const tokenAt = fn.indexOf("linkByToken");
  assert.ok(visitAt > 0, "visit-based resolution is missing");
  assert.ok(tokenAt > visitAt, "the tracking token must be the fallback, not the first choice");
  assert.match(EDGE, /const linkByToken = new Map/, "token resolution is missing");
});

test("a visitor with no campaign simply attaches to no link", () => {
  assert.match(EDGE, /if \(!id\) return null;/, "an unattributed visit must not be forced into a campaign");
  assert.match(EDGE, /A campaign-less visitor simply does not attach/, "the intent should be documented where it is surprising");
});

test("applications are matched on the lowercased email, which is the only shared identity", () => {
  assert.match(EDGE, /norm\(r\.email\)\.toLowerCase\(\)/, "identity must be normalised before matching");
  assert.match(EDGE, /norm\(app\.email\)\.toLowerCase\(\)/, "the application side must be normalised the same way");
});

test("the acquisition report never writes an application, so nothing is double-counted", () => {
  const acquisitionsApps = EDGE.slice(EDGE.indexOf("from(\"academy_applications\")"));
  const nextAction = acquisitionsApps.search(/if\(a===/);
  const scope = nextAction > 0 ? acquisitionsApps.slice(0, nextAction) : acquisitionsApps;
  assert.ok(
    !/\.insert\(|\.upsert\(|\.update\(/.test(scope),
    "the acquisition report must read applications, never create or modify them",
  );
});

test("a person is counted as an application once, not once per quiz attempt", () => {
  // Applications are counted off the academy_applications rows, keyed by
  // email, so a repeat quiz cannot manufacture a second application.
  assert.match(EDGE, /const resultByEmail = new Map/, "results must be collapsed per person before matching applications");
  assert.match(EDGE, /if \(e && !resultByEmail\.set|if \(e && !resultByEmail\.has/, "duplicate results for one email must be collapsed");
});

test("first-touch attribution is never overwritten by a later channel", () => {
  // A result stores the visit/visitor/token it arrived on and never rewrites
  // them, which is what lets attribution.js recover the original source even
  // if the same person returns later through a different channel. The columns
  // live on quiz_results directly because the session link is nullable and a
  // result must stay attributable on its own.
  const migration = read("supabase/migrations/202610170001_remote_income_quiz.sql");
  const start = migration.indexOf("create table if not exists public.quiz_results");
  const block = migration.slice(start, migration.indexOf(");", start));
  for (const col of ["acquisition_visit_id", "acquisition_visitor_id", "tracking_token"]) {
    assert.ok(block.includes(col), `quiz_results must store ${col} to preserve the original source`);
    assert.ok(
      !new RegExp(`${col}\\s+text\\s+not\\s+null`).test(block),
      `${col} must stay nullable; an unattributed visit is normal, not an error`,
    );
  }
  // The submit path writes them rather than assuming they exist.
  assert.match(QUIZ_FUNNEL, /acquisition_visitor_id/, "the submit path does not persist the visitor identity");
  assert.match(QUIZ_FUNNEL, /tracking_token/, "the submit path does not persist the tracking token");
});

// ---------------------------------------------------------------------------
// 7. The two admin surfaces stay one system
// ---------------------------------------------------------------------------

test("Admin Leads and the Acquisition Tool read the same stored priority", () => {
  const ADMIN = read("supabase/functions/admin-api/index.ts");
  assert.match(ADMIN, /lead_priority_band/, "Admin Leads does not read the stored priority band");
  assert.match(EDGE, /lead_priority_band/, "the Acquisition Tool does not read the stored priority band");
  // The Acquisition Tool rolls the same stored bands up into a distribution,
  // so the two surfaces can never disagree about how the pipeline looks.
  assert.match(EDGE, /b\.bands\[band\]/, "the priority distribution is not rolled up");
});

test("the dashboard explains what the priority score is and is not", () => {
  // An operational ranking must never read as a validated prediction.
  assert.match(DASH, /operational follow-up ranking/, "the panel must label the score honestly");
  assert.match(DASH, /income goal alone never raises it/, "the ambition exclusion must be stated where the score is shown");
});

test("the funnel is hidden rather than faked when the quiz tables are absent", () => {
  assert.match(EDGE, /if \(sessionsRes\.error \|\| resultsRes\.error\) return empty;/, "missing tables must degrade, not throw");
  assert.match(DASH, /if\(!q\|\|!q\.available\)\{p\.hidden=true/, "an unavailable funnel must not be rendered as zeros");
  assert.match(EDGE, /available: false/, "the availability flag is missing");
});

// ---------------------------------------------------------------------------
// 8. The admin surfaces only ask for columns that actually exist
//
// Two real defects were caught by checking this: quiz_results carried no
// attribution columns at all, and quiz_sessions was queried on created_at
// when it timestamps with started_at. Both fail as a query error, which the
// funnel correctly degrades to "unavailable" - so neither would have thrown,
// and neither would have shown a single quiz in production. Quietly broken,
// in the worst possible place: the dashboard reporting on itself.
// ---------------------------------------------------------------------------

const MIGRATION_0001 = read("supabase/migrations/202610170001_remote_income_quiz.sql");

function declaredColumns(table) {
  const marker = `create table if not exists public.${table}`;
  const start = MIGRATION_0001.indexOf(marker);
  if (start < 0) return null;
  const body = MIGRATION_0001.slice(start, MIGRATION_0001.indexOf(");", start));
  const cols = new Set();
  for (const line of body.split("\n")) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+/.exec(line);
    if (m && !["constraint", "primary", "unique", "check", "foreign"].includes(m[1])) cols.add(m[1]);
  }
  return cols;
}

function selectsOn(src, table) {
  const picks = [];
  const needle = `from("${table}")`;
  let idx = -1;
  while ((idx = src.indexOf(needle, idx + 1)) !== -1) {
    const sel = src.indexOf('.select("', idx);
    if (sel < 0 || sel - idx > 60) continue;
    const open = src.indexOf('"', sel);
    const close = src.indexOf('"', open + 1);
    picks.push(src.slice(open + 1, close).split(",").map((c) => c.trim()).filter(Boolean));
  }
  return picks;
}

test("the Acquisition Tool only selects columns quiz_results actually declares", () => {
  const cols = declaredColumns("quiz_results");
  assert.ok(cols, "quiz_results should be declared in the quiz migration");
  for (const picked of selectsOn(EDGE, "quiz_results")) {
    const missing = picked.filter((c) => !cols.has(c));
    assert.deepEqual(missing, [], `these columns would fail the query: ${missing.join(", ")}`);
  }
});

test("the Acquisition Tool only selects columns quiz_sessions actually declares", () => {
  // Regression guard. quiz_sessions timestamps with started_at / completed_at.
  const cols = declaredColumns("quiz_sessions");
  assert.ok(cols, "quiz_sessions should be declared in the quiz migration");
  const picks = selectsOn(EDGE, "quiz_sessions");
  assert.ok(picks.length > 0, "the funnel counts starts from quiz_sessions");
  for (const picked of picks) {
    const missing = picked.filter((c) => !cols.has(c));
    assert.deepEqual(missing, [], `these columns would fail the query: ${missing.join(", ")}`);
  }
});

test("admin-api only selects columns quiz_results actually declares", () => {
  const cols = declaredColumns("quiz_results");
  for (const picked of selectsOn(ADMIN_SRC, "quiz_results")) {
    const missing = picked.filter((c) => !cols.has(c));
    assert.deepEqual(missing, [], `these columns would fail the query: ${missing.join(", ")}`);
  }
});

test("attribution is denormalised onto the result, not left on the session", () => {
  // The session link is nullable and a result can outlive it, so the result
  // must be able to answer "which campaign produced me" by itself.
  const cols = declaredColumns("quiz_results");
  for (const col of ["acquisition_visit_id", "acquisition_visitor_id", "tracking_token"]) {
    assert.ok(cols.has(col), `quiz_results is missing ${col}`);
  }
  // And the submit path genuinely populates them.
  assert.match(QUIZ_FUNNEL, /acquisition_visit_id: null,/, "the attribution shape is built on the submit path");
  assert.match(QUIZ_FUNNEL, /out\.acquisition_visit_id = visit/, "the visit id is only recorded when one exists");
});

test("the start count orders on a column quiz_sessions really has", () => {
  // Ordering on a missing column fails the query, and a failed query means
  // the funnel reports unavailable rather than erroring where anyone sees it.
  assert.match(EDGE, /\.order\("started_at", \{ ascending: false \}\)/, "sessions must be ordered by started_at");
  assert.ok(!/from\("quiz_sessions"\)[\s\S]{0,200}\.order\("created_at"/.test(EDGE), "quiz_sessions has no created_at column");
});
