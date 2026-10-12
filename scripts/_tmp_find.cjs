const fs = require('fs');
function find(f, a) {
  const s = fs.readFileSync('supabase/functions/' + f + '/index.ts', 'utf8');
  const i = s.indexOf(a);
  if (i < 0) { console.log('NF ' + f + ' :: ' + a); return; }
  console.log('=== ' + f);
  console.log(JSON.stringify(s.slice(i - 60, i + 320)));
}
find('website-form', "frame('New application'");
find('paymongo-webhook', "emailType:'academy_payment_receipt'");
