const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(f, 'utf8');
// Find start of broken text property in delivery.send call
const marker = "text:`Payment received";
const i = s.indexOf(marker);
if (i >= 0) {
  // Find end of property (next comma at same nesting level — just find the next , after the closing backtick)
  // Simplest: find next occurrence of ",replyTo:" which comes right after text in delivery.send
  const end = s.indexOf(',replyTo:', i);
  if (end > i) {
    s = s.slice(0, i) + "text:'Payment received. See full receipt at ' + url," + s.slice(end);
    fs.writeFileSync(f, s);
    console.log('paymongo fixed (replaced text property)');
  } else {
    console.log('end marker not found');
  }
} else {
  console.log('marker not found');
}
