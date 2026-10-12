const fs = require('fs');
const path = require('path');

function patch(file, find, replace, label) {
  const full = path.join('supabase/functions', file, 'index.ts');
  const s = fs.readFileSync(full, 'utf8');
  if (!s.includes(find)) {
    console.log('SKIP (not found): ' + label);
    return;
  }
  if (s.split(find).length > 2) {
    console.log('SKIP (ambiguous): ' + label);
    return;
  }
  fs.writeFileSync(full, s.replace(find, replace));
  console.log('PATCHED: ' + label);
}

// ---------------------------------------------------------------------------
// 1. website-form: internal "new academy application" notification
// ---------------------------------------------------------------------------
patch('website-form',
  `mail(NOTIFY,\`New Academy application: \${name}\`,frame('New application','New Academy application',\`<p>A new Academy application is ready for review.</p><p><strong>\${esc(name)}</strong><br>\${esc(email)}</p>\${details.map(([k,v]) => \`<p><strong>\${esc(k)}:</strong><br>\${esc(v||'Not provided')}</p>\`).join('')}<p style="color:#77716a;font-size:13px">Submission ID: \${esc(id)}</p>\`,{label:'Review application in Admin',href:\`\${SITE}/admin.html\`}),ACADEMY,\`submission-\${id}-admin\`)`,
  `mail(NOTIFY,await (async()=>{const notifyTpl=await resolveEmailTemplate('internal_new_application',{first_name:name,email:email,apply_url:\`\${SITE}/admin.html\`},()=>({subject:\`New Academy application: \${name}\`,html:frame('New application','New Academy application',\`<p>A new Academy application is ready for review.</p><p><strong>\${esc(name)}</strong><br>\${esc(email)}</p>\${details.map(([k,v]) => \`<p><strong>\${esc(k)}:</strong><br>\${esc(v||'Not provided')}</p>\`).join('')}<p style="color:#77716a;font-size:13px">Submission ID: \${esc(id)}</p>\`,{label:'Review application in Admin',href:\`\${SITE}/admin.html\`}),text:\`New Academy application\\n\\n\${name}\\n\${email}\\n\\nSubmission ID: \${id}\`}));return notifyTpl.subject})(),\`New Academy application: \${name}\`,ACADEMY,\`submission-\${id}-admin\`)`,
  'website-form internal notification');

// ---------------------------------------------------------------------------
// 2. review-gcash-payment: "could not verify" email
// ---------------------------------------------------------------------------
patch('review-gcash-payment',
  `const sent=await mail(app.email,'We need your GCash payment screenshot | Assistara Academy',shell('We could not verify your GCash payment',`,
  `const unverifiedTpl=await resolveEmailTemplate('gcash_payment_unverified',{first_name:first,name:app.name,gcash_reference:app.gcash_reference||''},()=>({subject:'We need your GCash payment screenshot | Assistara Academy',html:shell('We could not verify your GCash payment',`,
  'review-gcash-payment unverified (open)');

patch('review-gcash-payment',
  `<p>Reference: <strong>\${esc(app.gcash_reference)}</strong></p>\`));return out({ok:true,message:sent?'Marked as not verified. Admin is updated and the applicant was emailed.':'Marked as not verified. Admin is updated, but the email could not be sent.'})}`,
  `<p>Reference: <strong>\${esc(app.gcash_reference)}</strong></p>\`),text:'We need your GCash payment screenshot | Assistara Academy\\n\\nWe received your payment submission, but we could not verify it from the reference provided.\\n\\nPlease reply directly to this email with a screenshot of your GCash payment or receipt. We will review it manually.\\n\\nReference: '+(app.gcash_reference||'')}));const html=unverifiedTpl.html;const sent=await mail(app.email,unverifiedTpl.subject,html);return out({ok:true,message:sent?'Marked as not verified. Admin is updated and the applicant was emailed.':'Marked as not verified. Admin is updated, but the email could not be sent.'})}`,
  'review-gcash-payment unverified (close)');

// ---------------------------------------------------------------------------
// 3. review-gcash-payment: "payment received" email
// ---------------------------------------------------------------------------
patch('review-gcash-payment',
  `const sent=await mail(app.email,\`Payment received 🎉\${receipt?' '+receipt:''} | Assistara Academy\`,shell('Payment received 🎉',`,
  `const approvalTpl=await resolveEmailTemplate('gcash_payment_approved',{first_name:first,name:app.name,receipt_number:receipt||'',onboarding_url:url},()=>({subject:\`Payment received 🎉\${receipt?' '+receipt:''} | Assistara Academy\`,html:shell('Payment received 🎉',`,
  'review-gcash-payment received (open)');

patch('review-gcash-payment',
  `<p>Your next step is to set up your Academy account.</p>\`,url));if(sent)await db.from('academy_applications').update({payment_confirmation_sent_at:now}).eq('id',app.id);return out({ok:true,message:sent?'Payment approved. Admin is updated and the applicant was emailed.':'Payment approved. Admin is updated, but the confirmation email could not be sent.'})});`,
  `<p>Your next step is to set up your Academy account.</p>\`,{label:'Set up my Academy account',href:url}),text:'Payment received\\n\\nHi '+first+',\\n\\nWe verified your GCash payment of 6,900 PHP. Your place in Assistara Academy is secured.\\n\\nReceipt: '+(receipt||'')+'\\n\\nYour next step is to set up your Academy account.\\n\\n'+url,replyTo:'academy@getassistara.com',senderName:'Assistara Academy'}));const sent=await mail(app.email,approvalTpl.subject,approvalTpl.html);if(sent)await db.from('academy_applications').update({payment_confirmation_sent_at:now}).eq('id',app.id);return out({ok:true,message:sent?'Payment approved. Admin is updated and the applicant was emailed.':'Payment approved. Admin is updated, but the confirmation email could not be sent.'})});`,
  'review-gcash-payment received (close)');

// ---------------------------------------------------------------------------
// 4. admin-gcash-payment: screenshot request
// ---------------------------------------------------------------------------
patch('admin-gcash-payment',
  `const sent=await mail(app.email,'Quick check on your GCash payment 👀 | Assistara Academy',shell('Quick check on your GCash payment 👀',`,
  `const shotTpl=await resolveEmailTemplate('gcash_screenshot_request',{first_name:first,name:app.name},()=>({subject:'Quick check on your GCash payment 👀 | Assistara Academy',html:shell('Quick check on your GCash payment 👀',`,
  'admin-gcash-payment screenshot (open)');

patch('admin-gcash-payment',
  `<p>Once you’ve paid, reply here with the screenshot and we’ll take care of the rest. 💛</p><p>Assistara Academy</p>\`));return out({ok:true,status:'pending',followup_status:'screenshot_requested',email_sent:sent})}`,
  `<p>Once you’ve paid, reply here with the screenshot and we’ll take care of the rest. 💛</p><p>Assistara Academy</p>\`),text:'Quick check on your GCash payment\\n\\nWe got your payment details, but we couldn’t match the payment just yet.\\n\\nAlready paid? Reply to this email with a screenshot of your GCash payment and we’ll check it for you.\\n\\nOnce you’ve paid, reply here with the screenshot and we’ll take care of the rest. 💛\\n\\nAssistara Academy'}));const sent=await mail(app.email,shotTpl.subject,shotTpl.html);return out({ok:true,status:'pending',followup_status:'screenshot_requested',email_sent:sent})}`,
  'admin-gcash-payment screenshot (close)');

// ---------------------------------------------------------------------------
// 5. admin-gcash-payment: follow-up
// ---------------------------------------------------------------------------
patch('admin-gcash-payment',
  `const sent=await mail(app.email,'Still want to secure your place? 😊 | Assistara Academy',shell('Still want to secure your place? 😊',`,
  `const fuTpl=await resolveEmailTemplate('gcash_payment_followup',{first_name:first,name:app.name},()=>({subject:'Still want to secure your place? 😊 | Assistara Academy',html:shell('Still want to secure your place? 😊',`,
  'admin-gcash-payment followup (open)');

patch('admin-gcash-payment',
  `<p>Once it’s done, send us the screenshot and we’ll take care of the rest. 💛</p><p>Assistara Academy</p>\`));return out({ok:true,status:'pending',followup_status:'followup_sent',email_sent:sent})}`,
  `<p>Once it’s done, send us the screenshot and we’ll take care of the rest. 💛</p><p>Assistara Academy</p>\`),text:'Still want to secure your place?\\n\\nJust a quick follow-up on your Assistara Academy payment.\\n\\nIf you already paid, reply with your GCash screenshot and we’ll verify it for you.\\n\\nIf you haven’t paid yet, you can still complete your payment.\\n\\nOnce it’s done, send us the screenshot and we’ll take care of the rest. 💛\\n\\nAssistara Academy'}));const sent=await mail(app.email,fuTpl.subject,fuTpl.html);return out({ok:true,status:'pending',followup_status:'followup_sent',email_sent:sent})}`,
  'admin-gcash-payment followup (close)');

// ---------------------------------------------------------------------------
// 6. paymongo-webhook: payment confirmation (delivery.send site)
// ---------------------------------------------------------------------------
patch('paymongo-webhook',
  `        const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:\`Payment received 🎉 \${receipt} | Assistara Academy\`,html:shell("Payment received 🎉",body,{label:"Set up my Academy account",href:url})};`,
  `        const pmTpl=await resolveEmailTemplate('academy_payment_confirmation',{first_name:(app.name||'there').split(/\\s+/)[0],name:app.name,receipt_number:receipt,amount:'₱'+(amount||0).toLocaleString('en-PH',{minimumFractionDigits:2}),currency:'PHP',payment_method:'QR Ph via PayMongo',date:new Date(paidAt).toLocaleString('en-PH',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Manila'}),onboarding_url:url},()=>({subject:\`Payment received 🎉 \${receipt} | Assistara Academy\`,html:shell("Payment received 🎉",body,{label:"Set up my Academy account",href:url}),text:'Payment received\\n\\nHi '+(app.name||'there').split(/\\s+/)[0]+',\\n\\nWe received your payment and your place in Assistara Academy is secured.\\n\\nReceipt: '+receipt+'\\n\\nYour next step is to set up your Academy account.\\n\\n'+url,senderName:'Assistara Academy'}));const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:pmTpl.subject,html:pmTpl.html,text:pmTpl.text};`,
  'paymongo-webhook confirmation (delivery.send)');

patch('paymongo-webhook',
  `🎉 \${receipt} | Assistara Academy\`,html:shell("Payment received 🎉",body,{label:"Set up my Academy account",href:url})};`,
  `🎉 \${receipt} | Assistara Academy\`);const payload:any={from:FROM,to:[app.email],reply_to:"academy@getassistara.com",subject:pmTpl.subject,html:pmTpl.html,text:pmTpl.text};`,
  'paymongo-webhook confirmation (direct resend)');

console.log('done');
