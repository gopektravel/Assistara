const { execFileSync } = require('child_process');
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
(async () => {
  const tpl = JSON.parse(execFileSync('node', ['scripts/_build_fullprice_tpl.cjs'], { encoding: 'utf8' }));
  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;

  // Save draft (overwrites previous draft for this key)
  const dr = await call('admin-email-templates', { action: 'save_draft', key: tpl.key, subject: tpl.subject, html: tpl.html, text: tpl.text, preview_text: "Welcome to Assistara Academy — your spot is confirmed.", name: 'Application accepted — full price', category: 'transactional', sender_name: 'Assistara Academy', variables: tpl.vars }, T);
  console.log('SAVE DRAFT:', dr.status, JSON.stringify(dr.data).slice(0, 150));

  // Preview — confirm NO XYRA, no discount, price 6,900 only
  const pv = await call('admin-email-templates', { action: 'preview', key: tpl.key, vars: { first_name: 'Pearl', checkout_url: 'https://www.getassistara.com/academy/checkout?token=abc', limit: '15', name: 'Pearl Lacdag' } }, T);
  const pd = pv.data;
  const html = pd.html || '';
  console.log('PREVIEW:', pv.status, '| unresolved:', pd.unresolvedVars?.length ? pd.unresolvedVars.join(',') : 'NONE');
  console.log('  subject:', pd.subject);
  console.log('  XYRA absent:', !html.includes('XYRA'));
  console.log('  6,900 present:', html.includes('6,900'));
  console.log('  3,900 absent:', !html.includes('3,900'));
  console.log('  4,900 absent:', !html.includes('4,900'));
  console.log('  discount absent:', !html.includes('OFF'));

  if (pv.status === 200) {
    // Publish over XYRA version
    const pub = await call('admin-email-templates', { action: 'publish', key: tpl.key, confirm: true, change_summary: 'Restore standard full-price acceptance template; XYRA moved to separate discounted key (kept) or manual entry' }, T);
    console.log('\nPUBLISH:', pub.status, JSON.stringify(pub.data).slice(0, 300));
    const gr = await call('admin-email-templates', { action: 'get', key: tpl.key }, T);
    console.log('After publish: status=', gr.data?.template?.status, 'version=', gr.data?.template?.version, 'subject=', gr.data?.template?.subject);
  }
})();
