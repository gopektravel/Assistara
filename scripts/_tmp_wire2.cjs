const fs = require('fs');
const path = require('path');

function patch(file, find, replace, label) {
  const full = path.join('supabase/functions', file, 'index.ts');
  const s = fs.readFileSync(full, 'utf8');
  if (!s.includes(find)) { console.log('SKIP (not found): ' + label); return; }
  if (s.split(find).length > 2) { console.log('SKIP (ambiguous): ' + label); return; }
  fs.writeFileSync(full, s.replace(find, replace));
  console.log('PATCHED: ' + label);
}

// website-form internal notification — exact text ends at ${esc(id)} then </p>
patch('website-form',
  `mail(NOTIFY,\`New Academy application: \${name}\`,frame('New application','New Academy application',\`<p>A new Academy application is ready for review.</p><p><strong>\${esc(name)}</strong><br>\${esc(email)}</p>\${details.map(([k,v]) => \`<p><strong>\${esc(k)}:</strong><br>\${esc(v||'Not provided')}</p>\`).join('')}<p style="color:#77716a;font-size:13px">Submission ID: \${esc(id)}</p>\`,{label:'Review application in Admin',href:\`\${SITE}/admin.html\`}),ACADEMY,\`submission-\${id}-admin\`)`,
  `mail(NOTIFY,await (async()=>{const nTpl=await resolveEmailTemplate('internal_new_application',{first_name:name,email:email,apply_url:\`\${SITE}/admin.html\`},()=>({subject:\`New Academy application: \${name}\`,html:frame('New application','New Academy application',\`<p>A new Academy application is ready for review.</p><p><strong>\${esc(name)}</strong><br>\${esc(email)}</p>\${details.map(([k,v]) => \`<p><strong>\${esc(k)}:</strong><br>\${esc(v||'Not provided')}</p>\`).join('')}<p style="color:#77716a;font-size:13px">Submission ID: \${esc(id)}</p>\`,{label:'Review application in Admin',href:\`\${SITE}/admin.html\`}),text:\`New Academy application\\n\\n\${name}\\n\${email}\\n\\nSubmission ID: \${id}\`}));return nTpl.subject})(),\`New Academy application: \${name}\`,ACADEMY,\`submission-\${id}-admin\`)`,
  'website-form internal notification');

// paymongo-webhook — delivery.send site (subject is built inline, no trailing space before receipt)
patch('paymongo-webhook',
  `emailType:'academy_payment_receipt',to:app.email,toName:app.name,subject:\`Payment received \${receipt} | Assistara Academy\`,html:shell("Payment received",body,{label:"Set up my Academy account",href:url}),`,
  `emailType:'academy_payment_receipt',to:app.email,toName:app.name,subject:pmSubject,html:pmHtml,text:pmText,`,
  'paymongo-webhook delivery.send site');

// The direct-Resend fallback site in paymongo-webhook needs the same vars too.
patch('paymongo-webhook',
  `const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:pmTpl.subject,html:pmTpl.html,text:pmTpl.text};`,
  `const pmSubject=pmTpl.subject,pmHtml=pmTpl.html,pmText=pmTpl.text;const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:pmSubject,html:pmHtml,text:pmTpl.text||pmText};`,
  'paymongo-webhook direct resend site');

console.log('done');
