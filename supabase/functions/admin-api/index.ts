import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")||"";
const EMAIL_FROM=Deno.env.get("EMAIL_FROM")||"Assistara <forms@getassistara.com>";
const SITE_URL="https://www.getassistara.com";
const USERNAME="admin";
const PASSWORD_SALT="97bfe0c623966592a8bc9d515275b3a6";
const PASSWORD_HASH="8df14096b4786eef7bc979b3f578966393d276194b4e009b2b6a83bdf1297e27";
const allowed=new Set(["https://getassistara.com","https://www.getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);
const good=(o:string|null)=>!!o&&(allowed.has(o)||o.endsWith(".vercel.app"));
const cors=(o:string|null)=>({"Content-Type":"application/json","Access-Control-Allow-Origin":good(o)?o!:SITE_URL,"Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const enc=new TextEncoder();
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const fromB64url=(s:string)=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function sha256Hex(s:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s)));return [...d].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sign(payload:string){const key=await crypto.subtle.importKey("raw",enc.encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))))}
async function issueToken(){const payload=b64url(enc.encode(JSON.stringify({u:USERNAME,exp:Date.now()+12*60*60*1000})));return `${payload}.${await sign(payload)}`}
async function verifyToken(token:string){try{const [p,s]=token.split(".");if(!p||!s||await sign(p)!==s)return false;const data=JSON.parse(new TextDecoder().decode(fromB64url(p)));return data.u===USERNAME&&Date.now()<data.exp}catch{return false}}
function esc(s:string){return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
async function send(to:string,subject:string,html:string){if(!RESEND_API_KEY) return false;const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${RESEND_API_KEY}`},body:JSON.stringify({from:EMAIL_FROM,to:[to],reply_to:"academy@getassistara.com",subject,html})});return r.ok}
function emailShell(title:string,body:string,cta?:{label:string,href:string}){return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;color:#fff;padding:22px 30px;font-size:22px;font-weight:700">Assistara Academy</td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px">${esc(title)}</h1></td></tr><tr><td style="padding:12px 30px 26px;font-size:16px;line-height:1.6;color:#4f4b45">${body}</td></tr>${cta?`<tr><td style="padding:0 30px 34px"><a href="${cta.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${cta.label}</a></td></tr>`:""}</table></td></tr></table></body></html>`}

const ANSWER_FIELDS=["current_situation","why_remote_work","what_tried","biggest_obstacle","remote_work_interest","weekly_commitment","payment_readiness"];
const ANSWER_FIELD_SCHEMA=[
  {field:"current_situation",label:"What best describes your current situation?"},
  {field:"why_remote_work",label:"Why do you want to start working remotely?",long:true},
  {field:"what_tried",label:"What have you already tried to get a remote job or client?",long:true},
  {field:"biggest_obstacle",label:"What is your biggest obstacle right now?",long:true},
  {field:"remote_work_interest",label:"What type of remote work interests you most?"},
  {field:"weekly_commitment",label:"Can you commit consistent time every week to complete the Academy and take action?"},
  {field:"payment_readiness",label:"If selected, would you be ready to join at ₱6,900?",options:{"Willing to invest in myself":"Yes, I'm willing to invest in myself.","Need payment plan":"I'm ready to join, but I would need a payment plan."}}
];
const MAX_NOTE_LENGTH=5000;
const SAFE_ID=/^[A-Za-z0-9_-]{1,64}$/;

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin"),h=cors(origin);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:h});
  if(req.method!=="POST"||(origin&&!good(origin))) return new Response(JSON.stringify({ok:false,error:"Forbidden"}),{status:403,headers:h});
  let body:any={};try{body=await req.json()}catch{}
  const action=String(body.action||"");
  if(action==="login"){
    const u=String(body.username||"").trim();const p=String(body.password||"");
    const hash=await sha256Hex(PASSWORD_SALT+p);
    if(u!==USERNAME||hash!==PASSWORD_HASH) return new Response(JSON.stringify({ok:false,error:"Invalid username or password"}),{status:401,headers:h});
    return new Response(JSON.stringify({ok:true,token:await issueToken()}),{status:200,headers:h});
  }
  const auth=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!await verifyToken(auth)) return new Response(JSON.stringify({ok:false,error:"Session expired"}),{status:401,headers:h});
  const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
  if(action==="list"){
    const {data,error}=await db.from("academy_applications").select("id,created_at,name,email,current_situation,why_remote_work,what_tried,biggest_obstacle,remote_work_interest,weekly_commitment,payment_readiness,status,decision,payment_status,accepted_at,paid_at,enrollment_token,onboarding_completed_at").order("created_at",{ascending:false}).limit(100);
    if(error) return new Response(JSON.stringify({ok:false,error:"Could not load applications"}),{status:500,headers:h});
    return new Response(JSON.stringify({ok:true,applications:data}),{status:200,headers:h});
  }
  if(action==="answers"){
    const ids=Array.isArray(body.ids)?body.ids:[];
    const safeIds=ids.filter((id:string)=>SAFE_ID.test(String(id||"").trim())).map((id:string)=>String(id).trim()).slice(0,50);
    if(!safeIds.length) return new Response(JSON.stringify({ok:false,error:"A valid application id is required"}),{status:400,headers:h});
    const filter=safeIds.map(id=>`"${id}"`).join(",");
    const {data,error}=await db.from("academy_applications").select("id,"+ANSWER_FIELDS.join(",")).in("id",safeIds);
    if(error) return new Response(JSON.stringify({ok:false,error:"Could not load answers"}),{status:500,headers:h});
    const byId=new Map();
    for(const row of data||[]){
      if(!row||row.id===undefined||row.id===null) continue;
      const answers:any={};
      for(const field of ANSWER_FIELDS) answers[field]=row[field]??null;
      byId.set(String(row.id),{id:String(row.id),answers});
    }
    const applications=safeIds.map(id=>{const record=byId.get(id);return record?{...record,found:true}:{id,answers:{},found:false};});
    return new Response(JSON.stringify({ok:true,fields:ANSWER_FIELD_SCHEMA,applications}),{status:200,headers:h});
  }
  if(action==="notes"){
    const sub=String(body.subaction||"read");
    if(sub!=="read"&&sub!=="write") return new Response(JSON.stringify({ok:false,error:"Unknown notes action"}),{status:400,headers:h});
    if(sub==="write"){
      const id=String(body.id||"").trim();
      if(!SAFE_ID.test(id)) return new Response(JSON.stringify({ok:false,error:"A valid application id is required"}),{status:400,headers:h});
      if(typeof body.note!=="string") return new Response(JSON.stringify({ok:false,error:"A note is required"}),{status:400,headers:h});
      const note=body.note.trim();
      if(note.length>MAX_NOTE_LENGTH) return new Response(JSON.stringify({ok:false,error:"That note is too long"}),{status:400,headers:h});
      const {data,error}=await db.from("academy_applications").update({admin_notes:note||null}).eq("id",id).select("admin_notes");
      if(error) return new Response(JSON.stringify({ok:false,error:"Could not save note"}),{status:500,headers:h});
      if(!data||!data[0]) return new Response(JSON.stringify({ok:false,error:"Application not found"}),{status:404,headers:h});
      return new Response(JSON.stringify({ok:true,note:typeof data[0].admin_notes==="string"?data[0].admin_notes:note}),{status:200,headers:h});
    }
    const ids=Array.isArray(body.ids)?body.ids:[];
    const safeIds=ids.filter((id:string)=>SAFE_ID.test(String(id||"").trim())).map((id:string)=>String(id).trim()).slice(0,50);
    if(!safeIds.length) return new Response(JSON.stringify({ok:false,error:"A valid application id is required"}),{status:400,headers:h});
    const {data,error}=await db.from("academy_applications").select("id,admin_notes").in("id",safeIds);
    if(error) return new Response(JSON.stringify({ok:false,error:"Could not load notes"}),{status:500,headers:h});
    const byId=new Map();
    for(const row of data||[]){
      if(!row||row.id===undefined||row.id===null) continue;
      byId.set(String(row.id),typeof row.admin_notes==="string"?row.admin_notes:"");
    }
    return new Response(JSON.stringify({ok:true,notes:safeIds.map(id=>({id,note:byId.get(id)||""}))}),{status:200,headers:h});
  }
  if(action==="decision"){
    const id=String(body.id||"");const decision=String(body.decision||"");
    if(!id||!["accepted","declined"].includes(decision)) return new Response(JSON.stringify({ok:false,error:"Invalid decision"}),{status:400,headers:h});
    const {data:app}=await db.from("academy_applications").select("id,name,email,enrollment_token").eq("id",id).maybeSingle();
    if(!app) return new Response(JSON.stringify({ok:false,error:"Application not found"}),{status:404,headers:h});
    const now=new Date().toISOString();
    const update=decision==="accepted"?{decision:"accepted",status:"accepted",accepted_at:now,declined_at:null}:{decision:"declined",status:"declined",declined_at:now,accepted_at:null};
    const {error}=await db.from("academy_applications").update(update).eq("id",id);
    if(error) return new Response(JSON.stringify({ok:false,error:"Could not update application"}),{status:500,headers:h});
    let enrollmentUrl="";
    if(decision==="accepted"){
      enrollmentUrl=`${SITE_URL}/academy/checkout?token=${encodeURIComponent(app.enrollment_token)}`;
      await send(app.email,"You've been accepted | Assistara Academy",emailShell("You've been accepted.",`<p>Hi ${esc((app.name||"there").split(/\s+/)[0])},</p><p>Your application to Assistara Academy has been accepted.</p><p>Your next step is to secure your place in the founding cohort. Use your private enrollment link below to review your place and complete payment.</p>`,{label:"Complete my enrollment",href:enrollmentUrl}));
    } else {
      await send(app.email,"Update on your Assistara Academy application",emailShell("Thank you for applying.",`<p>Hi ${esc((app.name||"there").split(/\s+/)[0])},</p><p>Thank you for taking the time to apply to Assistara Academy. We are not able to offer you a place in this cohort.</p><p>We appreciate your interest and wish you the best with your remote-work journey.</p>`));
    }
    return new Response(JSON.stringify({ok:true,enrollment_url:enrollmentUrl}),{status:200,headers:h});
  }
  return new Response(JSON.stringify({ok:false,error:"Unknown action"}),{status:400,headers:h});
});
