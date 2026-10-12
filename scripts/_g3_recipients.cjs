// Read-only: per-recipient delivery history for targets + prior groups.
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

  const emails = [
    ['T1 Alexia', 'alexiaguzman389@gmail.com'],
    ['T2 Rhode', 'rhodedrigce@gmail.com'],
    ['T3 Lehlee', 'leealmerino@gmail.com'],
    ['T4 Christine', 'christinesuete1010@gmail.com'],
    ['T5 Saliou', 'salioudiarrassoub@gmail.com'],
    ['T6 Jenmark', 'jenmarkpatagan1181999@gmail.com'],
    ['T7 Hazel', 'hazelsaturay@gmail.com'],
    ['T8 Edeza', 'edezayu6@gmail.com'],
    ['T9 Jeramie', 'matugasjeramie2@gmail.com'],
    ['P1 G1', 'adajarsteph11@gmail.com'],
    ['P2 G1', 'cristyulanday03@gmail.com'],
    ['P3 G1', 'pagilagangelica@gmail.com'],
    ['P4 G2', 'maraganairesh87@gmail.com'],
    ['P5 G2', 'smart.ice.fspring24@gmail.com'],
    ['P6 G2', 'apolitoedward08@gmail.com'],
  ];
  for (const [label, email] of emails) {
    const r = await call('admin-email', { action: 'recipient', email }, T);
    const msgs = r.data?.messages || [];
    console.log(`\n${label} (${email}) status=${r.status} suppression=${JSON.stringify(r.data?.suppression)} messages=${msgs.length}`);
    for (const m of msgs) console.log('  ' + JSON.stringify(m).slice(0, 500));
  }
})();
