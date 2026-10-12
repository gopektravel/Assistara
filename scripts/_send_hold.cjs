// Accept + send standard full-price acceptance to Pearl and Angelen.
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
const TARGETS = [
  { name: 'Pearl Angelica Lacdag', id: '85722db6-c3f1-4c0b-b1d8-66421fe50e9a', email: 'pearlangelicalacdag147@gmail.com' },
  { name: 'Angelen Saplad', id: 'b68caa95-d14f-46ee-a9bf-7066998cc14e', email: 'angelensaplad@gmail.com' },
];
(async () => {
  const idx = parseInt(process.argv[2] || '0', 10);
  const t = TARGETS[idx];
  if (!t) { console.log('bad index'); process.exit(1); }
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;
  console.log('Sending to', t.name, t.email, 'id=' + t.id);
  const r = await call('admin-applications', { action: 'decision', id: t.id, decision: 'accepted' }, T);
  console.log('RESULT:', r.status, JSON.stringify(r.data));
})();
