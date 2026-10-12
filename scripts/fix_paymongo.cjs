const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(f, 'utf8');
const broken = `.replaceAll('"',""` + `);`;
// Actually build the broken and fixed strings manually
const brokenStr = `.replaceAll('"',"` + `");`;
// Hmm, let's just search for the exact sequence in file
const pos = s.indexOf('replaceAll(\'"\',');
console.log('pos=', pos);
if (pos >= 0) {
  const snippet = s.slice(pos, pos + 80);
  console.log('snippet:', snippet);
  // Replace the exact broken snippet with fixed
  const brokenExact = `.replaceAll('"',"`;
  const fixedExact = `.replaceAll('"',"&quot;`;
  s = s.split(brokenExact).join(fixedExact);
  // Now fix the missing closing quote for the argument: it has `);` after `""` instead of `"&quot;");`
  // After replacing exact broken, we need to fix `");` at end of that segment to `"&quot;");`
  s = s.replace('"&quot;` + `);', '"&quot;` + `");`); // wrong, let's do simple replace of the exact text found
  fs.writeFileSync(f, s);
  console.log('done');
} else {
  console.log('not found replaceAll(\'"\'')
}
