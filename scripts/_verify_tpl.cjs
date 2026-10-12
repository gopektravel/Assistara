const BASE = 'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1';
const H0 = { 'Content-Type': 'application/json', 'Origin': 'https://www.getassistara.com' };
(async () => {
  const login = await (await fetch(BASE + '/admin-api', { method: 'POST', headers: H0, body: JSON.stringify({ action: 'login', username: 'admin', password: 'ILoveYou!Assistara26' }) })).json();
  const T = login.token;
  const r = await fetch(BASE + '/admin-email-templates', {
    method: 'POST', headers: { ...H0, Authorization: 'Bearer ' + T },
    body: JSON.stringify({ action: 'preview', key: 'academy_application_accepted', vars: { first_name: 'Alexia', checkout_url: 'https://www.getassistara.com/academy/checkout?token=abc', limit: '15', name: 'Alexia Guzman Santiago' } })
  });
  const d = await r.json();
  const h = d.html || '';
  console.log('XYRA:', h.includes('XYRA'));
  console.log('8369;3,000:', h.includes('&#8369;3,000'));
  console.log('8369;6,900:', h.includes('&#8369;6,900'));
  console.log('8369;3,900:', h.includes('&#8369;3,900'));
  console.log('only 15 spots:', h.includes('only 15 spots'));
  console.log('Hi Alexia:', h.includes('Hi Alexia,'));
  console.log('checkout href:', h.includes('https://www.getassistara.com/academy/checkout?token=abc'));
  console.log('subject:', d.subject);
  console.log('unresolved:', JSON.stringify(d.unresolvedVars));
})();
