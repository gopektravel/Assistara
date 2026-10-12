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
  console.log('list ok:', apps.data?.ok, 'status:', apps.status);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  console.log('total apps:', all.length);
  for (const e of ['pearlangelicalacdag147@gmail.com', 'angelensaplad@gmail.com', 'unemployedkc@gmail.com']) {
    const a = all.find(x => x.email === e);
    if (!a) { console.log(e + ': NOT FOUND in list'); continue; }
    console.log(`${e}: decision=${a.decision} status=${a.status} accepted_at=${a.accepted_at} token=${a.enrollment_token ? 'yes' : 'NO'} promo=${a.promo_code || 'none'}`);
  }
  const accepted = all.filter(a => a.decision === 'accepted').length;
  console.log('accepted count:', accepted);
  console.log('capacity:', JSON.stringify(apps.data?.capacity));
})();
