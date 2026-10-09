// Unit tests for the Tara provider fallback chain.
// Run: deno test supabase/functions/analyze-opportunity/providers_test.ts
//
// These tests use a mock fetch and mock env, so they never touch real API keys.

import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyFailure,
  runProviderChain,
  type ProviderDeps,
} from "./providers.ts";

const ENV: Record<string, string> = {
  GROQ_API_KEY: "test-groq",
  GEMINI_API_KEY: "test-gemini",
  OPENROUTER_API_KEY: "test-openrouter",
};

function deps(fetchImpl: typeof fetch, timeoutMs = 50): ProviderDeps {
  return { fetchImpl, getEnv: (k) => ENV[k], timeoutMs };
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function okGroq(text = "{\"tara_take\":\"hi\"}"): Response {
  return reply(200, { model: "openai/gpt-oss-20b", choices: [{ message: { content: text } }] });
}
function okGemini(text = "{\"tara_take\":\"hi\"}"): Response {
  return reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
}
function okOpenRouter(text = "{\"tara_take\":\"hi\"}"): Response {
  return reply(200, { model: "openrouter/free", choices: [{ message: { content: text } }] });
}

const ORDER = ["groq", "gemini", "openrouter"];

Deno.test("first provider success: no fallback", async () => {
  const calls: string[] = [];
  const fetchImpl = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(okGroq());
  }) as unknown as typeof fetch;
  const { result, failures } = await runProviderChain("u", ORDER, deps(fetchImpl));
  assertEquals(result?.provider, "groq");
  assertEquals(failures.length, 0);
  assertEquals(calls.length, 1);
});

Deno.test("provider 401 falls through to the next provider", async () => {
  const fetchImpl = ((url: string) => {
    if (String(url).includes("groq.com")) return Promise.resolve(reply(401, { error: { message: "Invalid API Key" } }));
    return Promise.resolve(okGemini());
  }) as unknown as typeof fetch;
  const { result, failures } = await runProviderChain("u", ORDER, deps(fetchImpl));
  assertEquals(result?.provider, "gemini");
  assertEquals(failures.length, 1);
  assertEquals(failures[0].provider, "groq");
  assertEquals(failures[0].category, "provider_auth");
});

Deno.test("rate limit 429 falls through two providers", async () => {
  const seen: string[] = [];
  const fetchImpl = ((url: string) => {
    const u = String(url);
    seen.push(u);
    if (u.includes("groq.com")) return Promise.resolve(reply(429, { error: { message: "rate limited" } }));
    if (u.includes("googleapis.com")) return Promise.resolve(reply(429, { error: { message: "rate limited" } }));
    return Promise.resolve(okOpenRouter());
  }) as unknown as typeof fetch;
  const { result, failures } = await runProviderChain("u", ORDER, deps(fetchImpl));
  assertEquals(result?.provider, "openrouter");
  assertEquals(failures.map((f) => f.category), ["rate_limit", "rate_limit"]);
  assertEquals(seen.length, 3);
});

Deno.test("provider timeout falls through to the next provider", async () => {
  const fetchImpl = ((url: string, init?: RequestInit) => {
    if (String(url).includes("groq.com")) {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort);
      });
    }
    return Promise.resolve(okGemini());
  }) as unknown as typeof fetch;
  const { result, failures } = await runProviderChain("u", ORDER, deps(fetchImpl, 25));
  assertEquals(result?.provider, "gemini");
  assertEquals(failures.length, 1);
  assertEquals(failures[0].category, "timeout");
});

Deno.test("all providers unavailable: returns null with one failure each", async () => {
  const fetchImpl = (() => Promise.resolve(reply(503, { error: { message: "down" } }))) as unknown as typeof fetch;
  const { result, failures } = await runProviderChain("u", ORDER, deps(fetchImpl));
  assertEquals(result, null);
  assertEquals(failures.length, 3);
  assertEquals(failures.map((f) => f.category), ["provider_server", "provider_server", "provider_server"]);
});

Deno.test("missing key for a provider is treated as a failure, not a crash", async () => {
  const localDeps: ProviderDeps = {
    fetchImpl: (() => Promise.resolve(okGemini())) as unknown as typeof fetch,
    getEnv: (k) => (k === "GROQ_API_KEY" ? undefined : ENV[k]),
    timeoutMs: 50,
  };
  const { result, failures } = await runProviderChain("u", ORDER, localDeps);
  assertEquals(result?.provider, "gemini");
  assertEquals(failures.length, 1);
  assertEquals(failures[0].provider, "groq");
});

Deno.test("duplicate provider entries cannot loop forever", async () => {
  let calls = 0;
  const fetchImpl = (() => {
    calls++;
    return Promise.resolve(reply(500, { error: { message: "down" } }));
  }) as unknown as typeof fetch;
  const { result } = await runProviderChain("u", ["groq", "groq", "groq"], deps(fetchImpl));
  assertEquals(result, null);
  assertEquals(calls, 1);
});

Deno.test("failure categories", () => {
  assertEquals(classifyFailure(401, ""), "provider_auth");
  assertEquals(classifyFailure(403, ""), "provider_auth");
  assertEquals(classifyFailure(429, ""), "rate_limit");
  assertEquals(classifyFailure(408, ""), "timeout");
  assertEquals(classifyFailure(0, "aborted"), "timeout");
  assertEquals(classifyFailure(500, ""), "provider_server");
  assertEquals(classifyFailure(0, "network down"), "network");
  assertEquals(classifyFailure(400, ""), "bad_request");
});
