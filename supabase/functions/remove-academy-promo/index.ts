import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,SITE="https://www.getassistara.com";
const allowed=new Set(["https://getassistara.com","https://www.getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);
const good=(o:string|null)=>!o||allowed.has(o)||o.endsWith(".vercel.app");
Deno.serve(async req=>{
  const o=req.headers.get("origin");
  const h={"Content-Type":"application/json","Access-Control-Allow-Origin":o&&good(o)?o:SITE,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:h});
  if(req.method!=="POST"||!good(o))return out({ok:false,error:"Forbidden"},403);
  let b:any={};try{b=await req.json()}catch{}
  const token=String(b.token||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(token))return out({ok:false,error:"Invalid enrollment link."},400);
  const db=createClient(U,K,{auth:{persistSession:false}});
  const {data:a,error:ae}=await db.from("academy_applications").select("id,decision,status,payment_status").eq("enrollment_token",token).maybeSingle();
  if(ae)return out({ok:false,error:"Enrollment lookup failed."},500);
  if(!a||(a.decision!=="accepted"&&a.status!=="accepted"))return out({ok:false,error:"Enrollment invitation is not active."},403);
  const u=await db.from("academy_applications").update({promo_code:null,checkout_amount_php:null}).eq("id",a.id);
  if(u.error)return out({ok:false,error:"Promo could not be removed."},500);
  return out({ok:true,amount_php:6900});
});