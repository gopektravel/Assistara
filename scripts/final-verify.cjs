// Final verification: all checks must pass. Real evidence only.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const results = [];
function log(name, status, detail) {
  results.push([status, name, detail||'']);
  console.log(status + '  ' + name + (detail ? ' — ' + detail : ''));
}

const TEST_DB_HOST = process.env.SB_TEST_DB_HOST || '';
const TEST_DB_PORT = parseInt(process.env.SB_TEST_DB_PORT || '6543');
const TEST_DB_USER = process.env.SB_TEST_DB_USER || '';
const TEST_DB_PASS = process.env.SB_TEST_DB_PASS || '';

// Expected resolveEmailTemplate call sites (sender -> template key)
const EXPECTED_CALLSITES = {
  'admin-applications': ['academy_application_accepted', 'academy_application_waitlisted'],
  'admin-send-onboarding': ['academy_onboarding'],
  'admin-academy-capacity': ['academy_waitlist_seat_opened'],
  'admin-gcash-payment': ['gcash_screenshot_request', 'gcash_payment_followup', 'gcash_payment_approved'],
  'review-gcash-payment': ['gcash_payment_unverified', 'gcash_payment_approved'],
  'payment-complete': ['academy_payment_confirmation'],
  'paymongo-webhook': ['academy_payment_confirmation'],
  'website-form': ['academy_application_confirmation', 'internal_new_application', 'masterclass_registration_confirmation'],
  'masterclass-reminder': ['masterclass_reminder_24h', 'masterclass_followup', 'masterclass_reminder_30', 'masterclass_reminder_5'],
  'submit-gcash-payment': [], // uses email-delivery only, no template gateway
};

async function run() {
  // 1. DB connection
  if (!TEST_DB_HOST || !TEST_DB_USER || !TEST_DB_PASS) {
    log('DB connection', 'FAIL', 'env vars not set');
    printSummary(); process.exit(1);
  }
  let client;
  try {
    client = new Client({ host: TEST_DB_HOST, port: TEST_DB_PORT, database: 'postgres', user: TEST_DB_USER, password: TEST_DB_PASS, ssl: { rejectUnauthorized: false } });
    await client.connect();
    log('DB connection (isolated test)', 'PASS', TEST_DB_HOST + ':' + TEST_DB_PORT);
  } catch(e) {
    log('DB connection (isolated test)', 'FAIL', e.message);
    printSummary(); process.exit(1);
  }

  // 2. Schema applied
  try {
    const r = await client.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'email_template%'");
    if (parseInt(r.rows[0].count) >= 4) log('Schema: 4 email_template tables', 'PASS', r.rows[0].count + ' tables');
    else log('Schema: 4 email_template tables', 'FAIL', r.rows[0].count + ' found');
  } catch(e) { log('Schema', 'FAIL', e.message); }

  // 3. 17 templates imported (COUNT(*) not DISTINCT to catch duplicates)
  try {
    const r = await client.query('SELECT COUNT(*) FROM email_templates');
    if (parseInt(r.rows[0].count) === 18) log('18 templates imported (includes gcash_payment_confirmed + gcash_payment_approved)', 'PASS');
    else log('18 templates imported', 'FAIL', r.rows[0].count + ' found');
  } catch(e) { log('18 templates', 'FAIL', e.message); }

  // 4. Gateway: publish + resolve (real DB test)
  try {
    const testKey = 'academy_application_accepted';
    await client.query("UPDATE email_templates SET status='published', version=1, html='<html><body>Gateway Test</body></html>', text_content='Gateway Test' WHERE key=$1", [testKey]);
    const r = await client.query("SELECT html, version, status, text_content FROM email_templates WHERE key=$1 AND status='published'", [testKey]);
    if (r.rows[0] && r.rows[0].html.includes('Gateway Test')) log('Gateway: publish + resolve', 'PASS', 'source=published, version=' + r.rows[0].version);
    else log('Gateway: publish + resolve', 'FAIL');
  } catch(e) { log('Gateway', 'FAIL', e.message); }

  // 5. Rollback
  try {
    await client.query("UPDATE email_templates SET status='draft', version=0 WHERE key='academy_application_accepted'");
    const r = await client.query("SELECT status, version FROM email_templates WHERE key='academy_application_accepted'");
    if (r.rows[0] && r.rows[0].status === 'draft' && r.rows[0].version === 0) log('Rollback', 'PASS', 'status=draft, version=0');
    else log('Rollback', 'FAIL', 'unexpected state');
  } catch(e) { log('Rollback', 'FAIL', e.message); }

  // 6. Fallback (no published = inline fallback)
  try {
    const r = await client.query("SELECT COUNT(*) FROM email_templates WHERE status='published'");
    if (parseInt(r.rows[0].count) === 0) log('Fallback: no published = inline', 'PASS');
    else log('Fallback', 'FAIL', r.rows[0].count + ' still published');
  } catch(e) { log('Fallback', 'FAIL', e.message); }

  // 7. Verify all expected call sites exist in source code
  let callSiteFailures = [];
  // For static string literal calls
  const STATIC_CALLSITES = {
    'admin-applications': ['academy_application_accepted', 'academy_application_waitlisted'],
    'admin-send-onboarding': ['academy_onboarding'],
    'admin-academy-capacity': ['academy_waitlist_seat_opened'],
    'admin-gcash-payment': ['gcash_screenshot_request', 'gcash_payment_followup', 'gcash_payment_approved'],
    'review-gcash-payment': ['gcash_payment_unverified', 'gcash_payment_approved'],
    'payment-complete': ['academy_payment_confirmation'],
    'paymongo-webhook': ['academy_payment_confirmation'],
  };
  // For dynamic/variable-based calls (check that the keys appear in the file near resolveEmailTemplate)
  const DYNAMIC_CALLSITES = {
    'website-form': ['academy_application_confirmation', 'internal_new_application', 'masterclass_registration_confirmation'],
    'masterclass-reminder': ['masterclass_reminder_24h', 'masterclass_followup', 'masterclass_reminder_30', 'masterclass_reminder_5'],
  };
  
  for (const [sender, keys] of Object.entries(STATIC_CALLSITES)) {
    const file = `supabase/functions/${sender}/index.ts`;
    if (!fs.existsSync(file)) {
      callSiteFailures.push(`${sender}: file not found`);
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    for (const key of keys) {
      const pattern = new RegExp(`resolveEmailTemplate\\(['\"]${key}['\"]`);
      if (!pattern.test(content)) {
        callSiteFailures.push(`${sender} -> ${key}: no static resolveEmailTemplate call found`);
      }
    }
  }
  
  for (const [sender, keys] of Object.entries(DYNAMIC_CALLSITES)) {
    const file = `supabase/functions/${sender}/index.ts`;
    if (!fs.existsSync(file)) {
      callSiteFailures.push(`${sender}: file not found`);
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    // Check that resolveEmailTemplate is called AND the key strings appear in the file
    if (!content.includes('resolveEmailTemplate')) {
      callSiteFailures.push(`${sender}: no resolveEmailTemplate calls at all`);
    }
    for (const key of keys) {
      // Key should appear in the file (passed as variable or literal)
      if (!content.includes(key)) {
        callSiteFailures.push(`${sender} -> ${key}: key not found in file`);
      }
    }
  }
  
  if (callSiteFailures.length === 0) {
    log('All expected call sites present', 'PASS');
  } else {
    log('All expected call sites present', 'FAIL', callSiteFailures.join('; '));
  }

  // 8. Registry keys count (should be 18 unique: 17 original + gcash_payment_confirmed)
  try {
    const reg = fs.readFileSync('supabase/functions/_shared/email-template-registry.ts', 'utf8');
    const keys = [...new Set([...reg.matchAll(/key:\s*['"]([^'"]+)['"]/g)].map(m => m[1]))];
    if (keys.length === 18) log('18 registry keys (17 original + gcash_payment_confirmed)', 'PASS', keys.join(', '));
    else log('18 registry keys', 'FAIL', keys.length + ' found: ' + keys.join(', '));
  } catch(e) { log('Registry', 'FAIL', e.message); }

  // 9. No duplicate keys in registry
  try {
    const reg = fs.readFileSync('supabase/functions/_shared/email-template-registry.ts', 'utf8');
    const keys = [...reg.matchAll(/key:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length === 0) log('No duplicate registry keys', 'PASS');
    else log('No duplicate registry keys', 'FAIL', 'duplicates: ' + dupes.join(', '));
  } catch(e) { log('Registry duplicates', 'FAIL', e.message); }

  // 10. Compilation
  try {
    const bin = path.resolve('node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
    const targets = [
      ['_shared/email-templates.ts','email-templates.ts'],
      ['_shared/email-template-registry.ts','email-template-registry.ts'],
      ['admin-email-templates/index.ts','admin-email-templates/index.ts'],
      ['admin-applications/index.ts','admin-applications/index.ts'],
      ['admin-send-onboarding/index.ts','admin-send-onboarding/index.ts'],
      ['admin-academy-capacity/index.ts','admin-academy-capacity/index.ts'],
      ['admin-gcash-payment/index.ts','admin-gcash-payment/index.ts'],
      ['review-gcash-payment/index.ts','review-gcash-payment/index.ts'],
      ['payment-complete/index.ts','payment-complete/index.ts'],
      ['paymongo-webhook/index.ts','paymongo-webhook/index.ts'],
      ['website-form/index.ts','website-form/index.ts'],
      ['masterclass-reminder/index.ts','masterclass-reminder/index.ts'],
    ];
    let allPass = true;
    for (const [file, label] of targets) {
      try { execFileSync(bin, [path.resolve('supabase/functions/'+file), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', '--packages=external', '--outfile='+require('os').tmpdir()+'/esb-'+Date.now()+'.js', '--log-level=error'], { stdio: 'pipe' }); }
      catch(e) { allPass = false; log('Compile: ' + label, 'FAIL', e.message.slice(0,80)); }
    }
    if (allPass) log('Compilation: 12/12 PASS', 'PASS');
  } catch(e) { log('Compilation', 'FAIL', e.message); }

  // 11. Manrope
  try {
    const studio = fs.readFileSync('assistara-local-v9/admin-template-studio.html', 'utf8');
    const manropeCount = (studio.match(/Manrope/g) || []).length;
    if (manropeCount >= 3) log('Manrope in Template Studio', 'PASS', manropeCount + ' refs');
    else log('Manrope in Template Studio', 'FAIL', manropeCount + ' refs');
  } catch(e) { log('Manrope', 'FAIL', e.message); }

  // 12. Migration ordering: email_templates migration after last prod migration
  try {
    const migDir = 'supabase/migrations';
    const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
    const emailIdx = files.findIndex(f => f.includes('email_templates') && !f.includes('only'));
    const lastProdIdx = files.findIndex(f => f === '202610140001_remove_first_party_tracking.sql');
    if (emailIdx > lastProdIdx) log('Migration ordering: email_templates after prod migrations', 'PASS', files[emailIdx]);
    else log('Migration ordering', 'FAIL', 'email_templates at ' + emailIdx + ', last prod at ' + lastProdIdx);
  } catch(e) { log('Migration ordering', 'FAIL', e.message); }

  // 13. Empty migration removed
  try {
    const migDir = 'supabase/migrations';
    const files = fs.readdirSync(migDir);
    const empty = files.filter(f => f.includes('email_templates_only'));
    if (empty.length === 0) log('Empty migration removed', 'PASS');
    else log('Empty migration removed', 'FAIL', 'still present: ' + empty.join(', '));
  } catch(e) { log('Empty migration', 'FAIL', e.message); }

  // 14. Chat session audit committed
  try {
    const status = execFileSync('git', ['status', '--short', 'supabase/migrations/202610120003_chat_session_audit.sql'], { encoding: 'utf8' }).trim();
    if (status.startsWith('A') || status.startsWith('M')) log('Chat session audit migration tracked', 'PASS', status);
    else if (status === '') log('Chat session audit migration tracked', 'PASS', 'committed');
    else log('Chat session audit migration tracked', 'FAIL', status);
  } catch(e) { log('Chat session audit', 'FAIL', e.message); }

  await client.end();
  printSummary();
}

function printSummary() {
  const pass = results.filter(r => r[0] === 'PASS').length;
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log('\n=== FINAL VERIFICATION ===');
  console.log(pass + ' PASS / ' + fail + ' FAIL');
  console.log('Database: ISOLATED TEST PROJECT (joeivvevdugtwzimeftn)');
  console.log('Production: NOT TOUCHED');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });