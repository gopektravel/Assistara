import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
declare const EdgeRuntime:{waitUntil:(p:Promise<any>)=>void};

const SECRET=Deno.env.get("PAYMONGO_SECRET_KEY")||"";
const WEBHOOK_SECRET=Deno.env.get("PAYMONGO_WEBHOOK_SECRET")||"";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND=Deno.env.get("RESEND_API_KEY")||"",FROM=Deno.env.get("EMAIL_FROM")||"Assistara <forms@getassistara.com>";
const SITE="https://www.getassistara.com",SELF_URL="https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/paymongo-webhook",enc=new TextEncoder();

const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
const safeEqual=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const esc=(s:any)=>String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const money=(n:any)=>"PHP "+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const paymongo=async(path:string)=>{const r=await fetch("https://api.paymongo.com/v1/"+path,{headers:{Authorization:"Basic "+btoa(SECRET+":")}});return {ok:r.ok,data:await r.json().catch(()=>({}))}};

async function verify(raw:string,header:string){
  const parts=Object.fromEntries(header.split(",").map(x=>x.trim().split("=",2)));
  const t=parts.t||"",sig=SECRET.includes("_live_")?parts.li:parts.te;
  if(!/^\d+$/.test(t)||!sig)return false;
  if(Math.abs(Date.now()/1000-Number(t))>300)return false;
  let secret=WEBHOOK_SECRET;
  if(SECRET.includes("_test_")){
    try{
      const hooks=await paymongo("webhooks");
      const list=Array.isArray(hooks.data?.data)?hooks.data.data:[];
      const hook=list.find((x:any)=>x?.attributes?.url===SELF_URL&&x?.attributes?.livemode===false&&x?.attributes?.status==="enabled");
      if(typeof hook?.attributes?.secret_key==="string")secret=hook.attributes.secret_key;
    }catch{}
  }
  if(!secret)return false;
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected=hex(await crypto.subtle.sign("HMAC",key,enc.encode(t+"."+raw)));
  return safeEqual(expected,sig);
}
const logo=`<table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#ffd51f;border-radius:12px;color:#151515;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700">Assistara Academy</td></tr></table>`;
function shell(title:string,body:string,cta:{label:string,href:string}){return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 30px">${logo}</td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px;line-height:1.15">${title}</h1></td></tr><tr><td style="padding:12px 30px 24px;font-size:16px;line-height:1.6;color:#4f4b45">${body}</td></tr><tr><td style="padding:0 30px 18px"><a href="${cta.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${cta.label}</a></td></tr><tr><td style="padding:0 30px 34px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="${cta.href}" style="color:#4f4b45;word-break:break-all">${cta.href}</a></td></tr></table></td></tr></table></body></html>`}
function b64(bytes:Uint8Array){let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)}
async function receiptPdf(d:any){const pdf=await PDFDocument.create(),p=pdf.addPage([595,842]),f=await pdf.embedFont(StandardFonts.Helvetica),b=await pdf.embedFont(StandardFonts.HelveticaBold),dark=rgb(.09,.09,.09),muted=rgb(.42,.42,.42),yellow=rgb(1,.835,.12);p.drawRectangle({x:0,y:758,width:595,height:84,color:dark});p.drawText("ASSISTARA",{x:42,y:790,size:20,font:b,color:rgb(1,1,1)});p.drawText("PAYMENT RECEIPT",{x:42,y:716,size:28,font:b,color:dark});const row=(l:string,v:string,y:number)=>{p.drawText(l.toUpperCase(),{x:42,y,size:9,font:b,color:muted});p.drawText(String(v||"-").replace(/[^\x20-\x7E]/g,""),{x:190,y,size:11,font:f,color:dark})};let y=660;row("Receipt number",d.receipt,y);y-=27;row("Customer",d.name,y);y-=27;row("Email",d.email,y);y-=27;row("Payment date",d.date,y);y-=27;row("Status","PAID",y);y-=55;p.drawText("Assistara Academy - Founding Cohort",{x:42,y,size:14,font:b,color:dark});p.drawText(money(d.amount),{x:390,y,size:14,font:b,color:dark});y-=70;row("Payment method","QR Ph via PayMongo",y);y-=27;row("PayMongo reference",d.paymentId,y);y-=55;p.drawRectangle({x:42,y:y-14,width:511,height:54,color:yellow});p.drawText("TOTAL PAID",{x:58,y:y+4,size:12,font:b,color:dark});p.drawText(money(d.amount),{x:360,y:y+2,size:18,font:b,color:dark});p.drawText("Questions? academy@getassistara.com",{x:42,y:72,size:9,font:f,color:muted});return new Uint8Array(await pdf.save())}
async function sendConfirmation(app:any,receipt:string,amount:number,paymentId:string,paidAt:string){
  if(!RESEND)return false;
  const url=`${SITE}/academy/onboarding?token=${encodeURIComponent(app.enrollment_token||"")}`,first=esc((app.name||"there").split(/\s+/)[0]);
  const date=new Date(paidAt).toLocaleString("en-PH",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Manila"});
  let pdf:Uint8Array|undefined;try{pdf=await receiptPdf({receipt,name:app.name,email:app.email,date,amount,paymentId})}catch(e){console.error("paymongo_receipt_pdf_failed",e)}
  const body=`<p>Hi ${first},</p><p>We received your payment and your place in Assistara Academy is secured. 🎉</p><table width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#faf9f5;border-radius:14px"><tr><td style="padding:16px 18px"><strong>Purchase</strong><br>Assistara Academy - Founding Cohort</td><td align="right" style="padding:16px 18px"><strong>${esc(money(amount))}</strong></td></tr><tr><td style="padding:0 18px 12px;color:#777">Receipt</td><td align="right" style="padding:0 18px 12px">${esc(receipt)}</td></tr><tr><td style="padding:0 18px 12px;color:#777">Payment method</td><td align="right" style="padding:0 18px 12px">QR Ph via PayMongo</td></tr><tr><td style="padding:0 18px 16px;color:#777">Status</td><td align="right" style="padding:0 18px 16px"><strong>PAID</strong></td></tr></table><p>${pdf?"Your branded payment receipt is attached as a PDF for your records.":""}</p><p>Your next step is to set up your Academy account.</p>`;
  const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:`Payment received 🎉 ${receipt} | Assistara Academy`,html:shell("Payment received 🎉",body,{label:"Set up my Academy account",href:url})};
  if(pdf)payload.attachments=[{filename:`Assistara-Payment-Receipt-${receipt}.pdf`,content:b64(pdf)}];
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${RESEND}`,"Idempotency-Key":`academy-paymongo-${app.id}-v1`},body:JSON.stringify(payload)});
  if(r.ok){const db=createClient(U,K,{auth:{persistSession:false}});await db.from("academy_applications").update({payment_confirmation_sent_at:new Date().toISOString()}).eq("id",app.id)}
  return r.ok;
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({ok:false},405);
  if(!SECRET||!WEBHOOK_SECRET)return json({ok:false,error:"Webhook not configured"},503);
  const raw=await req.text(),signature=req.headers.get("paymongo-signature")||"";
  if(!await verify(raw,signature))return json({ok:false,error:"Invalid signature"},401);

  let evt:any;try{evt=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON"},400)}
  const eventId=String(evt?.data?.id||""),a=evt?.data?.attributes||{},type=String(a.type||""),live=!!a.livemode,payment=a.data||{},paymentId=String(payment.id||""),pa=payment.attributes||{},piId=String(pa.payment_intent_id||"");
  const expectedLive=SECRET.includes("_live_");
  if(!eventId||live!==expectedLive)return json({ok:false,error:"Mode mismatch"},400);
  if(!["payment.paid","payment.failed"].includes(type))return json({ok:true,ignored:true});

  const db=createClient(U,K,{auth:{persistSession:false}});
  const inserted=await db.from("paymongo_webhook_events").insert({event_id:eventId,event_type:type,payment_id:paymentId||null,payment_intent_id:piId||null,livemode:live}).select("event_id");
  if(inserted.error){
    if(String(inserted.error.code)==="23505"){
      const {data:prior}=await db.from("paymongo_webhook_events").select("processed_at").eq("event_id",eventId).maybeSingle();
      if(prior?.processed_at)return json({ok:true,duplicate:true});
      await db.from("paymongo_webhook_events").update({processing_error:null}).eq("event_id",eventId);
    }else{console.error("paymongo_event_insert_failed",inserted.error.code);return json({ok:false},500)}
  }

  try{
    if(!piId)throw new Error("missing_payment_intent");
    const {data:app}=await db.from("academy_applications").select("id,name,email,enrollment_token,payment_status,checkout_amount_php,receipt_number,paid_at,payment_confirmation_sent_at,paymongo_payment_intent_id").eq("paymongo_payment_intent_id",piId).maybeSingle();
    if(!app)throw new Error("application_not_found");

    if(type==="payment.failed"){
      if(app.payment_status!=="paid")await db.from("academy_applications").update({payment_status:"failed",paymongo_payment_id:paymentId||null}).eq("id",app.id).eq("paymongo_payment_intent_id",piId).neq("payment_status","paid");
      await db.from("paymongo_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",eventId);
      return json({ok:true});
    }

    // Never fulfill from webhook payload alone: retrieve the Payment Intent from PayMongo.
    const verified=await paymongo("payment_intents/"+encodeURIComponent(piId));
    const va=verified.data?.data?.attributes,expectedAmount=Math.round((Number(app.checkout_amount_php)>0?Number(app.checkout_amount_php):6900)*100);
    if(!verified.ok||va?.status!=="succeeded"||!!va?.livemode!==expectedLive||Number(va?.amount)!==expectedAmount||String(va?.currency||"").toUpperCase()!=="PHP")throw new Error("authoritative_payment_verification_failed");
    if(String(pa.status||"")!=="paid"||Number(pa.amount)!==expectedAmount||String(pa.currency||"").toUpperCase()!=="PHP")throw new Error("webhook_payment_details_mismatch");

    let receipt=app.receipt_number||"";
    if(!receipt){const rr=await db.rpc("next_assistara_receipt_number");receipt=String(rr.data||"");if(!receipt)throw new Error("receipt_generation_failed")}
    const paidAt=app.paid_at||new Date().toISOString(),amount=expectedAmount/100;
    const update=await db.from("academy_applications").update({payment_status:"paid",paid_at:paidAt,purchase_amount:amount,purchase_currency:"PHP",payment_method:"paymongo_qrph",paymongo_payment_id:paymentId,receipt_number:receipt,receipt_generated_at:new Date().toISOString(),payment_method_brand:"QR Ph"}).eq("id",app.id).eq("paymongo_payment_intent_id",piId).neq("payment_status","paid").select("id");
    if(update.error)throw new Error("application_update_failed");
    await db.from("masterclass_signups").update({purchased:true,purchased_at:paidAt,purchase_amount:amount,purchase_currency:"PHP",status:"purchased"}).eq("application_id",app.id);
    await db.from("admin_activity_log").insert({entity_type:"application",entity_id:app.id,action:"paymongo_payment_paid",details:{event_id:eventId,payment_id:paymentId,payment_intent_id:piId,amount_php:amount}});
    await db.from("paymongo_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",eventId);
    if(!app.payment_confirmation_sent_at)EdgeRuntime.waitUntil(sendConfirmation(app,receipt,amount,paymentId,paidAt));
    console.log("paymongo-payment-fulfilled",JSON.stringify({event_id:eventId,application_id:app.id,payment_intent_id:piId,payment_id:paymentId}));
    return json({ok:true});
  }catch(e){
    const msg=e instanceof Error?e.message:"processing_failed";
    console.error("paymongo_webhook_processing_failed",eventId,msg);
    await db.from("paymongo_webhook_events").update({processing_error:msg}).eq("event_id",eventId);
    return json({ok:false,error:"Processing failed"},500);
  }
});