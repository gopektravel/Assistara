const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "admin-email-templates", "index.ts"),
  "utf8",
);
const STUDIO = fs.readFileSync(
  path.join(__dirname, "..", "assistara-local-v9", "admin-template-studio.html"),
  "utf8",
);

// Pure mirror of the allowlist logic in index.ts (kept in sync by the source assertions below).
const TEST_INTERNAL = ["notifications@getassistara.com"];
function isAllowed(to) {
  return TEST_INTERNAL.includes(to.toLowerCase());
}

describe("test_send allowlist source", () => {
  it("TEST_INTERNAL is exactly [\"notifications@getassistara.com\"]", () => {
    assert.ok(SRC.includes('["notifications@getassistara.com"]'), "single-element literal must be present");
    assert.match(SRC, /const\s+TEST_INTERNAL\s*=\s*\[\s*"notifications@getassistara\.com"\s*\]/);
  });

  it("TEMPLATE_TEST_EMAIL is not used to build or widen TEST_INTERNAL", () => {
    const lines = SRC.split("\n");
    const declLine = lines.find((l) => /const\s+TEST_INTERNAL\s*=/.test(l));
    assert.ok(declLine, "TEST_INTERNAL declaration must exist");
    assert.ok(!declLine.includes("TEMPLATE_TEST_EMAIL"), "declaration line must not reference TEMPLATE_TEST_EMAIL");
    // No spread/concat of env values into the allowlist anywhere.
    assert.ok(!/TEST_INTERNAL.*TEMPLATE_TEST_EMAIL/.test(SRC));
    assert.ok(!/TEST_INTERNAL_DEFAULT/.test(SRC), "no default-constant widening path");
    assert.ok(!/INTERNAL_TEST_DOMAIN/.test(SRC), "no domain-constant widening path");
  });

  it("the test_send allowlist guard is unconditional (no TEST_INTERNAL.length && skip)", () => {
    assert.ok(!SRC.includes("TEST_INTERNAL.length &&"), "guard must always run");
    assert.match(SRC, /if\s*\(\s*!TEST_INTERNAL\.includes\(to\)\s*\)/);
  });

  it("the 403 error text and status are still present", () => {
    assert.ok(SRC.includes("Test sends are limited to internal addresses."));
    assert.match(SRC, /\{\s*ok:\s*false,\s*error:\s*"Test sends are limited to internal addresses\."\s*\},\s*403/);
  });
});

describe("Template Studio test-send recipient", () => {
  it("testSend() targets notifications@getassistara.com, not admin@getassistara.com", () => {
    assert.ok(STUDIO.includes("notifications@getassistara.com"), "studio must target notifications@getassistara.com");
    assert.ok(!STUDIO.includes("admin@getassistara.com"), "studio must not contain admin@getassistara.com");
    assert.match(STUDIO, /test_send.*notifications@getassistara\.com/);
  });
});

describe("test_send allowlist behaviour", () => {
  const cases = [
    ["notifications@getassistara.com", true, "the only permitted recipient"],
    ["admin@getassistara.com", false, "other internal address denied"],
    ["ops@getassistara.com", false, "other internal address denied"],
    ["someone@evil.com", false, "external address denied"],
  ];
  for (const [to, expected, name] of cases) {
    it(`${to} → ${expected ? "allowed" : "denied"}: ${name}`, () => {
      assert.equal(isAllowed(to), expected);
    });
  }
});
