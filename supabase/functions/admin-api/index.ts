import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL="https://www.getassistara.com";
const USERNAME="admin";
const PASSWORD_SALT="feb789e407214ef9de506a6f11051332";
const PASSWORD_HASH="b07473c45b983ec7144df50a59c34e00671550687c09f40e582a46ac189eba0c";
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
