import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SITE = "https://www.getassistara.com";

const allowed = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001"
]);

const good = (o: string | null) => !o || allowed.has(o);
const cors = (o: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": o && good(o) ? o : SITE,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});

const out = (body: any, status: number, h: any) =>
  new Response(JSON.stringify(body), { status, headers: h });

const clean = (v: any, n = 500) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";

const phoneish = (v: string) =>
  /^\+?[0-9 ()-]{7,}$/.test(v);

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  const h = cors(origin);

  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: h });

  if (req.method !== "POST" || !good(origin))
    return out({ ok: false, error: "Forbidden" }, 403, h);

  try {
    let b: any = {};
    try { b = await req.json(); } catch {}

    const identifier = clean(b.identifier, 300);
    const password = typeof b.password === "string" ? b.password : "";

    if (!identifier || !password)
      return out({ ok: false, error: "Enter your email or phone number and password" }, 400, h);

    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let email = identifier;

    if (phoneish(identifier) && !identifier.includes("@")) {
      const phone = identifier.replace(/[^0-9+]/g, "").replace(/(?!^)[+]/g, "");

      const { data } = await admin
        .from("academy_applications")
        .select("email")
        .eq("onboarding_phone", phone)
        .not("auth_user_id", "is", null)
        .order("onboarding_completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.email)
        return out({ ok: false, error: "Invalid email/phone or password" }, 401, h);

      email = data.email;
    }

    const auth = createClient(URL, PUBLIC, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session || !data.user)
      return out({ ok: false, error: "Invalid email/phone or password" }, 401, h);

    const { data: adminUser, error: adminUserError } = await admin.auth.admin.getUserById(data.user.id);
    const bannedUntil = adminUser?.user?.banned_until
      ? new Date(adminUser.user.banned_until).getTime()
      : 0;
    if (adminUserError || !adminUser?.user || adminUser.user.deleted_at || bannedUntil > Date.now())
      return out({ ok: false, error: "Invalid email/phone or password" }, 401, h);

    const { data: entitled, error: entitlementError } = await admin.rpc(
      "academy_has_access",
      { p_user_id: data.user.id }
    );
    if (entitlementError || entitled !== true)
      return out({ ok: false, error: "Academy access requires completed enrollment and account setup" }, 403, h);

    return out({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    }, 200, h);

  } catch (e) {
    console.error("academy-login", e);
    return out({ ok: false, error: "Login failed" }, 500, h);
  }
});
