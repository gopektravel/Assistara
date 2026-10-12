// Definitive compilation check: direct esbuild binary, no shell quoting issues.
const { execFileSync } = require('child_process');
const path = require('path');

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

const bin = path.resolve('node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
const outdir = path.resolve('node_modules', '.cache', 'esbuild-check');
require('fs').mkdirSync(outdir, { recursive: true });

let pass = 0, fail = 0;
const results = [];

for (const t of targets) {
  const abs = path.resolve(t);
  const outfile = path.join(outdir, t.replace(/[\/\\]/g, '_') + '.js');
  try {
    // No shell: true — direct binary invocation avoids Windows path-space splitting
    execFileSync(bin, [
      abs,
      '--bundle',
      '--format=esm',
      '--platform=neutral',
      '--target=es2022',
      '--packages=external',
      '--outfile=' + outfile,
      '--log-level=error',
    ], { stdio: 'pipe' });
    results.push(['PASS', t, '']);
    pass++;
  } catch (e) {
    const msg = String(e.stderr || e.message || '').split('\n')
      .filter(l => l.trim() && !l.match(/at /) && !l.match(/^node:/))
      .slice(0, 4).join(' | ');
    results.push(['FAIL', t, msg]);
    fail++;
  }
}

console.log('\n=== COMPILATION RESULTS ===');
for (const [status, file, err] of results) {
  console.log(status.padEnd(5) + file + (err ? '\n      ' + err : ''));
}
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
