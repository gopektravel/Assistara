const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
const EMAILS = [
  'alexiaguzman389@gmail.com', 'rhodedrigce@gmail.com', 'leealmerino@gmail.com',
  'christinesuete1010@gmail.com', 'salioudiarrassoub@gmail.com', 'jenmarkpatagan1181999@gmail.com',
  'hazelsaturay@gmail.com', 'edezayu6@gmail.com', 'matugasjeramie2@gmail.com'
];
(async () => {
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;
  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  for (const e of EMAILS) {
    const a = all.find(x => x.email === e);
    const msg = await call('admin-email', { action: 'recipient', email: e }, T);
    const acc = (msg.data?.messages || []).filter(m => (m.email_type || '').includes('accept'));
    const latest = acc.sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0))[0];
    console.log(JSON.stringify({
      email: e,
      name: a?.name || '?',
      id: a?.id || '?',
      decision: a?.decision,
      status: a?.status,
      accepted_at: a?.accepted_at,
      token: a?.enrollment_token ? 'yes' : 'NO',
      promo: a?.promo_code || a?.assigned_promo_code_id || 'none',
      email_subject: latest?.subject || 'NONE',
      email_provider: latest?.provider || '-',
      msg_id: latest?.provider_message_id || '-',
      msg_sent: latest?.sent_at || '-',
      msg_status: latest?.status || '-',
      messages_total: msg.data?.messages?.length || 0
    }));
  }
})();
