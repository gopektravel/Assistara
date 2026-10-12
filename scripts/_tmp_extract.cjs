const fs = require('fs');
function slice(f, a, b) {
  const s = fs.readFileSync('supabase/functions/' + f + '/index.ts', 'utf8');
  const i = s.indexOf(a);
  if (i < 0) return 'NF:' + a;
  const j = s.indexOf(b, i);
  return s.slice(i, j > 0 ? j : s.length);
}
const out = {
  wf_confirm: slice('website-form', "frame('Your application is in", 'ACADEMY,'),
  wf_notify: slice('website-form', "frame('New application'", 'details'),
  wf_mc: slice('website-form', "frame('FREE LIVE MASTERCLASS'", 'gcal'),
  gcv_unverified: slice('review-gcash-payment', "shell('We could not verify", 'for (const k'),
  gcv_received: slice('review-gcash-payment', "shell('Payment received", 'for (const k'),
  gcv_review_other: slice('review-gcash-payment', "const first = esc((app.name", 'const sent'),
  gpay_screenshot: slice('admin-gcash-payment', "shell('Quick check on your GCash payment", 'for ()'),
  gpay_followup: slice('admin-gcash-payment', "shell('Still want to secure your place", 'for ()'),
};
fs.writeFileSync('C:/Users/jesse/AppData/Local/Temp/opencode/extra-emails.txt', JSON.stringify(out, null, 1));
console.log('ok');
