// Tests for the persistent, self-healing provider prioritization behaviour.
//
// MockHealthStore mirrors the semantics of the SQL RPCs in
// 202610090005_tara_provider_health_selfhealing.sql (advisory-lock serialized,
// move-to-bottom on failure, one-step-up on success, exponential cooldown).
// The real SQL is exercised separately by the rolled-back DB test in
// TARA_AI_SETUP.md ("Migration validation").
//
// Run: deno test supabase/functions/analyze-opportunity/health_test.ts

import { assertEquals } from "jsr:@std/assert@1";

const DEFAULT = ["groq", "gemini", "openrouter"];

interface S {
  provider: string;
  priority: number;
  failures: number;
  cooldownUntil: number | null;
  lastFailedAt: number | null;
  lastSucceededAt: number | null;
  lastCategory: string | null;
}

class MockHealthStore {
  private m = new Map<string, S>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(providers: string[] = DEFAULT) {
    providers.forEach((p, i) =>
      this.m.set(p, {
        provider: p,
        priority: i + 1,
        failures: 0,
        cooldownUntil: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        lastCategory: null,
      })
    );
  }

  /** Serialize updates like pg_advisory_xact_lock. */
  private locked<T>(fn: () => T): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  failure(provider: string, category: string, retryAfter: number | null, now: number): Promise<void> {
    return this.locked(() => {
      const s = this.m.get(provider);
      if (!s) return;
      s.failures += 1;
      s.lastFailedAt = now;
      s.lastCategory = category;
      let seconds: number;
      if (category === "provider_auth") {
        seconds = 21600;
      } else {
        seconds = Math.min(30 * 2 ** Math.min(Math.max(s.failures - 1, 0), 6), 900);
        if (retryAfter && retryAfter > 0) seconds = Math.max(seconds, Math.min(retryAfter, 900));
      }
      s.cooldownUntil = now + seconds * 1000;
      const max = Math.max(...[...this.m.values()].map((x) => x.priority));
      s.priority = max + 1;
      this.normalize();
    });
  }

  success(provider: string, now: number): Promise<void> {
    return this.locked(() => {
      const s = this.m.get(provider);
      if (!s) return;
      s.failures = 0;
      s.cooldownUntil = null;
      s.lastSucceededAt = now;
      s.lastCategory = null;
      const cur = s.priority;
      if (cur > 1) {
        const above = [...this.m.values()]
          .filter((x) => x.priority < cur)
          .sort((a, b) => b.priority - a.priority)[0];
        if (above) {
          above.priority = cur;
          s.priority = cur - 1;
        }
      }
    });
  }

  private normalize() {
    [...this.m.values()]
      .sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider))
      .forEach((s, i) => (s.priority = i + 1));
  }

  priorityOrder(): string[] {
    return [...this.m.values()]
      .sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider))
      .map((s) => s.provider);
  }

  order(now: number): string[] {
    const eligible = [...this.m.values()]
      .filter((s) => !s.cooldownUntil || s.cooldownUntil <= now)
      .sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider))
      .map((s) => s.provider);
    return eligible.length ? eligible : [...DEFAULT];
  }

  cooldownSeconds(provider: string, now: number): number {
    const s = this.m.get(provider)!;
    return s.cooldownUntil ? Math.round((s.cooldownUntil - now) / 1000) : 0;
  }

  failureCount(provider: string): number {
    return this.m.get(provider)!.failures;
  }

  priorities(): number[] {
    return [...this.m.values()].map((s) => s.priority).sort((a, b) => a - b);
  }

  serialize(): string {
    return JSON.stringify([...this.m.values()]);
  }

  static load(json: string): MockHealthStore {
    const store = new MockHealthStore([]);
    for (const s of JSON.parse(json) as S[]) store.m.set(s.provider, s);
    return store;
  }
}

Deno.test("rotation: a failed provider moves to the bottom", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 1000);
  assertEquals(st.priorityOrder(), ["gemini", "openrouter", "groq"]);
  assertEquals(st.priorities(), [1, 2, 3]);
});

Deno.test("rotation: a second failure also moves to the bottom", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 1000);
  await st.failure("gemini", "provider_server", null, 1000);
  assertEquals(st.priorityOrder(), ["openrouter", "groq", "gemini"]);
});

Deno.test("rotation: a failure is persisted even when a later provider succeeds", async () => {
  const st = new MockHealthStore();
  // groq fails, gemini answers -> groq must be at the bottom next time.
  await st.failure("groq", "timeout", null, 1000);
  await st.success("gemini", 1000);
  assertEquals(st.priorityOrder(), ["gemini", "openrouter", "groq"]);
});

Deno.test("recovery: priority is restored one step per success", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 1000);
  await st.failure("gemini", "rate_limit", null, 1000);
  assertEquals(st.priorityOrder(), ["openrouter", "groq", "gemini"]);
  await st.success("gemini", 2000);
  assertEquals(st.priorityOrder(), ["openrouter", "gemini", "groq"]);
  await st.success("gemini", 3000);
  assertEquals(st.priorityOrder(), ["gemini", "openrouter", "groq"]);
});

Deno.test("recovery: success clears failures and cooldown", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "provider_server", null, 1000);
  assertEquals(st.failureCount("groq"), 1);
  await st.success("groq", 2000);
  assertEquals(st.failureCount("groq"), 0);
  assertEquals(st.cooldownSeconds("groq", 2000), 0);
});

Deno.test("cooldown: exponential backoff and Retry-After are honoured", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 0);
  assertEquals(st.cooldownSeconds("groq", 0), 30);
  await st.failure("groq", "rate_limit", null, 0);
  assertEquals(st.cooldownSeconds("groq", 0), 60);
  await st.failure("groq", "rate_limit", null, 0);
  assertEquals(st.cooldownSeconds("groq", 0), 120);

  const st2 = new MockHealthStore();
  await st2.failure("groq", "rate_limit", 500, 0);
  assertEquals(st2.cooldownSeconds("groq", 0), 500);
});

Deno.test("cooldown: credential failures get a long fixed cooldown", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "provider_auth", null, 0);
  assertEquals(st.cooldownSeconds("groq", 0), 21600);
});

Deno.test("eligibility: a cooling provider is skipped, then probed after cooldown", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 0); // 30s cooldown
  assertEquals(st.order(0), ["gemini", "openrouter"]);
  assertEquals(st.order(31_000), ["gemini", "openrouter", "groq"]);
});

Deno.test("complete failure: when everything is cooling, the default order is used", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "provider_server", null, 0);
  await st.failure("gemini", "provider_server", null, 0);
  await st.failure("openrouter", "provider_server", null, 0);
  assertEquals(st.order(0), ["groq", "gemini", "openrouter"]);
});

Deno.test("persistence: state survives serialize/load", async () => {
  const st = new MockHealthStore();
  await st.failure("groq", "rate_limit", null, 1000);
  await st.failure("gemini", "provider_server", null, 1000);
  await st.success("openrouter", 1000);
  const restored = MockHealthStore.load(st.serialize());
  assertEquals(restored.priorityOrder(), st.priorityOrder());
  assertEquals(restored.priorities(), [1, 2, 3]);
});

Deno.test("concurrency: simultaneous updates cannot corrupt ordering", async () => {
  const st = new MockHealthStore();
  const calls: Promise<void>[] = [];
  for (let i = 0; i < 30; i++) {
    const provider = DEFAULT[i % DEFAULT.length];
    calls.push(st.failure(provider, "provider_server", null, i));
  }
  await Promise.all(calls);
  // Priorities stay a dense 1..3 permutation: no duplicates, no gaps.
  assertEquals(st.priorities(), [1, 2, 3]);
  assertEquals(st.failureCount("groq"), 10);
  assertEquals(st.failureCount("gemini"), 10);
  assertEquals(st.failureCount("openrouter"), 10);
});

Deno.test("concurrency: interleaved failure and success stay consistent", async () => {
  const st = new MockHealthStore();
  await Promise.all([
    st.failure("groq", "rate_limit", null, 0),
    st.success("gemini", 0),
    st.failure("openrouter", "timeout", null, 0),
    st.success("groq", 1),
  ]);
  assertEquals(st.priorities(), [1, 2, 3]);
  assertEquals(new Set(st.priorityOrder()).size, 3);
});
