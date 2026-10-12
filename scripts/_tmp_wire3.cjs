const fs = require('fs');
const path = require('path');
const full = path.join('supabase/functions/website-form/index.ts');
const s = fs.readFileSync(full, 'utf8');
const find = "mail(NOTIFY,`New Academy application: ${name}`,frame('New application','New Academy application',`<p>A new Academy application is ready for review.</p><p><strong>${esc(name)}</strong><br>${esc(email)}</p>${details.map(([k,v])=>`<p><strong>${esc(k)}:</strong><br>${esc(v||'Not provided')}</p>`).join('')}<p style=\"color:#77716a;font-size:13px\">Submission ID: ${esc(id)}</p>`,{label:'Review application in Admin',href:`${SITE}/admin.html`}),ACADEMY,`submission-${id}-internal`)";
const replace = "mail(NOTIFY,await (async()=>{const nTpl=await resolveEmailTemplate('internal_new_application',{first_name:name,email:email,apply_url:`${SITE}/admin.html`},()=>({subject:`New Academy application: ${name}`,html:frame('New application','New Academy application',`<p>A new Academy application is ready for review.</p><p><strong>${esc(name)}</strong><br>${esc(email)}</p>${details.map(([k,v])=>`<p><strong>${esc(k)}:</strong><br>${esc(v||'Not provided')}</p>`).join('')}<p style=\"color:#77716a;font-size:13px\">Submission ID: ${esc(id)}</p>`,{label:'Review application in Admin',href:`${SITE}/admin.html`}),text:`New Academy application\\n\\n${name}\\n${email}\\n\\nSubmission ID: ${id}`}));return nTpl.subject})(),`New Academy application: ${name}`,ACADEMY,`submission-${id}-internal`)";
if (!s.includes(find)) { console.log('NOT FOUND'); }
else if (s.split(find).length > 2) { console.log('AMBIGUOUS'); }
else {
  fs.writeFileSync(full, s.replace(find, replace));
  console.log('PATCHED website-form internal notification');
}
