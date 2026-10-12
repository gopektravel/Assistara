import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { createReplacementEnrollmentToken, resolveEnrollmentApplication } from "./enrollment-token.ts";

const applicationId = "11111111-1111-4111-8111-111111111111";
const originalToken = "22222222-2222-4222-8222-222222222222";

function fakeDb() {
  return {
    from() {
      return {
        select() {
          return {
            eq(column: string, value: string) {
              return {
                maybeSingle() {
                  const found = (column === "id" && value === applicationId) ||
                    (column === "enrollment_token" && value === originalToken);
                  return Promise.resolve({ data: found ? { id: applicationId } : null, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("replacement enrollment tokens are stable, unique and resolvable", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
  const token = await createReplacementEnrollmentToken(applicationId);
  assert(token.startsWith(`r1.${applicationId}.`));
  assertEquals(token, await createReplacementEnrollmentToken(applicationId));
  assertNotEquals(token, await createReplacementEnrollmentToken("33333333-3333-4333-8333-333333333333"));
  const resolved = await resolveEnrollmentApplication(fakeDb(), token, "id");
  assertEquals(resolved.tokenKind, "replacement");
  assertEquals(resolved.data.id, applicationId);
});

Deno.test("original enrollment tokens continue to resolve", async () => {
  const resolved = await resolveEnrollmentApplication(fakeDb(), originalToken, "id");
  assertEquals(resolved.tokenKind, "original");
  assertEquals(resolved.data.id, applicationId);
});

Deno.test("tampered replacement tokens are rejected", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
  const token = await createReplacementEnrollmentToken(applicationId);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  const resolved = await resolveEnrollmentApplication(fakeDb(), tampered, "id");
  assertEquals(resolved.tokenKind, "invalid");
  assertEquals(resolved.data, null);
});
