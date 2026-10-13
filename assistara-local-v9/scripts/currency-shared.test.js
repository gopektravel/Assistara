const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "assistara-currency.js"), "utf8");

function load(saved = null, rates = { USD: 0.01592, EUR: 0.01421 }, opts = {}) {
  const store = new Map(saved == null ? [] : [["assistara_currency_display", saved]]);
  if (opts.token) store.set("assistara_admin_token", opts.token);
  const events = [];
  const directOk = opts.directOk !== false;
  const context = {
    localStorage: {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    sessionStorage: {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    fetch: async (url) => {
      if (String(url).includes("admin-finance")) {
        if (opts.edgeRate > 0) return { ok: true, json: async () => ({ ok: true, fx_rate_php: opts.edgeRate }) };
        return { ok: false, json: async () => ({ ok: false }) };
      }
      if (!directOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ date: "2026-10-09", rates }) };
    },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    window: {
      addEventListener() {},
      dispatchEvent: (event) => events.push(event),
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { currency: context.window.AssistaraCurrency, store, events };
}

test("only PHP, USD and EUR are supported", () => {
  const { currency } = load();
  assert.deepEqual([...currency.DISP_CURS], ["PHP", "USD", "EUR"]);
});

test("invalid saved preference resets to PHP", () => {
  const { currency, store } = load("invalid-currency");
  assert.equal(currency.getDisplay(), "PHP");
  assert.equal(store.get(currency.DISP_KEY), "PHP");
});

test("real PHP base rates change numerical values", async () => {
  const { currency } = load();
  await currency.fetchRate("USD");
  await currency.fetchRate("EUR");
  assert.ok(Math.abs(currency.displayValue(6900, "USD") - 109.848) < 0.001);
  assert.ok(Math.abs(currency.displayValue(6900, "EUR") - 98.049) < 0.001);
});

test("shared preference persists and emits synchronization event", () => {
  const { currency, store, events } = load();
  currency.setDisplay("EUR");
  assert.equal(currency.getDisplay(), "EUR");
  assert.equal(store.get(currency.DISP_KEY), "EUR");
  assert.equal(events.at(-1).detail.currency, "EUR");
});

test("unavailable rates never fabricate a converted value", () => {
  const { currency } = load();
  assert.equal(currency.displayValue(6900, "USD"), null);
});

test("edge-function fallback resolves rates when direct fetch fails", async () => {
  const { currency } = load(null, {}, { directOk: false, token: "test-token", edgeRate: 62.5 });
  assert.equal(await currency.fetchRate("USD"), true);
  assert.equal(currency.displayValue(6250, "USD"), 100);
});

test("genuine failure without token stays unavailable, never fabricated", async () => {
  const { currency } = load(null, {}, { directOk: false });
  assert.equal(await currency.fetchRate("USD"), false);
  assert.equal(currency.displayValue(6250, "USD"), null);
});

test("selectors exist only on Overview and Finance", () => {
  const root = path.join(__dirname, "..");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const finance = fs.readFileSync(path.join(root, "admin-finance.html"), "utf8");
  assert.equal((admin.match(/id="sidebarCurrencySwitch"/g) || []).length, 1);
  assert.equal((finance.match(/id="currencySwitch"/g) || []).length, 0);
  for (const file of ["admin-acquisition.html", "admin-email.html", "admin-masterclass-event.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(html.includes('id="currencySwitch"'), false, file);
    assert.equal(html.includes('id="sidebarCurrencySwitch"'), false, file);
  }
});

test("Finance uses the same preference key and shared rate store", () => {
  const finance = fs.readFileSync(path.join(__dirname, "..", "admin-finance.html"), "utf8");
  assert.equal(finance.includes("assistara_finance_display_currency"), false);
  assert.equal(finance.includes("window.AssistaraCurrency.DISP_KEY"), true);
  assert.equal(finance.includes("window.AssistaraCurrency.dispRates"), true);
  assert.equal(finance.includes("window.AssistaraCurrency.setDisplay(cur)"), true);
});
