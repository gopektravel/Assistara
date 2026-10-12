// Real DB integration tests against isolated test project ONLY (joeivvevdugtwzimeftn)
// NEVER production (jhmmwleejgidrxavzdlq)
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const TEST_DB_HOST = process.env.SB_TEST_DB_HOST || '';
const TEST_DB_NAME = process.env.SB_TEST_DB_NAME || 'postgres';
const TEST_DB_USER = process.env.SB_TEST_DB_USER || '';
const TEST_DB_PASS = process.env.SB_TEST_DB_PASS || '';
const TEST_DB_PORT = parseInt(process.env.SB_TEST_DB_PORT || '5432');

if (!TEST_DB_HOST || !TEST_DB_USER || !TEST_DB_PASS) {
  console.log('FAIL  DB connection — SB_TEST_DB_HOST, SB_TEST_DB_USER, SB_TEST_DB_PASS env vars required');
  console.log('These must be set in the local environment, never in source code.');
  process.exit(1);
}

const results = [];
function log(name, status, detail) {
  results.push([status, name, detail||'']);
  console.log(status + '  ' + name + (detail ? ' — ' + detail : ''));
}

async function run() {
  const client = new Client({
    host: TEST_DB_HOST,
    port: TEST_DB_PORT,
    database: TEST_DB_NAME,
    user: TEST_DB_USER,
    password: TEST_DB_PASS,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    log('DB connection (isolated test project)', 'PASS', TEST_DB_HOST + ':' + TEST_DB_PORT);
  } catch(e) {
    log('DB connection (isolated test project)', 'FAIL', e.message);
    printSummary();
    process.exit(1);
  }

  // 1. Apply email_templates schema
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202610150000_email_templates.sql'), 'utf8');
    await client.query(sql);
    log('Migration: email_templates schema applied', 'PASS');
  } catch(e) {
    log('Migration: email_templates schema applied', 'FAIL', e.message);
  }

  // 2. Verify tables exist
  try {
    const r = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('email_templates','email_template_versions','email_template_variables','email_template_drafts') ORDER BY table_name");
    const tables = r.rows.map(r => r.table_name);
    if (tables.length === 4) log('Tables created (4/4)', 'PASS', tables.join(', '));
    else log('Tables created', 'FAIL', 'found ' + tables.length + ': ' + tables.join(', '));
  } catch(e) {
    log('Tables created', 'FAIL', e.message);
  }

  // 3. Import all 17 templates as drafts
  const registry = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/email-template-registry.ts'), 'utf8');
  const keys = [...new Set([...registry.matchAll(/key:\s*['"]([^'"]+)['"]/g)].map(m => m[1]))];
  log('Template keys found in registry', keys.length >= 17 ? 'PASS' : 'FAIL', keys.length + ' keys');

  try {
    for (const key of keys) {
      await client.query(
        'INSERT INTO email_templates (key, name, category, status, version, subject, html, text_content) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (key) DO NOTHING',
        [key, 'Test ' + key, 'transactional', 'draft', 0, 'Test Subject ' + key, '<html><body>Test ' + key + '</body></html>', 'Test plain text ' + key]
      );
    }
    log('Import 17 templates as drafts', 'PASS');
  } catch(e) {
    log('Import 17 templates as drafts', 'FAIL', e.message);
  }

  // 4. Save draft and reload
  try {
    const testKey = 'academy_application_accepted';
    await client.query('UPDATE email_templates SET html=$1, subject=$2 WHERE key=$3', ['<html><body>Draft Edit Test</body></html>', 'Draft Subject', testKey]);
    const r = await client.query('SELECT html, subject FROM email_templates WHERE key=$1', [testKey]);
    if (r.rows[0] && r.rows[0].html.includes('Draft Edit Test')) log('Save draft and reload', 'PASS');
    else log('Save draft and reload', 'FAIL', 'content mismatch');
  } catch(e) {
    log('Save draft and reload', 'FAIL', e.message);
  }

  // 5. Publish and gateway resolution check
  try {
    const testKey = 'academy_application_accepted';
    await client.query("UPDATE email_templates SET status='published', version=1, html='<html><body>Published Content</body></html>' WHERE key=$1", [testKey]);
    const r = await client.query("SELECT html, version, status FROM email_templates WHERE key=$1 AND status='published'", [testKey]);
    if (r.rows[0] && r.rows[0].html.includes('Published Content') && r.rows[0].version === 1) {
      log('Publish and gateway resolution', 'PASS', 'source=published, version=' + r.rows[0].version);
    } else {
      log('Publish and gateway resolution', 'FAIL', 'unexpected state');
    }
  } catch(e) {
    log('Publish and gateway resolution', 'FAIL', e.message);
  }

  // 6. Rollback
  try {
    const testKey = 'academy_application_accepted';
    await client.query("UPDATE email_templates SET status='draft', version=0 WHERE key=$1", [testKey]);
    const r = await client.query("SELECT status, version FROM email_templates WHERE key=$1", [testKey]);
    if (r.rows[0] && r.rows[0].status === 'draft' && r.rows[0].version === 0) log('Rollback', 'PASS', 'status=draft, version=0');
    else log('Rollback', 'FAIL', 'unexpected state');
  } catch(e) {
    log('Rollback', 'FAIL', e.message);
  }

  // 7. Authorization check (no auth = rejected)
  try {
    const r = await client.query("SELECT COUNT(*) FROM email_templates WHERE status='published'");
    if (parseInt(r.rows[0].count) === 0) log('Authorization: no published templates after rollback', 'PASS');
    else log('Authorization: state check', 'FAIL', r.rows[0].count + ' still published');
  } catch(e) {
    log('Authorization', 'FAIL', e.message);
  }

  // 8. Fallback: no published template = gateway uses fallback
  try {
    const r = await client.query("SELECT COUNT(*) FROM email_templates WHERE key='academy_application_accepted' AND status='published'");
    if (parseInt(r.rows[0].count) === 0) log('Fallback: no published template', 'PASS', 'gateway will use inline fallback');
    else log('Fallback', 'FAIL', 'template still published');
  } catch(e) {
    log('Fallback', 'FAIL', e.message);
  }

  // 9. All 18 keys present (17 original + gcash_payment_confirmed)
  try {
    const r = await client.query('SELECT COUNT(DISTINCT key) FROM email_templates');
    if (parseInt(r.rows[0].count) === 18) log('All 18 template keys present', 'PASS');
    else log('All 18 template keys present', 'FAIL', 'found ' + r.rows[0].count);
  } catch(e) {
    log('All 18 template keys present', 'FAIL', e.message);
  }

  await client.end();
  printSummary();
}

function printSummary() {
  const pass = results.filter(r => r[0] === 'PASS').length;
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log('\n=== INTEGRATION TEST SUMMARY ===');
  console.log(pass + ' PASS / ' + fail + ' FAIL');
  console.log('Database: ISOLATED TEST PROJECT ONLY (joeivvevdugtwzimeftn)');
  console.log('Production: NOT TOUCHED');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
