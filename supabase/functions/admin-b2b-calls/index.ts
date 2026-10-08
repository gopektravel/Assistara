import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL="https://www.getassistara.com";
const allowed=new Set(["https://getassistara.com","https://www.getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);
const good=(origin:string|null)=>!!origin&&(allowed.has(origin)||origin.endsWith(".vercel.app"));
const headers=(origin:string|null)=>({"content-type":"application/json","access-control-allow-origin":good(origin)?origin!:SITE_URL,"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"POST,OPTIONS","vary":"Origin"});
const encoder=new TextEncoder();
const b64url=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const fromB64url=(value:string)=>Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
async function sign(payload:string){const key=await crypto.subtle.importKey("raw",encoder.encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(payload))))}
async function admin(req:Request){try{const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const [payload,signature]=token.split(".");if(!payload||!signature||await sign(payload)!==signature)return false;const data=JSON.parse(new TextDecoder().decode(fromB64url(payload)));return !!data.v&&data.v===(Deno.env.get("ADMIN_TOKEN_VERSION")||"")&&data.u==="admin"&&Date.now()<data.exp}catch{return false}}
const clean=(value:unknown,max=8000)=>typeof value==="string"?value.trim().slice(0,max):"";
const pipeline=new Set(["Booked","Attended","No-show","Qualified","Proposal","Won","Lost"]);

Deno.serve(async req=>{
 const origin=req.headers.get("origin"),h=headers(origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method!=="POST"||(origin&&!good(origin)))return new Response(JSON.stringify({ok:false,error:"Forbidden"}),{status:403,headers:h});
 if(!await admin(req))return new Response(JSON.stringify({ok:false,error:"Session expired"}),{status:401,headers:h});
 let body:any={};try{body=await req.json()}catch{}
 const db=createClient(URL,SERVICE_KEY,{auth:{persistSession:false}});
 if(body.action==="list"){
   const {data,error}=await db.from("b2b_discovery_calls").select("id,b2b_lead_id,cal_booking_id,cal_event_type_name,cal_event_type_slug,contact_name,contact_email,contact_phone,business_name,qualifying_answers,cal_booking_status,call_start_at,call_end_at,call_date,timezone,booked_at,cancelled_at,cancellation_reason,rescheduled_from_cal_booking_id,rescheduled_to_cal_booking_id,reschedule_reason,pipeline_status,internal_notes,follow_up_at,deal_value,deal_currency,lost_reason,created_at,updated_at").order("call_start_at",{ascending:true,nullsFirst:false}).limit(200);
   if(error)return new Response(JSON.stringify({ok:false,error:error.message}),{status:500,headers:h});
   return new Response(JSON.stringify({ok:true,calls:data||[]}),{headers:h});
 }
 if(body.action==="update"){
   const id=clean(body.id,100);if(!id)return new Response(JSON.stringify({ok:false,error:"Missing call"}),{status:400,headers:h});
   const update:any={};
   if(body.pipeline_status!==undefined){const value=clean(body.pipeline_status,30);if(!pipeline.has(value))return new Response(JSON.stringify({ok:false,error:"Invalid pipeline status"}),{status:400,headers:h});update.pipeline_status=value}
   if(body.internal_notes!==undefined)update.internal_notes=clean(body.internal_notes);
   if(body.follow_up_at!==undefined)update.follow_up_at=clean(body.follow_up_at,40)||null;
   if(body.deal_value!==undefined){const value=body.deal_value===""||body.deal_value===null?null:Number(body.deal_value);if(value!==null&&(!Number.isFinite(value)||value<0))return new Response(JSON.stringify({ok:false,error:"Invalid deal value"}),{status:400,headers:h});update.deal_value=value}
   if(body.deal_currency!==undefined)update.deal_currency=clean(body.deal_currency,8).toUpperCase()||"USD";
   if(body.lost_reason!==undefined)update.lost_reason=clean(body.lost_reason);
   if(!Object.keys(update).length)return new Response(JSON.stringify({ok:false,error:"Nothing to update"}),{status:400,headers:h});
   const {data,error}=await db.from("b2b_discovery_calls").update(update).eq("id",id).select().single();
   if(error)return new Response(JSON.stringify({ok:false,error:error.message}),{status:500,headers:h});
   await db.from("admin_activity_log").insert({entity_type:"b2b_discovery_call",entity_id:id,action:"pipeline_updated",details:{fields:Object.keys(update)}});
   return new Response(JSON.stringify({ok:true,call:data}),{headers:h});
 }
 return new Response(JSON.stringify({ok:false,error:"Unknown action"}),{status:400,headers:h});
});
