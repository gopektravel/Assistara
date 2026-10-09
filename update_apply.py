content = open('assistara-local-v9/academy-apply.html', encoding='utf-8').read()

# Insert sold-out banner before the form-card
soldout = '''
<section id="soldoutSection" class="shell" style="display:none;">
<div style="background:#fff;border:1px solid #dfdcd5;border-radius:30px;padding:48px 34px;box-shadow:0 24px 70px rgba(0,0,0,.08);text-align:center;max-width:700px;margin:auto;">
<h2 style="font-family:Manrope,sans-serif;font-weight:800;font-size:clamp(32px,5vw,48px);letter-spacing:-.055em;margin:0 0 18px;color:#151515;">Oops, our first cohort is full! 🎉</h2>
<p style="font-family:Manrope,sans-serif;font-size:18px;line-height:1.6;color:#6a655e;margin:0 0 14px;max-width:640px;margin-left:auto;margin-right:auto;">All 15 spots for Assistara Academy's first cohort have been taken.</p>
<p style="font-family:Manrope,sans-serif;font-size:18px;line-height:1.6;color:#6a655e;margin:0 0 28px;max-width:640px;margin-left:auto;margin-right:auto;">We'd still love to have you! Join our priority waitlist and we'll let you know as soon as another spot becomes available.</p>
<a href="#waitlistForm" style="display:inline-block;padding:15px 28px;font-family:Manrope,sans-serif;font-weight:800;font-size:16px;background:#171717;color:#fff;text-decoration:none;border-radius:14px;box-shadow:0 6px 20px rgba(23,23,23,.18);">Join the Priority Waitlist</a>
<p style="font-family:Manrope,sans-serif;font-size:13px;color:#9a948c;margin-top:14px;">Free to join. No payment required.</p>
</div>
</section>
'''

content = content.replace('<div class="form-card"', soldout + '<div class="form-card"')

waitlistform = '''
<section id="waitlistForm" class="shell" style="margin-top:24px;display:none;">
<div style="background:#171717;color:#fff;border-radius:30px;padding:42px 34px;max-width:580px;margin:auto;">
<h3 style="font-family:Manrope,sans-serif;font-weight:800;font-size:24px;margin:0 0 10px;">Join the Priority Waitlist</h3>
<p style="font-family:Manrope,sans-serif;font-size:15px;color:#aaa;margin:0 0 20px;line-height:1.5;">Free. No payment. You’ll be the first to know when a spot opens.</p>
<form id="waitlistFormEl" style="display:grid;gap:14px;">
<label style="font-family:Manrope,sans-serif;font-weight:700;font-size:13px;color:#ddd;">Full name <input type="text" id="wlName" required style="width:100%;padding:13px 16px;border-radius:13px;border:1px solid #3a3a3a;background:#242424;color:#fff;font-family:Manrope,sans-serif;font-size:15px;margin-top:6px;" placeholder="Your full name"></label>
<label style="font-family:Manrope,sans-serif;font-weight:700;font-size:13px;color:#ddd;">Email address <input type="email" id="wlEmail" required style="width:100%;padding:13px 16px;border-radius:13px;border:1px solid #3a3a3a;background:#242424;color:#fff;font-family:Manrope,sans-serif;font-size:15px;margin-top:6px;" placeholder="you@email.com"></label>
<label style="font-family:Manrope,sans-serif;font-weight:700;font-size:13px;color:#ddd;display:flex;align-items:center;gap:8px;margin-top:4px;cursor:pointer;"><input type="checkbox" id="wlConsent" required style="width:18px;height:18px;accent-color:#ffd51f;"> I agree to receive notifications about open spots.</label>
<button type="submit" class="btn btn-yellow" style="min-height:54px;font-family:Manrope,sans-serif;font-weight:800;font-size:16px;background:#ffd51f;color:#151515;border:0;border-radius:14px;cursor:pointer;margin-top:4px;">Join the Priority Waitlist →</button>
<div id="wlMsg" style="font-family:Manrope,sans-serif;font-size:14px;font-weight:700;min-height:24px;margin-top:4px;"></div>
</form>
</div>
</section>
'''

# Insert waitlist form before closing body
content = content.replace('</body>', waitlistform + '</body>')

# Inject a lightweight capacity check script
check_script = '''
<script>
(async function(){
  try {
    const r = await fetch('/academy-check-capacity', {method:'GET', headers:{'Accept':'application/json'}});
    const d = await r.json();
    if (d && d.ok && d.full) {
      document.getElementById('soldoutSection') && (document.getElementById('soldoutSection').style.display='block');
      document.getElementById('waitlistForm') && (document.getElementById('waitlistForm').style.display='block');
      const form = document.querySelector('.form-card');
      if (form) form.style.display = 'none';
    } else {
      document.getElementById('waitlistForm') && (document.getElementById('waitlistForm').style.display='none');
      document.getElementById('soldoutSection') && (document.getElementById('soldoutSection').style.display='none');
    }
  } catch (e) { console.error('Capacity check failed', e); }
})();
</script>
'''
content = content.replace('</body>', check_script + '</body>')

# Add waitlist handler script
wl_script = '''
<script>
(function(){
  const f = document.getElementById('waitlistFormEl');
  if (!f) return;
  f.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Joining…';
    try {
      const r = await fetch('https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/join-academy-waitlist', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: document.getElementById('wlEmail').value.trim(), name: document.getElementById('wlName').value.trim(), cohort_code: 'founding-2026', source: 'academy_apply_soldout' })
      });
      const d = await r.json();
      const msg = document.getElementById('wlMsg');
      msg.textContent = d && d.ok ? (d.already ? 'You are already on the priority waitlist!' : 'Joined the priority waitlist! We will contact you when a spot opens.') : 'Could not join. Please try again.';
      msg.style.color = d && d.ok ? '#87d6a7' : '#f0a0a0';
    } catch (ex) {
      document.getElementById('wlMsg').textContent = 'Network error. Please try again.';
      document.getElementById('wlMsg').style.color = '#f0a0a0';
    }
    btn.disabled = false; btn.textContent = 'Join the Priority Waitlist →';
  });
})();
</script>
'''
content = content.replace(check_script, check_script + wl_script)

open('assistara-local-v9/academy-apply.html','w',encoding='utf-8').write(content)
print('updated academy-apply')
