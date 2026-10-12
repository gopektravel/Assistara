const fs = require('fs');
const s = fs.readFileSync('supabase/functions/website-form/index.ts', 'utf8');
const i = s.indexOf('You’re in 🎉 See you Sunday');
const j = s.indexOf(';', i);
console.log(JSON.stringify(s.slice(i - 260, j + 1)));
