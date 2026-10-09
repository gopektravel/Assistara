// Tara provider fallback chain for the analyze-opportunity Edge Function.
//
// Providers (in default priority order): Groq -> Gemini -> OpenRouter.
// The order can be overridden at runtime by the `tara_provider_health` table.
//
// This module is intentionally free of Deno.serve / Supabase wiring so it can be
// unit tested with a mock fetch (no real API keys required).

export interface ProviderResult {
  text: string;
  model: string;
  provider: string;
}

export interface ProviderFailure {
  provider: string;
  status: number;
  category: string;
  message: string;
  retryAfterSeconds?: number | null;
}

/** A row from public.tara_provider_health. */
export interface HealthRow {
  provider: string;
  priority: number;
  consecutive_failures?: number | null;
  cooldown_until?: string | null;
  last_failed_at?: string | null;
  last_succeeded_at?: string | null;
}

export interface ProviderDeps {
  /** Injectable fetch, used by tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable env reader, used by tests. Defaults to Deno.env.get. */
  getEnv?: (key: string) => string | undefined;
  /** Per-provider timeout in milliseconds. */
  timeoutMs?: number;
}

export const DEFAULT_ORDER = ["groq", "gemini", "openrouter"] as const;
export const DEFAULT_TIMEOUT_MS = 20000;

export const SYSTEM_PROMPT =
  `You are Tara, Assistara Academy's Client Coach. Help complete beginners find, understand and win legitimate remote-client opportunities. Be practical, warm, direct and concise. Use supplied student and Client Finder data first. Never invent places, prospects, skills, proof or experience. For client finding, prioritize existing opportunities, due follow ups, saved places, then supplied Discover places. Return valid JSON only with required tara_take. All other fields are optional: next_action:{action,why,when?}, client_problem, evidence[], assumptions_unknowns[], fit_assessment, how_student_can_help[], suggested_message, questions_to_ask[], warnings[], recommended_places[], save_places[], opportunity_detected, add_to_client_hunt. IMPORTANT: Do not use a standard template. Answer the student's actual request naturally. Include optional fields ONLY when they materially help answer that specific request. Do not automatically include "how_student_can_help", "next_action", "suggested_message", "warnings", "client_problem", or any other section. For simple questions, tara_take alone may be the complete answer. Use suggested_message only when the student asks for wording/outreach or when drafting a message is clearly the useful next step. Use warnings only when there is a genuine risk or important caution. Use how_student_can_help only when evaluating a concrete client/opportunity where that analysis is useful. Use next_action only when a concrete next action adds value. Keep tara_take and suggested messages under 120 words. Never use em dashes or en dashes.`;

export class ProviderError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parse a Retry-After header (seconds or HTTP-date) into seconds, else null. */
export function parseRetryAfter(value: string | null, nowMs: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (!Number.isNaN(at)) return Math.max(0, Math.round((at - nowMs) / 1000));
  return null;
}

/** Classify a provider failure for server-side diagnostics. Never returned to users. */
export function classifyFailure(status: number, message: string): string {
  const m = String(message || "").toLowerCase();
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || m.includes("timeout") || m.includes("abort")) return "timeout";
  if (status >= 500) return "provider_server";
  if (status === 0) return "network";
  if (m.includes("invalid json") || m.includes("parse")) return "invalid_response";
  if (status === 400 || status === 422) return "bad_request";
  return "unknown";
}

function envOf(deps: ProviderDeps, key: string): string {
  const reader = deps.getEnv || ((k: string) => Deno.env.get(k));
  return String(reader(key) || "").trim();
}

async function postJSON(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  deps: ProviderDeps,
): Promise<any> {
  const fetchImpl = deps.fetchImpl || fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.message || "request failed";
      throw new ProviderError(String(message), response.status, parseRetryAfter(response.headers.get("retry-after")));
    }
    return data;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const name = (error as any)?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      throw new ProviderError("timeout", 408);
    }
    throw new ProviderError((error as any)?.message || String(error), 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function callGroq(user: string, deps: ProviderDeps = {}): Promise<ProviderResult> {
  const key = envOf(deps, "GROQ_API_KEY");
  if (!key) throw new ProviderError("Groq key is not configured", 0);
  const model = envOf(deps, "GROQ_MODEL") || "openai/gpt-oss-20b";
  const data = await postJSON(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      temperature: 0.15,
      response_format: { type: "json_object" },
    },
    deps,
  );
  return { text: data?.choices?.[0]?.message?.content || "", model: data?.model || model, provider: "groq" };
}

export async function callGemini(user: string, deps: ProviderDeps = {}): Promise<ProviderResult> {
  const key = envOf(deps, "GEMINI_API_KEY") || envOf(deps, "GOOGLE_API_KEY");
  if (!key) throw new ProviderError("Gemini key is not configured", 0);
  const model = envOf(deps, "GEMINI_MODEL") || "gemini-3.8-flash";
  const data = await postJSON(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    { "x-goog-api-key": key, "Content-Type": "application/json" },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.15, responseMimeType: "application/json" },
    },
    deps,
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return { text, model, provider: "gemini" };
}

export async function callOpenRouter(user: string, deps: ProviderDeps = {}): Promise<ProviderResult> {
  const key = envOf(deps, "OPENROUTER_API_KEY");
  if (!key) throw new ProviderError("OpenRouter key is not configured", 0);
  const model = "openrouter/free";
  const data = await postJSON(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://www.getassistara.com",
      "X-Title": "Assistara Tara",
    },
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      temperature: 0.15,
      response_format: { type: "json_object" },
    },
    deps,
  );
  return { text: data?.choices?.[0]?.message?.content || "", model: data?.model || model, provider: "openrouter" };
}

export function callProvider(provider: string, user: string, deps: ProviderDeps = {}): Promise<ProviderResult> {
  if (provider === "groq") return callGroq(user, deps);
  if (provider === "gemini") return callGemini(user, deps);
  if (provider === "openrouter") return callOpenRouter(user, deps);
  throw new ProviderError("Unknown provider: " + provider, 0);
}

/**
 * Try each configured provider in order until one answers.
 *
 * - Bounded: iterates the (deduplicated) order once, so it can never loop forever.
 * - Provider-side failures (auth, rate limit, server, timeout, network) fall through
 *   to the next provider. There is no user/session retry here: an invalid user
 *   session is rejected by the auth gate before this runs.
 */
export async function runProviderChain(
  user: string,
  order: readonly string[],
  deps: ProviderDeps = {},
): Promise<{ result: ProviderResult | null; failures: ProviderFailure[] }> {
  const failures: ProviderFailure[] = [];
  const seen = new Set<string>();
  for (const provider of order) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    try {
      const result = await callProvider(provider, user, deps);
      if (result?.text) return { result, failures };
      failures.push({ provider, status: 0, category: "empty_response", message: "empty response" });
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : 0;
      const message = (error as any)?.message || String(error);
      const retryAfterSeconds = error instanceof ProviderError ? error.retryAfterSeconds : null;
      failures.push({ provider, status, category: classifyFailure(status, message), message, retryAfterSeconds });
    }
  }
  return { result: null, failures };
}

/**
 * Build the provider order for one request from persisted health rows.
 *
 * - Eligible providers (cooldown elapsed or never failed) are tried, ordered by
 *   persisted priority.
 * - Providers still in cooldown are skipped.
 * - If nothing is eligible (everything cooling down) or the health table is
 *   unavailable/empty, fall back to the configured default order so Tara still
 *   answers.
 */
export function buildProviderOrder(
  rows: readonly HealthRow[] | null | undefined,
  nowMs: number,
  defaultOrder: readonly string[] = DEFAULT_ORDER,
): string[] {
  const byName = new Map<string, HealthRow>();
  for (const row of rows || []) {
    if (row && typeof row.provider === "string") byName.set(row.provider, row);
  }

  const eligible: string[] = [];
  for (const provider of defaultOrder) {
    const row = byName.get(provider);
    if (!row) {
      // No health row yet: treat as healthy.
      eligible.push(provider);
      continue;
    }
    const until = row.cooldown_until ? Date.parse(row.cooldown_until) : 0;
    if (!until || Number.isNaN(until) || until <= nowMs) eligible.push(provider);
  }

  eligible.sort((a, b) => {
    const ra = byName.get(a);
    const rb = byName.get(b);
    // Providers without a health row keep their configured default position.
    const pa = ra ? ra.priority : 1_000_000 + defaultOrder.indexOf(a);
    const pb = rb ? rb.priority : 1_000_000 + defaultOrder.indexOf(b);
    return pa - pb || a.localeCompare(b);
  });

  return eligible.length ? eligible : [...defaultOrder];
}
