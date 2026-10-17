import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,USER="admin",enc=new TextEncoder();
const allowed=new Set(["https://getassistara.com","https://www.getassistara.com","http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]);const ok=(o:string|null)=>!!o&&(allowed.has(o)||o.endsWith('.vercel.app'));const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');async function sign(p:string){const k=await crypto.subtle.importKey('raw',enc.encode(K),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(p))))}async function auth(t:string){try{const[p,s]=t.split('.');if(!p||!s||await sign(p)!==s)return false;const raw=atob(p.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-p.length%4)%4));const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));return !!d.v&&d.v===(Deno.env.get("ADMIN_TOKEN_VERSION")||"")&&d.u===USER&&Date.now()<d.exp}catch{return false}}

// ---------------------------------------------------------------------------
// Remote Income Potential Quiz, folded into the existing acquisition model.
//
// The quiz is a new top-of-funnel stage, not a new analytics system. Quiz
// results already carry acquisition_visit_id / acquisition_visitor_id /
// tracking_token, exactly the same trio that links a masterclass signup or an
// Academy application to a campaign, so everything here reuses the existing
// resolution chain rather than inventing a second one.
//
// `acquisition_performance` is read untouched. Quiz numbers are computed
// alongside it and returned in a separate `quiz` key, so no existing metric,
// column or historical row changes shape.
// ---------------------------------------------------------------------------

type Any = Record<string, any>;
const norm = (v: unknown) => String(v ?? "").trim();
const upper = (v: unknown) => norm(v).toUpperCase();
const num = (v: unknown) => Number(v) || 0;

async function loadQuiz(db: Any, links: Any[]) {
  const empty = {
    available: false,
    starts: 0,
    completions: 0,
    leads: 0,
    applications: 0,
    accepted: 0,
    paid: 0,
    revenue: 0,
    completionRate: 0,
    captureRate: 0,
    quizToPaidRate: 0,
    byLink: {} as Record<string, Any>,
    byCareer: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  };

  // --- starts (sessions) and completions (saved results) ------------------
  const [sessionsRes, resultsRes] = await Promise.all([
    // A session counts as a start the moment it is created. quiz_sessions
    // timestamps its own way: started_at, not created_at. Ordering on a
    // column that does not exist would fail the query, and a failed query
    // takes the whole funnel down to "unavailable".
    db.from("quiz_sessions")
      .select("id,started_at,completed_at,acquisition_visit_id,acquisition_visitor_id,tracking_token")
      .order("started_at", { ascending: false })
      .limit(1000),
    db.from("quiz_results")
      .select("id,created_at,email,acquisition_visit_id,acquisition_visitor_id,tracking_token,lead_priority,lead_priority_band,primary_career,readiness_stage,marketing_consent")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (sessionsRes.error || resultsRes.error) return empty;

  const sessions: Any[] = sessionsRes.data || [];
  const results: Any[] = resultsRes.data || [];

  // --- resolve visits -> links so the same resolver drives quiz and non-quiz
  const visitIds = [
    ...new Set(
      [...sessions, ...results]
        .map((r) => norm(r.acquisition_visit_id))
        .filter(Boolean),
    ),
  ];
  const visitToLink = new Map<string, string>();
  if (visitIds.length) {
    const v = await db.from("acquisition_visits")
      .select("id,acquisition_link_id")
      .in("id", visitIds.slice(0, 500));
    for (const row of v.data || []) {
      if (row && norm(row.acquisition_link_id)) visitToLink.set(norm(row.id), norm(row.acquisition_link_id));
    }
  }

  const linkByToken = new Map<string, string>(
    (links || []).map((l: Any) => [upper(l.token), norm(l.id)]),
  );

  // Resolution order mirrors attribution.js: visit first, then tracking token.
  // A campaign-less visitor simply does not attach to a link, which is the
  // correct outcome rather than an error.
  const linkOf = (r: Any): string => {
    const visitId = norm(r.acquisition_visit_id);
    if (visitId && visitToLink.has(visitId)) return visitToLink.get(visitId) as string;
    const tok = upper(r.tracking_token);
    return (tok && linkByToken.get(tok)) || "";
  };

  // --- per-link rollups ---------------------------------------------------
  const byLink: Record<string, { starts: number; completions: number; leads: number; applications: number; accepted: number; paid: number; careers: Record<string, number>; bands: Record<string, number> }> = {};
  const bucket = (id: string) => {
    if (!id) return null;
    if (!byLink[id]) byLink[id] = { starts: 0, completions: 0, leads: 0, applications: 0, accepted: 0, paid: 0, careers: {}, bands: {} };
    return byLink[id];
  };
  for (const s of sessions) {
    const b = bucket(linkOf(s));
    if (b) b.starts++;
  }

  const byCareer: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let leads = 0;
  for (const r of results) {
    const b = bucket(linkOf(r));
    if (b) b.completions++;
    if (norm(r.email)) {
      leads++;
      if (b) b.leads++;
    }
    const career = norm(r.primary_career);
    if (career) {
      byCareer[career] = (byCareer[career] || 0) + 1;
      if (b) b.careers[career] = (b.careers[career] || 0) + 1;
    }
    const band = norm(r.lead_priority_band) || "cool";
    byPriority[band] = (byPriority[band] || 0) + 1;
    if (b) b.bands[band] = (b.bands[band] || 0) + 1;
  }

  // --- which of those leads went on to apply, get accepted and pay ---------
  // Matched on the lowercased email, which is the only identity the quiz and
  // the application form share. An application is never duplicated by this:
  // it stays the source of truth for its own status.
  const leadEmails = results.map((r) => norm(r.email).toLowerCase()).filter(Boolean);
  let applications = 0, accepted = 0, paid = 0, revenue = 0;
  const appByLink = new Map<string, number>();
  if (leadEmails.length) {
    const appsRes = await db.from("academy_applications")
      .select("id,email,status,decision,payment_status,paid_at,amount_paid")
      .in("email", leadEmails.slice(0, 500));
    const resultByEmail = new Map<string, Any>();
    for (const r of results) {
      const e = norm(r.email).toLowerCase();
      if (e && !resultByEmail.has(e)) resultByEmail.set(e, r);
    }
    for (const app of appsRes.data || []) {
      const e = norm(app.email).toLowerCase();
      const r = resultByEmail.get(e);
      if (!r) continue;
      applications++;
      const lid = linkOf(r);
      if (lid) appByLink.set(lid, (appByLink.get(lid) || 0) + 1);
      const isAccepted = norm(app.decision) === "accepted" || norm(app.status) === "accepted";
      const isPaid = norm(app.payment_status) === "paid" || !!app.paid_at;
      if (isAccepted) { accepted++; if (lid) { const b = bucket(lid); if (b) b.accepted++; } }
      if (isPaid) {
        paid++;
        revenue += num(app.amount_paid);
        if (lid) { const b = bucket(lid); if (b) b.paid++; }
      }
    }
  }
  for (const [lid, n] of appByLink) {
    const b = bucket(lid);
    if (b && !b.applications) b.applications = n;
  }

  const starts = sessions.length;
  const completions = results.length;
  return {
    available: true,
    starts,
    completions,
    leads,
    applications,
    accepted,
    paid,
    revenue,
    completionRate: starts ? Math.round((completions / starts) * 1000) / 10 : 0,
    captureRate: completions ? Math.round((leads / completions) * 1000) / 10 : 0,
    quizToPaidRate: leads ? Math.round((paid / leads) * 1000) / 10 : 0,
    byLink,
    byCareer,
    byPriority,
  };
}

Deno.serve(async req=>{
  const o=req.headers.get('origin'),h={'Content-Type':'application/json','Access-Control-Allow-Origin':ok(o)?o!:'https://www.getassistara.com','Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:h});
  if(req.method!=='POST'||(o&&!ok(o)))return out({ok:false,error:'Forbidden'},403);
  const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!await auth(t))return out({ok:false,error:'Session expired'},401);
  let b:any={};try{b=await req.json()}catch{}
  const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}}),a=String(b.action||'');

  if(a==='list'){
    const {data,error}=await db.from('acquisition_performance').select('*').order('created_at',{ascending:false});
    if(error)return out({ok:false,error:error.message},500);
    // Existing response shape is preserved exactly; the quiz funnel rides
    // along in its own key so nothing that reads `links` today changes.
    const quiz=await loadQuiz(db,data||[]);
    const merged=(data||[]).map((l:any)=>{
      const q=quiz.byLink[norm(l.id)]||null;
      const starts=q?q.starts:0,completions=q?q.completions:0,ql=q?q.leads:0,qp=q?q.paid:0;
      // Ad spend only exists where a campaign records it. When it does not,
      // cost figures are omitted rather than shown as a misleading zero.
      const spend=num((l as any).spend??(l as any).ad_spend??(l as any).cost);
      return {...l,
        quiz_starts:starts,quiz_completions:completions,quiz_leads:ql,
        quiz_applications:q?q.applications:0,quiz_accepted:q?q.accepted:0,quiz_paid:qp,
        quiz_completion_rate:starts?Math.round((completions/starts)*1000)/10:null,
        quiz_capture_rate:completions?Math.round((ql/completions)*1000)/10:null,
        quiz_careers:q?q.careers:{},quiz_bands:q?q.bands:{},
        cost_per_quiz_lead:spend>0&&ql?Math.round((spend/ql)*100)/100:null,
        cost_per_paying_customer:spend>0&&qp?Math.round((spend/qp)*100)/100:null,
      };
    });
    return out({ok:true,links:merged,quiz});
  }

  if(a==='visitors'){
    const linkId=String(b.link_id||'');
    if(!linkId)return out({ok:false,error:'Missing link id'},400);
    const {data:visits,error}=await db.from('acquisition_visits').select('id,created_at,visitor_id,session_id,landing_path,quiz_result_id,signup_id,application_id,b2b_lead_id').eq('acquisition_link_id',linkId).order('created_at',{ascending:false}).limit(200);
    if(error)return out({ok:false,error:error.message},500);
    const rows=visits||[];
    const sids=[...new Set(rows.map((x:any)=>x.signup_id).filter(Boolean))],
      aids=[...new Set(rows.map((x:any)=>x.application_id).filter(Boolean))],
      bids=[...new Set(rows.map((x:any)=>x.b2b_lead_id).filter(Boolean))],
      qids=[...new Set(rows.map((x:any)=>x.quiz_result_id).filter(Boolean))];
    let ss:any[]=[],aa:any[]=[],bb:any[]=[],qq:any[]=[];
    if(sids.length)ss=(await db.from('masterclass_signups').select('id,name,email').in('id',sids)).data||[];
    if(aids.length)aa=(await db.from('academy_applications').select('id,name,email,status,payment_status').in('id',aids)).data||[];
    if(bids.length)bb=(await db.from('b2b_leads').select('id,name,email,status').in('id',bids)).data||[];
    // quiz_result_id only exists after the acquisition link migration. A
    // missing column must not break the existing visitor drill-down.
    if(qids.length){
      const q=await db.from('quiz_results').select('id,first_name,email,primary_career,lead_priority_band').in('id',qids);
      qq=q.data||[];
    }
    return out({ok:true,visitors:rows.map((v:any)=>({
      ...v,
      masterclass:ss.find(x=>x.id===v.signup_id)||null,
      application:aa.find(x=>x.id===v.application_id)||null,
      b2b:bb.find(x=>x.id===v.b2b_lead_id)||null,
      quiz:qq.find(x=>x.id===v.quiz_result_id)||null,
    }))});
  }

  if(a==='create'){
    const channel=String(b.channel||'').trim(),placement=String(b.placement||'').trim(),label=String(b.label||'').trim(),destination=String(b.destination||'academy').trim();
    if(!channel||!placement)return out({ok:false,error:'Channel and placement are required'},400);
    if(!['academy','b2b'].includes(destination))return out({ok:false,error:'Campaign must be Academy or B2B'},400);
    const {data,error}=await db.from('acquisition_links').insert({channel,placement,label:label||null,destination}).select('*').single();
    return error?out({ok:false,error:error.message},500):out({ok:true,link:data});
  }
  if(a==='update_label'){
    const id=String(b.id||'').trim(),label=String(b.label||'').trim();
    if(!id)return out({ok:false,error:'Missing link id'},400);
    const {data,error}=await db.from('acquisition_links').update({label:label||null}).eq('id',id).select('*').single();
    return error?out({ok:false,error:error.message},500):out({ok:true,link:data});
  }
  if(a==='delete'){
    const id=String(b.id||'');
    if(!id)return out({ok:false,error:'Missing link id'},400);
    const {error}=await db.from('acquisition_links').delete().eq('id',id);
    return error?out({ok:false,error:error.message},500):out({ok:true});
  }
  if(a==='toggle'){
    const {data,error}=await db.from('acquisition_links').update({is_active:!!b.is_active}).eq('id',String(b.id||'')).select('*').single();
    return error?out({ok:false,error:error.message},500):out({ok:true,link:data});
  }
  return out({ok:false,error:'Unknown action'},400);
});
