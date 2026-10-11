import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const USER = "admin";
const enc = new TextEncoder();

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const ok = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function sign(p: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(K), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(p))));
}

async function auth(t: string) {
  try {
    const [p, s] = t.split(".");
    if (!p || !s || (await sign(p)) !== s) return false;
    const raw = atob(p.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (p.length % 4)) % 4));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
    return !!d.v && d.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && d.u === USER && Date.now() < d.exp;
  } catch {
    return false;
  }
}

const moneyPHP = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function log(db: any, type: string, id: string | null, action: string, details: any = {}) {
  await db.from("admin_activity_log").insert({ entity_type: type, entity_id: id, action, details });
}

// Calculate final price (amount_php) based on coupon settings and current Academy price
function calculateAmountPhp(discountType: string, discountValue: number, regularPricePhp: number): number {
  let finalPrice = regularPricePhp;

  switch (discountType) {
    case "fixed_php":
      finalPrice = regularPricePhp - Math.min(discountValue, regularPricePhp);
      break;
    case "percentage":
      finalPrice = regularPricePhp - Math.floor((regularPricePhp * discountValue) / 10000);
      break;
    case "target_price":
      finalPrice = Math.min(discountValue, regularPricePhp);
      break;
  }

  return Math.max(0, finalPrice);
}

// Calculate discount preview based on coupon settings and current Academy price
function calculateDiscountPreview(discountType: string, discountValue: number, regularPricePhp: number) {
  let discountAmount = 0;
  let finalPrice = regularPricePhp;

  switch (discountType) {
    case "fixed_php":
      discountAmount = Math.min(discountValue, regularPricePhp);
      finalPrice = regularPricePhp - discountAmount;
      break;
    case "percentage":
      discountAmount = Math.floor((regularPricePhp * discountValue) / 10000);
      finalPrice = regularPricePhp - discountAmount;
      break;
    case "target_price":
      finalPrice = Math.min(discountValue, regularPricePhp);
      discountAmount = regularPricePhp - finalPrice;
      break;
  }

  return {
    regular_price_php: regularPricePhp,
    discount_amount_php: discountAmount,
    final_price_php: finalPrice,
    discount_percent: regularPricePhp > 0 ? Math.round((discountAmount / regularPricePhp) * 10000) / 100 : 0,
  };
}

// Production originally stored the coupon's final price as whole pesos in
// amount_php. Normalize those legacy rows for the read API until the additive
// coupon migration is applied; never write the derived values back here.
function normalizeCoupon(coupon: any, regularPricePhp: number) {
  if (coupon.discount_type && Number.isFinite(Number(coupon.discount_value))) return coupon;
  const legacyFinalPriceCentavos = Math.max(0, Number(coupon.amount_php || 0) * 100);
  return {
    ...coupon,
    discount_type: "fixed_php",
    discount_value: Math.max(0, regularPricePhp - legacyFinalPriceCentavos),
  };
}

// Validate coupon data
function validateCouponData(data: any, isUpdate = false) {
  const errors: string[] = [];

  if (!isUpdate) {
    if (!data.code || typeof data.code !== "string") {
      errors.push("Coupon code is required");
    } else if (!/^[A-Z0-9_-]{3,32}$/i.test(data.code)) {
      errors.push("Coupon code must be 3-32 characters, alphanumeric with hyphens/underscores only");
    }
  }

  if (data.discount_type && !["fixed_php", "percentage", "target_price"].includes(data.discount_type)) {
    errors.push("Invalid discount type");
  }

  if (data.discount_value !== undefined) {
    if (typeof data.discount_value !== "number" || data.discount_value <= 0) {
      errors.push("Discount value must be a positive number");
    }
  }

  if (data.max_redemptions !== undefined && data.max_redemptions !== null) {
    if (!Number.isInteger(data.max_redemptions) || data.max_redemptions < 1) {
      errors.push("Max redemptions must be a positive integer or null");
    }
  }

  if (data.max_redemptions_per_customer !== undefined) {
    if (!Number.isInteger(data.max_redemptions_per_customer) || data.max_redemptions_per_customer < 1) {
      errors.push("Max redemptions per customer must be a positive integer");
    }
  }

  if (data.starts_at && data.expires_at) {
    const start = new Date(data.starts_at).getTime();
    const end = new Date(data.expires_at).getTime();
    if (isNaN(start) || isNaN(end) || start >= end) {
      errors.push("Start date must be before expiration date");
    }
  }

  return errors;
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  const h = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ok(o) ? o! : SITE,
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const out = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });

  if (req.method !== "POST" || (o && !ok(o))) return out({ ok: false, error: "Forbidden" }, 403);

  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await auth(t))) return out({ ok: false, error: "Session expired" }, 401);

  let b: any = {};
  try {
    b = await req.json();
  } catch {}

  const action = String(b.action || "");
  const db = createClient(U, K, { auth: { persistSession: false } });

  // Get current Academy regular price from a reference application or config
  // For now, use ₱6,900 (690000 centavos) as the standard price
  const REGULAR_PRICE_PHP = 690000;

  // LIST - Get all coupons with analytics
  if (action === "list") {
    try {
      // Get coupons with analytics
      const { data: coupons, error } = await db.rpc("get_coupon_analytics");
      // Analytics are additive. Legacy production databases may not have the
      // optional reporting RPC yet; the Admin must still list and manage the
      // canonical coupon records instead of failing the whole section.
      const analytics = error ? [] : (coupons || []);

      // Also get raw coupon data for full details
      const { data: rawCoupons, error: rawError } = await db
        .from("academy_promo_codes")
        .select("*")
        .order("created_at", { ascending: false });

      if (rawError) throw rawError;

      // Merge analytics with raw data
      const analyticsMap = new Map(analytics.map((c: any) => [c.coupon_id, c]));
      const enriched = (rawCoupons || []).map((rawCoupon: any) => {
        const c = normalizeCoupon(rawCoupon, REGULAR_PRICE_PHP);
        const a = analyticsMap.get(c.id);
        return {
          ...c,
          confirmed_redemptions: a?.confirmed_redemptions ?? 0,
          pending_redemptions: a?.pending_redemptions ?? 0,
          failed_redemptions: a?.failed_redemptions ?? 0,
          refunded_redemptions: a?.refunded_redemptions ?? 0,
          revenue_php: a?.revenue_php ?? 0,
          total_discounts_php: a?.total_discounts_php ?? 0,
          last_redemption_at: a?.last_redemption_at ?? null,
          remaining_redemptions: a?.remaining_redemptions ?? null,
          preview: calculateDiscountPreview(c.discount_type, c.discount_value, REGULAR_PRICE_PHP),
        };
      });

      return out({ ok: true, coupons: enriched });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // GET - Single coupon with full details and redemption history
  if (action === "get") {
    const id = String(b.id || "");
    if (!id) return out({ ok: false, error: "Coupon ID required" }, 400);

    try {
      const { data: coupon, error } = await db.from("academy_promo_codes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!coupon) return out({ ok: false, error: "Coupon not found" }, 404);

      // Get redemption history
      const { data: redemptions, error: rError } = await db
        .from("academy_coupon_redemptions")
        .select("*")
        .eq("coupon_id", id)
        .order("redeemed_at", { ascending: false })
        .limit(100);

      if (rError) throw rError;

      const normalizedCoupon = normalizeCoupon(coupon, REGULAR_PRICE_PHP);
      return out({
        ok: true,
        coupon: {
          ...normalizedCoupon,
          preview: calculateDiscountPreview(normalizedCoupon.discount_type, normalizedCoupon.discount_value, REGULAR_PRICE_PHP),
          redemptions: redemptions || [],
        },
      });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // CREATE - Create new coupon
  if (action === "create") {
    const errors = validateCouponData(b);
    if (errors.length) return out({ ok: false, error: errors.join("; ") }, 400);

    const code = String(b.code).trim().toUpperCase();
    const now = new Date().toISOString();

    try {
      // Check for duplicate code
      const { data: existing } = await db.from("academy_promo_codes").select("id").eq("code", code).maybeSingle();
      if (existing) return out({ ok: false, error: "Coupon code already exists" }, 409);

      const insertData = {
        code,
        campaign_name: b.campaign_name?.trim() || null,
        description: b.description?.trim() || null,
        discount_type: b.discount_type || "fixed_php",
        discount_value: Number(b.discount_value),
        amount_php: calculateAmountPhp(b.discount_type || "fixed_php", Number(b.discount_value), REGULAR_PRICE_PHP),
        starts_at: b.starts_at || null,
        expires_at: b.expires_at || null,
        max_redemptions: b.max_redemptions ?? null,
        max_redemptions_per_customer: b.max_redemptions_per_customer ?? 1,
        active: b.active !== false,
        created_at: now,
        updated_at: now,
        created_by: null, // Could extract from token
        updated_by: null,
      };

      const { data: coupon, error } = await db.from("academy_promo_codes").insert(insertData).select().single();
      if (error) throw error;

      await log(db, "coupon", coupon.id, "create", { code: coupon.code, discount_type: coupon.discount_type });

      return out({
        ok: true,
        coupon: {
          ...coupon,
          preview: calculateDiscountPreview(coupon.discount_type, coupon.discount_value, REGULAR_PRICE_PHP),
        },
      });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // UPDATE - Update existing coupon
  if (action === "update") {
    const id = String(b.id || "");
    if (!id) return out({ ok: false, error: "Coupon ID required" }, 400);

    const errors = validateCouponData(b, true);
    if (errors.length) return out({ ok: false, error: errors.join("; ") }, 400);

    try {
      // Check if coupon exists
      const { data: existing, error: fetchError } = await db.from("academy_promo_codes").select("*").eq("id", id).maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return out({ ok: false, error: "Coupon not found" }, 404);

      // If code is being changed, check for conflicts
      if (b.code && String(b.code).trim().toUpperCase() !== existing.code) {
        const newCode = String(b.code).trim().toUpperCase();
        const { data: conflict } = await db.from("academy_promo_codes").select("id").eq("code", newCode).maybeSingle();
        if (conflict) return out({ ok: false, error: "Coupon code already exists" }, 409);
      }

      const updates: any = { updated_at: new Date().toISOString(), updated_by: null };
      const allowedFields = [
        "code",
        "campaign_name",
        "description",
        "discount_type",
        "discount_value",
        "starts_at",
        "expires_at",
        "max_redemptions",
        "max_redemptions_per_customer",
        "active",
      ];

      for (const field of allowedFields) {
        if (b[field] !== undefined) {
          if (field === "code") updates[field] = String(b[field]).trim().toUpperCase();
          else if (field === "discount_value") updates[field] = Number(b[field]);
          else if (["max_redemptions", "max_redemptions_per_customer"].includes(field)) {
            updates[field] = b[field] === null ? null : Number(b[field]);
          } else if (["starts_at", "expires_at"].includes(field)) {
            updates[field] = b[field] || null;
          } else {
            updates[field] = b[field];
          }
        }
      }

      // Recalculate amount_php if discount_type or discount_value changed
      const newDiscountType = updates.discount_type ?? existing.discount_type;
      const newDiscountValue = updates.discount_value ?? existing.discount_value;
      if (updates.discount_type !== undefined || updates.discount_value !== undefined) {
        updates.amount_php = calculateAmountPhp(newDiscountType, newDiscountValue, REGULAR_PRICE_PHP);
      }

      const { data: coupon, error } = await db.from("academy_promo_codes").update(updates).eq("id", id).select().single();
      if (error) throw error;

      await log(db, "coupon", coupon.id, "update", { changes: Object.keys(updates).filter((k) => k !== "updated_at" && k !== "updated_by") });

      return out({
        ok: true,
        coupon: {
          ...coupon,
          preview: calculateDiscountPreview(coupon.discount_type, coupon.discount_value, REGULAR_PRICE_PHP),
        },
      });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // DUPLICATE - Create a copy of an existing coupon
  if (action === "duplicate") {
    const id = String(b.id || "");
    if (!id) return out({ ok: false, error: "Coupon ID required" }, 400);

    try {
      const { data: existing, error: fetchError } = await db.from("academy_promo_codes").select("*").eq("id", id).maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return out({ ok: false, error: "Coupon not found" }, 404);

      // Generate a new code
      const baseCode = existing.code;
      let newCode = baseCode + "_COPY";
      let attempt = 1;
      while (true) {
        const { data: conflict } = await db.from("academy_promo_codes").select("id").eq("code", newCode).maybeSingle();
        if (!conflict) break;
        attempt++;
        newCode = `${baseCode}_COPY${attempt}`;
      }

      const now = new Date().toISOString();
      const insertData = {
        code: newCode,
        campaign_name: existing.campaign_name ? `${existing.campaign_name} (Copy)` : null,
        description: existing.description,
        discount_type: existing.discount_type,
        discount_value: existing.discount_value,
        amount_php: calculateAmountPhp(existing.discount_type, existing.discount_value, REGULAR_PRICE_PHP),
        starts_at: null, // New coupon starts fresh
        expires_at: null,
        max_redemptions: existing.max_redemptions,
        max_redemptions_per_customer: existing.max_redemptions_per_customer,
        active: false, // Duplicates start inactive for safety
        created_at: now,
        updated_at: now,
        created_by: null,
        updated_by: null,
      };

      const { data: coupon, error } = await db.from("academy_promo_codes").insert(insertData).select().single();
      if (error) throw error;

      await log(db, "coupon", coupon.id, "duplicate", { source_coupon_id: existing.id, source_code: existing.code });

      return out({
        ok: true,
        coupon: {
          ...coupon,
          preview: calculateDiscountPreview(coupon.discount_type, coupon.discount_value, REGULAR_PRICE_PHP),
        },
      });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // TOGGLE ACTIVE - Activate/deactivate coupon
  if (action === "toggle_active") {
    const id = String(b.id || "");
    const active = Boolean(b.active);
    if (!id) return out({ ok: false, error: "Coupon ID required" }, 400);

    try {
      const { data: coupon, error } = await db
        .from("academy_promo_codes")
        .update({ active, updated_at: new Date().toISOString(), updated_by: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (!coupon) return out({ ok: false, error: "Coupon not found" }, 404);

      await log(db, "coupon", coupon.id, active ? "activate" : "deactivate", {});

      return out({
        ok: true,
        coupon: {
          ...coupon,
          preview: calculateDiscountPreview(coupon.discount_type, coupon.discount_value, REGULAR_PRICE_PHP),
        },
      });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // DELETE - Delete coupon (only if no confirmed redemptions)
  if (action === "delete") {
    const id = String(b.id || "");
    const force = Boolean(b.force);
    if (!id) return out({ ok: false, error: "Coupon ID required" }, 400);

    try {
      // Check for confirmed redemptions
      const { data: redemptions, error: rError } = await db
        .from("academy_coupon_redemptions")
        .select("id, status")
        .eq("coupon_id", id)
        .in("status", ["confirmed", "pending"]);
      if (rError) throw rError;

      const hasActiveRedemptions = (redemptions || []).some((r) => r.status === "confirmed" || r.status === "pending");
      if (hasActiveRedemptions && !force) {
        return out(
          {
            ok: false,
            error: "Cannot delete coupon with confirmed or pending redemptions. Use force=true to override.",
          },
          409,
        );
      }

      const { error } = await db.from("academy_promo_codes").delete().eq("id", id);
      if (error) throw error;

      await log(db, "coupon", id, "delete", { forced: force });

      return out({ ok: true });
    } catch (e) {
      return out({ ok: false, error: e.message }, 500);
    }
  }

  // PREVIEW - Calculate discount preview for given parameters
  if (action === "preview") {
    const discountType = String(b.discount_type || "fixed_php");
    const discountValue = Number(b.discount_value || 0);
    const regularPrice = Number(b.regular_price_php || REGULAR_PRICE_PHP);

    const preview = calculateDiscountPreview(discountType, discountValue, regularPrice);
    return out({ ok: true, preview });
  }

  return out({ ok: false, error: "Unknown action" }, 400);
});
