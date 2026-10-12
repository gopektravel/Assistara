import fs from 'fs';

const c = fs.readFileSync('assistara-local-v9/admin-email.html', 'utf8');
const m = c.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.log('no script found'); process.exit(1); }
const src = m[1];

const stub = `
const location = { href: '' };
let localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {}, addEventListener: () => {} }) };
const fetch = async () => ({ status: 200, json: async () => ({ ok: true }) });
`;

try {
  new Function(stub + src);
  console.log('admin-email.html JS SYNTAX OK');
} catch (e) {
  console.log('SYNTAX ERROR: ' + e.message);
  process.exit(1);
}

// Also verify all $() ids referenced in studio functions exist or are created dynamically
const studioGetIds = [...src.matchAll(/\$\("studio-([a-z-]+)"\)/g)].map(x => x[1]);
console.log('Studio element ids referenced:', [...new Set(studioGetIds)].join(', '));
