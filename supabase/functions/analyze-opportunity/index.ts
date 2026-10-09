import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildProviderOrder,
  DEFAULT_ORDER,
  type HealthRow,
  type ProviderFailure,
  type ProviderResult,
  runProviderChain,
} from "./providers.ts";
import { verifyAdminToken } from "./auth.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_USERNAME = Deno.env.get("ADMIN_USERNAME") || "admin";
const ADMIN_TOKEN_VERSION = Deno.env.get("ADMIN_TOKEN_VERSION") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Verify an Admin HMAC token. Mirrors admin-api.verifyToken: the payload must be
 * signed with the service-role key, be for the configured admin user, match the
 * current ADMIN_TOKEN_VERSION (when configured), and not be expired.
 */
function isAdmin(token: string): Promise<boolean> {
  return verifyAdminToken(token, {
    key: K,
    username: ADMIN_USERNAME,
    version: ADMIN_TOKEN_VERSION,
  });
}

/** Verify a Supabase user JWT by asking Auth who it belongs to. */
async function authorized(req: Request): Promise<boolean> {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return false;
  const c = createClient(U, K);
  const { data } = await c.auth.getUser(t);
  return !!data.user;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Server-side diagnostic log. Never includes tokens, keys or conversation text. */
function logEvent(event: string, fields: Record<string, unknown>) {
  try {
    console.log(event, JSON.stringify(fields));
  } catch {
    console.log(event);
  }
}

function failureSummary(failures: ProviderFailure[]) {
  return failures.map((f) => ({ provider: f.provider, status: f.status, category: f.category }));
}

/**
 * Run a best-effort task after the response is sent. Uses the Edge Runtime's
 * waitUntil when available, otherwise awaits so the work is not lost.
 */
function scheduleBackground(task: Promise<unknown>): void {
  const edge = (globalThis as any).EdgeRuntime;
  if (edge && typeof edge.waitUntil === "function") {
    try {
      edge.waitUntil(task);
      return;
    } catch {
      /* fall through to awaiting */
    }
  }
  // No waitUntil: attach a catch so a rejection can never surface.
  task.catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let b: any = {};
    try {
      b = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const hasAdminToken = typeof b.admin_token === "string" && b.admin_token.length > 0;
    const adminBody = hasAdminToken ? await isAdmin(b.admin_token) : false;
    const hasBearer = /^Bearer\s+\S/i.test(req.headers.get("authorization") || "");

    if (!adminBody) {
      const userOk = await authorized(req);
      if (!userOk) {
        // Application auth failure (not a provider failure). Never fall back here.
        logEvent("tara_auth_rejected", {
          admin_token_present: hasAdminToken,
          bearer_present: hasBearer,
        });
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const root = b.payload || b;
    const d = root.data || {};
    const request =
      root.current_task?.student_request || root.student_request || root.text || "";
    const user = JSON.stringify({
      data: {
        student: d.student || {},
        client_finder: d.client_finder || {},
        opportunity: d.opportunity || {},
        conversation_history: Array.isArray(d.conversation_history)
          ? d.conversation_history.slice(-12)
          : [],
      },
      current_task: {
        type: root.current_task?.type || "analyze_opportunity",
        student_request: request,
      },
    });

    // Provider order comes from persisted health (best-effort); on any DB
    // problem we fall back to the default order and still answer.
    const db = createClient(U, K);
    let rows: HealthRow[] = [];
    let healthAvailable = false;
    try {
      const { data, error } = await db
        .from("tara_provider_health")
        .select("provider,priority,consecutive_failures,cooldown_until,last_failed_at,last_succeeded_at")
        .order("priority", { ascending: true });
      if (!error && Array.isArray(data)) {
        rows = data as HealthRow[];
        healthAvailable = true;
      }
    } catch {
      /* health table is optional */
    }

    const order = buildProviderOrder(rows, Date.now(), DEFAULT_ORDER);
    const { result, failures } = await runProviderChain(user, order);

    // Persist health changes after responding. A failure moves the provider to
    // the bottom and starts a cooldown; a success restores it one step. This is
    // best-effort and can never affect the answer or the user's session.
    if (healthAvailable && (failures.length > 0 || result)) {
      const persist = async () => {
        try {
          for (const f of failures) {
            await db.rpc("tara_provider_failure", {
              p_provider: f.provider,
              p_category: f.category,
              p_retry_after_seconds: f.retryAfterSeconds ?? null,
            });
          }
          if (result) {
            await db.rpc("tara_provider_success", { p_provider: result.provider });
          }
        } catch (error) {
          logEvent("tara_health_persist_failed", { message: (error as any)?.message || String(error) });
        }
      };
      scheduleBackground(persist());
    }

    if (!result) {
      logEvent("tara_providers_exhausted", { failures: failureSummary(failures), order });
      return json({ error: "Tara couldn't answer right now. Please try again in a moment." }, 503);
    }

    if (failures.length) {
      logEvent("tara_provider_fallback", {
        served_by: (result as ProviderResult).provider,
        failures: failureSummary(failures),
      });
    }

    let out: unknown;
    try {
      out = JSON.parse(result.text);
    } catch {
      logEvent("tara_invalid_json", { provider: result.provider, model: result.model });
      return json({ error: "Tara couldn't answer right now. Please try again in a moment." }, 503);
    }

    return json({
      analysis: out,
      model: result.model,
      provider: result.provider,
      fallback: failures.length > 0,
    });
  } catch (error) {
    logEvent("tara_unhandled_error", { message: (error as any)?.message || String(error) });
    return json({ error: "Tara failed" }, 500);
  }
});
