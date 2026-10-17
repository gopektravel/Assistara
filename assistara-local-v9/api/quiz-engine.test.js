"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("./_quiz-engine");
const report = require("./_quiz-report");

const {
  QUESTIONS,
  CAREERS,
  CAREER_ORDER,
  SCORING_VERSION,
  REPORT_VERSION,
  INCOME_MODEL,
  normaliseAnswers,
  scoreAnswers,
  readinessFor,
  incomeScenarios,
  leadPriority,
  leadPriorityBand,
  LEAD_PRIORITY,
} = engine;

const { buildReport } = report;

// --- Complete answer payloads used across the suite -------------------------
function base(over) {
  return Object.assign(
    {
      q1: "a",
      q2: 25000,
      q3: "c",
      q4: "a",
      q5: "a",
      q6: ["t1", "t4"],
      q7: "a",
      q8: "a",
      // The qualifications question. Default is the lowest rung so that the
      // "no formal qualifications" path is the reference point: nothing a test
      // asserts about readiness or lead priority may depend on a degree.
      q9: ["hs"],
      q10: "a",
    },
    over || {},
  );
}

function norm(over) {
  const r = normaliseAnswers(base(over));
  assert.equal(r.ok, true, r.error || "expected a valid payload");
  return r.answers;
}

function score(over) {
  return scoreAnswers(norm(over));
}

function reportFor(over, extra) {
  return buildReport(
    Object.assign({ answers: norm(over) }, extra || {}),
  );
}

// ---------------------------------------------------------------------------
// 1. All ten questions exist and are well formed
// ---------------------------------------------------------------------------
test("all ten questions are present, ordered and well formed", () => {
  assert.equal(QUESTIONS.length, 10);
  assert.deepEqual(
    QUESTIONS.map((q) => q.id),
    ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"],
  );
  for (const q of QUESTIONS) {
    assert.ok(q.kicker, `${q.id} needs a progress kicker`);
    assert.ok(q.title && q.title.length > 10, `${q.id} needs a real title`);
    assert.ok(q.purpose, `${q.id} needs a documented purpose`);
    if (q.type !== "income") {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} needs options`);
      const keys = q.options.map((o) => o.key);
      assert.equal(new Set(keys).size, keys.length, `${q.id} has duplicate option keys`);
      for (const o of q.options) assert.ok(o.label && o.label.length > 0, `${q.id}.${o.key} needs a label`);
    }
  }
  // No question may require prior VA knowledge: none of them mention VA tools
  // as a prerequisite in the question title itself.
  for (const q of QUESTIONS) {
    assert.doesNotMatch(q.title, /virtual assistant certification|VA experience required/i);
  }
});

// ---------------------------------------------------------------------------
// 2. Validation, multi-select exclusivity, clamping
// ---------------------------------------------------------------------------
test("an incomplete payload is rejected rather than silently accepted", () => {
  const bad = base();
  delete bad.q7;
  const r = normaliseAnswers(bad);
  assert.equal(r.ok, false);
  assert.match(r.error, /q7/);
});

test("an unknown option value is rejected", () => {
  const r = normaliseAnswers(base({ q4: "zzz" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /q4/);
});

test("q6 multi-select keeps canonical order and de-duplicates", () => {
  const r = normaliseAnswers(base({ q6: ["t7", "t1", "t7", "t4"] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.answers.q6, ["t1", "t4", "t7"]);
});

test("'none yet' is mutually exclusive with every other tool choice", () => {
  const ok1 = normaliseAnswers(base({ q6: ["tnone"] }));
  assert.equal(ok1.ok, true);
  assert.deepEqual(ok1.answers.q6, ["tnone"]);

  const bad = normaliseAnswers(base({ q6: ["t1", "tnone"] }));
  assert.equal(bad.ok, false, "mixing 'none yet' with a tool must be refused");
  assert.match(bad.error, /exclusive/i);
});

test("an empty multi-select is refused", () => {
  const r = normaliseAnswers(base({ q6: [] }));
  assert.equal(r.ok, false);
});

test("the income goal is clamped into range and snapped to the step", () => {
  assert.equal(norm({ q2: 1 }).q2, 5000, "below the floor snaps up");
  assert.equal(norm({ q2: 9999999 }).q2, 100000, "above the ceiling snaps down");
  assert.equal(norm({ q2: 27000 }).q2, 25000, "snapped down to the nearest 5000");
  assert.equal(norm({ q2: 28000 }).q2, 30000, "snapped up to the nearest 5000");
  assert.equal(norm({ q2: 62000 }).q2, 60000, "mid-range values snap to the grid");
  // A non-numeric goal must be refused outright rather than becoming NaN in a
  // stored record or in the income maths.
  const bad = normaliseAnswers(base({ q2: "not-a-number" }));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /income/i);
});

// ---------------------------------------------------------------------------
// 3. Income calculations (transparent maths)
// ---------------------------------------------------------------------------
test("monthly gross uses paid hours x 52 / 12 x rate", () => {
  const inc = incomeScenarios(norm({ q2: 30000, q3: "c" }));
  const paid = 15; // 11-20 hours modelled at 15
  const expected = Math.round(paid * (52 / 12) * 400);
  const found = inc.scenarios.find((s) => s.rate === 400);
  assert.equal(inc.weeklyHours, paid);
  assert.equal(found.monthly, expected);
  assert.equal(inc.formula, "monthly gross = paid hours per week × 52 ÷ 12 × hourly rate");
  assert.equal(inc.weeksPerYear, 52);
  assert.equal(inc.monthsPerYear, 12);
});

test("the required hourly rate to hit the goal is derived, not invented", () => {
  const inc = incomeScenarios(norm({ q2: 30000, q3: "c" }));
  const paid = 15;
  assert.equal(inc.requiredRate, Math.ceil(30000 / (paid * (52 / 12))));
  // Verify it actually closes the gap.
  const back = Math.round(paid * (52 / 12) * inc.requiredRate);
  assert.ok(back >= 30000, "the derived rate must reach the goal");
  assert.ok(back - 30000 < 6000, "and must not wildly overshoot it");
});

test("hours needed at each example rate are computed consistently", () => {
  const inc = incomeScenarios(norm({ q2: 50000, q3: "b" }));
  for (const h of inc.hoursNeeded) {
    assert.ok(Number.isFinite(h.hours) && h.hours > 0);
    const back = Math.round(h.hours * (52 / 12) * h.rate);
    assert.ok(back >= 50000, `rate ${h.rate} must reach the goal`);
  }
});

test("every rate is labelled an example until the market data is verified", () => {
  const inc = incomeScenarios(norm({}));
  assert.equal(inc.labelledAsTypical, false, "rates must never be called typical");
  for (const s of inc.scenarios) assert.equal(s.isExample, true);
  assert.ok(inc.modellingNotes.length >= 5);
  assert.ok(inc.modellingNotes.some((n) => /not earnings predictions|illustrative/i.test(n)));
  assert.ok(inc.modellingNotes.some((n) => /guarantee/i.test(n)));
  assert.ok(inc.modellingNotes.some((n) => /taxes|platform fees/i.test(n)));
});

test("open-ended hour ranges are modelled at a documented value", () => {
  const low = incomeScenarios(norm({ q3: "a" }));
  assert.equal(low.weeklyHoursOpenEnded, true);
  assert.equal(low.weeklyHours, INCOME_MODEL.openEndedModelling.a.modelledAt);
  assert.equal(low.weeklyHoursModelledAt, 4);

  const high = incomeScenarios(norm({ q3: "f" }));
  assert.equal(high.weeklyHoursOpenEnded, true);
  assert.equal(high.weeklyHours, INCOME_MODEL.openEndedModelling.f.modelledAt);
  assert.equal(high.weeklyHoursModelledAt, 40);

  const mid = incomeScenarios(norm({ q3: "d" }));
  assert.equal(mid.weeklyHoursOpenEnded, false);
  assert.equal(mid.weeklyHours, 25);
});

// ---------------------------------------------------------------------------
// 4. Determinism, reachability, tie-breaks
// ---------------------------------------------------------------------------
test("scoring is deterministic across repeated runs", () => {
  const answers = norm({ q4: "f", q5: "b", q6: ["t6", "t3"] });
  const a = scoreAnswers(answers);
  const b = scoreAnswers(JSON.parse(JSON.stringify(answers)));
  assert.deepEqual(a, b);
  assert.equal(a.scoringVersion, SCORING_VERSION);
});

test("the signal ordering is q4 > q5 > any single tool, as specified", () => {
  // Documented contract, not an accident of the current numbers.
  assert.ok(engine.PRIMARY_WEIGHT > engine.SECONDARY_WEIGHT, "q4 must outrank q5");
  const maxTool = Math.max(
    ...Object.values(engine.TOOL_WEIGHTS).flatMap((m) => Object.values(m)),
  );
  assert.equal(maxTool, engine.MAX_TOOL_CONTRIBUTION);
  assert.ok(engine.SECONDARY_WEIGHT > maxTool, "q5 must outrank any single tool");

  // q4 vs q5 on different careers: q4 wins the primary slot.
  const conflict = score({ q4: "b", q5: "f", q6: ["tnone"] });
  assert.equal(conflict.primary, "creative");
  assert.equal(conflict.secondary, "systems");

  // Stacked evidence still beats a lone q4, which is the point of having
  // supporting evidence at all — q5 plus q6 on the same career.
  const stacked = score({ q4: "b", q5: "f", q6: ["t6"] });
  assert.equal(stacked.primary, "systems");
  assert.ok(stacked.scores.systems > stacked.scores.creative);

  // But no SINGLE tool selection can outrank q5 on a different career.
  const toolOnly = score({ q4: "a", q5: "c", q6: ["t6"] });
  assert.ok(
    toolOnly.scores.connector > toolOnly.scores.systems,
    "q5 (4) must beat a lone tool (3)",
  );
});

test("all seven career outcomes are reachable as the primary match", () => {
  const byMission = {
    a: "organizer",
    b: "creative",
    c: "connector",
    d: "detective",
    e: "growth",
    f: "systems",
    g: "builder",
  };
  for (const [key, career] of Object.entries(byMission)) {
    const s = score({ q4: key, q5: key, q6: ["tnone"] });
    assert.equal(s.primary, career, `q4="${key}" should reach ${career}`);
    assert.ok(s.secondary, "every profile should still offer a secondary path");
    assert.notEqual(s.secondary, s.primary, "secondary must differ from primary");
    assert.ok(CAREERS[career], "the matched id must resolve to a real career");
    assert.ok(CAREERS[s.secondary], "the secondary id must resolve to a real career");
  }
});

test("ties resolve to the canonical order, never to chance", () => {
  // Two careers at an identical score.
  const a = scoreAnswers({ q1: "a", q2: 5000, q3: "a", q4: "a", q5: "b", q6: ["tnone"], q7: "a", q8: "a", q9: ["hs"], q10: "a" });
  const b = scoreAnswers({ q1: "a", q2: 5000, q3: "a", q4: "b", q5: "a", q6: ["tnone"], q7: "a", q8: "a", q9: ["hs"], q10: "a" });
  // both have one 6 and one 4 on different careers -> tie at 6
  assert.notEqual(a.primary, null);
  const winner = CAREER_ORDER.indexOf(a.primary) < CAREER_ORDER.indexOf(b.primary) ? a : b;
  const loser = winner === a ? b : a;
  assert.ok(CAREER_ORDER.indexOf(winner.primary) < CAREER_ORDER.indexOf(loser.primary));
  assert.equal(winner.scores[winner.primary], loser.scores[loser.primary], "the contest must actually be a tie");
});

test("the ordering is a total, stable order", () => {
  const s = score({ q4: "g", q5: "g", q6: ["t7", "t1", "t4"] });
  assert.deepEqual(s.order, engine.sortedCareers(s.scores));
  assert.equal(new Set(s.order).size, 7, "every career appears exactly once");
  assert.deepEqual(s.order.slice().sort(), CAREER_ORDER.slice().sort());
});

test("income ambition and timeline never change the career personality", () => {
  const a = score({ q2: 5000, q10: "e" });
  const b = score({ q2: 100000, q10: "a" });
  assert.equal(a.primary, b.primary);
  assert.equal(a.secondary, b.secondary);
  assert.deepEqual(a.scores, b.scores);
});

test("readiness is separate from career matching", () => {
  const beginner = readinessFor(norm({ q7: "a", q6: ["tnone"] }));
  const veteran = readinessFor(norm({ q7: "e", q6: ["t1", "t6", "t5"] }));
  assert.equal(beginner.stage, 1);
  assert.equal(veteran.stage, 5);
  const s1 = score({ q7: "a", q6: ["tnone"] });
  const s2 = score({ q7: "e", q6: ["t1", "t6", "t5"] });
  assert.equal(s1.primary, s2.primary, "readiness must not move the career match");
});

test("readiness stages stay inside the documented five", () => {
  for (const step of ["a", "b", "c", "d", "e"]) {
    for (const tools of [["tnone"], ["t1"], ["t1", "t2", "t3", "t4", "t5", "t6"]]) {
      const r = readinessFor(norm({ q7: step, q6: tools }));
      assert.ok(r.stage >= 1 && r.stage <= 5, `stage ${r.stage} out of range`);
      assert.ok(engine.READINESS_STAGES.some((s) => s.id === r.stage));
      assert.equal(r.key, engine.READINESS_STAGES[r.stage - 1].key);
    }
  }
});

test("a certificate alone never implies client readiness", () => {
  const certified = readinessFor(norm({ q7: "c", q6: ["t1"] }));
  assert.equal(certified.experienceStep, 3);
  assert.ok(certified.stage <= 3, "holding a certificate must not reach 'preparing for clients'");
  // Even with strong tooling, a certificate must not jump to stage 4/5.
  const certifiedAndSkilled = readinessFor(norm({ q7: "c", q6: ["t1", "t2", "t3", "t4", "t5", "t6"] }));
  assert.ok(certifiedAndSkilled.stage <= 3, "certificate + tools still cannot mean client-ready");
});

test("transferable tools can move a beginner forward one stage", () => {
  const bare = readinessFor(norm({ q7: "a", q6: ["tnone"] }));
  const skilled = readinessFor(norm({ q7: "a", q6: ["t1", "t2", "t3", "t4", "t5", "t6"] }));
  assert.equal(bare.stage, 1);
  assert.ok(skilled.stage >= 2, "strong transferable skills should count");
});

// ---------------------------------------------------------------------------
// 5. The seven complete example profiles (§20)
// ---------------------------------------------------------------------------
const PROFILES = [
  {
    name: "Total beginner, part-time, family motivation",
    answers: { q1: "b", q2: 15000, q3: "b", q4: "a", q5: "c", q6: ["tnone"], q7: "a", q8: "a", q9: ["none"], q10: "a" },
    expect: { readinessMax: 2, track: "beginner" },
  },
  {
    name: "Creative person with existing digital skills",
    answers: { q1: "c", q2: 40000, q3: "d", q4: "b", q5: "b", q6: ["t2", "t3", "t1"], q7: "b", q8: "b", q9: ["voc"], q10: "b" },
    expect: { primary: "creative" },
  },
  {
    name: "Experienced sales professional",
    answers: { q1: "d", q2: 80000, q3: "e", q4: "e", q5: "e", q6: ["t5", "t4", "t1"], q7: "e", q8: "e", q9: ["bach"], q10: "b" },
    expect: { primary: "growth", readinessMin: 5, track: "experienced" },
  },
  {
    name: "Technically inclined beginner",
    answers: { q1: "a", q2: 30000, q3: "c", q4: "f", q5: "f", q6: ["t6", "t1"], q7: "a", q8: "b", q9: ["hs"], q10: "b" },
    expect: { primary: "systems" },
  },
  {
    name: "Existing certified VA without clients",
    answers: { q1: "d", q2: 45000, q3: "d", q4: "a", q5: "d", q6: ["t1", "t4", "t5"], q7: "c", q8: "d", q9: ["vatrain"], q10: "c" },
    expect: { track: "certified", readinessMax: 3 },
  },
  {
    name: "E-commerce worker changing careers",
    answers: { q1: "e", q2: 35000, q3: "c", q4: "g", q5: "g", q6: ["t7", "t5"], q7: "d", q8: "d", q9: ["procert"], q10: "c" },
    expect: { primary: "builder" },
  },
  {
    name: "Person with limited equipment or internet",
    answers: { q1: "a", q2: 10000, q3: "a", q4: "c", q5: "c", q6: ["tnone"], q7: "a", q8: "f", q9: ["none"], q10: "e" },
    expect: { obstacle: "equipment", readinessMax: 2, timeline: "exploring" },
  },
];

test("all seven example profiles resolve to distinct, useful recommendations", () => {
  const seen = new Map();
  for (const p of PROFILES) {
    const r = reportFor(p.answers);
    const key = `${r.primary.id}|${r.roadmap.track}|${r.obstacle.key}`;
    assert.ok(!seen.has(key), `${p.name} collided with ${seen.get(key)}`);
    seen.set(key, p.name);

    assert.ok(CAREERS[r.primary.id], `${p.name} must map to a real career`);
    assert.ok(r.primary.why.length >= 1, `${p.name} primary needs a why`);
    assert.ok(r.secondary, `${p.name} needs a secondary match`);
    assert.notEqual(r.primary.id, r.secondary.id, `${p.name} secondary must differ`);
    assert.equal(r.reportVersion, REPORT_VERSION);

    if (p.expect.primary) assert.equal(r.primary.id, p.expect.primary, `${p.name} primary`);
    if (p.expect.track) assert.equal(r.roadmap.track, p.expect.track, `${p.name} track`);
    if (p.expect.readinessMax) assert.ok(r.readiness.stage <= p.expect.readinessMax, `${p.name} readiness`);
    if (p.expect.readinessMin) assert.ok(r.readiness.stage >= p.expect.readinessMin, `${p.name} readiness`);
    if (p.expect.obstacle) assert.equal(r.obstacle.key, p.expect.obstacle, `${p.name} obstacle`);
    if (p.expect.timeline) assert.equal(r.nextStep.tone, "gentle", `${p.name} explorer must not get pressure`);
  }
  assert.equal(seen.size, PROFILES.length, "every profile must be distinct");
});

test("every one of the ten answers shapes the report", () => {
  // Each row starts from a fresh payload and changes exactly one answer, so a
  // failure always names the answer that stopped mattering.
  const rows = [
    {
      field: "q1",
      from: { q1: "a" },
      to: { q1: "c" },
      pick: (r) => r.intro.paragraphs[1],
    },
    {
      field: "q2",
      from: { q2: 25000 },
      to: { q2: 60000 },
      pick: (r) => r.income.goal,
    },
    {
      field: "q3",
      from: { q3: "c" },
      to: { q3: "f" },
      pick: (r) => r.income.weeklyHours,
    },
    {
      // q5 and q6 neutralised so question 4 is the only signal in play.
      field: "q4",
      from: { q4: "a", q5: "a", q6: ["tnone"] },
      to: { q4: "g", q5: "a", q6: ["tnone"] },
      pick: (r) => r.primary.id,
    },
    {
      // q4 is neutralised in effect: with only q5 moving, the primary stays put
      // and it is the secondary slot that must respond.
      field: "q5",
      from: { q4: "a", q5: "a", q6: ["tnone"] },
      to: { q4: "a", q5: "g", q6: ["tnone"] },
      pick: (r) => r.secondary.id,
    },
    {
      field: "q6",
      from: { q6: ["t1", "t4"] },
      to: { q6: ["tnone"] },
      pick: (r) => JSON.stringify(r.strengths.selected) + r.strengths.none,
    },
    {
      field: "q7",
      from: { q7: "a", q6: ["tnone"] },
      to: { q7: "e", q6: ["tnone"] },
      pick: (r) => r.readiness.stage + "|" + r.readiness.title,
    },
    {
      field: "q8",
      from: { q8: "a" },
      to: { q8: "f" },
      pick: (r) => r.obstacle.key,
    },
    {
      field: "q9",
      from: { q9: ["hs"] },
      to: { q9: ["bach", "procert"] },
      pick: (r) => r.strengths.qualifications.labels.join(",") + "|" + r.readiness.stage,
    },
    {
      field: "q10",
      from: { q10: "a" },
      to: { q10: "d" },
      pick: (r) => r.nextStep.body,
    },
  ];

  for (const row of rows) {
    const before = buildReport({ answers: normaliseAnswers(base(row.from)).answers });
    const after = buildReport({ answers: normaliseAnswers(base(row.to)).answers });
    assert.notDeepEqual(
      row.pick(after),
      row.pick(before),
      `changing ${row.field} must change the report`,
    );
  }

  // And the timing answer must change the tone as well as the wording.
  const explorer = buildReport({ answers: normaliseAnswers(base({ q10: "e" })).answers });
  assert.equal(explorer.nextStep.tone, "gentle");
});

// ---------------------------------------------------------------------------
// 6. Report content rules (§10)
// ---------------------------------------------------------------------------
test("the report is personalised by name and motivation, not a bare template", () => {
  const withName = reportFor({ q1: "b" }, { firstName: "Maria Santos" });
  const otherMotivation = reportFor({ q1: "c" }, { firstName: "Maria Santos" });
  const anonymous = reportFor({ q1: "c" }, { firstName: "" });

  assert.match(withName.intro.paragraphs[0], /^Hi Maria\./);
  assert.match(withName.intro.heading, /Maria/);
  // The opening sentence tracks q1 exactly.
  assert.equal(withName.intro.motivation, "b");
  assert.notDeepEqual(
    withName.intro.paragraphs,
    otherMotivation.intro.paragraphs,
    "a different motivation must write a different introduction",
  );
  assert.match(withName.intro.paragraphs.join(" "), /people who matter most/i);
  assert.match(otherMotivation.intro.paragraphs.join(" "), /freedom to work from wherever/i);
  // And it still works with no name supplied.
  assert.equal(anonymous.intro.heading, "Your remote career profile");
  assert.equal(anonymous.intro.paragraphs[0].startsWith("Hi "), false, "no fake greeting without a name");
  assert.equal(anonymous.intro.paragraphs.length, 3);
  assert.equal(withName.intro.paragraphs.length, 4);
});

test("the report covers all twelve required sections", () => {
  const r = reportFor({}, { firstName: "Ana" });
  assert.ok(r.intro && r.intro.paragraphs.length >= 3, "A personal introduction");
  assert.ok(r.primary && r.primary.why.length >= 1, "B primary match");
  assert.ok(r.secondary && r.secondary.id !== r.primary.id, "C secondary match");
  assert.ok(r.income && r.income.goal && r.income.scenarios.length >= 3, "D income analysis");
  assert.ok(r.strengths && r.strengths.paragraphs.length >= 1, "E strengths");
  assert.ok(r.readiness && r.readiness.missing.length >= 1, "F readiness");
  assert.ok(r.obstacle && r.obstacle.advice.length >= 3, "G obstacle");
  assert.ok(r.roadmap && r.roadmap.weeks.length === 4, "H 30-day roadmap");
  assert.ok(r.portfolio && r.portfolio.project.length > 30, "I portfolio project");
  assert.ok(r.lifestyle && r.lifestyle.body, "J lifestyle fit");
  assert.ok(r.nextStep && r.nextStep.cta && r.nextStep.cta.href, "K next step");
  assert.ok(r.share && r.share.url && r.share.line, "L shareable summary");
  assert.ok(r.disclaimers.length >= 4, "disclaimers travel with the report");
});

test("a report never claims a compatibility percentage", () => {
  const r = reportFor({ q4: "b", q5: "b", q6: ["t2"] });
  const flat = JSON.stringify(r);
  assert.doesNotMatch(flat, /\d{1,3}%\s*(match|compat|fit)/i);
  assert.doesNotMatch(flat, /psychometric/i.test(flat) ? /validated|normed/i : /$a/);
  assert.doesNotMatch(r.secondary.note || "", /^$/);
});

test("the share card never exposes private answers", () => {
  const r = reportFor({ q2: 100000 }, { firstName: "Ana Cruz", referral: "IG123" });
  assert.equal(r.share.excludes.includes("Email address"), true);
  assert.equal(r.share.excludes.includes("Income goal"), true);
  assert.doesNotMatch(r.share.line, /@/);
  assert.doesNotMatch(r.share.line, /100000|₱100,000/);
  assert.match(r.share.url, /ref=IG123/);
});

// ---------------------------------------------------------------------------
// 7. Certification and experience copy (§5 q7, §9)
// ---------------------------------------------------------------------------
test("certificate holders are steered to proof, not to another certificate", () => {
  const r = reportFor({ q7: "c", q8: "c", q10: "b" });
  assert.equal(r.nextStep.tone, "portfolio");
  assert.match(r.readiness.paragraphs.join(" "), /certificate|credential/i);
  assert.match(r.readiness.paragraphs.join(" "), /portfolio/i);
  assert.doesNotMatch(
    r.nextStep.body,
    /guarantee|job placement|accredited/i,
    "no employment or accreditation claim",
  );
  assert.match(r.roadmap.track, /certified|portfolio/);
  assert.match(JSON.stringify(r.roadmap.weeks), /specialization|portfolio/i);
});

test("the beginner roadmap runs foundations, practice, sample project, outreach", () => {
  const r = reportFor({ q7: "a", q6: ["tnone"] });
  assert.equal(r.roadmap.track, "beginner");
  assert.deepEqual(
    r.roadmap.weeks.map((w) => w.title),
    ["Foundations", "Guided practice", "Sample project", "Introductory outreach"],
  );
  assert.match(r.roadmap.promise, /not a promise of employment/i);
});

test("the obstacle the visitor chose is answered with practical advice", () => {
  const q8 = QUESTIONS.find((q) => q.id === "q8");
  const covered = new Set();
  for (const opt of q8.options) {
    const r = reportFor({ q8: opt.key });
    assert.equal(r.obstacle.key, opt.obstacle, `q8="${opt.key}" mapping`);
    assert.equal(r.obstacle.label, opt.label);
    assert.ok(r.obstacle.advice.length >= 4, `${opt.obstacle} needs real advice`);
    assert.ok(r.obstacle.title.length > 5);
    covered.add(opt.obstacle);
  }
  assert.equal(covered.size, q8.options.length, "every documented obstacle is reachable");
  assert.deepEqual([...covered].sort(), Object.keys(report.OBSTACLES).sort());
});

test("lifestyle copy never promises unlimited flexibility", () => {
  // The lifestyle block is modelled from availability (q3) and motivation
  // (q1), so every combination that can be picked must stay honest.
  const combos = [];
  for (const q3 of ["a", "b", "c", "d", "e", "f"]) {
    for (const q1 of ["a", "b", "c", "d", "e"]) combos.push({ q3, q1 });
  }
  const seen = new Set();
  for (const combo of combos) {
    const r = reportFor(combo);
    seen.add(r.lifestyle.key);
    const id = `q3=${combo.q3},q1=${combo.q1}`;
    assert.ok(r.lifestyle.caveat, `${id} needs an honest caveat`);
    assert.match(
      r.lifestyle.caveat,
      /not every|negotiated|constraint|flexibility|hours may|core hours|overlap/i,
      `${id} caveat must actually set a limit`,
    );
    assert.doesNotMatch(r.lifestyle.body, /always|guaranteed|any time you want|unlimited/i, id);
    assert.doesNotMatch(r.lifestyle.title, /always|guaranteed|unlimited/i, id);
    // The block must still name the hours the visitor said they actually have.
    assert.equal(r.lifestyle.hours, r.income.weeklyHours, `${id} must use the reported hours`);
  }
  assert.ok(seen.size >= 4, `at least four distinct week shapes should be reachable, saw ${[...seen]}`);
  for (const key of Object.keys(report.WORKDAY)) {
    assert.ok(seen.has(key), `WORKDAY.${key} must be reachable from some answer`);
  }
});

test("every roadmap is scaled to the available hours", () => {
  const light = reportFor({ q3: "a" });
  const full = reportFor({ q3: "f" });
  assert.equal(light.roadmap.load, "light");
  assert.equal(full.roadmap.load, "full");
  assert.notEqual(light.roadmap.note, full.roadmap.note);
});

// ---------------------------------------------------------------------------
// 7b. Qualifications question (§5 q9)
//
// The rule these tests exist to hold: formal education may only ever ADD.
// It cannot lower readiness, cannot lower follow-up priority, cannot change a
// career match, and cannot be mistaken for a certificate the visitor holds.
// ---------------------------------------------------------------------------
test("q9 covers the documented qualification paths, including an exclusive none", () => {
  const q9 = engine.question("q9");
  assert.equal(q9.type, "multi", "qualifications must be multi-select");
  const keys = q9.options.map((o) => o.key);
  for (const key of ["hs", "voc", "assoc", "bach", "master", "doctorate", "procert", "vatrain", "academy", "none"]) {
    assert.ok(keys.includes(key), `q9 is missing the ${key} option`);
  }
  // Every option must be present in the EDUCATION scoring table too, so a new
  // option cannot ship without a documented rule behind it.
  for (const o of q9.options) {
    assert.ok(engine.EDUCATION[o.key], `q9.${o.key} has no EDUCATION rule`);
  }
  assert.equal(engine.EDUCATION.none.exclusive, undefined);
  assert.equal(q9.options.find((o) => o.key === "none").exclusive, true, "none stands alone");
  assert.equal(q9.options.filter((o) => o.exclusive).length, 1, "exactly one exclusive option");
  // The Academy certificate is an explicit, separately worded choice.
  const academy = q9.options.find((o) => o.key === "academy");
  assert.ok(/I already hold/i.test(academy.label), "the Academy option must be first person and past tense");
});

test("'no formal qualifications' is mutually exclusive with holding qualifications", () => {
  const ok = normaliseAnswers(base({ q9: ["none"] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.answers.q9, ["none"]);

  const bad = normaliseAnswers(base({ q9: ["bach", "none"] }));
  assert.equal(bad.ok, false, "mixing 'none' with a qualification must be refused");
  assert.match(bad.error, /exclusive/i);
});

test("an empty qualifications answer is refused, and unknown keys are rejected", () => {
  assert.equal(normaliseAnswers(base({ q9: [] })).ok, false);
  assert.equal(normaliseAnswers(base({ q9: ["law-school"] })).ok, false);
  // Canonical order and de-duplication behave like every other multi-select.
  const r = normaliseAnswers(base({ q9: ["procert", "hs", "hs"] }));
  assert.deepEqual(r.answers.q9, ["hs", "procert"]);
});

test("qualifications never change which career suits someone", () => {
  const none = score({ q9: ["none"] });
  const doctorate = score({ q9: ["master", "doctorate"] });
  const trained = score({ q9: ["vatrain", "academy"] });
  assert.equal(none.primary, doctorate.primary, "a degree must not move the primary match");
  assert.equal(none.primary, trained.primary, "training must not move the primary match");
  assert.equal(none.secondary, doctorate.secondary);
  assert.deepEqual(none.scores, doctorate.scores, "career scores must be identical");
  assert.deepEqual(none.scores, trained.scores);
});

test("holding no formal qualifications is never a penalty", () => {
  // The reference path: a beginner with nothing on paper scores exactly like
  // the same beginner with a high school diploma, because neither is a gate.
  const none = readinessFor(norm({ q9: ["none"], q7: "a", q6: ["tnone"] }));
  const hs = readinessFor(norm({ q9: ["hs"], q7: "a", q6: ["tnone"] }));
  assert.equal(none.stage, hs.stage, "no qualification must not read as a lower stage");

  const noneLead = leadPriority(base({ q9: ["none"] }));
  const hsLead = leadPriority(base({ q9: ["hs"] }));
  assert.equal(noneLead.score, hsLead.score, "no qualification must not lose follow-up points");

  // With nothing else in the score, holding nothing formal is a flat zero:
  // the baseline, never a minus.
  const nothingElse = base({ q9: ["none"], q3: "a", q10: "e" });
  assert.equal(leadPriority(nothingElse).score, 0, "holding nothing formal contributes zero, never a minus");

  // And the report must not dress it up as a gap.
  const r = reportFor({ q9: ["none"] });
  const text = r.strengths.paragraphs.join(" ");
  assert.match(text, /normal place to start|common place to start/i);
  // It must never read as a gap the visitor has to apologise for.
  assert.doesNotMatch(text, /you (are )?missing|hold you back|falling behind|disadvantage|put you at a (big )?disadvantage/i);
  assert.equal(r.strengths.qualifications.noneSelected, true);
});

test("education can lift a beginner by one stage and no further", () => {
  const bare = readinessFor(norm({ q9: ["none"], q7: "a", q6: ["tnone"] }));
  const degree = readinessFor(norm({ q9: ["bach"], q7: "a", q6: ["tnone"] }));
  assert.equal(bare.stage, 1);
  assert.equal(degree.stage, 2, "a degree may lift a beginner exactly one stage");

  // Even stacked with every transferable tool, paper alone cannot reach
  // "preparing for clients".
  const everything = readinessFor(
    norm({ q9: ["bach", "master", "doctorate"], q7: "a", q6: ["t1", "t2", "t3", "t4", "t5", "t6"] }),
  );
  assert.ok(everything.stage <= 3, `qualifications + tools must not imply client readiness, got ${everything.stage}`);

  // Once real experience has had its say, education stops adding entirely.
  const veteran = readinessFor(norm({ q9: ["master", "doctorate"], q7: "e", q6: ["tnone"] }));
  assert.equal(veteran.stage, 5, "education must not stack on top of experience");
  const certified = readinessFor(norm({ q9: ["academy"], q7: "c", q6: ["t1"] }));
  assert.equal(certified.stage, 3, "the Academy certificate is not a readiness shortcut either");
});

test("education contributes additively to lead priority, and only up to the ceiling", () => {
  const plain = leadPriority(base({ q9: ["none"] }));
  const qualified = leadPriority(base({ q9: ["bach"] }));
  const stacked = leadPriority(base({ q9: ["master", "doctorate", "academy", "procert"] }));

  assert.ok(qualified.score > plain.score, "holding qualifications should add follow-up points");
  assert.equal(
    qualified.score - plain.score,
    engine.EDUCATION.bach.leadPoints,
    "a bachelor's degree is worth exactly its documented points",
  );
  assert.ok(
    stacked.score - plain.score <= engine.EDUCATION_MAX_LEAD_POINTS,
    "education points must be capped, overlapping paper cannot stack",
  );
  assert.ok(
    stacked.score - plain.score <= 4,
    "the documented ceiling for education is 4 points",
  );

  // Practical training is worth at least as much as an academic degree,
  // because it sits closer to the work a client actually buys.
  const degree = leadPriority(base({ q9: ["bach"] })).score;
  const trained = leadPriority(base({ q9: ["vatrain"] })).score;
  assert.ok(trained >= degree, "client-facing training must not be worth less than a degree");

  // The reason is readable and part of the explained total.
  const reasons = leadPriority(base({ q9: ["bach"] })).reasons;
  const eduReason = reasons.find((r) => /holds/i.test(r.label));
  assert.ok(eduReason, "a qualification must explain its own points");
  assert.ok(eduReason.label.length > 8);
  assert.ok(!/[—–]/.test(eduReason.label), "reasons must not contain typographic dashes");
});

test("taking the quiz never implies the visitor already holds the Academy certificate", () => {
  // Default: they never ticked it, so the report must offer it as a future
  // option in the exact registered wording, and must not claim completion.
  const notHeld = reportFor({});
  assert.equal(notHeld.roadmap.certificateHeld, false, "silence must never read as holding the certificate");
  assert.match(
    notHeld.roadmap.certificateNote,
    /Certificate of Completion/,
    "the certificate must appear by its exact name",
  );
  assert.match(notHeld.roadmap.certificateNote, /exam/, "the requirement to earn it must be stated");
  assert.match(
    notHeld.roadmap.certificateNote,
    /finishes? every class and passes all four phase exams plus the final Academy exam/i,
    "the verified requirement is: every class, four phase exams, the final Academy exam",
  );
  assert.doesNotMatch(notHeld.roadmap.certificateNote, /you (already )?hold/i, "no false claim of ownership");

  // A visitor who says they hold it is told to use it, not sold another one.
  const held = reportFor({ q9: ["academy"] });
  assert.equal(held.roadmap.certificateHeld, true);
  assert.match(held.roadmap.certificateNote, /already hold an Assistara Academy certificate of completion/i);
  assert.doesNotMatch(
    held.nextStep.body,
    /earn your certificate|get certified first|certification is required/i,
    "a certificate holder must never be told certification comes first",
  );
});

test("a taken quiz never awards the certificate anywhere in the report", () => {
  for (const q9 of [["none"], ["hs"], ["bach"], ["academy"]]) {
    const flat = JSON.stringify(reportFor({ q9 }));
    assert.doesNotMatch(flat, /quiz (awards|grants|earns)|pass this quiz to (earn|get)/i);
  }
  // The question's own support copy must say so too.
  const q9 = engine.question("q9");
  assert.match(q9.support, /does not award a certificate/i);
  assert.match(q9.support, /Certificate of Completion/);
});

// ---------------------------------------------------------------------------
// 8. Every career block is complete (§6)
// ---------------------------------------------------------------------------
test("each of the seven careers carries the full profile content", () => {
  for (const id of CAREER_ORDER) {
    const c = CAREERS[id];
    assert.ok(c.title && c.category && c.tagline && c.description, `${id} identity`);
    assert.ok(Array.isArray(c.strengths) && c.strengths.length >= 3, `${id} strengths`);
    assert.ok(Array.isArray(c.tasks) && c.tasks.length >= 5, `${id} tasks`);
    assert.ok(Array.isArray(c.tools) && c.tools.length >= 3, `${id} tools`);
    assert.ok(c.portfolioProject && c.portfolioProject.length > 40, `${id} portfolio`);
    assert.ok(Array.isArray(c.nextSteps) && c.nextSteps.length >= 3, `${id} next steps`);
    assert.ok(Array.isArray(c.challenges) && c.challenges.length >= 3, `${id} challenges`);
    assert.ok(Array.isArray(c.specializations) && c.specializations.length >= 2, `${id} specializations`);
    assert.ok(c.description.length > 150, `${id} needs a real description`);
  }
});

test("the systems career separates beginner tasks from advanced work", () => {
  const c = CAREERS.systems;
  assert.ok(c.beginnerVsAdvanced, "required distinction is missing");
  assert.ok(c.beginnerVsAdvanced.beginner.length >= 4);
  assert.ok(c.beginnerVsAdvanced.advanced.length >= 4);
  assert.match(c.beginnerVsAdvanced.note, /additional training/i);
});

test("the documented task lists match the seven career outcomes in the spec", () => {
  const expected = {
    organizer: ["Inbox organization", "Calendar management", "Scheduling", "Document preparation", "Task tracking", "Administrative coordination"],
    creative: ["Social media content", "Canva graphics", "Content calendars", "Scheduling posts", "Basic copywriting", "Content organization"],
    connector: ["Customer messages", "Email support", "Community moderation", "Appointment coordination", "Customer follow-ups", "Support documentation"],
    detective: ["Online research", "Data organization", "Spreadsheet maintenance", "Competitor research", "Lead research", "Information verification"],
    growth: ["Prospect research", "CRM updates", "Outreach support", "Appointment setting", "Sales follow-ups", "Pipeline organization"],
    systems: ["Digital tool setup", "Simple automation", "Troubleshooting", "Workflow documentation", "Process improvements"],
    builder: ["Product listings", "Order tracking", "Inventory updates", "Customer questions", "Store maintenance", "Product catalog management"],
  };
  for (const [id, tasks] of Object.entries(expected)) {
    for (const t of tasks) {
      assert.ok(CAREERS[id].tasks.includes(t), `${id} is missing the specified task "${t}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// Acquisition lead priority
//
// This is an operational follow-up ranking. These tests exist to pin down the
// two properties that actually matter: the score is built only from what the
// person said out loud about timing, experience and available hours, and the
// reason breakdown always accounts for the total so it can be explained.
// ---------------------------------------------------------------------------

test("the income goal alone can never raise lead priority", () => {
  // Same person, same timing, same experience, wildly different ambition.
  const low = leadPriority(base({ q2: 5000, q3: "c", q7: "c", q10: "b" }));
  const mid = leadPriority(base({ q2: 30000, q3: "c", q7: "c", q10: "b" }));
  const high = leadPriority(base({ q2: 500000, q3: "c", q7: "c", q10: "b" }));
  assert.equal(low.score, mid.score);
  assert.equal(mid.score, high.score);
});

test("the scoring rules never read the income goal or the career answers", () => {
  // A structural guard, not just a behavioural one: it keeps the next person
  // from quietly wiring ambition or career choice into the score.
  const src = leadPriority.toString();
  assert.ok(!/\bq2\b/.test(src), "leadPriority must not read the income goal");
  assert.ok(!/\bq4\b/.test(src), "leadPriority must not read the primary career");
  assert.ok(!/\bq5\b/.test(src), "leadPriority must not read the secondary career");
});

test("which career suits someone does not change their priority", () => {
  const organizer = leadPriority(base({ q3: "c", q7: "c", q10: "b", q4: "a", q5: "b" }));
  const builder = leadPriority(base({ q3: "c", q7: "c", q10: "b", q4: "g", q5: "a" }));
  assert.equal(organizer.score, builder.score);
});

test("declared start intent is ordered the way it reads, strongest first", () => {
  // q3 "a" is under 5 hours, so capacity contributes nothing and this compares
  // the timeline answer on its own.
  const scoreFor = (t) => leadPriority(base({ q3: "a", q7: "a", q10: t })).score;
  assert.ok(scoreFor("a") > scoreFor("b"), "ready now should outrank within a month");
  assert.ok(scoreFor("b") > scoreFor("c"), "within a month should outrank three months");
  assert.ok(scoreFor("c") > scoreFor("d"), "three months should outrank six");
  assert.ok(scoreFor("d") > scoreFor("e"), "six months should outrank just exploring");
  assert.equal(scoreFor("e"), LEAD_PRIORITY.timeline.exploring);
});

test("the strongest timeline answer is worth exactly the documented points", () => {
  const p = leadPriority(base({ q3: "a", q7: "a", q10: "a" }));
  assert.equal(p.score, LEAD_PRIORITY.timeline.now);
  assert.ok(p.reasons.some((r) => r.points === LEAD_PRIORITY.timeline.now && /start right now/i.test(r.label)));
});

test("previous experience is ordered the way the readiness stages read", () => {
  // q3 "a" zeroes out capacity, so only the experience answer moves.
  const scoreFor = (q7) => leadPriority(base({ q3: "a", q7, q10: "e" })).score;
  assert.ok(scoreFor("e") > scoreFor("d"), "paid work should outrank portfolio work");
  assert.ok(scoreFor("d") > scoreFor("c"), "portfolio should outrank a certificate");
  assert.ok(scoreFor("c") > scoreFor("b"), "a course should outrank self-teaching");
  assert.ok(scoreFor("b") > scoreFor("a"), "self-teaching should outrank starting from scratch");
  assert.equal(scoreFor("a"), 0, "starting from scratch is the baseline, not a penalty");
});

test("each experience level is worth exactly the documented points", () => {
  const stages = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  for (const [q7, stage] of Object.entries(stages)) {
    const p = leadPriority(base({ q3: "a", q7, q10: "e" }));
    assert.equal(p.score, LEAD_PRIORITY.experience[stage], `stage ${stage} should score ${LEAD_PRIORITY.experience[stage]}`);
  }
});

test("free hours are capped at the highest tier actually reached", () => {
  // Regression guard: an ascending tier walk stopped at the first threshold,
  // so someone offering 11-20 hours scored the 5-hour tier.
  const scoreFor = (q3) => leadPriority(base({ q3, q7: "a", q10: "e" })).score;
  assert.equal(scoreFor("a"), LEAD_PRIORITY.capacity[0], "under 5 hours is the floor");
  assert.equal(scoreFor("b"), LEAD_PRIORITY.capacity[5], "5-10 hours reaches the 5 hour tier");
  assert.equal(scoreFor("c"), LEAD_PRIORITY.capacity[10], "11-20 hours must reach the 10 hour tier, not stop at 5");
  assert.equal(scoreFor("d"), LEAD_PRIORITY.capacity[20], "21-30 hours reaches the top tier");
  assert.equal(scoreFor("e"), LEAD_PRIORITY.capacity[20], "31-40 hours reaches the top tier");
  assert.equal(scoreFor("f"), LEAD_PRIORITY.capacity[20], "40+ hours reaches the top tier");
});

test("a submitted Academy application adds the documented bonus and nothing else", () => {
  const answers = base({ q3: "f", q7: "a", q10: "e" });
  const quizOnly = leadPriority(answers);
  const applied = leadPriority(answers, { applied: true });

  assert.equal(quizOnly.applied, false);
  assert.equal(applied.applied, true);
  assert.equal(applied.score - quizOnly.score, LEAD_PRIORITY.applicationBonus);
  assert.ok(applied.reasons.some((r) => r.points === LEAD_PRIORITY.applicationBonus && /application/i.test(r.label)));
});

test("not applying is never treated as applying", () => {
  // Surfaces pass an explicit flag; anything other than true is a non-application.
  const answers = base({ q3: "f", q7: "e", q10: "a" });
  const plain = leadPriority(answers);
  assert.equal(leadPriority(answers, { applied: false }).score, plain.score);
  assert.equal(leadPriority(answers, { applied: undefined }).score, plain.score);
  assert.equal(leadPriority(answers, {}).score, plain.score);
});

test("the reason breakdown always accounts for the total", () => {
  const cases = [
    base({}),
    base({ q3: "d", q7: "e", q10: "a" }),
    base({ q3: "b", q7: "c", q10: "c" }),
    base({ q3: "e", q7: "d", q10: "d" }),
  ];
  for (const answers of cases) {
    for (const opts of [undefined, { applied: true }]) {
      const p = leadPriority(answers, opts);
      const sum = p.reasons.reduce((n, r) => n + Number(r.points || 0), 0);
      assert.equal(p.score, Math.min(LEAD_PRIORITY.max, sum), `score ${p.score} must equal the explained total ${sum}`);
    }
  }
});

test("every reason is a readable label with a positive point value", () => {
  const p = leadPriority(base({ q3: "d", q7: "e", q10: "b" }), { applied: true });
  assert.ok(p.reasons.length >= 3, "a well-rounded lead should explain itself on several counts");
  for (const r of p.reasons) {
    assert.equal(typeof r.label, "string");
    assert.ok(r.label.trim().length > 8, `reason label is too vague to be useful: ${r.label}`);
    assert.ok(!/[—–]/.test(r.label), `reasons must not contain typographic dashes: ${r.label}`);
    assert.ok(Number(r.points) > 0, `reason must carry a positive value: ${r.label}`);
  }
});

test("priority never leaves the 0-100 range", () => {
  const everything = leadPriority(base({ q3: "f", q7: "e", q10: "a" }), { applied: true });
  assert.ok(everything.score > LEAD_PRIORITY.max - 1, "the strongest possible lead should sit at the ceiling");
  assert.equal(everything.score, LEAD_PRIORITY.max, "the ceiling is enforced, not exceeded");

  const nothing = leadPriority(base({ q3: "a", q7: "a", q10: "e" }));
  assert.equal(nothing.score, 0);
  assert.equal(nothing.band, "cool");
});

test("an empty or partial submission still produces a usable ranking", () => {
  const empty = leadPriority({});
  assert.equal(empty.score, 0);
  assert.equal(empty.band, "cool");
  assert.deepEqual(empty.reasons, []);

  // A half-answered quiz must not throw or invent points.
  const partial = leadPriority({ q10: "a" });
  assert.equal(partial.score, LEAD_PRIORITY.timeline.now);
  assert.equal(partial.band, leadPriorityBand(partial.score).key);
});

test("bands are assigned by the documented thresholds", () => {
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[0].min).key, "hot");
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[0].min - 1).key, "warm");
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[1].min).key, "warm");
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[1].min - 1).key, "developing");
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[2].min).key, "developing");
  assert.equal(leadPriorityBand(LEAD_PRIORITY.bands[2].min - 1).key, "cool");
  assert.equal(leadPriorityBand(0).key, "cool");
  assert.equal(leadPriorityBand(100).key, "hot");
  // Out of range input falls back to the lowest band rather than crashing.
  assert.equal(leadPriorityBand(NaN).key, "cool");
  assert.equal(leadPriorityBand(-5).key, "cool");
  assert.equal(leadPriorityBand(1000).key, "hot");
});

test("the score and its band always agree", () => {
  const cases = [
    base({ q3: "a", q7: "a", q10: "e" }),
    base({ q3: "b", q7: "b", q10: "d" }),
    base({ q3: "c", q7: "c", q10: "c" }),
    base({ q3: "d", q7: "d", q10: "b" }),
    base({ q3: "e", q7: "e", q10: "a" }),
  ];
  for (const answers of cases) {
    for (const opts of [undefined, { applied: true }]) {
      const p = leadPriority(answers, opts);
      assert.equal(p.band, leadPriorityBand(p.score).key);
      assert.equal(p.bandLabel, leadPriorityBand(p.score).label);
    }
  }
});

test("bands have a human label rather than an internal key", () => {
  for (const b of LEAD_PRIORITY.bands) {
    assert.ok(b.label && b.label.trim().length > 3, `band ${b.key} needs a readable label`);
    assert.ok(!/^[a-z_]+$/.test(b.label), `band ${b.key} label must not be a raw identifier`);
  }
});

test("Admin Leads applies the same application bonus the scoring rules define", () => {
  // The acquisition surfaces live in Deno and cannot import the Node engine,
  // so they restate this one constant. Asserting the two agree turns a silent
  // divergence into a failing test.
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "admin-api", "index.ts"),
    "utf8",
  );
  const m = /APPLICATION_BONUS\s*=\s*(\d+)/.exec(src);
  assert.ok(m, "admin-api must declare APPLICATION_BONUS so the bonus stays explainable");
  assert.equal(
    Number(m[1]),
    LEAD_PRIORITY.applicationBonus,
    "admin-api restates the application bonus; it must match LEAD_PRIORITY.applicationBonus",
  );
  // And the stored quiz-side score is genuinely what the surface starts from.
  assert.match(src, /lead_priority/, "admin-api should read the stored priority score");
  assert.match(src, /lead_priority_reasons/, "admin-api should read the priority breakdown so it stays explainable");
});
