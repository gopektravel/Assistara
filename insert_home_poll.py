content = open('assistara-local-v9/index.html', encoding='utf-8').read()
script = '''<script id="homeLivePoll">
(function(){
  const banner = document.getElementById('homeLiveBanner');
  if(!banner) return;
  let last = null;
  async function poll(){
    try{
      const r = await fetch('https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-status', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'read', event_key:'founding-masterclass-2026'})});
      const d = await r.json();
      if(d && d.ok && d.event && d.event.status === 'live'){
        if(last !== 'live'){ banner.style.display = 'block'; last = 'live'; }
      } else {
        if(last !== 'other'){ banner.style.display = 'none'; last = 'other'; }
      }
    } catch(e){ console.error('Live poll error', e); }
  }
  poll();
  setInterval(poll, 30000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) poll(); });
})();
</script>
'''
content = content.replace('</body>', script + '</body>')
open('assistara-local-v9/index.html','w',encoding='utf-8').write(content)
print('index.html live poll inserted')
