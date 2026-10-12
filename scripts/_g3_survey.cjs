// Read-only production state survey for the Group 3 acceptance send.
// No writes, no emails. Verifies coupons, applicants, history, capacity.
const fs = require('fs');

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv('.vercel/.env.production.local');
const URL_BASE = (env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function q(path) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) return { error: `${r.status} ${JSON.stringify(json).slice(0, 300)}` };
  return { data: json };
}

const NAMES = [
  'Alexia Guzman Santiago',
  'Rhode Drigce Awitan',
  'Lehlee Amor A. McNiven',
  'Christine Villaruel',
  'Diarrassouba Saliou',
  'Jenmark Samaniego Patagan',
  'Hazel Saturay',
  'Edeza Uayan Yu',
  'Jeramie Matugas',
];
const DO_NOT_EMAIL = ['Pearl Angelica Lacdag', 'Angelen Saplad', 'Floremae M. Abejo'];
const PRIOR = [
  'adajarsteph11@gmail.com', 'cristyulanday03@gmail.com', 'pagilagangelica@gmail.com',
  'maraganairesh87@gmail.com', 'smart.ice.fspring24@gmail.com', 'apolitoedward08@gmail.com',
];

async function run() {
  console.log('=== 1. PROXY CHECK ===');
  console.log('SUPABASE_URL:', URL_BASE);

  console.log('\n=== 2. PROMO CODES ===');
  const promo = await q('academy_promo_codes?select=*&order=created_at.asc');
  if (promo.error) console.log('ERROR:', promo.error);
  else for (const p of promo.data) console.log(JSON.stringify({
    code: p.code, amount_php: p.amount_php, discount_type: p.discount_type, discount_value: p.discount_value,
    active: p.active, expires_at: p.expires_at, max_redemptions: p.max_redemptions,
    max_redemptions_per_customer: p.max_redemptions_per_customer, id: p.id
  }));

  console.log('\n=== 3. TARGET APPLICANTS (by email list build) ===');
  // find applicants matching the 9 names via ilike on name
  const orFilter = NAMES.map(n => `name.ilike.*${encodeURIComponent(n.split(' ')[1] || n)}*`);
  const apps = await q(`academy_applications?select=*&order=created_at.asc&limit=500`);
  if (apps.error) { console.log('ERROR:', apps.error); return; }

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const find = n => apps.data.find(a => norm(a.name) === norm(n)) ||
    apps.data.find(a => norm(a.name).includes(norm(n)) || norm(n).includes(norm(a.name)));

  console.log('total applications in prod:', apps.data.length);
  for (const n of NAMES) {
    const a = find(n);
    if (!a) { console.log(`MISSING: ${n}`); continue; }
    console.log(`FOUND: ${n} -> id=${a.id} email=${a.email} name="${a.name}" decision=${a.decision} status=${a.status} payment=${a.payment_status} accepted_at=${a.accepted_at} token=${a.enrollment_token ? 'yes' : 'NO'} assigned_promo=${a.assigned_promo_code_id || 'none'(a.assigned_promo_code_id === undefined ? ' (column missing?)' : '')}`);
  }

  console.log('\n=== 4. DO NOT EMAIL LIST ===');
  for (const n of DO_NOT_EMAIL) {
    const a = find(n);
    console.log(`${n}: ${a ? `id=${a.id} decision=${a.decision} status=${a.status} email=${a.email}` : 'NOT FOUND'}`);
  }

  console.log('\n=== 5. PRIOR GROUPS 1+2 (must remain untouched) ===');
  for (const e of PRIOR) {
    const a = apps.data.find(x => x.email === e);
    console.log(`${e}: ${a ? `decision=${a.decision} status=${a.status} accepted_at=${a.accepted_at} assigned_promo=${a.assigned_promo_code_id || 'none'}` : 'NOT FOUND'}`);
  }

  console.log('\n=== 6. EMAIL DELIVERY HISTORY (academy_acceptance) ===');
  const log = await q(`email_delivery_log?select=id,recipient_email,subject,email_type,status,provider,provider_message_id,created_at&order=created_at.desc&limit=200`);
  if (log.error) console.log('ERROR:', log.error);
  else {
    const acceptance = log.data.filter(r => (r.email_type || '').includes('accept') || (r.subject || '').includes('You'));
    for (const r of acceptance) console.log(JSON.stringify(r));
    console.log('total rows in window:', log.data.length);
  }

  console.log('\n=== 7. CAPACITY ===');
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/academy_capacity_overview`, {
      method: 'POST', headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    console.log(r.status, JSON.stringify(await r.json()).slice(0, 600));
  } catch (e) { console.log('capacity error', e.message); }

  console.log('\n=== 8. ADMIN ACTIVITY (recent decision actions) ===');
  const act = await q('admin_activity_log?select=created_at,entity_id,action,details&order=created_at.desc&limit=60');
  if (act.error) console.log('ERROR:', act.error);
  else for (const r of act.data.filter(r => (r.action || '').includes('decision') || (r.action || '').includes('email'))) {
    console.log(`${r.created_at} ${r.action} ${r.entity_id} ${JSON.stringify(r.details).slice(0, 200)}`);
  }
}

run();
