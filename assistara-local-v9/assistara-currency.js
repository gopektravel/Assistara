/* Shared Assistara display currency. PHP remains the source of truth. */
const DISP_CURS = ["PHP", "USD", "EUR"];
const DISP_SYM = { PHP: "₱", USD: "$", EUR: "€" };
const DISP_KEY = "assistara_currency_display";
const DISP_RATE_KEY = "assistara_currency_rates_v2";
const RATE_MAX_AGE = 36 * 60 * 60 * 1000;
const FIN_FX_URL = "https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/admin-finance";
const FX_DIRECT = ["https://api.frankfurter.dev/v1/latest?from=PHP&to="];

let dispCur = (() => {
  try {
    const saved = localStorage.getItem(DISP_KEY);
    if (saved && !DISP_CURS.includes(saved)) localStorage.setItem(DISP_KEY, "PHP");
    return DISP_CURS.includes(saved) ? saved : "PHP";
  } catch { return "PHP"; }
})();
const dispRates = { PHP: 1 };
let dispRateDate = new Date().toISOString().slice(0, 10);
let rateSource = "PHP base";

function readRateCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DISP_RATE_KEY) || "null");
    if (!cached || !Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > RATE_MAX_AGE) return;
    for (const cur of ["USD", "EUR"]) {
      if (Number(cached.rates && cached.rates[cur]) > 0) dispRates[cur] = Number(cached.rates[cur]);
    }
    if (typeof cached.date === "string") dispRateDate = cached.date;
    if (typeof cached.source === "string") rateSource = cached.source + " (cached)";
  } catch { /* unavailable cache is not a rate */ }
}
function writeRateCache(source) {
  try {
    localStorage.setItem(DISP_RATE_KEY, JSON.stringify({
      rates: { USD: dispRates.USD || null, EUR: dispRates.EUR || null },
      date: dispRateDate,
      source,
      savedAt: Date.now(),
    }));
  } catch { /* storage may be unavailable */ }
}
readRateCache();

function adminToken() {
  try {
    return localStorage.getItem("assistara_admin_token") ||
      sessionStorage.getItem("assistara_admin_token") || "";
  } catch { return ""; }
}

async function fetchDirectRate(cur) {
  for (const base of FX_DIRECT) {
    try {
      const response = await fetch(base + encodeURIComponent(cur), { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const targetPerPhp = Number(json.rates && json.rates[cur]);
      if (targetPerPhp > 0) {
        return { phpPerUnit: 1 / targetPerPhp, date: json.date || dispRateDate, source: "Frankfurter" };
      }
    } catch { /* use authenticated same-business fallback */ }
  }
  return null;
}

async function fetchEdgeRate(cur) {
  const token = adminToken();
  if (!token) return null;
  try {
    const response = await fetch(FIN_FX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ action: "fx", currency: cur, date: dispRateDate }),
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.ok && Number(json.fx_rate_php) > 0) {
      return {
        phpPerUnit: Number(json.fx_rate_php),
        date: json.rate_date || json.date || dispRateDate,
        source: "Finance FX service",
      };
    }
  } catch { /* preserve explicit unavailable state */ }
  return null;
}

async function fetchRate(cur, force = false) {
  if (cur === "PHP") return true;
  if (!DISP_CURS.includes(cur)) return false;
  if (!force && Number(dispRates[cur]) > 0) return true;
  const result = await fetchDirectRate(cur) || await fetchEdgeRate(cur);
  if (!result) return Number(dispRates[cur]) > 0;
  dispRates[cur] = result.phpPerUnit;
  dispRateDate = result.date;
  rateSource = result.source;
  writeRateCache(result.source);
  return true;
}

function fmtMoney(value, cur) {
  if (value == null || !Number.isFinite(Number(value)) || !DISP_CURS.includes(cur)) return "—";
  return (DISP_SYM[cur] || "") + Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPHP(value) { return fmtMoney(value, "PHP"); }
function displayValue(php, cur) {
  if (!Number.isFinite(Number(php))) return null;
  if (cur === "PHP") return Number(php);
  const rate = Number(dispRates[cur]);
  return rate > 0 ? Number(php) / rate : null;
}
function setDisplay(cur) {
  if (!DISP_CURS.includes(cur)) cur = "PHP";
  dispCur = cur;
  try { localStorage.setItem(DISP_KEY, cur); } catch {}
  try {
    window.dispatchEvent(new CustomEvent("assistara:currencychange", {
      detail: { currency: cur, rateDate: dispRateDate, rateSource },
    }));
  } catch {}
  return cur;
}

window.addEventListener("storage", (event) => {
  if (event.key !== DISP_KEY) return;
  const next = DISP_CURS.includes(event.newValue) ? event.newValue : "PHP";
  if (next !== event.newValue) try { localStorage.setItem(DISP_KEY, next); } catch {}
  dispCur = next;
  try { window.dispatchEvent(new CustomEvent("assistara:currencychange", { detail: { currency: next } })); } catch {}
});

window.AssistaraCurrency = {
  DISP_CURS, DISP_SYM, DISP_KEY, DISP_RATE_KEY, dispRates,
  fetchRate, fmtMoney, fmtPHP, displayValue, setDisplay,
  getDisplay: () => dispCur,
  getRateDate: () => dispRateDate,
  getRateSource: () => rateSource,
};

/* Warm both rates without blocking the Admin shell. */
(async () => {
  try { await Promise.all([fetchRate("USD"), fetchRate("EUR")]); } catch {}
})();
