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
let f = 0;
for (const t of targets) {
  const abs = path.resolve(t);
  const out = path.join(__dirname, 'esb-check.js');
  try {
    // Direct path to installed esbuild binary avoids npx shell quoting issues
    const bin = path.resolve('node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
    const outdir = require('os').tmpdir();
  execFileSync(bin, [abs, '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', '--packages=external', '--outdir=' + outdir, '--log-level=error'], { stdio: 'pipe', windowsVerbatimArguments: true });
    console.log('PASS', t);
  } catch (e) {
    f++;
    const msg = (String(e.stderr || '') + String(e.message || '')).split('\n').filter(x => x.trim() && !x.match(/at /) && !x.match(/^node:/)).slice(0, 6).join(' | ');
    console.log('FAIL', t, '|', msg.slice(0, 200));
  }
}
console.log(f === 0 ? '\nRESULT: ALL PASS (' + targets.length + ')' : '\nRESULT: ' + f + ' FAIL');
process.exit(f ? 1 : 0);
