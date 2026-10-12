const fs = require('fs');
function seg(f, a, b) {
  const s = fs.readFileSync('supabase/functions/' + f + '/index.ts', 'utf8');
  const i = s.indexOf(a);
  if (i < 0) return 'NF ' + f + ' :: ' + a;
  const j = s.indexOf(b, i);
  return s.slice(i - 120, j > 0 ? j + b.length : s.length);
}
console.log('=== wf-confirm');
console.log(seg('website-form', "frame('Your application is in", 'ACADEMY,'));
console.log('=== wf-notify');
console.log(seg('website-form', "frame('New application'", 'ACADEMY,'));
console.log('=== gcv-unverified');
console.log(seg('review-gcash-payment', "shell('We could not verify", ')'));
console.log('=== gcv-received');
console.log(seg('review-gcash-payment', "shell('Payment received 🎉'", ')'));
console.log('=== gpay-screenshot');
console.log(seg('admin-gcash-payment', "shell('Quick check on your GCash payment", ')'));
console.log('=== gpay-followup');
console.log(seg('admin-gcash-payment', "shell('Still want to secure your place", ')'));
console.log('=== paymongo');
console.log(seg('paymongo-webhook', 'html:shell("Payment received', '.text?'));
