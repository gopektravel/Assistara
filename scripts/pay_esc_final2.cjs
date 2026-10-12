const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(f, 'utf8');
const idx = s.indexOf('replaceAll('&')');
if (idx >= 0) {
  const end = s.indexOf(');', idx);
  const seg = s.slice(idx, end + 2);
  const fixed = seg.replace("replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('\"','\"\"');", "replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('\"','&quot;');");
  s = s.replace(seg, fixed);
  fs.writeFileSync(f, s);
  console.log('paymongo esc fixed');
} else {
  console.log('segment not found at index', idx);
}
