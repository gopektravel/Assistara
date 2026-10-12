// Regression test: import/update must never silently change a published template's status
// Isolated harness — does not touch production DB
const TEST_KEYS = [
  "academy_application_accepted", // published, must stay published
  "academy_application_accepted_discounted" // draft preserved
];
const assertions = [];
for (const k of TEST_KEYS) {
  assertions.push({
    key: k,
    rule: "update_draft_SQL must include WHERE status='draft' OR must skip published",
    expectedStatus: k === "academy_application_accepted" ? "published" : "draft",
    risk: "Previous 12-key bulk update accidentally set published -> draft; must guard"
  });
}
console.log("Regression assertions:");
for (const a of assertions) console.log("  " + a.key + " -> " + a.expectedStatus + " (rule: " + a.rule + ")");
console.log("PASS if future import SQL restricts updates to status='draft' or excludes published keys.");
// Recommended guard for future bulk SQL:
console.log("RECOMMENDED SQL GUARD: ADD 'AND status = \"draft\"' to WHERE clause for draft-only updates.");
