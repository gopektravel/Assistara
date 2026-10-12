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
  const email = process.argv[2] || 'alexiaguzman389@gmail.com';
  const r = await call('admin-email', { action: 'recipient', email }, T);
  const msgs = r.data?.messages || [];
  console.log('recipient:', email, 'messages:', msgs.length);
  // show the most recent academy_acceptance
  const acc = msgs.filter(m => (m.email_type || '').includes('accept'));
  for (const m of acc) {
    console.log('  type=' + m.email_type, '| subject=' + m.subject, '| provider=' + m.provider, '| msgId=' + m.provider_message_id, '| status=' + m.status, '| sent=' + m.sent_at);
  }
  // also confirm application state
  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  const a = all.find(x => x.email === email);
  if (a) console.log('  app: decision=' + a.decision, 'status=' + a.status, 'accepted_at=' + a.accepted_at);
})();
