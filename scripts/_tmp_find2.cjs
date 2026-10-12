const fs = require('fs');
const s = fs.readFileSync('supabase/functions/website-form/index.ts', 'utf8');
const i = s.indexOf("frame('New application'");
console.log('i=' + i);
console.log(JSON.stringify(s.slice(i - 100, i + 900)));
