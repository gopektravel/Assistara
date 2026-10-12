// Read-only production survey via admin API (same workflow as before).
// No writes, no emails sent.
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };

async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}

const NAMES = ['Alexia Guzman Santiago','Rhode Drigce Awitan','Lehlee Amor A. McNiven','Christine Villaruel','Diarrassouba Saliou','Jenmark Samaniego Patagan','Hazel Saturay','Edeza Uayan Yu','Jeramie Matugas'];
const DO_NOT_EMAIL = ['Pearl Angelica Lacdag','Angelen Saplad','Floremae M. Abejo'];
const PRIOR = ['adajarsteph11@gmail.com','cristyulanday03@gmail.com','pagilagangelica@gmail.com','maraganairesh87@gmail.com','smart.ice.fspring24@gmail.com','apolitoedward08@gmail.com'];
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  console.log('LOGIN:', login.status, login.data?.token ? 'token ok' : JSON.stringify(login.data).slice(0, 200));
  if (!login.data?.token) return;
  const T = login.data.token;

  const coupons = await call('admin-coupons', { action: 'list' }, T);
  console.log('\n=== COUPONS ===', coupons.status);
  const list = coupons.data?.coupons || coupons.data?.items || coupons.data?.codes || (Array.isArray(coupons.data) ? coupons.data : null);
  if (Array.isArray(list)) {
    for (const c of list) console.log(JSON.stringify(c).slice(0, 500));
  } else {
    console.log('shape:', JSON.stringify(coupons.data).slice(0, 800));
    // try get by code
    for (const code of ['XYRA', 'MASTERCLASS']) {
      const g = await call('admin-coupons', { action: 'get', code }, T);
      console.log(`GET ${code}:`, g.status, JSON.stringify(g.data).slice(0, 800));
    }
  }

  const apps = await call('admin-applications', { action: 'list' }, T);
  console.log('\n=== APPLICATIONS ===', apps.status);
  if (apps.data?.ok) {
    const all = [...(apps.data.applications || []), ...(apps.data.students || [])];
    console.log('applicants:', (apps.data.applications || []).length, 'students:', (apps.data.students || []).length,
      '| assigned_promo_code_id column present:', all.length ? ('assigned_promo_code_id' in all[0]) : 'n/a');
    if (all.length) console.log('sample keys:', Object.keys(all[0]).join(','));

    console.log('\n--- TARGETS ---');
    for (const n of NAMES) {
      const a = all.find(x => norm(x.name) === norm(n)) || all.find(x => norm(x.name).includes(norm(n)) || norm(n).includes(norm(x.name)));
      console.log(a ? `${n} | id=${a.id} | ${a.email} | decision=${a.decision} | status=${a.status} | payment=${a.payment_status} | accepted_at=${a.accepted_at} | token=${a.enrollment_token ? 'yes' : 'NO'} | promo=${a.assigned_promo_code_id || a.promo_code || 'none'}`
        : `MISSING: ${n}`);
    }
    console.log('\n--- DO NOT EMAIL ---');
    for (const n of DO_NOT_EMAIL) {
      const a = all.find(x => norm(x.name) === norm(n)) || all.find(x => norm(x.name).includes(norm(n)));
      console.log(a ? `${n} | id=${a.id} | decision=${a.decision} | status=${a.status} | accepted_at=${a.accepted_at || '-'}` : `not found: ${n}`);
    }
    console.log('\n--- PRIOR GROUP 1/2 ---');
    for (const e of PRIOR) {
      const a = all.find(x => x.email === e);
      console.log(a ? `${e} | decision=${a.decision} | status=${a.status} | accepted_at=${a.accepted_at} | promo=${a.assigned_promo_code_id || a.promo_code || 'none'}` : `NOT FOUND: ${e}`);
    }
    console.log('\n--- CAPACITY ---', JSON.stringify(apps.data.capacity));
  } else console.log('err:', JSON.stringify(apps.data).slice(0, 300));

  const act = await call('admin-email', { action: 'activity', limit: 200 }, T);
  console.log('\n=== DELIVERY ACTIVITY ===', act.status, JSON.stringify(act.data).slice(0, 1200));
})();
