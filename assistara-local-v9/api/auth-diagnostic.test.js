"use strict";

const assert = require("node:assert");
const test = require("node:test");
const crypto = require("node:crypto");

// Import the diagnostic function directly
const { adminTokenDiagnostic, adminTokenClaims } = require("./_academy-security");

// Synthetic test values ONLY - no production secrets
const FAKE_SERVICE_KEY = "synthetic_test_key_for_diagnostic_only_1234567890";
const FAKE_SERVICE_KEY_2 = "different_synthetic_test_key_9876543210";

// Helper: base64url encode
function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64url");
}

// Helper: create a synthetic admin token
function createSyntheticToken(serviceKey, overrides = {}) {
  const payload = {
    u: overrides.u || "admin",
    exp: overrides.exp || Date.now() + 30 * 60 * 1000,
    ...overrides.additionalClaims,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", serviceKey)
    .update(payloadB64, "utf8")
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

// =============================================================================
// DIAGNOSTIC CATEGORY TESTS
// =============================================================================

test("missing token returns AUTH_HEADER_MISSING", () => {
  const result = adminTokenDiagnostic("", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_HEADER_MISSING");
});

test("null token returns AUTH_HEADER_MISSING", () => {
  const result = adminTokenDiagnostic(null, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_HEADER_MISSING");
});

test("undefined token returns AUTH_HEADER_MISSING", () => {
  const result = adminTokenDiagnostic(undefined, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_HEADER_MISSING");
});

test("missing service key returns SERVER_AUTH_CONFIG_MISSING", () => {
  const result = adminTokenDiagnostic("some.token", "");
  assert.strictEqual(result, "SERVER_AUTH_CONFIG_MISSING");
});

test("null service key returns SERVER_AUTH_CONFIG_MISSING", () => {
  const result = adminTokenDiagnostic("some.token", null);
  assert.strictEqual(result, "SERVER_AUTH_CONFIG_MISSING");
});

test("token with 1 segment returns TOKEN_FORMAT_INVALID", () => {
  const result = adminTokenDiagnostic("onlyonepart", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with 3 segments returns TOKEN_FORMAT_INVALID", () => {
  const result = adminTokenDiagnostic("part1.part2.part3", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with 4 segments returns TOKEN_FORMAT_INVALID", () => {
  const result = adminTokenDiagnostic("a.b.c.d", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with invalid base64url in payload returns TOKEN_FORMAT_INVALID", () => {
  const result = adminTokenDiagnostic("invalid+base64.signature", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with invalid base64url in signature returns TOKEN_FORMAT_INVALID", () => {
  const result = adminTokenDiagnostic("payload.invalid+sig", FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with non-JSON payload returns TOKEN_FORMAT_INVALID", () => {
  const payloadB64 = b64url("this is not json");
  const signature = crypto
    .createHmac("sha256", FAKE_SERVICE_KEY)
    .update(payloadB64, "utf8")
    .digest("base64url");
  const result = adminTokenDiagnostic(`${payloadB64}.${signature}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("token with wrong signature length returns TOKEN_FORMAT_INVALID", () => {
  const payloadB64 = b64url(JSON.stringify({ u: "admin", exp: Date.now() + 300000 }));
  const shortSig = crypto
    .createHmac("sha256", FAKE_SERVICE_KEY)
    .update(payloadB64, "utf8")
    .digest("base64url")
    .slice(0, 20);
  const result = adminTokenDiagnostic(`${payloadB64}.${shortSig}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_FORMAT_INVALID");
});

test("expired token returns TOKEN_EXPIRED", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, {
    exp: Date.now() - 1000, // expired 1 second ago
  });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_EXPIRED");
});

test("token expiring exactly now returns TOKEN_EXPIRED", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, {
    exp: Date.now(),
  });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_EXPIRED");
});

test("token with seconds-based exp returns TOKEN_EXPIRED", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, {
    exp: Math.floor(Date.now() / 1000) + 300, // seconds, not ms
  });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_EXPIRED");
});

test("token with string exp returns TOKEN_EXPIRED", () => {
  const payloadB64 = b64url(JSON.stringify({ u: "admin", exp: String(Date.now() + 300000) }));
  const signature = crypto
    .createHmac("sha256", FAKE_SERVICE_KEY)
    .update(payloadB64, "utf8")
    .digest("base64url");
  const result = adminTokenDiagnostic(`${payloadB64}.${signature}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_EXPIRED");
});

test("token with NaN exp returns TOKEN_EXPIRED", () => {
  // Create a token with NaN exp (will be serialized as null in JSON)
  const payload = { u: "admin", exp: null };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", FAKE_SERVICE_KEY)
    .update(payloadB64, "utf8")
    .digest("base64url");
  const result = adminTokenDiagnostic(`${payloadB64}.${signature}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "TOKEN_EXPIRED");
});

test("wrong signing key returns SIGNATURE_INVALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY_2);
  assert.strictEqual(result, "SIGNATURE_INVALID");
});

test("tampered signature returns SIGNATURE_INVALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const [payload, sig] = token.split(".");
  const tamperedSig = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA");
  const result = adminTokenDiagnostic(`${payload}.${tamperedSig}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "SIGNATURE_INVALID");
});

test("invalid admin claim returns ADMIN_CLAIM_INVALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, { u: "learner" });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "ADMIN_CLAIM_INVALID");
});

test("missing admin claim returns ADMIN_CLAIM_INVALID", () => {
  const payloadB64 = b64url(JSON.stringify({ exp: Date.now() + 300000 }));
  const signature = crypto
    .createHmac("sha256", FAKE_SERVICE_KEY)
    .update(payloadB64, "utf8")
    .digest("base64url");
  const result = adminTokenDiagnostic(`${payloadB64}.${signature}`, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "ADMIN_CLAIM_INVALID");
});

test("wrong admin claim case returns ADMIN_CLAIM_INVALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, { u: "Admin" });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "ADMIN_CLAIM_INVALID");
});

test("valid token returns AUTH_VALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_VALID");
});

test("valid token with extra claims returns AUTH_VALID", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY, {
    additionalClaims: { role: "superadmin", iat: Date.now() },
  });
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_VALID");
});

// =============================================================================
// SECURITY TESTS - NO SENSITIVE DATA EXPOSED
// =============================================================================

test("diagnostic does not expose token value", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result, "AUTH_VALID");
  // The result is just a category string, not the token
  assert.notStrictEqual(result, token);
  assert.strictEqual(result.length < 50, true);
});

test("diagnostic does not expose service key", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  assert.strictEqual(result.includes(FAKE_SERVICE_KEY), false);
});

test("diagnostic does not expose token payload", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const result = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  // Result should be just a category, not contain payload data
  assert.strictEqual(result.includes("admin"), false);
  assert.strictEqual(result.includes("exp"), false);
});

test("diagnostic returns only allowed category strings", () => {
  const allowedCategories = [
    "AUTH_HEADER_MISSING",
    "BEARER_MISSING",
    "TOKEN_FORMAT_INVALID",
    "TOKEN_EXPIRED",
    "SIGNATURE_INVALID",
    "ADMIN_CLAIM_INVALID",
    "AUTH_VALID",
    "SERVER_AUTH_CONFIG_MISSING",
  ];

  // Test various inputs
  const testCases = [
    "",
    null,
    undefined,
    "invalid",
    "a.b.c",
    createSyntheticToken(FAKE_SERVICE_KEY),
    createSyntheticToken(FAKE_SERVICE_KEY, { u: "learner" }),
    createSyntheticToken(FAKE_SERVICE_KEY, { exp: Date.now() - 1000 }),
  ];

  for (const testCase of testCases) {
    const result = adminTokenDiagnostic(testCase, FAKE_SERVICE_KEY);
    assert.ok(
      allowedCategories.includes(result),
      `Unexpected diagnostic category: ${result}`
    );
  }
});

// =============================================================================
// CONSISTENCY WITH adminTokenClaims
// =============================================================================

test("AUTH_VALID only when adminTokenClaims succeeds", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const diagnostic = adminTokenDiagnostic(token, FAKE_SERVICE_KEY);
  const claims = adminTokenClaims(token, FAKE_SERVICE_KEY);
  assert.strictEqual(diagnostic, "AUTH_VALID");
  assert.ok(claims !== null);
});

test("non-AUTH_VALID only when adminTokenClaims fails", () => {
  const testCases = [
    { token: "", key: FAKE_SERVICE_KEY },
    { token: "invalid", key: FAKE_SERVICE_KEY },
    { token: createSyntheticToken(FAKE_SERVICE_KEY), key: FAKE_SERVICE_KEY_2 },
    { token: createSyntheticToken(FAKE_SERVICE_KEY, { u: "learner" }), key: FAKE_SERVICE_KEY },
    { token: createSyntheticToken(FAKE_SERVICE_KEY, { exp: Date.now() - 1000 }), key: FAKE_SERVICE_KEY },
  ];

  for (const { token, key } of testCases) {
    const diagnostic = adminTokenDiagnostic(token, key);
    const claims = adminTokenClaims(token, key);
    assert.notStrictEqual(diagnostic, "AUTH_VALID");
    assert.strictEqual(claims, null);
  }
});

// =============================================================================
// BEARER EXTRACTION TESTS
// =============================================================================

test("bearer extraction from Authorization header", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const header = `Bearer ${token}`;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  assert.ok(match);
  assert.strictEqual(match[1].trim(), token);
});

test("bearer extraction is case-insensitive", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const header = `bearer ${token}`;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  assert.ok(match);
  assert.strictEqual(match[1].trim(), token);
});

test("bearer extraction handles extra whitespace", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const header = `Bearer   ${token}  `;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  assert.ok(match);
  assert.strictEqual(match[1].trim(), token);
});

test("bearer extraction fails for non-Bearer scheme", () => {
  const token = createSyntheticToken(FAKE_SERVICE_KEY);
  const header = `Basic ${token}`;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  assert.strictEqual(match, null);
});

test("bearer extraction fails for missing header", () => {
  const header = "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  assert.strictEqual(match, null);
});
