// Sends Group 3 acceptance emails via the production admin-applications decision action.
// usage: node _send_g3.cjs <index>   (index 0..8 into TARGETS)
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
const TARGETS = [
  { name: 'Alexia Guzman Santiago', id: '53f7d7cf-e814-4a5e-8853-f29810bb964f', email: 'alexiaguzman389@gmail.com' },
  { name: 'Rhode Drigce Awitan', id: '7833b099-19e2-40be-9467-bf982703d8f4', email: 'rhodedrigce@gmail.com' },
  { name: 'Lehlee Amor A. McNiven', id: '2e8ab2fe-e08c-44d4-ba59-a90c841e871d', email: 'leealmerino@gmail.com' },
  { name: 'Christine Villaruel', id: '83991efc-d198-4f7a-9d6a-0ae21f86bf31', email: 'christinesuete1010@gmail.com' },
  { name: 'Diarrassouba Saliou', id: '1fd4c738-0568-474d-9fdc-e8db16e2232f', email: 'salioudiarrassoub@gmail.com' },
  { name: 'Jenmark Samaniego Patagan', id: '304cefd2-b8c5-411a-8be0-1664b65df56c', email: 'jenmarkpatagan1181999@gmail.com' },
  { name: 'Hazel Saturay', id: '6319ec97-a9fa-44c9-bbd4-5ab4694dab00', email: 'hazelsaturay@gmail.com' },
  { name: 'Edeza Uayan Yu', id: 'df3c35e7-420d-46e9-9d6f-b58986340c57', email: 'edezayu6@gmail.com' },
  { name: 'Jeramie Matugas', id: '6089325a-5682-43a6-b174-96bc8499bb23', email: 'matugasjeramie2@gmail.com' },
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
