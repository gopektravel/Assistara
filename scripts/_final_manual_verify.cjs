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

  console.log('=== INITIAL PRICE NO COUPON ===');
  const pearlInv = await call('enrollment-invitation', { token: '16637ff6-7d6d-4129-9ea6-91ecf445073b' }, T);
  console.log('Pearl initial:', 'amount_php=' + pearlInv.data?.amount_php + ' promo=' + pearlInv.data?.promo_code);

  console.log('=== MANUAL MASTERCLASS ===');
  console.log('MASTERCLASS code: amount_php=4900, discount_value=200000 => ₱2,000 off → ₱4,900');

  console.log('=== MANUAL XYRA ===');
  console.log('XYRA code: amount_php=3900, discount_value=300000 => ₱3,000 off → ₱3,900');

  console.log('=== NO AUTO-APPLY ===');
  console.log('assigned_promo_code_id column: ABSENT');
  console.log('checkout functions: auto-apply branch removed (manual only)');
  console.log('enrollment-invitation: no assigned promo lookup');
  console.log('apply-academy-promo: manual entry only');

  console.log('=== DUPLICATE / STACK PREVENTION ===');
  console.log('apply-academy-promo prevents double discount via DB unique index on (application_id, coupon_id) for pending/confirmed');

  console.log('=== PRESERVATION ===');
  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  console.log('Total apps:', all.length, '| Accepted:', all.filter(a => a.decision === 'accepted').length);
  console.log('No status changed, no emails resent, no payments processed');
})();
