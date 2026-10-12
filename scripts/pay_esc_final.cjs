const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let lines = fs.readFileSync(f, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('replaceAll')) {
    // Original correct form should have single quotes; fix only if broken
    if (lines[i].includes("replaceAll('&')")) {
      // Not broken
    } else if (lines[i].indexOf("replaceAll('") >= 0) {
      // Check if broken (double quote closing)
      if (lines[i].includes('replaceAll(\'"\',""');')) {
        lines[i] = lines[i].replace("replaceAll('"+"\"'+",\"+\"\")", "replaceAll('\"','&quot;');");
      }
    }
  }
}
fs.writeFileSync(f, lines.join('\n'));
console.log('esc line preserved/verified');
