import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const TARGET = `${PROJECT_URL}/functions/v1/website-form`;

const allowedOrigins = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

function allowed(origin: string | null) {
  return !!origin && (allowedOrigins.has(origin) || origin.endsWith(".vercel.app"));
}
function cors(origin: string | null) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowed(origin) ? origin! : "https://www.getassistara.com",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ok:false,error:"Method not allowed"}), {status:405,headers});


  const body = await req.text();
  const upstream = await fetch(TARGET, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { "Origin": origin } : {}) },
    body,
  });
  const upstreamText = await upstream.text();
  return new Response(upstreamText, { status: upstream.status, headers });
});
