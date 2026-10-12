const fs = require('fs');
const f = 'supabase/functions/admin-academy-capacity/index.ts';
const s = fs.readFileSync(f, 'utf8');
const i = s.indexOf('A seat just opened');
const j = s.indexOf('recipientId', i);
const k = s.indexOf(';', j);
console.log(JSON.stringify(s.slice(i - 40, k + 1)));
