const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const financeHtml = fs.readFileSync(path.join(root, "assistara-local-v9", "admin-finance.html"), "utf8");
const financeFn = fs.readFileSync(path.join(root, "supabase", "functions", "admin-finance", "index.ts"), "utf8");
const feeMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "202610080004_payment_processing_fees.sql"), "utf8");

test("the Overview no longer has a separate Processing Fees card", () => {
  const overview = financeHtml.slice(financeHtml.indexOf("function renderOverview()"), financeHtml.indexOf("function have("));
  assert.doesNotMatch(overview, /"Processing Fees"/);
  // the core metrics remain
  for (const label of ["Gross Revenue", "Net Revenue", "Total Expenses", "Net Profit / Loss"]) {
    assert.match(overview, new RegExp(`"${label.replace(/[/]/g, "\\/")}"`), `expected ${label}`);
  }
});

test("processing fees are represented under the existing expense category", () => {
  assert.match(financeHtml, /const FEE_CATEGORY = "Payment \/ Banking Fees";/);
  assert.match(financeHtml, /"Payment \/ Banking Fees",/); // still in CATEGORIES (reused, not duplicated)
  assert.match(financeHtml, /function feeExpenseEntries\(\)/);
  assert.match(financeHtml, /category: FEE_CATEGORY/);
  // fees are derived from the immutable ledger at render time (no writes)
  assert.match(financeHtml, /\.filter\(\(f\) => byId\.has\(f\.application_id\)/);
});

test("Total Expenses includes fees and Net Profit never deducts them twice", () => {
  const overview = financeHtml.slice(financeHtml.indexOf("function renderOverview()"), financeHtml.indexOf("function have("));
  assert.match(overview, /const allMat = mat\.concat\(feeMat\);/);
  assert.match(overview, /const totalExpenses = nonFeeExpenses === null \|\| processingFees === null \? null : nonFeeExpenses \+ processingFees;/);
  assert.match(overview, /const netRevenue = grossDisplayed === null \|\| processingFees === null \? null : grossDisplayed - processingFees;/);
  // Net Profit = Gross Revenue − Total Expenses (fees already inside Total Expenses)
  assert.match(overview, /const net = grossDisplayed === null \|\| totalExpenses === null \? null : grossDisplayed - totalExpenses;/);
  assert.doesNotMatch(overview, /netRevenue - totalExpenses/);
});

test("Expenses by category shows amount and percentage", () => {
  const block = financeHtml.slice(financeHtml.indexOf("function categoryBlock(mat)"), financeHtml.indexOf("function marketingMiniTable()"));
  assert.match(block, /data-category-pct/);
  assert.match(block, /\(v \/ grand\) \* 100/);
  assert.match(block, /data-category-total/);
});

test("a donut chart renders distribution with a legend and no demo data", () => {
  assert.match(financeHtml, /function donutBlock\(list\)/);
  assert.match(financeHtml, /class="donut"/);
  assert.match(financeHtml, /donutLegend/);
  assert.match(financeHtml, /function categoryColors\(cats\)/);
  assert.match(financeHtml, /role="img" aria-label=/);
  assert.match(financeHtml, /No expenses to chart/);
  // chart is built from the computed list, never a hardcoded dataset
  assert.doesNotMatch(financeHtml, /donutBlock\(\s*\[/);
});

test("the fee ledger enforces idempotency and the API exposes fee reconciliation", () => {
  assert.match(feeMigration, /unique \(provider, provider_payment_id\)/);
  assert.match(feeMigration, /net_amount_php numeric\(14,2\) generated always as \(gross_amount_php - fee_amount_php\)/);
  assert.match(financeFn, /action === "fee_list"/);
  assert.match(financeFn, /action === "fee_update"/);
  assert.match(financeFn, /Confirmed fee records cannot be altered without audit review/);
});
