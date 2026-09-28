import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET=Deno.env.get("PAYMONGO_SECRET_KEY")||"";
const PUBLIC=Deno.env.get("PAYMONGO_PUBLIC_KEY")||"";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE="https://www.getassistara.com",LIMIT=15;
const allowed=new Set([SITE,"https://getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);
const good=(o:string|null)=>!!o&&(allowed.has(o)||o.endsWith(".vercel.app"));
const auth=(key:string)=>"Basic "+btoa(key+":");
const paymongo=async(path:string,key:string,init:RequestInit={})=>{
  const r=await fetch("https://api.paymongo.com/v1/"+path,{...init,headers:{"Content-Type":"application/json","Authorization":auth(key),...(init.headers||{})}});
  const data=await r.json().catch(()=>({}));
  return {ok:r.ok,status:r.status,data};
};
const reply=(body:any,status:number,origin:string|null)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":good(origin)?origin!:SITE,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}});

Deno.serve(async req=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":good(origin)?origin!:SITE,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}});
  if(req.method!=="POST"||(origin&&!good(origin)))return reply({ok:false,error:"Forbidden"},403,origin);
  if(!SECRET||!PUBLIC||!/^sk_(test|live)_/.test(SECRET)||!/^pk_(test|live)_/.test(PUBLIC))return reply({ok:false,error:"QR payment service is not configured."},500,origin);
  if(SECRET.includes("_test_")!==PUBLIC.includes("_test_"))return reply({ok:false,error:"QR payment configuration mismatch."},500,origin);

  let body:any={};try{body=await req.json()}catch{}
  const token=String(body.token||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(token))return reply({ok:false,error:"This enrollment link is invalid."},400,origin);

  const db=createClient(U,K,{auth:{persistSession:false}});
  const {data:app,error:lookupError}=await db.from("academy_applications")
    .select("id,name,email,decision,status,payment_status,enrollment_token,promo_code,checkout_amount_php,paymongo_payment_intent_id,paymongo_qr_expires_at")
    .eq("enrollment_token",token).maybeSingle();
  if(lookupError||!app)return reply({ok:false,error:"We could not find this enrollment invitation."},404,origin);
  if(app.decision!=="accepted"&&app.status!=="accepted"&&app.status!=="waitlisted")return reply({ok:false,error:"This enrollment invitation is not active yet."},403,origin);
  if(app.payment_status==="paid")return reply({ok:false,error:"This enrollment has already been paid."},409,origin);

  const cutoff=new Date(Date.now()-31*60*1000).toISOString();
  const [{count:paid},{count:reserved}]=await Promise.all([
    db.from("academy_applications").select("id",{count:"exact",head:true}).eq("payment_status","paid"),
    db.from("academy_applications").select("id",{count:"exact",head:true}).eq("payment_status","pending").gte("payment_requested_at",cutoff).neq("id",app.id)
  ]);
  if((paid||0)+(reserved||0)>=LIMIT){
    await db.from("academy_applications").update({status:"waitlisted",waitlisted_at:new Date().toISOString()}).eq("id",app.id);
    return reply({ok:false,full:true,error:"The Founding Cohort is currently full. You have been moved to the waitlist and we will contact you if a place opens."},409,origin);
  }

  const amountPhp=(Number(app.checkout_amount_php)>0?Number(app.checkout_amount_php):6900);
  const amount=Math.round(amountPhp*100);
  const now=Date.now();

  // Reuse an unexpired QR for this application instead of creating duplicate payment intents.
  if(app.paymongo_payment_intent_id&&app.paymongo_qr_expires_at&&new Date(app.paymongo_qr_expires_at).getTime()>now+15000){
    const existing=await paymongo("payment_intents/"+encodeURIComponent(app.paymongo_payment_intent_id),SECRET);
    const a=existing.data?.data?.attributes;
    if(existing.ok&&a?.status==="succeeded")return reply({ok:false,paid:true,error:"This payment has already completed. Please refresh your enrollment page."},409,origin);
    const image=a?.next_action?.code?.image_url,testUrl=a?.next_action?.code?.test_url||null;
    if(existing.ok&&image&&a?.status==="awaiting_next_action")return reply({ok:true,payment_intent_id:app.paymongo_payment_intent_id,image_url:image,test_url:SECRET.includes("_test_")?testUrl:null,amount_php:amountPhp,currency:"PHP",expires_at:app.paymongo_qr_expires_at,test_mode:SECRET.includes("_test_")},200,origin);
  }

  const intent=await paymongo("payment_intents",SECRET,{method:"POST",body:JSON.stringify({data:{attributes:{amount,currency:"PHP",payment_method_allowed:["qrph"],description:"Assistara Academy Founding Cohort",metadata:{source:"assistara_academy",application_id:app.id,enrollment_token:token}}}})});
  if(!intent.ok||!intent.data?.data?.id){console.error("paymongo_intent_create_failed",intent.status);return reply({ok:false,error:"Could not start QR payment. Please try again."},502,origin)}
  const pi=intent.data.data,clientKey=pi.attributes?.client_key;
  const pm=await paymongo("payment_methods",PUBLIC,{method:"POST",body:JSON.stringify({data:{attributes:{type:"qrph",billing:{name:app.name,email:app.email}}}})});
  if(!pm.ok||!pm.data?.data?.id){console.error("paymongo_method_create_failed",pm.status);return reply({ok:false,error:"Could not generate QR payment. Please try again."},502,origin)}
  const attached=await paymongo("payment_intents/"+encodeURIComponent(pi.id)+"/attach",PUBLIC,{method:"POST",body:JSON.stringify({data:{attributes:{payment_method:pm.data.data.id,client_key:clientKey,return_url:SITE+"/academy/checkout?token="+encodeURIComponent(token)}}})});
  const attrs=attached.data?.data?.attributes,image=attrs?.next_action?.code?.image_url,testUrl=attrs?.next_action?.code?.test_url||null;
  if(!attached.ok||!image){console.error("paymongo_attach_failed",attached.status,attrs?.status);return reply({ok:false,error:"Could not generate QR payment. Please try again."},502,origin)}

  const expiresAt=new Date(now+30*60*1000).toISOString();
  const saved=await db.from("academy_applications").update({
    payment_status:"pending",payment_method:"paymongo_qrph",payment_requested_at:new Date(now).toISOString(),
    paymongo_payment_intent_id:pi.id,paymongo_payment_id:null,paymongo_qr_created_at:new Date(now).toISOString(),paymongo_qr_expires_at:expiresAt
  }).eq("id",app.id).neq("payment_status","paid").select("id");
  if(saved.error||!saved.data?.length)return reply({ok:false,error:"QR was created, but enrollment could not be reserved. Please refresh before paying."},409,origin);

  await db.from("admin_activity_log").insert({entity_type:"application",entity_id:app.id,action:"paymongo_qr_created",details:{payment_intent_id:pi.id,amount_php:amountPhp,test_mode:SECRET.includes("_test_")}});
  return reply({ok:true,payment_intent_id:pi.id,image_url:image,test_url:SECRET.includes("_test_")?testUrl:null,amount_php:amountPhp,currency:"PHP",expires_at:expiresAt,test_mode:SECRET.includes("_test_")},200,origin);
});