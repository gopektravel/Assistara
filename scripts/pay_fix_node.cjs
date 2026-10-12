const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(f, 'utf8');
// The broken concat is near the delivery.send call; just replace the whole text property with a clean version
const bad = "text:`Payment received\\n\\nHi "+(app.name||'there').split(/\\s+/)[0]+',\\n\\nWe received your payment and your place in Assistara Academy is secured.\\n\\nReceipt: '+receipt+'\\n\\nYour next step is to set up your Academy account.\\n\\n'+url,";
const good = "text:'Payment received. See receipt details at ' + url,";
if (s.includes(bad)) {
  s = s.replace(bad, good);
  fs.writeFileSync(f, s);
  console.log('paymongo text fixed');
} else {
  console.log('bad string not found');
  // Show snippet around text:
  const i = s.indexOf('text:`Payment');
  if (i >= 0) console.log('found at', i, ':', s.slice(i, i+120));
}
