const fs = require('fs');
const f = 'supabase/functions/paymongo-webhook/index.ts';
let s = fs.readFileSync(f, 'utf8');
const lines = s.split('\n');
const line = lines[14];
const left = ".replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('"';
// Actually let's just use indexOf with substring pieces
const a = '.replaceAll(\'"\',""');';
// Build a by concatenating pieces that don't include the closing
const part1 = '.replaceAll(\'"\',"';
const part2 = '\"\"');';
const fullBad = part1 + part2;
if (line.indexOf(fullBad) >= 0) {
  const fixed = line.replace(fullBad, ".replaceAll('"','&quot;');");
  lines[14] = fixed;
  fs.writeFileSync(f, lines.join('\n'));
  console.log('paymongo fixed');
} else {
  console.log('bad substring not found; line begins with:', line.slice(0,60));
}
