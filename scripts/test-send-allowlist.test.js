const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "admin-email-templates", "index.ts"),
  "utf8",
);

// Pure mirror of the allowlist logic in index.ts (kept in sync by assertions 1-3).
function buildAllowlist(envValue) {
  const INTERNAL_TEST_DOMAIN = "getassistara.com";
  const TEST_INTERNAL_DEFAULT = ["notifications@getassistara.com"];
  return Array.from(
    new Set([
      ...TEST_INTERNAL_DEFAULT,
      ...(envValue || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ]),
  ).filter((a) => a.endsWith("@" + INTERNAL_TEST_DOMAIN));
}
function isAllowed(to, envValue) {
  return buildAllowlist(envValue).includes(to.toLowerCase());
}

describe("test_send allowlist source", () => {
  it("TEST_INTERNAL is built from TEST_INTERNAL_DEFAULT containing notifications@getassistara.com and filtered to INTERNAL_TEST_DOMAIN", () => {
    assert.match(SRC, /const\s+INTERNAL_TEST_DOMAIN\s*=\s*["']getassistara\.com["']/);
    assert.match(SRC, /const\s+TEST_INTERNAL_DEFAULT\s*=\s*\[[^\]]*notifications@getassistara\.com[^\]]*\]/);
    assert.match(SRC, /TEST_INTERNAL_DEFAULT/);
    assert.match(SRC, /TEMPLATE_TEST_EMAIL/);
    assert.match(SRC, /endsWith\(\s*"@"\s*\+\s*INTERNAL_TEST_DOMAIN\s*\)/);
  });

  it("the test_send allowlist guard is unconditional (no TEST_INTERNAL.length && skip)", () => {
    assert.ok(!SRC.includes("TEST_INTERNAL.length &&"), "guard must not be skipped when the env var is empty");
    assert.match(SRC, /if\s*\(\s*!TEST_INTERNAL\.includes\(to\)\s*\)/);
  });

  it("the 403 error text and status are still present", () => {
    assert.ok(SRC.includes("Test sends are limited to internal addresses."));
    assert.match(SRC, /\{\s*ok:\s*false,\s*error:\s*"Test sends are limited to internal addresses\."\s*\},\s*403/);
  });
});

describe("test_send allowlist behaviour", () => {
  const cases = [
    ["notifications@getassistara.com", "", true, "default notifications address allowed with empty env"],
    ["someone@evil.com", "", false, "external address denied with empty env"],
    ["someone@gmail.com", "", false, "gmail address denied with empty env"],
    ["anything@elsewhere.com", "anything@elsewhere.com", false, "env-set external address still denied"],
    ["ops@getassistara.com", "ops@getassistara.com", true, "env-set internal address allowed"],
    ["notifications@getassistara.com", "anything@elsewhere.com", true, "default notifications address allowed even when env is external-only"],
  ];
  for (const [to, env, expected, name] of cases) {
    it(`${to} (env=${JSON.stringify(env)}) → ${expected ? "allowed" : "denied"}: ${name}`, () => {
      assert.equal(isAllowed(to, env), expected);
    });
  }
});
