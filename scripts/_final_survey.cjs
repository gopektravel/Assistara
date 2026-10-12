// Comprehensive production survey for final cleanup.
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
  console.log('LOGIN:', login.status, T ? 'ok' : 'FAIL');
  if (!T) return;

  // 1. All applications
  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  console.log('\n=== ALL APPLICATIONS (' + all.length + ') ===');
  console.log('assigned_promo_code_id column present:', all.length ? ('assigned_promo_code_id' in all[0]) : 'n/a');
  const accepted = all.filter(a => a.decision === 'accepted');
  console.log('accepted:', accepted.length);
  for (const a of accepted) {
    console.log(`  ${a.name} | ${a.email} | token=${a.enrollment_token ? 'yes' : 'NO'} | promo=${a.promo_code || 'none'} | assigned=${a.assigned_promo_code_id || 'none'} | checkout_amt=${a.checkout_amount_php || 'none'}`);
  }
  const pending = all.filter(a => a.decision !== 'accepted');
  console.log('pending:', pending.length);
  for (const a of pending) {
    console.log(`  ${a.name} | ${a.email} | decision=${a.decision} status=${a.status}`);
  }

  // 2. Capacity
  console.log('\n=== CAPACITY ===');
  console.log(JSON.stringify(apps.data?.capacity));

  // 3. Published templates
  console.log('\n=== PUBLISHED TEMPLATES ===');
  const list = await call('admin-email-templates', { action: 'list' }, T);
  const templates = list.data?.templates || [];
  for (const t of templates) {
    console.log(`  key=${t.key} status=${t.status} version=${t.version} name=${t.name || ''}`);
  }

  // 4. Coupons
  console.log('\n=== COUPONS ===');
  const coupons = await call('admin-coupons', { action: 'list' }, T);
  const clist = coupons.data?.coupons || coupons.data?.items || (Array.isArray(coupons.data) ? coupons.data : []);
  if (Array.isArray(clist)) {
    for (const c of clist) console.log(`  code=${c.code} amount_php=${c.amount_php} active=${c.active} expires=${c.expires_at || 'never'} max_redeem=${c.max_redemptions || 'unlimited'} per_cust=${c.max_redemptions_per_customer || 'unlimited'}`);
  }

  // 5. Email delivery for all accepted
  console.log('\n=== EMAIL DELIVERY (accepted applicants) ===');
  for (const a of accepted) {
    const r = await call('admin-email', { action: 'recipient', email: a.email }, T);
    const acc = (r.data?.messages || []).filter(m => (m.email_type || '').includes('accept'));
    const latest = acc.sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0))[0];
    console.log(`  ${a.name}: acceptance_emails=${acc.length} latest_subject="${latest?.subject || 'NONE'}" provider=${latest?.provider || '-'} msgId=${latest?.provider_message_id || '-'} status=${latest?.status || '-'}`);
  }
})();
