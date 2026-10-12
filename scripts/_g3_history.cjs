// Read-only: how were Group 2 sent? Check admin_activity_log + delivery overview.
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
(async () => {
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;

  const apps = await call('admin-applications', { action: 'list' }, T);
  console.log('=== ACTIVITY LOG (decision/email related) ===');
  for (const a of (apps.data?.activity || [])) {
    if (/decision|email|accepted/i.test(a.action || '')) console.log(JSON.stringify(a));
  }

  const ov = await call('admin-email', { action: 'overview' }, T);
  console.log('\n=== EMAIL OVERVIEW ===');
  console.log(JSON.stringify(ov.data, null, 1).slice(0, 3000));
})();
