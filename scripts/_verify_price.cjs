const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function inv(token) {
  const r = await fetch(`${BASE}/enrollment-invitation`, { method: 'POST', headers: H0, body: JSON.stringify({ token }) });
  return { status: r.status, data: await r.json() };
}
(async () => {
  const Pearl = '16637ff6-7d6d-4129-9ea6-91ecf445073b';
  const Angelen = '95707796-410f-442b-ab19-79e15e40a631';
  for (const [label, token] of [['Pearl', Pearl], ['Angelen', Angelen]]) {
    const r = await inv(token);
    const d = r.data || {};
    console.log(`${label}: status=${r.status} amount_php=${d.amount_php} checkout_amount_php=${d.checkout_amount_php} promo_code=${d.promo_code} auto_applied=${d.auto_applied} offer_unavailable=${d.offer_unavailable} regular_amount_php=${d.regular_amount_php}`);
  }
})();
