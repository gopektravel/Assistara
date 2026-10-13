/* Shared Assistara currency display — display-only, never writes DB */
const DISP_CURS = ["PHP","USD","EUR"];
const DISP_SYM = {PHP:"₱",USD:"$",EUR:"€"};
/* Defensive: reset any stale/invalid display preference (including old AUD) to PHP */
(function resetInvalidPref(){ try{ const s=localStorage.getItem("assistara_currency_display"); if(s&&!["PHP","USD","EUR"].includes(s)){ localStorage.setItem("assistara_currency_display","PHP"); } }catch(e){} })();
const DISP_KEY = "assistara_currency_display";
let dispCur = (()=>{try{const s=localStorage.getItem(DISP_KEY); return DISP_CURS.includes(s)?s:"PHP";}catch{ return "PHP";}})();
const dispRates = {PHP:1};
let dispRateDate = new Date().toISOString().slice(0,10);
async function fetchRate(cur){
  if(cur==="PHP"||dispRates[cur]>0) return true;
  try{
    const r=await fetch("https://api.frankfurter.app/latest?from=PHP&to="+encodeURIComponent(cur),{cache:"no-store"});
    if(!r.ok) throw new Error("Rate fetch failed");
    const j=await r.json();
    const rate = j.rates && j.rates[cur] ? Number(j.rates[cur]) : null;
    if(rate && rate>0){ dispRates[cur]=rate; dispRateDate=j.date||new Date().toISOString().slice(0,10); return true; }
  }catch(e){ /* unavailable — leave as unavailable */ }
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
window.AssistaraCurrency = { DISP_CURS, DISP_SYM, DISP_KEY, dispCur, dispRates, dispRateDate, fetchRate, fmtMoney, fmtPHP, displayValue, setDisplay: (c)=>{ if(DISP_CURS.includes(c)){ dispCur=c; try{localStorage.setItem(DISP_KEY,c);}catch{} } }, getDisplay: ()=>dispCur };
