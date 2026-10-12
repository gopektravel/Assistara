// Syntax check: bundle every touched Edge Function with the esbuild CLI.
// Catches syntax errors and unresolved relative imports without needing Deno.
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

const targets = [
  'supabase/functions/_shared/email-templates.ts',
  'supabase/functions/_shared/email-template-registry.ts',
  'supabase/functions/admin-email-templates/index.ts',
  'supabase/functions/admin-applications/index.ts',
  'supabase/functions/admin-send-onboarding/index.ts',
  'supabase/functions/admin-academy-capacity/index.ts',
  'supabase/functions/admin-gcash-payment/index.ts',
  'supabase/functions/review-gcash-payment/index.ts',
  'supabase/functions/payment-complete/index.ts',
  'supabase/functions/paymongo-webhook/index.ts',
  'supabase/functions/website-form/index.ts',
  'supabase/functions/masterclass-reminder/index.ts',
];

const out = path.join(os.tmpdir(), 'esb-check.js');
const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';
let failed = 0;

for (const t of targets) {
  const cmd = [
    'npx --yes esbuild@0.28.2',
    q(path.resolve(t)),
    '--bundle',
    '--format=esm',
    '--platform=neutral',
    '--target=es2022',
    '--packages=external',
    '--outfile=' + q(out),
    '--log-level=error',
  ].join(' ');
  try {
    execFileSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'], shell: true, cwd: __dirname + '/..' });
    console.log('OK   ' + t);
  } catch (e) {
    failed++;
    console.log('FAIL ' + t);
    const msg = String((e && e.stderr) || (e && e.message) || e).split('\n').filter((l) => l.trim() && !l.includes('at ') && !l.includes('node:child_process')).slice(0, 14).join('\n');
    console.log('     ' + msg.replace(/\n/g, '\n     '));
  }
}
console.log('\n' + (failed ? failed + ' file(s) failed' : 'all ' + targets.length + ' files parse cleanly'));
process.exit(failed ? 1 : 0);
