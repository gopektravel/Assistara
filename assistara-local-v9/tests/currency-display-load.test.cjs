// Load-guard for assistara-currency.js: would have caught the 414b838 regression
// where DISP_KEY/dispCur/dispRates were deleted while window.AssistaraCurrency
// still referenced them (load-time ReferenceError).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'assistara-currency.js');
const src = fs.readFileSync(file, 'utf8');

test('source declares DISP_KEY, dispCur, dispRates and contains no AUD', () => {
  for (const name of ['DISP_KEY', 'dispCur', 'dispRates']) {
    assert.match(src, new RegExp('(const|let|var)\\s+' + name + '\\b'), name + ' must be declared');
  }
  assert.ok(!src.includes('"AUD"') && !src.includes("'AUD'"), 'AUD must never appear');
});

test('every shorthand identifier in window.AssistaraCurrency export is declared', () => {
  const m = src.match(/window\.AssistaraCurrency\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(m, 'window.AssistaraCurrency object literal exists');
  const body = m[1];
  // Split top-level comma entries; arrow-function values contain "=>" but no top-level commas inside braces here.
  const entries = body.split(',').map((s) => s.trim()).filter(Boolean);
  const shorthand = entries
    .filter((e) => !e.includes(':'))
    .map((e) => e.trim())
    .filter((e) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(e));
  assert.ok(shorthand.length > 0, 'export has shorthand identifiers');
  for (const id of shorthand) {
    assert.match(
      src,
      new RegExp('(const|let|var|function)\\s+' + id + '\\b'),
      id + ' must be declared in the file'
    );
  }
});

test('script loads in stubbed DOM context without throwing; display API works', () => {
  const store = new Map();
  const context = vm.createContext({
    console,
    Date,
    encodeURIComponent,
    navigator: {},
    location: { href: '' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });
  context.window = context;
  assert.doesNotThrow(() => {
    vm.runInContext(src, context, { filename: file });
  });
  const api = context.window.AssistaraCurrency;
  assert.ok(api, 'window.AssistaraCurrency is defined');
  assert.equal(api.getDisplay(), 'PHP');
  api.setDisplay('EUR');
  assert.equal(api.getDisplay(), 'EUR');
  for (const fn of ['fmtMoney', 'fmtPHP', 'displayValue']) {
    assert.equal(typeof api[fn], 'function', fn + ' is a function');
  }
  assert.ok(!src.includes('"AUD"') && !src.includes("'AUD'"));
});
