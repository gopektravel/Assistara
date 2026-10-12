// Read-only verification of the two contradictions.
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

  // 1. All applications — check assigned_promo_code_id column + Floremae + Group2/3 tokens
  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  console.log('\n=== SCHEMA ===');
  console.log('assigned_promo_code_id column present:', all.length ? ('assigned_promo_code_id' in all[0]) : 'n/a');
  if (all.length) console.log('sample keys:', Object.keys(all[0]).filter(k => /promo|assigned|checkout/i.test(k)).join(', '));

  console.log('\n=== FLOREMAE ===');
  const f = all.find(x => /floremae/i.test(x.name));
  if (f) {
    console.log('  name:', f.name);
    console.log('  email:', f.email);
    console.log('  decision:', f.decision);
    console.log('  status:', f.status);
    console.log('  payment_status:', f.payment_status);
    console.log('  accepted_at:', f.accepted_at);
    console.log('  enrollment_token:', f.enrollment_token);
    console.log('  promo_code:', f.promo_code || 'none');
    console.log('  assigned_promo_code_id:', f.assigned_promo_code_id || 'none');
    console.log('  checkout_amount_php:', f.checkout_amount_php || 'none');
  } else console.log('  NOT FOUND');

  console.log('\n=== GROUP 2 (iresh) ===');
  const g2 = all.find(x => x.email === 'maraganairesh87@gmail.com');
  if (g2) console.log('  token:', g2.enrollment_token, '| decision:', g2.decision, '| assigned:', g2.assigned_promo_code_id || 'none', '| checkout_amt:', g2.checkout_amount_php || 'none');

  console.log('\n=== GROUP 3 (Alexia) ===');
  const g3 = all.find(x => x.email === 'alexiaguzman389@gmail.com');
  if (g3) console.log('  token:', g3.enrollment_token, '| decision:', g3.decision, '| assigned:', g3.assigned_promo_code_id || 'none', '| checkout_amt:', g3.checkout_amount_php || 'none');

  // 2. Floremae delivery events
  console.log('\n=== FLOREMAE DELIVERY ===');
  const fr = await call('admin-email', { action: 'recipient', email: 'unemployedkc@gmail.com' }, T);
  const acc = (fr.data?.messages || []).filter(m => (m.email_type || '').includes('accept'));
  console.log('  acceptance messages:', acc.length);
  for (const m of acc) console.log('   ', JSON.stringify({ subject: m.subject, provider: m.provider, msgId: m.provider_message_id, created_at: m.created_at, status: m.status, sent_at: m.sent_at }));

  // 3. Floremae enrollment link (does it work?)
  console.log('\n=== FLOREMAE ENROLLMENT LINK ===');
  if (f && f.enrollment_token) {
    const inv = await call('enrollment-invitation', { token: f.enrollment_token }, T);
    console.log('  status:', inv.status);
    console.log('  response:', JSON.stringify(inv.data).slice(0, 400));
  }

  // 4. Group 2 enrollment link (should show 4900 if assigned)
  console.log('\n=== GROUP 2 ENROLLMENT LINK ===');
  if (g2 && g2.enrollment_token) {
    const inv2 = await call('enrollment-invitation', { token: g2.enrollment_token }, T);
    console.log('  status:', inv2.status);
    console.log('  amount_php:', inv2.data?.amount_php, '| promo_code:', inv2.data?.promo_code, '| auto_applied:', inv2.data?.auto_applied);
  }

  // 5. Group 3 enrollment link (should show 3900 if XYRA applied, else 6900)
  console.log('\n=== GROUP 3 ENROLLMENT LINK ===');
  if (g3 && g3.enrollment_token) {
    const inv3 = await call('enrollment-invitation', { token: g3.enrollment_token }, T);
    console.log('  status:', inv3.status);
    console.log('  amount_php:', inv3.data?.amount_php, '| promo_code:', inv3.data?.promo_code, '| auto_applied:', inv3.data?.auto_applied);
  }

  // 6. Capacity
  console.log('\n=== CAPACITY ===');
  console.log(JSON.stringify(apps.data?.capacity));
})();
