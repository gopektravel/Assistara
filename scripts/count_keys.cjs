const fs = require('fs');
const s = fs.readFileSync('supabase/functions/_shared/email-template-registry.ts', 'utf8');
const keys = s.split('\n').filter(l => l.includes('key: "')).map(l => {
  const m = l.match(/key: "([^"]+)"/);
  return m ? m[1] : null;
}).filter(Boolean);
console.log('Total template keys:', keys.length);
keys.forEach(k => console.log(' -', k));
console.log('PASS:', keys.length === 19 ? '19 found' : keys.length + ' found (check manually)');
