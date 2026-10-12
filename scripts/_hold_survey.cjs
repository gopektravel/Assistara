// Read-only survey: Pearl, Angelen, Floremae — records, delivery history, capacity.
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
const NAMES = ['Pearl Angelica Lacdag', 'Angelen Saplad', 'Floremae M. Abejo'];
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;
  console.log('LOGIN:', login.status, T ? 'ok' : JSON.stringify(login.data).slice(0, 200));
  if (!T) return;

  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  console.log('\n=== CAPACITY ===');
  console.log(JSON.stringify(apps.data?.capacity));

  // Count accepted
  const accepted = all.filter(a => a.decision === 'accepted');
  console.log('\ntotal applications:', all.length, '| accepted:', accepted.length, '| students(enrolled):', (apps.data?.students || []).length);

  console.log('\n=== TARGET APPLICANTS ===');
  for (const n of NAMES) {
    const a = all.find(x => norm(x.name) === norm(n)) || all.find(x => norm(x.name).includes(norm(n)));
    if (!a) { console.log('MISSING:', n); continue; }
    console.log(`\n${n}:`);
    console.log('  id=' + a.id);
    console.log('  email=' + a.email);
    console.log('  name="' + a.name + '"');
    console.log('  decision=' + a.decision + ' status=' + a.status + ' payment=' + a.payment_status);
    console.log('  accepted_at=' + a.accepted_at);
    console.log('  enrollment_token=' + (a.enrollment_token || 'NONE'));
    console.log('  promo_code=' + (a.promo_code || 'none') + ' assigned_promo=' + (a.assigned_promo_code_id || 'none'));
    console.log('  checkout_amount_php=' + (a.checkout_amount_php || 'none'));
    // look for age-like fields
    const ageKeys = Object.keys(a).filter(k => /age|birth|dob|minor|guardian|consent/i.test(k));
    console.log('  age-related fields: ' + (ageKeys.length ? ageKeys.map(k => k + '=' + JSON.stringify(a[k])).join(', ') : 'NONE'));
  }

  console.log('\n=== DELIVERY HISTORY (acceptance) ===');
  for (const n of NAMES) {
    const a = all.find(x => norm(x.name) === norm(n)) || all.find(x => norm(x.name).includes(norm(n)));
    if (!a) continue;
    const r = await call('admin-email', { action: 'recipient', email: a.email }, T);
    const acc = (r.data?.messages || []).filter(m => (m.email_type || '').includes('accept'));
    console.log(`${n} (${a.email}): total_msgs=${r.data?.messages?.length} acceptance_msgs=${acc.length}`);
    for (const m of acc) console.log('   ' + JSON.stringify(m).slice(0, 300));
  }

  // Floremae answers (age/eligibility)
  const fl = all.find(x => norm(x.name).includes('floremae'));
  if (fl) {
    console.log('\n=== FLOREMAE ANSWERS ===');
    const ans = await call('admin-api', { action: 'answers', id: fl.id }, T);
    console.log(JSON.stringify(ans.data).slice(0, 1500));
  }
})();
