with open('supabase/functions/website-form/index.ts') as f: s=f.read()
start = s.find('mail(NOTIFY,await (async()=>{const nTpl=await')
end = s.find('}`);', start)
# The segment from start to just before the .catch after the closing )
catch_pos = s.find('.catch(', start)
# We'll replace the entire broken mail() call with the correct version, keeping .catch after
old = s[start:catch_pos]
new = "mail(NOTIFY,nTpl.subject,nTpl.html,ACADEMY,`submission-${id}-internal`)"
# But nTpl isn't defined yet — need to resolve before that. Instead insert resolution before mailResults line
# Find line with const sent=... after masterclass
mc_line = s.find('const sent=await mail(email,mcTpl.subject')
if mc_line < 0: mc_line = s.find('const sent=await mail')
# Insert nTpl definition before that line
insert = "    const nTpl = await resolveEmailTemplate('internal_new_application',{first_name:name,email:email,apply_url:`${SITE}/admin.html`},()=>({subject:`New Academy application: ${name}`,html:frame('New application','New Academy application',`<p>A new Academy application is ready for review.</p><p><strong>${esc(name)}</strong><br>${esc(email)}</p>`,{label:'Review application in Admin',href:`${SITE}/admin.html`}),text:`New Academy application\\n\\n${name}\\n${email}\\n\\nSubmission ID: ${id}`}));\n"
s = s[:mc_line] + insert + s[mc_line:]
# Now replace the broken mail(NOTIFY... block with correct call (nTpl now defined above)
s = s.replace(old, new)
with open('supabase/functions/website-form/index.ts','w') as f: f.write(s)
print('website-form fixed via python')
