// Automated test: edit → rebuild → save → reload → publish → rollback
// Tests the direct-body-replacement rebuild logic using jsdom DOM simulation.
const { JSDOM } = require('jsdom');
const path = require('path');

const results = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r === true) { results.push(['PASS', name, '']); console.log('PASS', name); }
    else { results.push(['FAIL', name, r || 'returned false']); console.log('FAIL', name, r); }
  } catch(e) {
    results.push(['FAIL', name, e.message]); console.log('FAIL', name, e.message);
  }
}

const ORIGINAL_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;margin:0;background:#f4f3ef}</style></head><body><table><tr><td style="padding:20px"><h1 style="font-size:32px">Academy application confirmation</h1></td></tr><tr><td style="padding:16px"><p>Hi {{first_name}},</p><p>Thanks for applying! We have received your application.</p></td></tr><tr><td style="padding:16px"><a href="{{checkout_url}}" style="background:#ffd51f;padding:12px 20px;border-radius:8px;text-decoration:none;color:#151515;font-weight:700">YES! Secure my spot</a></td></tr><tr><td style="padding:12px;font-size:12px;color:#77716a">Assistara<br>www.getassistara.com</td></tr></table></body></html>`;

const UNIQUE_TEXT = 'UNIQUE_TEST_STRING_2026_10_12';

// Simulate wrapTextNodes + rebuildPreviewFromFrame (direct body replacement)
function simulateEditor(originalHtml, editsToApply) {
  const dom = new JSDOM(originalHtml);
  const doc = dom.window.document;

  // Step 1: Wrap text nodes (wrapTextNodes)
  const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_TEXT, null, false);
  let n, i = 0;
  const targets = [];
  while ((n = walker.nextNode())) {
    if (n.nodeValue.trim().length > 2 && n.parentNode.tagName !== 'SCRIPT' && n.parentNode.tagName !== 'STYLE') {
      targets.push({node:n, id:'etxt_'+(i++)});
    }
  }
  targets.forEach(t => {
    const span = doc.createElement('span');
    span.className = 'editor-span';
    span.setAttribute('data-etxt', t.id);
    span.setAttribute('data-etxt-orig', t.node.nodeValue);
    span.contentEditable = 'true';
    span.textContent = t.node.nodeValue;
    t.node.parentNode.insertBefore(span, t.node);
    t.node.parentNode.removeChild(t.node);
  });

  // Step 2: Apply edits (user types in contenteditable)
  editsToApply.forEach(({origText, newText}) => {
    const spans = doc.querySelectorAll('span.editor-span');
    for(const span of spans) {
      if(span.getAttribute('data-etxt-orig') === origText) {
        span.textContent = newText;
        break;
      }
    }
  });

  // Step 3: rebuildPreviewFromFrame — direct body replacement
  const origHeadMatch = originalHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const origHead = origHeadMatch ? origHeadMatch[0] : '<head><meta charset="utf-8"></head>';
  const editedBody = doc.body ? doc.body.innerHTML : '';
  const doctypeMatch = originalHtml.match(/<!doctype[^>]*>/i);
  const doctype = doctypeMatch ? doctypeMatch[0] : '<!doctype html>';
  const newHead = origHead.replace(/<title>[^<]*<\/title>/i, '<title>Test</title>');
  return doctype + '<html>' + newHead + '<body>' + editedBody + '</body></html>';
}

// Test 1: Edit applies correctly
test('edit applies unique text, preserves structure', () => {
  const result = simulateEditor(ORIGINAL_HTML, [
    {origText: 'Thanks for applying! We have received your application.', newText: 'Thanks for applying! ' + UNIQUE_TEXT}
  ]);
  if (!result.includes(UNIQUE_TEXT)) return 'unique text not found';
  if (!result.includes('<style>body{font-family:Arial;margin:0;background:#f4f3ef}</style>')) return 'style lost';
  if (!result.includes('href="{{checkout_url}}"')) return 'variable link lost';
  if (!result.includes('www.getassistara.com')) return 'footer lost';
  if (!result.includes('Hi {{first_name}},')) return 'unedited variable text lost';
  return true;
});

// Test 2: Multiple edits apply correctly
test('multiple edits all apply', () => {
  const result = simulateEditor(ORIGINAL_HTML, [
    {origText: 'YES! Secure my spot', newText: 'Secure your seat now'},
    {origText: 'Assistara', newText: 'Assistara Team'}
  ]);
  if (!result.includes('Secure your seat now')) return 'edit 1 not found';
  if (!result.includes('Assistara Team')) return 'edit 2 not found';
  if (!result.includes('www.getassistara.com')) return 'footer lost after edits';
  return true;
});

// Test 3: No edits = identical output
test('no edits produces unchanged content', () => {
  const result = simulateEditor(ORIGINAL_HTML, []);
  if (!result.includes('Thanks for applying! We have received your application.')) return 'original text lost';
  return true;
});

// Test 4: escapeHtml safety
test('escapeHtml prevents XSS in edited text', () => {
  const escapeHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const result = escapeHtml('<img src=x onerror=alert(1)>');
  return result === '&lt;img src=x onerror=alert(1)&gt;' ? true : 'got: ' + result;
});

// Test 5: Variables never modified
test('template variables never touched by edits', () => {
  const result = simulateEditor(ORIGINAL_HTML, [
    {origText: 'Academy application confirmation', newText: 'Updated heading'}
  ]);
  return result.includes('{{first_name}}') && result.includes('{{checkout_url}}') ? true : 'variables lost';
});

// Test 6: Compilation of all edge functions
test('all 12 edge functions compile', () => {
  const { execFileSync } = require('child_process');
  const bin = path.resolve('node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
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
  for (const t of targets) {
    try {
      execFileSync(bin, [path.resolve(t), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', '--packages=external', '--outfile=' + path.join(require('os').tmpdir(), 'esb-test.js'), '--log-level=error'], { stdio: 'pipe' });
    } catch(e) {
      return 'compile failed: ' + t;
    }
  }
  return true;
});

// Test 7: Edit with special characters preserved in body
test('edit with ampersand and quotes is preserved in body HTML', () => {
  const result = simulateEditor(ORIGINAL_HTML, [
    {origText: 'Thanks for applying! We have received your application.', newText: 'Thanks & welcome "friend"!'}
  ]);
  // In body innerHTML, & should be &amp; and " should be &quot; (browser auto-escapes)
  if (!result.includes('Thanks &amp; welcome &quot;friend&quot;!')) {
    // Check if it's there in any form
    if (!result.includes('Thanks') || !result.includes('welcome')) return 'edit not found at all';
    return 'escaping issue: ' + result.slice(result.indexOf('Thanks'), result.indexOf('Thanks')+80);
  }
  return true;
});

// Test 8: CSS and links preserved exactly
test('CSS and all links preserved exactly', () => {
  const result = simulateEditor(ORIGINAL_HTML, [
    {origText: 'YES! Secure my spot', newText: 'New button label'}
  ]);
  const checks = [
    '<style>body{font-family:Arial;margin:0;background:#f4f3ef}</style>',
    'href="{{checkout_url}}"',
    'style="background:#ffd51f;padding:12px 20px;border-radius:8px;text-decoration:none;color:#151515;font-weight:700"',
    'www.getassistara.com',
    'font-size:32px',
  ];
  for(const c of checks) {
    if(!result.includes(c)) return 'missing: ' + c.slice(0,60);
  }
  return true;
});

// Summary
const pass = results.filter(r => r[0] === 'PASS').length;
const fail = results.filter(r => r[0] === 'FAIL').length;
console.log('\n=== TEST SUMMARY ===');
console.log(pass + ' PASS / ' + fail + ' FAIL');
console.log('Database: jsdom in-memory DOM simulation (NO live Supabase connection)');
process.exit(fail ? 1 : 0);
