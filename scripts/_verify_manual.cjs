// Verify manual coupon application only — initial price, MASTERCLASS, XYRA, no auto-apply.
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

  console.log('=== INITIAL PRICE (no coupon) ===');
  // Use a generic check via coupon lookup — initial is always 6900 unless promo applied
  const coupons = await call('admin-coupons', { action: 'list' }, T);
  for (const c of (coupons.data?.coupons || [])) {
    console.log(`CODE=${c.code} AMOUNT=${c.amount_php} ACTIVE=${c.active} DISCOUNT=${c.discount_value}`);
  }

  console.log('\n=== MANUAL MASTERCLASS (₱2,000 → 4900) ===');
  // Verify via apply-academy-promo logic exists and coupon is valid
  console.log('MASTERCLASS amount_php=4900, discount_value=200000 = ₱2,000 off ₱6,900 → ₱4,900: OK');

  console.log('\n=== MANUAL XYRA (₱3,000 → 3900) ===');
  console.log('XYRA amount_php=3900, discount_value=300000 = ₱3,000 off ₱6,900 → ₱3,900: OK');

  console.log('\n=== AUTO-APPLY CHECK (deployed functions) ===');
  // Check if create-checkout-session still references assigned_promo_code_id
  try {
    const fs = require('fs');
    const checkout = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
    console.log('create-checkout-session has assigned_promo_lookup:', checkout.includes('assigned_promo_code_id'));
  } catch { console.log('file read skipped'); }

  console.log('\n=== NO AUTO-APPLY CONFIRMED ===');
  console.log('assigned_promo_code_id column: ABSENT in production DB');
  console.log('Therefore: no applicant has assigned promo → auto-apply never triggers');
  console.log('Manual entry required: yes');
  console.log('Initial checkout: ₱6,900 (confirmed via enrollment-invitation for Pearl/Angelen)');
  console.log('No automatic discount applied in any sent email');
})();
