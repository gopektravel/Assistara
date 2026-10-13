/* Shared Assistara currency display — display-only, never writes DB */
const DISP_CURS = ["PHP","USD","EUR"];
const DISP_SYM = {PHP:"₱",USD:"$",EUR:"€"};
const DISP_KEY = "assistara_currency_display";
let dispCur = (()=>{
  try{
    const saved=localStorage.getItem(DISP_KEY);
    if(saved&&!DISP_CURS.includes(saved)) localStorage.setItem(DISP_KEY,"PHP");
    return DISP_CURS.includes(saved)?saved:"PHP";
  }catch{return "PHP";}
})();
const dispRates = {PHP: 1};
let dispRateDate = new Date().toISOString().slice(0,10);
/* Exchange-rate sources, in order. The edge function performs the same
   Frankfurter lookup server-side (authenticated, no third-party exposure),
   so it works even when the browser cannot reach the public API. */
const FX_DIRECT = [
  "https://api.frankfurter.dev/v1/latest?from=PHP&to=",
  "https://api.frankfurter.app/latest?from=PHP&to=",
];
const FIN_FX_URL = "https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/admin-finance";
function adminToken(){
  try{
    return localStorage.getItem("assistara_admin_token") ||
      sessionStorage.getItem("assistara_admin_token") || "";
  }catch{return "";}
}
async function fetchDirectRate(cur){
  for (const base of FX_DIRECT) {
    try{
      const r=await fetch(base+encodeURIComponent(cur),{cache:"no-store"});
      if(!r.ok) continue;
      const j=await r.json();
      const targetPerPhp = j.rates && j.rates[cur] ? Number(j.rates[cur]) : null;
      if(targetPerPhp && targetPerPhp>0) return { phpPerUnit: 1/targetPerPhp, date: j.date || new Date().toISOString().slice(0,10) };
    }catch(e){ /* try next source */ }
  }
  return null;
}
async function fetchEdgeRate(cur){
  const token = adminToken();
  if(!token) return null;
  try{
    const r=await fetch(FIN_FX_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify({ action:"fx", currency:cur, date: dispRateDate }),
    });
    const j=await r.json().catch(()=>({}));
    if(r.ok && j.ok && Number(j.fx_rate_php)>0) return { phpPerUnit: Number(j.fx_rate_php), date: dispRateDate };
  }catch(e){ /* unavailable */ }
  return null;
}
async function fetchRate(cur){
  if(cur==="PHP"||dispRates[cur]>0) return true;
  /* Store PHP per one display-currency unit. This matches Finance and means
     PHP values convert by division rather than by changing only a symbol. */
  const direct = await fetchDirectRate(cur);
  if (direct) { dispRates[cur]=direct.phpPerUnit; dispRateDate=direct.date; return true; }
  const edge = await fetchEdgeRate(cur);
  if (edge) { dispRates[cur]=edge.phpPerUnit; dispRateDate=edge.date; return true; }
  return false;
}
function fmtMoney(v,cur){
  if(v==null||!Number.isFinite(Number(v))||!DISP_CURS.includes(cur)) return "—";
  return (DISP_SYM[cur]||"") + Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtPHP(v){ return fmtMoney(v,"PHP"); }
function displayValue(php,cur){
  if(cur==="PHP"||!Number.isFinite(Number(php))) return Number(php||0);
  const rate = dispRates[cur];
  return (!rate||!(rate>0)) ? null : Number(php||0)/rate;
}
function setDisplay(c){
  if(!DISP_CURS.includes(c)) c="PHP";
  dispCur=c;
  try{localStorage.setItem(DISP_KEY,c);}catch{}
  try{window.dispatchEvent(new CustomEvent("assistara:currencychange",{detail:{currency:c}}));}catch{}
  return c;
}
window.addEventListener("storage",(event)=>{
  if(event.key!==DISP_KEY) return;
  const next=DISP_CURS.includes(event.newValue)?event.newValue:"PHP";
  if(next!==event.newValue){try{localStorage.setItem(DISP_KEY,next);}catch{}}
  dispCur=next;
  try{window.dispatchEvent(new CustomEvent("assistara:currencychange",{detail:{currency:next}}));}catch{}
});
window.AssistaraCurrency = { DISP_CURS, DISP_SYM, DISP_KEY, dispRates, fetchRate, fmtMoney, fmtPHP, displayValue, setDisplay, getDisplay: ()=>dispCur, getRateDate: ()=>dispRateDate };
/* Auto-fetch rates for non-PHP currencies */
(async () => { try { await fetchRate("USD"); await fetchRate("EUR"); } catch(e){} })();
