import re

with open('supabase/functions/website-form/index.ts', encoding='utf-8') as f:
    content = f.read()

# Add gateway import if not already present
if 'resolveEmailTemplate' not in content:
    content = content.replace(
        'import "jsr:@supabase/functions-js/edge-runtime.d.ts";',
        'import "jsr:@supabase/functions-js/edge-runtime.d.ts";\nimport { resolveEmailTemplate } from "../_shared/email-templates.ts";'
    )

# Replace the mail function to use gateway
old_mail = r'async function mail\(to:string,subject:string,html:string,reply:string,key:string\)\{[^}]+\}'
new_mail = '''async function mail(to:string,subject:string,html:string,reply:string,key:string){
  const fallback=()=>({subject,html,text:"",senderName:"",senderEmail:"",replyTo:reply});
  const resolved=await resolveEmailTemplate(key,{},fallback);
  const B=Deno.env.get('BREVO_API_KEY')||'';
  const brevo=async()=>{if(!B)throw Error('BREVO_API_KEY missing');const m=FROM.match(/^\\s*(.*?)\\s*<([^>]+)>\\s*$/);const sender=m?{name:m[1].trim(),email:m[2].trim()}:{email:FROM};const x=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':B},body:JSON.stringify({sender,to:[{email:to}],replyTo:{email:reply},subject:resolved.subject,htmlContent:resolved.html})});if(!x.ok)throw Error('Brevo email failed '+x.status);console.log('email provider brevo',key);return true};
  if(!R)return brevo();
  let r;try{r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${R}`,'Idempotency-Key':key},body:JSON.stringify({from:FROM,to:[to],reply_to:reply,subject:resolved.subject,html:resolved.html})})}catch(e){throw e}
  if(r.ok){console.log('email provider resend',key);return true}
  const body=await r.text().catch(()=> '');let name='';try{name=JSON.parse(body)?.name||''}catch{}
  if(r.status!==429)throw Error('Resend email failed '+r.status+(name?' ('+name+')':''));
  console.warn('resend limited ('+(name||'429')+'); falling back to brevo',key);return brevo();
}'''

content = re.sub(old_mail, new_mail, content)

with open('supabase/functions/website-form/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('WEBSITE-FORM: gateway integration done')
