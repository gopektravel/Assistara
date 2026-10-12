const fs = require('fs');
const full = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(full, 'utf8');
const anchor = "  const delivery=await createEmailDelivery('paymongo-webhook');";

if (s.includes('pmTpl=await resolveEmailTemplate')) {
  console.log('ALREADY PATCHED');
  process.exit(0);
}
if (!s.includes(anchor)) { console.log('ANCHOR NOT FOUND'); process.exit(1); }

// Build the insertion text with normal JS escaping.
const firstExpr = "(app.name||'there').split(/\\s+/)[0]";
const amountExpr = "amount.toLocaleString('en-PH',{minimumFractionDigits:2})";
const textPart =
  "'Payment received\\n\\nHi '+" + firstExpr + "+','" +
  "\\n\\nWe received your payment and your place in Assistara Academy is secured." +
  "\\n\\nReceipt: '+receipt+" +
  "'\\n\\nYour next step is to set up your Academy account.\\n\\n'+url";

const insertion =
  "\n  const pmTpl=await resolveEmailTemplate('academy_payment_confirmation',{" +
  "first_name:" + firstExpr + "," +
  "name:app.name," +
  "receipt_number:receipt," +
  "amount:" + amountExpr + "," +
  "currency:'PHP'," +
  "payment_method:'QR Ph via PayMongo'," +
  "date:new Date(paidAt).toLocaleString('en-PH',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Manila'})," +
  "onboarding_url:url}," +
  "()=>({subject:'Payment received '+receipt+' | Assistara Academy'," +
  "html:shell('Payment received',body,{label:'Set up my Academy account',href:url})," +
  "text:" + textPart + "," +
  "senderName:'Assistara Academy'}));" +
  "\n  const pmSubject=pmTpl.subject,pmHtml=pmTpl.html,pmText=pmTpl.text;";

s = s.replace(anchor, anchor + insertion);

// Remove the duplicate definition the earlier patch added right before payload.
s = s.split('const pmSubject=pmTpl.subject,pmHtml=pmTpl.html,pmText=pmTpl.text;const payload:any=').join('const payload:any=');

fs.writeFileSync(full, s);
console.log('PATCHED pmTpl definition');
console.log('pmTpl refs: ' + (s.match(/pmTpl/g) || []).length);
console.log('pmSubject refs: ' + (s.match(/pmSubject/g) || []).length);
