// Unit tests for Admin token verification (analyze-opportunity auth gate).
// Run: deno test supabase/functions/analyze-opportunity/auth_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { issueAdminToken, safeEqual, verifyAdminToken } from "./auth.ts";

const KEY = "test-service-role-key";
const USERNAME = "admin";
const VERSION = "v-test-1";
const OPTS = { key: KEY, username: USERNAME, version: VERSION };
const FUTURE = Date.now() + 60 * 60 * 1000;
const PAST = Date.now() - 1000;

Deno.test("accepts a valid admin token", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: VERSION, exp: FUTURE }, KEY);
  assertEquals(await verifyAdminToken(token, OPTS), true);
});

Deno.test("rejects a token signed with a different key", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: VERSION, exp: FUTURE }, "other-key");
  assertEquals(await verifyAdminToken(token, OPTS), false);
});

Deno.test("rejects a token for a non-admin user", async () => {
  const token = await issueAdminToken({ u: "someone", v: VERSION, exp: FUTURE }, KEY);
  assertEquals(await verifyAdminToken(token, OPTS), false);
});

Deno.test("rejects an expired token", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: VERSION, exp: PAST }, KEY);
  assertEquals(await verifyAdminToken(token, OPTS), false);
});

Deno.test("rejects a token with the wrong token version", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: "old-version", exp: FUTURE }, KEY);
  assertEquals(await verifyAdminToken(token, OPTS), false);
});

Deno.test("does not enforce version when ADMIN_TOKEN_VERSION is unset", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: "whatever", exp: FUTURE }, KEY);
  assertEquals(await verifyAdminToken(token, { key: KEY, username: USERNAME, version: "" }), true);
});

Deno.test("rejects a tampered payload", async () => {
  const token = await issueAdminToken({ u: USERNAME, v: VERSION, exp: FUTURE }, KEY);
  const [, sig] = token.split(".");
  const tampered = await issueAdminToken({ u: "admin", v: VERSION, exp: FUTURE + 999999 }, KEY);
  const [evilPayload] = tampered.split(".");
  assertEquals(await verifyAdminToken(`${evilPayload}.${sig}`, OPTS), false);
});

Deno.test("rejects malformed tokens", async () => {
  assertEquals(await verifyAdminToken("", OPTS), false);
  assertEquals(await verifyAdminToken("not-a-token", OPTS), false);
  assertEquals(await verifyAdminToken("a.b.c", OPTS), false);
});

Deno.test("safeEqual is correct", () => {
  assertEquals(safeEqual("abc", "abc"), true);
  assertEquals(safeEqual("abc", "abd"), false);
  assertEquals(safeEqual("abc", "ab"), false);
});
