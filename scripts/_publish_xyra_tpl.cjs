// Publishes the XYRA acceptance template under academy_application_accepted.
// Read-only until the publish step. Verifies validation before publishing.
const { execFileSync } = require('child_process');
const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
async function call(fn, body, token) {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { ...H0, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, data: j };
}
(async () => {
  const tpl = JSON.parse(execFileSync('node', ['scripts/_build_xyra_tpl.cjs'], { encoding: 'utf8' }));

  const login = await call('admin-api', { action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' });
  const T = login.data?.token;
  console.log('LOGIN:', login.status, T ? 'ok' : JSON.stringify(login.data).slice(0, 200));
  if (!T) return;

  // Save draft (registers variables)
  const dr = await call('admin-email-templates', {
    action: 'save_draft', key: tpl.key, subject: tpl.subject, html: tpl.html, text: tpl.text,
    preview_text: "You've been accepted — plus a ₱3,000 welcome gift inside.",
    name: 'Application accepted — XYRA (₱3,000 off)', category: 'transactional',
    sender_name: 'Xyra & the Assistara Team', variables: tpl.vars
  }, T);
  console.log('SAVE DRAFT:', dr.status, JSON.stringify(dr.data).slice(0, 200));

  // Preview to confirm vars resolve
  const pv = await call('admin-email-templates', { action: 'preview', key: tpl.key, vars: { first_name: 'Alexia', checkout_url: 'https://www.getassistara.com/academy/checkout?token=abc', limit: '15', name: 'Alexia Guzman Santiago' } }, T);
  const pd = pv.data;
  console.log('PREVIEW:', pv.status, '| unresolved:', pd.unresolvedVars?.length ? pd.unresolvedVars.join(',') : 'NONE');
  console.log('  first name rendered:', pd.html?.includes('Hi Alexia,') ? 'YES' : 'NO');
  console.log('  XYRA present:', pd.html?.includes('XYRA') ? 'YES' : 'NO');
  console.log('  ₱3,000 present:', pd.html?.includes('₱3,000') ? 'YES' : 'NO');
  console.log('  ₱3,900 present:', pd.html?.includes('₱3,900') ? 'YES' : 'NO');
  console.log('  ₱6,900 present:', pd.html?.includes('₱6,900') ? 'YES' : 'NO');
  console.log('  limit rendered:', pd.html?.includes('only 15 spots') ? 'YES' : 'NO');
  console.log('  subject:', pd.subject);

  // Check publish-validation rules locally against the draft content
  const all = `${tpl.subject}\n${tpl.html}`;
  const required = ['first_name', 'checkout_url', 'limit'];
  const checks = {
    'subject non-empty': !!tpl.subject?.trim(),
    'has <body>': /<body[\s>]/i.test(tpl.html),
    'has </body>': /<\/body>/i.test(tpl.html),
    'no <script>': !/<script[\s>]/i.test(tpl.html),
    'no javascript:': !/javascript:/i.test(tpl.html),
    'text non-empty': !!tpl.text?.trim(),
  };
  for (const v of required) checks[`{{${v}}} present`] = new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`).test(all);
  const imgs = [...tpl.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  checks['all images absolute https'] = imgs.every(s => /^https:\/\//i.test(s));
  checks['only official logo'] = imgs.every(s => s.includes('getassistara.com/assistara-logo'));
  console.log('\nVALIDATION:');
  let allPass = true;
  for (const [k, v] of Object.entries(checks)) { if (!v) allPass = false; console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`); }

  if (!allPass) { console.log('ABORT: validation fails, not publishing'); return; }

  // Publish
  const pub = await call('admin-email-templates', { action: 'publish', key: tpl.key, confirm: true, change_summary: 'Group 3 XYRA acceptance (₱3,000 off)' }, T);
  console.log('\nPUBLISH:', pub.status, JSON.stringify(pub.data).slice(0, 400));

  // Verify published
  const gr = await call('admin-email-templates', { action: 'get', key: tpl.key }, T);
  const gt = gr.data?.template;
  console.log('After publish: status =', gt?.status, '| version =', gt?.version, '| published_at =', gt?.published_at);
})();
