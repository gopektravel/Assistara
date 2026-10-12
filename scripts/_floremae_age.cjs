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
  const FLOREMAE = 'e96f69e4-8122-46aa-b223-b1cea1ab3d4b';

  const ans = await call('admin-api', { action: 'answers', ids: [FLOREMAE] }, T);
  console.log('=== FLOREMAE ANSWERS ===');
  console.log(JSON.stringify(ans.data, null, 1));

  const apps = await call('admin-applications', { action: 'list' }, T);
  const all = [...(apps.data?.applications || []), ...(apps.data?.students || [])];
  const f = all.find(x => x.id === FLOREMAE);
  console.log('\n=== FLOREMAE FULL RECORD (selected fields) ===');
  if (f) {
    for (const k of ['name','email','status','decision','admin_notes','notes','next_action','follow_up_at','source','created_at','payment_readiness','weekly_commitment']) {
      if (f[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(f[k])}`);
    }
    // search all string values for age/16/old/minor
    console.log('\n  -- fields containing age/16/minor/old --');
    for (const [k, v] of Object.entries(f)) {
      const s = JSON.stringify(v);
      if (s && /\b(16|minor|age|years? old|guardian)\b/i.test(s)) console.log(`  ${k}: ${s.slice(0,200)}`);
    }
  }
})();
