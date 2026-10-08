// Admin Finance — expense CRUD behind the same Admin token gate as every
// other admin endpoint.
//
// Actions
//   { action: "list" }                                -> all expenses
//   { action: "create", expense: {...} }              -> insert, return row
//   { action: "update", id, expense: {...} }          -> update, return row
//   { action: "delete", id }                          -> delete
//   { action: "fx", currency, date }                  -> fetch PHP rate for currency on date
//
// The expense object mirrors public.finance_expenses. The server always
// recomputes the normalised `amount_php` from `amount`, `currency` and
// `fx_rate_php`, so totals can never drift from the original entry.
// Recurring expenses stay as a single rule row; occurrence materialisation
// happens in the Admin UI.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const USER = "admin";

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);
const ok = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ok(o) ? o! : SITE,
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const out = (x: unknown, s = 200, o: string | null) =>
  new Response(JSON.stringify(x), { status: s, headers: cors(o) });

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(K),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}
async function verifyToken(token: string) {
  try {
    const [p, s] = token.split(".");
    if (!p || !s || (await sign(p)) !== s) return false;
    const raw = atob(p.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (p.length % 4)) % 4));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
    return !!d.v && d.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && d.u === USER && Date.now() < d.exp;
  } catch {
    return false;
  }
}

const CURRENCIES = ["PHP", "USD", "EUR"];
const FREQUENCIES = ["monthly", "quarterly", "yearly"];

// Frankfurter API base URL (no API key required)
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

// In-memory cache for FX rates to avoid repeated calls during a single request
const fxCache = new Map<string, number>();

async function fetchFxRate(currency: string, date: string): Promise<number | null> {
  if (currency === "PHP") return 1;
  const cacheKey = `${currency}:${date}`;
  if (fxCache.has(cacheKey)) return fxCache.get(cacheKey)!;

  try {
    // Frankfurter uses date in URL: /v1/2026-09-15?from=EUR&to=PHP
    // It automatically handles weekends/holidays by returning the latest available rate
    const url = `${FRANKFURTER_BASE}/${date}?from=${currency}&to=PHP`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    const rate = data.rates?.PHP;
    if (typeof rate === "number" && rate > 0) {
      fxCache.set(cacheKey, rate);
      return rate;
    }
    return null;
  } catch {
    return null;
  }
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

async function validateExpense(raw: any): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const amount = Number(raw?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) {
    return { ok: false, error: "Enter a valid amount." };
  }
  const currency = clean(raw?.currency, 10).toUpperCase();
  if (!CURRENCIES.includes(currency)) {
    return { ok: false, error: "Currency must be PHP, USD, or EUR." };
  }

  // fx_rate_php: server-authoritative. If client provides a manual override, validate it.
  // Otherwise, we will fetch the rate server-side (for create/update without manual override).
  let fxRate = Number(raw?.fx_rate_php ?? 0);
  const hasManualOverride = Number.isFinite(fxRate) && fxRate > 0;

  const dateRaw = clean(raw?.expense_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) || Number.isNaN(Date.parse(dateRaw + "T00:00:00Z"))) {
    return { ok: false, error: "Enter a valid expense date." };
  }

  const category = clean(raw?.category, 80);
  if (!category) return { ok: false, error: "Choose a category." };

  const recurring = raw?.recurring === true || raw?.recurring === "true";
  const frequency = clean(raw?.recurrence_frequency, 20).toLowerCase();
  if (recurring && !FREQUENCIES.includes(frequency)) {
    return { ok: false, error: "Choose a recurrence frequency for the recurring expense." };
  }

  // Optional end date for a recurring schedule ("stop" / "cancel").
  let endsOn: string | null = null;
  const endsRaw = clean(raw?.ends_on, 10) || null;
  if (endsRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endsRaw) || Number.isNaN(Date.parse(endsRaw + "T00:00:00Z"))) {
      return { ok: false, error: "Enter a valid end date for the recurring expense." };
    }
    if (endsRaw < dateRaw) return { ok: false, error: "The end date must be on or after the expense date." };
    endsOn = endsRaw;
  }

  // If no manual override provided, fetch the rate server-side
  if (!hasManualOverride) {
    const fetched = await fetchFxRate(currency, dateRaw);
    if (fetched === null) {
      return { ok: false, error: `Could not retrieve automatic ${currency}→PHP rate for ${dateRaw}. Please enter a custom exchange rate.` };
    }
    fxRate = fetched;
  } else {
    // Manual override provided - validate it
    if (!Number.isFinite(fxRate) || fxRate <= 0 || fxRate > 100000) {
      return { ok: false, error: "Enter a valid PHP exchange rate." };
    }
  }

  const amountPhp = Math.round(amount * fxRate * 100) / 100;

  return {
    ok: true,
    value: {
      amount,
      currency,
      fx_rate_php: fxRate,
      amount_php: amountPhp,
      expense_date: dateRaw,
      category,
      vendor: clean(raw?.vendor, 200) || null,
      description: clean(raw?.description, 2000) || null,
      recurring,
      recurrence_frequency: recurring ? frequency : null,
      ends_on: recurring && endsOn ? endsOn : null,
      link_id: clean(raw?.link_id, 200) || null,
      receipt_reference: clean(raw?.receipt_reference, 200) || null,
    },
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST" || (origin && !ok(origin))) return out({ ok: false, error: "Forbidden" }, 403, origin);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await verifyToken(token))) return out({ ok: false, error: "Session expired" }, 401, origin);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is handled below */ }

  const action = String(body.action || "");
  const db = createClient(U, K, { auth: { persistSession: false } });

  if (action === "list") {
    const { data, error } = await db
      .from("finance_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return out({ ok: false, error: "Could not load expenses." }, 500, origin);
    return out({ ok: true, expenses: data || [] }, 200, origin);
  }

  if (action === "fx") {
    // Fetch FX rate for a given currency and date
    // Body: { currency: "USD" | "EUR", date: "2026-09-15" }
    const currency = String(body.currency || "").toUpperCase();
    const date = String(body.date || "");
    if (!["USD", "EUR"].includes(currency)) {
      return out({ ok: false, error: "Currency must be USD or EUR." }, 400, origin);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
      return out({ ok: false, error: "Enter a valid date." }, 400, origin);
    }
    const rate = await fetchFxRate(currency, date);
    if (rate === null) {
      return out({ ok: false, error: `Could not retrieve ${currency}→PHP rate for ${date}.` }, 400, origin);
    }
    return out({ ok: true, fx_rate_php: rate, source: "frankfurter" }, 200, origin);
  }

  if (action === "create") {
    const check = await validateExpense(body.expense);
    if (!check.ok) return out({ ok: false, error: check.error }, 400, origin);
    const { data, error } = await db
      .from("finance_expenses")
      .insert(check.value)
      .select("*")
      .single();
    if (error) return out({ ok: false, error: "Could not save the expense." }, 500, origin);
    return out({ ok: true, expense: data }, 200, origin);
  }

  if (action === "update") {
    const id = clean(body.id, 64);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return out({ ok: false, error: "Invalid expense id." }, 400, origin);
    const check = await validateExpense(body.expense);
    if (!check.ok) return out({ ok: false, error: check.error }, 400, origin);
    const { data, error } = await db
      .from("finance_expenses")
      .update(check.value)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return out({ ok: false, error: "Could not update the expense." }, 500, origin);
    return out({ ok: true, expense: data }, 200, origin);
  }

  if (action === "delete") {
    const id = clean(body.id, 64);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return out({ ok: false, error: "Invalid expense id." }, 400, origin);
    const { error } = await db.from("finance_expenses").delete().eq("id", id);
    if (error) return out({ ok: false, error: "Could not delete the expense." }, 500, origin);
    return out({ ok: true }, 200, origin);
  }

  return out({ ok: false, error: "Unknown action" }, 400, origin);
});