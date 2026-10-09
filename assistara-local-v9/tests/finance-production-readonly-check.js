// Paste into DevTools Console while logged in at /admin/finance.
// Only reads expense records and source; never creates/updates/deletes records.
(async () => {
  if (location.pathname.replace(/\/$/, '') !== '/admin/finance') throw Error('Open /admin/finance while logged in first.');
  const response = await fetch('/admin/finance?currency-audit=' + Date.now(), { cache: 'no-store' });
  const source = await response.text();
  const data = await req(FIN, 'list');
  const software = (data.expenses || []).filter(e => e.category === 'Software');
  console.log('Source evidence', {
    url: location.href,
    requestId: response.headers.get('x-vercel-id'),
    etag: response.headers.get('etag'),
    correctedVersion: source.includes('content="original-currency-v2"'),
    originalAwareCalculator: source.includes('function expenseDisplay(e)'),
    runningCategoryFunction: categoryBlock.toString(),
    currentCurrency: displayCurrency,
    reportingRates: { ...displayRates },
    serviceWorkers: await navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.scope)),
  });
  console.table(software.map(e => ({
    id: e.id, vendor: e.vendor, amount: e.amount, currency: e.currency,
    fx_rate_php: e.fx_rate_php, amount_php: e.amount_php,
    calculatedEntryPHP: Math.round(Number(e.amount) * Number(e.fx_rate_php) * 100) / 100,
    displayedSingleExpense: typeof expenseDisplay === 'function' ? expenseDisplay(e) : money(e.amount_php),
  })));
  console.log('Software materialized entries in current date range',
    materializedExpenses().filter(x => x.e.category === 'Software').map(x => ({id:x.e.id, occurrences:x.dates.length})));
  console.log('Current expanded Software DOM', document.querySelector('[data-category="Software"]')?.outerHTML || 'No expanded-category element in this version');
  console.log('No writes performed. Do not share tokens or unrelated financial records.');
})();
