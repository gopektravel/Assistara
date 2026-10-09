# Insert masterclass admin panel into admin.html before closing </body>
content = open('assistara-local-v9/admin.html', encoding='utf-8').read()

panel = '''
<section id="masterclassAdmin" style="margin-top:28px;padding:22px;background:#fff;border:1px solid #dfdcd5;border-radius:18px;max-width:720px;">
  <h2 style="font-family:Manrope,sans-serif;font-weight:800;font-size:20px;margin:0 0 10px;">Masterclass Event Control</h2>
  <div style="display:grid;gap:8px;font-family:Manrope,sans-serif;font-size:13px;color:#555;">
    <div><b>Event:</b> <span id="mcEventName">founding-masterclass-2026</span></div>
    <div><b>Status:</b> <span id="mcStatus">scheduled</span></div>
    <div><b>Scheduled:</b> <span id="mcScheduled">2026-10-11 18:00 PHT</span></div>
    <div><b>Live destination:</b> <span id="mcDest">/live.html</span> <a href="/live.html" target="_blank">verify →</a></div>
  </div>
  <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
    <button onclick="mcSet('scheduled')" style="padding:10px 18px;font-family:Manrope,sans-serif;font-weight:800;font-size:13px;background:#171717;color:#fff;border:0;border-radius:10px;cursor:pointer;">Scheduled</button>
    <button onclick="mcSet('live')" style="padding:10px 18px;font-family:Manrope,sans-serif;font-weight:800;font-size:13px;background:#ffd51f;color:#151515;border:0;border-radius:10px;cursor:pointer;">Go Live</button>
    <button onclick="mcSet('ended')" style="padding:10px 18px;font-family:Manrope,sans-serif;font-weight:800;font-size:13px;background:#6a655e;color:#fff;border:0;border-radius:10px;cursor:pointer;">End Masterclass</button>
  </div>
  <div id="mcMsg" style="margin-top:10px;font-family:Manrope,sans-serif;font-weight:700;font-size:14px;min-height:20px;"></div>
</section>
<script>
(async function loadMasterclass() {
  try {
    const r = await fetch('https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-status', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',event_key:'founding-masterclass-2026'})});
    const d = await r.json();
    if(d.ok && d.event) {
      document.getElementById('mcStatus').textContent = d.event.status || 'unknown';
      document.getElementById('mcScheduled').textContent = (d.event.scheduled_at ? d.event.scheduled_at.substring(0,19) + ' PHT' : '—');
      document.getElementById('mcDest').textContent = d.event.live_destination_url || '—';
    }
  } catch(e){}
})();
async function mcSet(toStatus) {
  const msg = document.getElementById('mcMsg');
  msg.textContent = 'Confirming...'; msg.style.color = '#6a655e';
  if(!confirm('Change masterclass status to: ' + toStatus + '? This is audited.')) return;
  try {
    const token = sessionStorage.getItem('assistara_admin_token') || '';
    const r = await fetch('https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-status', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'set',event_key:'founding-masterclass-2026',new_status:toStatus,changed_by:'admin'})});
    const d = await r.json();
    msg.textContent = d.ok ? ('Updated to ' + (d.status||toStatus) + (d.changed ? ' (changed)' : ' (no-op)')) : ('Error: ' + (d.error||'unknown'));
    msg.style.color = d.ok ? '#176638' : '#982b2b';
    if(d.ok) loadMasterclass();
  } catch(e){ msg.textContent = 'Network error'; msg.style.color = '#982b2b'; }
}
</script>
'''

content = content.replace('</body>', panel + '</body>')
open('assistara-local-v9/admin.html', 'w', encoding='utf-8').write(content)
print('Admin masterclass panel inserted')
