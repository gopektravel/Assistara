// Execute the actual inline Finance application, with DOM/network stubs.
// No financial API writes, copied currency formulas, or production credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const htmlPath = process.env.FINANCE_HTML || path.join(__dirname, '..', 'admin-finance.html');
function app(file = htmlPath) {
  const html = fs.readFileSync(file, 'utf8');
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function categoryBlock'));
  assert.ok(script, 'Finance inline application exists');
  const end = script.indexOf('       * Wiring');
  const cutoff = script.lastIndexOf('      /*', end);
  const elements = new Map();
  const storage = new Map([['assistara_admin_token', 'local-test-only']]);
  let networkCalls = 0;
  const context = vm.createContext({
    console, Date, URLSearchParams, setTimeout: () => 0,
    location: { href: '' },
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
    sessionStorage: { getItem: () => null },
    fetch: async () => { networkCalls++; throw Error('Network forbidden in regression tests'); },
    document: {
      querySelectorAll: () => [],
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {value:'',innerHTML:'',style:{},classList:{toggle(){}},scrollIntoView(){},focus(){},addEventListener(){},appendChild(){}});
        return elements.get(id);
      },
    },
  });
  context.window = context;
  vm.runInContext(script.slice(0, cutoff), context, { filename: file });
  vm.runInContext('preset="all"; displayRates.USD=56.25; displayRates.EUR=62.5;',context);
  return { run: s => vm.runInContext(s,context), elements, networkCalls: () => networkCalls };
}
const usd = {id:'usd',category:'Software',vendor:'Opencode',amount:10,currency:'USD',fx_rate_php:55.8,amount_php:558,expense_date:'2026-10-01',recurring:false};
const eur = {...usd,id:'eur',vendor:'EUR tool',currency:'EUR',fx_rate_php:60,amount_php:600};
const php = {...usd,id:'php',vendor:'PHP tool',amount:500,currency:'PHP',fx_rate_php:1,amount_php:500};
function seed(a, records = [usd]) { a.run(`expenses=${JSON.stringify(records)}; displayCurrency="USD";`); }
function category(a) { return a.run('categoryBlock(materializedExpenses())'); }
test('actual expanded Software row shows $10.00', () => {
  const a=app(); seed(a);
  assert.match(category(a), /data-expense-value>\$10\.00/);
});
test('actual Software category total is $10.00', () => {
  const a=app(); seed(a);
  assert.match(category(a), /data-category-total>\$10\.00/);
});
test('real currency switch USD → PHP → USD keeps row and total', async () => {
  const a=app(); seed(a); const before=a.run('JSON.stringify(expenses)');
  await a.run('setDisplayCurrency("PHP")');
  assert.match(category(a), /data-category-total>₱558\.00/);
  await a.run('setDisplayCurrency("USD")');
  assert.match(category(a), /data-expense-value>\$10\.00/);
  assert.match(category(a), /data-category-total>\$10\.00/);
  assert.equal(a.run('JSON.stringify(expenses)'),before);
  assert.equal(a.networkCalls(),0);
});
test('EUR round trip returns exact €10.00', async () => {
  const a=app(); seed(a,[eur]); await a.run('setDisplayCurrency("EUR")');
  await a.run('setDisplayCurrency("USD")'); await a.run('setDisplayCurrency("EUR")');
  assert.match(category(a), /data-expense-value>€10\.00/);
});
test('PHP round trip returns exact ₱500.00', async () => {
  const a=app(); seed(a,[php]); await a.run('setDisplayCurrency("EUR")'); await a.run('setDisplayCurrency("PHP")');
  assert.match(category(a), /data-expense-value>₱500\.00/);
});
test('mixed category sums rounded individual values, not rounded PHP aggregate', () => {
  const a=app(); seed(a,[usd,eur,php]);
  // Historical source→PHP, session PHP→USD: 10 + 10.67 + 8.89.
  assert.equal(a.run('expenseTotal(materializedExpenses())'),29.56);
  assert.match(category(a), /data-category-total>\$29\.56/);
  assert.match(category(a), /data-expense-value>\$10\.67/);
  assert.match(category(a), /data-expense-value>\$8\.89/);
});
test('other categories and actual Overview cards/chart reconcile', () => {
  const a=app(); seed(a,[usd,eur,{...php,category:'Domain'}]); a.run('renderOverview()');
  const rendered=a.elements.get('content').innerHTML;
  assert.match(rendered, /<b>\$29\.56<\/b><span>Total Expenses/);
  assert.match(rendered, /<b>\$-29\.56<\/b><span>Net Profit/);
  assert.match(rendered, /title="Expenses \$29\.56"/);
  assert.match(rendered, /data-category-total>\$20\.67/);
  assert.match(rendered, /data-category-total>\$8\.89/);
});
test('expense list uses the same original-aware conversion', () => {
  const a=app(); seed(a); assert.match(a.run('expenseRowHtml(expenses[0])'), /\$10\.00 USD/);
  a.run('displayCurrency="EUR"');
  assert.match(a.run('expenseRowHtml(expenses[0])'), /<small>€8\.93<\/small>/);
});
test('opening and reading real edit form preserves entry amount and FX rate without fetching', () => {
  const a=app(); seed(a); a.run('openForm(expenses[0])');
  assert.equal(Number(a.elements.get('f-fx').value),55.8);
  const result=a.run('readForm()');
  assert.equal(result.amount,10); assert.equal(result.currency,'USD'); assert.equal(result.fx_rate_php,55.8);
  assert.equal(a.networkCalls(),0);
});
test('metadata-only API validation preserves even a discrepant historical amount_php', async () => {
  const source=fs.readFileSync(process.env.FINANCE_EDGE_SOURCE || path.join(__dirname,'..','..','supabase','functions','admin-finance','index.ts'),'utf8');
  const validation=source.slice(source.indexOf('function clean('),source.indexOf('Deno.serve('));
  const c=vm.createContext({CURRENCIES:['PHP','USD','EUR'],FREQUENCIES:['monthly','quarterly','yearly'],fetchFxRate:()=>{throw Error('Must not fetch a new rate');}});
  vm.runInContext(stripTypeScriptTypes(validation),c);
  c.current={...usd,amount_php:557.99}; c.raw={...usd,vendor:'renamed'};
  const result=await vm.runInContext('validateExpense(raw,current)',c);
  assert.equal(result.ok,true); assert.equal(result.value.amount_php,557.99); assert.equal(result.value.fx_rate_php,55.8);
});
test('missing rates are unknown, unsupported currencies rejected, no fallback to 1', () => {
  const a=app(); seed(a); a.run('displayCurrency="EUR"; delete displayRates.EUR');
  assert.equal(a.run('expenseDisplay(expenses[0])'),null);
  assert.match(category(a),/data-category-total>—/);
  a.run('displayCurrency="USD"; expenses[0].currency="AUD"');
  assert.equal(a.run('expenseDisplay(expenses[0])'),null);
});
test('reload executes same inline code and preserves original USD', () => {
  for(let i=0;i<2;i++){const a=app();seed(a); assert.match(category(a),/data-expense-value>\$10\.00/);assert.equal(a.networkCalls(),0);}
});
if (process.env.PRODUCTION_FINANCE_HTML) {
  test('captured production category code reproduces $9.92 with a stored $10 fixture', () => {
    const a=app(process.env.PRODUCTION_FINANCE_HTML); seed(a);
    assert.match(category(a),/\$9\.92/);
    assert.equal(a.run('money(558)'), '$9.92');
  });
}
if (process.env.FINANCE_RECORDS_JSON) {
  test('authorized real $10 Opencode record renders exact row/category without mutation', () => {
    const records=JSON.parse(fs.readFileSync(process.env.FINANCE_RECORDS_JSON,'utf8').replace(/^\uFEFF/,''));
    const original=records.rows.find(e=>e.vendor==='Opencode' && e.category==='Software');
    assert.ok(original); assert.equal(Number(original.amount),10); assert.equal(original.currency,'USD');
    assert.equal(Number(original.amount_php),Math.round(10*Number(original.fx_rate_php)*100)/100);
    const a=app(); seed(a,[original]); const before=a.run('JSON.stringify(expenses)');
    assert.match(category(a),/data-expense-value>\$10\.00/);
    assert.match(category(a),/data-category-total>\$10\.00/);
    a.run('displayCurrency="PHP"'); a.run('displayCurrency="USD"');
    assert.match(category(a),/data-category-total>\$10\.00/);
    assert.equal(a.run('JSON.stringify(expenses)'),before);
  });
}
