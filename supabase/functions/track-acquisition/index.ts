import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=(o:string|null)=>!o||o==='https://getassistara.com'||o==='https://www.getassistara.com'||o.endsWith('.vercel.app')||o.startsWith('http://localhost:')||o.startsWith('http://127.0.0.1:');
Deno.serve(async req=>{
 const o=req.headers.get('origin'),h={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed(o)&&o?o:'https://www.getassistara.com','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
 const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:h});
 if(req.method!=='POST'||!allowed(o))return out({ok:false},403);
 let b:any={};try{b=await req.json()}catch{return out({ok:false},400)}
 const token=String(b.token||'').trim().toUpperCase();
 const visitor=String(b.visitor_id||'').slice(0,100)||null,session=String(b.session_id||'').slice(0,100)||null,path=String(b.landing_path||'').slice(0,500)||null,ref=String(b.referrer||'').slice(0,1000)||null,ua=String(req.headers.get('user-agent')||'').slice(0,1000)||null;
 let link:any=null;
 if(token){
  const q=await db.from('acquisition_links').select('id,token,destination,is_active').eq('token',token).eq('is_active',true).maybeSingle();
  if(q.error)return out({ok:false,error:q.error.message},500);
  if(!q.data)return out({ok:false,error:'Invalid link'},404);
  link=q.data;
 }
 const row:any={acquisition_link_id:link?.id||null,tracking_token:link?.token||'SITE',visitor_id:visitor,session_id:session,landing_path:path,referrer:ref,user_agent:ua};
 const {data:visit,error}=await db.from('acquisition_visits').insert(row).select('id').single();
 if(error)return out({ok:false,error:error.message},500);
 return out({ok:true,token:link?.token||'',destination:link?.destination||'',visit_id:visit.id,sitewide:!link});
});