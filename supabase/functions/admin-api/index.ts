import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL="https://www.getassistara.com";
const USERNAME=Deno.env.get("ADMIN_USERNAME")||"admin";
const PASSWORD_SALT=Deno.env.get("ADMIN_PASSWORD_SALT")||"";
const PASSWORD_HASH=Deno.env.get("ADMIN_PASSWORD_HASH")||"";
const PASSWORD_SCHEME=Deno.env.get("ADMIN_PASSWORD_SCHEME")||"pbkdf2-sha256";
const TOKEN_VERSION=Deno.env.get("ADMIN_TOKEN_VERSION")||"";
const PASSWORD_ITERATIONS=310_000;
const allowed=new Set(["https://getassistara.com","https://www.getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);
const good=(o:string|null)=>!!o&&(allowed.has(o)||o.endsWith(".vercel.app"));
const cors=(o:string|null)=>({"Content-Type":"application/json","Access-Control-Allow-Origin":good(o)?o!:SITE_URL,"Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const enc=new TextEncoder();
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const fromB64url=(s:string)=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function passwordHash(password:string){const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(PASSWORD_SALT),iterations:PASSWORD_ITERATIONS},material,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function legacyPasswordHash(password:string){const bits=await crypto.subtle.digest("SHA-256",enc.encode(PASSWORD_SALT+password));return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function sign(payload:string){const key=await crypto.subtle.importKey("raw",enc.encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))))}
async function issueToken(){const now=Date.now();const payload=b64url(enc.encode(JSON.stringify({u:USERNAME,v:TOKEN_VERSION,iat:now,exp:now+2*60*60*1000})));return `${payload}.${await sign(payload)}`}
async function verifyToken(token:string){try{if(!TOKEN_VERSION)return false;const [p,s]=token.split(".");if(!p||!s||!safeEqual(await sign(p),s))return false;const data=JSON.parse(new TextDecoder().decode(fromB64url(p)));return data.u===USERNAME&&data.v===TOKEN_VERSION&&Date.now()<data.exp}catch{return false}}
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
    if(!PASSWORD_SALT||!PASSWORD_HASH||!TOKEN_VERSION) return new Response(JSON.stringify({ok:false,error:"Admin login is temporarily unavailable"}),{status:503,headers:h});
    const hash=PASSWORD_SCHEME==="legacy-sha256"?await legacyPasswordHash(p):await passwordHash(p);
    if(u!==USERNAME||!safeEqual(hash,PASSWORD_HASH)) return new Response(JSON.stringify({ok:false,error:"Invalid username or password"}),{status:401,headers:h});
    return new Response(JSON.stringify({ok:true,token:await issueToken()}),{status:200,headers:h});
  }
  const auth=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!await verifyToken(auth)) return new Response(JSON.stringify({ok:false,error:"Session expired"}),{status:401,headers:h});
  // Lets the Vercel Test Portal gate confirm an Admin token with the one
  // service that holds the signing key, instead of needing a second copy of
  // that key configured here. It sits directly behind verifyToken() and
  // returns nothing: no table, no column, no application data.
  if(action==="session-check")return new Response(JSON.stringify({ok:true}),{status:200,headers:h});
  const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
  if(action==="list"){
    const {data,error}=await db.from("academy_applications").select("id,created_at,name,email,current_situation,why_remote_work,what_tried,biggest_obstacle,remote_work_interest,weekly_commitment,payment_readiness,status,decision,payment_status,accepted_at,paid_at,enrollment_token,onboarding_completed_at").order("created_at",{ascending:false}).limit(100);
    if(error) return new Response(JSON.stringify({ok:false,error:"Could not load applications"}),{status:500,headers:h});
    return new Response(JSON.stringify({ok:true,applications:data}),{status:200,headers:h});
  }
  // ------------------------------------------------------------------------
  // Unified prospective-student view (quiz + application + payment).
  //
  // One record per person, merged on the lowercased email, which is the only
  // identity both flows share. An applicant is never duplicated just because
  // they later took the quiz: the application row stays the single source of
  // truth for status, and the quiz row only enriches it. Nothing here writes.
  // ------------------------------------------------------------------------
  if(action==="quiz-leads"){
    const limit=Math.min(500,Math.max(1,Number(body.limit)||200));
    // The quiz tables are added by a later migration. Until it is applied this
    // must still serve the applicant half of the picture rather than erroring.
    const {data:results,error:quizError}=await db.from("quiz_results")
      .select("id,created_at,first_name,email,marketing_consent,marketing_consent_at,consent_source,primary_career,secondary_career,readiness_stage,readiness_key,income_goal_php,weekly_hours,obstacle,start_timeline,lead_priority,lead_priority_band,lead_priority_reasons,answers,email_state,email_sent_at,acquisition_visit_id,acquisition_visitor_id,tracking_token,application_id,report")
      .order("created_at",{ascending:false}).limit(limit);
    const quizAvailable=!quizError;
    const rows=quizAvailable?(results||[]):[];

    const {data:apps,error:appError}=await db.from("academy_applications")
      .select("id,created_at,name,email,status,decision,payment_status,accepted_at,paid_at,onboarding_completed_at,source")
      .order("created_at",{ascending:false}).limit(500);
    if(appError) return new Response(JSON.stringify({ok:false,error:"Could not load applications"}),{status:500,headers:h});

    const key=(e:unknown)=>String(e||"").trim().toLowerCase();
    const leads=new Map();
    // Applications first, so an existing applicant is never replaced by a quiz
    // row that happens to share their address.
    for(const a of apps||[]){
      const k=key(a.email); if(!k) continue;
      leads.set(k,{email:a.email,application:a,quiz:null});
    }
    for(const r of rows){
      const k=key(r.email);
      if(!k) continue;
      const existing=leads.get(k);
      if(existing){ if(!existing.quiz) existing.quiz=r; }
      else leads.set(k,{email:r.email,application:null,quiz:r});
    }

    // Lead priority is stored once at quiz-submit time from what the person
    // actually said. Where we already know they applied, the documented
    // application bonus is added so the two surfaces agree; the breakdown is
    // extended with that same line so the number stays explainable.
    const APPLICATION_BONUS=30;
    const priorityOf=(r:any,applied:boolean)=>{
      if(!r) return null;
      const base=Number(r.lead_priority)||0;
      const band=String(r.lead_priority_band||"cool");
      const reasons=Array.isArray(r.lead_priority_reasons)?r.lead_priority_reasons:[];
      if(!applied) return {score:base,band,reasons};
      return {score:Math.min(100,base+APPLICATION_BONUS),band,reasons:[...reasons,{label:"Has already submitted an Academy application",points:APPLICATION_BONUS}]};
    };
    const seg=(r:any)=>{
      if(!r) return {readiness:null,experience:null,career:null,obstacle:null};
      // q10 start timeline drives readiness-to-buy; q7 stage drives experience.
      const stage=Number(r.readiness_stage)||1;
      return {
        readiness:String(r.start_timeline||"exploring"),
        experience:["beginner","self_taught","trained_certified","portfolio_ready","experienced"][stage-1]||"beginner",
        career:String(r.primary_career||""),
        obstacle:String(r.obstacle||""),
      };
    };

    const out=[];
    for(const [k,v] of leads){
      const a=v.application,r=v.quiz,s=seg(r);
      out.push({
        email:v.email||k,
        first_name:(r&&r.first_name)||(a&&String(a.name||"").trim().split(/\s+/)[0])||"",
        first_seen:(a&&a.created_at)||(r&&r.created_at)||null,
        last_seen:(r&&r.created_at)||(a&&a.created_at)||null,
        quiz:r?{completed_at:r.created_at,primary:r.primary_career,secondary:r.secondary_career,readiness_stage:r.readiness_stage,readiness_key:r.readiness_key,goal:r.income_goal_php,weekly_hours:r.weekly_hours,obstacle:r.obstacle,timeline:r.start_timeline,priority:priorityOf(r,!!a),answers:r.answers||{},report:r.report||null,email_state:r.email_state,email_sent_at:r.email_sent_at,consent:r.marketing_consent===true,consent_at:r.marketing_consent_at,consent_source:r.consent_source||null}:null,
        application:a?{id:a.id,created_at:a.created_at,status:a.status,decision:a.decision,payment_status:a.payment_status,accepted_at:a.accepted_at,paid_at:a.paid_at,onboarding_completed_at:a.onboarding_completed_at,source:a.source}:null,
        attribution:r?{visit:r.acquisition_visit_id,visitor:r.acquisition_visitor_id,token:r.tracking_token}:null,
        segments:s,
      });
    }
    out.sort((x,y)=>String(y.last_seen||"").localeCompare(String(x.last_seen||"")));

    // Funnel counts are read from the rows already in hand, so the numbers on
    // screen always agree with the list underneath them.
    const consented=rows.filter(r=>r.marketing_consent===true).length;
    const priorityCounts:Record<string,number>=rows.reduce((acc:any,r:any)=>{
      const b=String(r.lead_priority_band||"cool");acc[b]=(acc[b]||0)+1;return acc;
    },{} as Record<string,number>);
    const funnel={
      quiz_completions:rows.length,
      captured_leads:rows.filter(r=>key(r.email)).length,
      consented_leads:consented,
      applications:(apps||[]).length,
      accepted:(apps||[]).filter(a=>a.decision==="accepted"||a.status==="accepted").length,
      paid:(apps||[]).filter(a=>a.payment_status==="paid"||!!a.paid_at).length,
      // Declared here rather than bolted on afterwards, so the shape the
      // response carries is the shape TypeScript actually knows about.
      quiz_to_paid:0,
      // Priority distribution, using the same stored bands the Acquisition
      // Tool reports, so the two never disagree about how the pipeline looks.
      by_priority:priorityCounts,
    };
    funnel.quiz_to_paid=funnel.captured_leads?Math.round(funnel.paid/funnel.captured_leads*1000)/10:0;

    return new Response(JSON.stringify({ok:true,leads:out,funnel,quizAvailable,definitions:{
      captured_leads:"Quiz completions that left an email address.",
      accepted:"Applications with an accepted decision, read live from academy_applications.",
      paid:"Applications with a paid payment status or a paid_at timestamp.",
      quiz_to_paid:"Paid enrolments divided by captured quiz leads, over the rows returned.",
    }}),{status:200,headers:h});
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
  if(action==="student-progress"){
    // Return progress data for all enrolled students.
    // Reads from the canonical academy_class_progress and academy_exam_attempts tables.
    const {data:progressRows,error:progressError}=await db.from("academy_class_progress").select("user_id,class_key,completed,completed_at").eq("completed",true);
    if(progressError) return new Response(JSON.stringify({ok:false,error:"Could not load class progress"}),{status:500,headers:h});
    const {data:examRows,error:examError}=await db.from("academy_exam_attempts").select("user_id,exam_key,score,passing_score,passed,attempted_at");
    if(examError) return new Response(JSON.stringify({ok:false,error:"Could not load exam attempts"}),{status:500,headers:h});
    // Group by user
    const progressByUser=new Map();
    for(const row of progressRows||[]){
      const uid=String(row.user_id);
      if(!progressByUser.has(uid)) progressByUser.set(uid,{classes:[],lastActivity:null});
      const entry=progressByUser.get(uid);
      entry.classes.push({class_key:String(row.class_key),completed_at:row.completed_at});
      if(row.completed_at&&(!entry.lastActivity||row.completed_at>entry.lastActivity)) entry.lastActivity=row.completed_at;
    }
    const examsByUser=new Map();
    for(const row of examRows||[]){
      const uid=String(row.user_id);
      if(!examsByUser.has(uid)) examsByUser.set(uid,[]);
      examsByUser.get(uid).push({exam_key:String(row.exam_key),score:Number(row.score),passing_score:Number(row.passing_score),passed:!!row.passed,attempted_at:row.attempted_at});
    }
    // Merge into a single response
    const allUserIds=new Set([...progressByUser.keys(),...examsByUser.keys()]);
    const students=[];
    for(const uid of allUserIds){
      const p=progressByUser.get(uid)||{classes:[],lastActivity:null};
      const e=examsByUser.get(uid)||[];
      // Last activity = max of last class completion and last exam attempt
      let lastActivity=p.lastActivity;
      for(const exam of e){
        if(exam.attempted_at&&(!lastActivity||exam.attempted_at>lastActivity)) lastActivity=exam.attempted_at;
      }
      students.push({user_id:uid,completed_classes:p.classes.map((c:any)=>c.class_key),exam_attempts:e,last_activity:lastActivity});
    }
    return new Response(JSON.stringify({ok:true,students}),{status:200,headers:h});
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
  return new Response(JSON.stringify({ok:false,error:"Unknown action"}),{status:400,headers:h});
});
