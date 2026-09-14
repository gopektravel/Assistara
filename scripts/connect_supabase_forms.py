from pathlib import Path
import re

ENDPOINT = "https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/submit-lead"
ROOT = Path("assistara-local-v9")

# B2B form
p = ROOT / "app.js"
s = p.read_text()
old_endpoint = "const LEAD_ENDPOINT='https://script.google.com/macros/s/AKfycbzrCdpuv2z7BGYEIKOJjDx6V6pzOatdtnQ_xFl6fH8NITuJTmbPuNQtI7gux1EU7-rl/exec';"
if old_endpoint in s:
    s = s.replace(old_endpoint, f"const LEAD_ENDPOINT='{ENDPOINT}';", 1)
old_fetch = "      await fetch(LEAD_ENDPOINT,{method:'POST',mode:'no-cors',body:payload});"
new_fetch = "      const response=await fetch(LEAD_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'b2b',name:fd.get('name')||'',email:fd.get('email')||'',company:fd.get('company')||'',time_thieves:fd.get('tasks')||'',support_level:fd.get('hours')||'Not sure yet'})});\n      if(!response.ok)throw new Error('Submission failed');"
if old_fetch in s:
    s = s.replace(old_fetch, new_fetch, 1)
p.write_text(s)

# Masterclass form
p = ROOT / "academy.html"
s = p.read_text()
pattern = re.compile(r"<script>\s*\(\(\)=>\{const form=document\.getElementById\('masterclassForm'\).*?</script>", re.S)
replacement = f'''<script>
(()=>{{const form=document.getElementById('masterclassForm'),success=document.getElementById('masterclassSuccess');if(!form||!success)return;const button=form.querySelector('button[type="submit"]');form.addEventListener('submit',async event=>{{event.preventDefault();const data=new FormData(form);const original=button.textContent;button.textContent='Saving your seat…';button.disabled=true;success.classList.remove('show','error');try{{const response=await fetch('{ENDPOINT}',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{type:'masterclass',name:data.get('name')||'',email:data.get('email')||''}})}});if(!response.ok)throw new Error('Submission failed');form.reset();button.textContent='Seat saved ✓';success.textContent='You’re on the list. Check your inbox for the next steps.';success.classList.add('show')}}catch(error){{button.textContent=original;button.disabled=false;success.textContent='Something went wrong. Please try again.';success.classList.add('show','error')}}}})}})();
</script>'''
if "script.google.com/macros" in s and "masterclassForm" in s:
    s, n = pattern.subn(replacement, s, count=1)
    if n != 1:
        raise RuntimeError(f"Masterclass handler replacement count: {n}")
p.write_text(s)

# Academy application
p = ROOT / "academy-apply.html"
s = p.read_text()
pattern = re.compile(r"<script>\s*\(\(\)=>\{const form=document\.getElementById\('applicationForm'\).*?</script>", re.S)
replacement = f'''<script>
(()=>{{const form=document.getElementById('applicationForm'),wrap=document.getElementById('applicationFormWrap'),success=document.getElementById('success');if(!form)return;form.addEventListener('submit',async e=>{{e.preventDefault();const button=form.querySelector('button[type="submit"]');const original=button.textContent;button.disabled=true;button.textContent='Submitting…';const fd=new FormData(form);try{{const response=await fetch('{ENDPOINT}',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{type:'academy',name:fd.get('name')||'',email:fd.get('email')||'',current_situation:fd.get('situation')||'',why_remote_work:fd.get('goal')||'',what_tried:fd.get('tried')||'',biggest_obstacle:fd.get('obstacle')||'',remote_work_interest:fd.get('direction')||'',weekly_commitment:fd.get('commitment')||'',payment_readiness:fd.get('paymentReadiness')||''}})}});if(!response.ok)throw new Error('Submission failed');wrap.style.display='none';success.classList.add('show');window.scrollTo({{top:0,behavior:'smooth'}})}}catch(err){{button.disabled=false;button.textContent=original;alert('Something went wrong. Please try again.')}}}})}})();
</script>'''
if "script.google.com/macros" in s and "applicationForm" in s:
    s, n = pattern.subn(replacement, s, count=1)
    if n != 1:
        raise RuntimeError(f"Academy handler replacement count: {n}")
p.write_text(s)

print("Assistara forms connected to Supabase")
