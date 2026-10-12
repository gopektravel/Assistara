import re

with open('supabase/functions/paymongo-webhook/index.ts', encoding='utf-8') as f:
    content = f.read()

# Replace the payload line with gateway-resolved version
old_pattern = r'const payload:any=\{from:FROM,to:\[app\.email\],reply_to:"academy@getassara\.com",subject:`Payment received 🎉 \$\{receipt\} \| Assistara Academy`,html:shell\("Payment received 🎉",body,\{label:"Set up my Academy account",href:url\)\}\}'
new_code = '''const fallback=()=>({subject:`Payment received 🎉 ${receipt} | Assistara Academy`,html:shell("Payment received 🎉",body,{label:"Set up my Academy account",href:url}),text:"",senderName:"",senderEmail:"",replyTo:"academy@getassara.com"});
  const resolved=await resolveEmailTemplate("academy_payment_confirmation",{first_name:first,receipt,amount:money(amount),date,url},fallback);
  const payload:any={from:FROM,to:[app.email],reply_to:resolved.replyTo||"academy@getassara.com",subject:resolved.subject,html:resolved.html};'''

content = re.sub(old_pattern, new_code, content)

with open('supabase/functions/paymongo-webhook/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('PAYMONGO WEBHOOK: gateway integration done')
