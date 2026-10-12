with open('supabase/functions/_shared/email-template-registry.ts', encoding='utf-8') as f:
    content = f.read()
idx = content.find("'academy_application_confirmation':")
if idx == -1:
    idx = content.find('"academy_application_confirmation":')
print('Found at:', idx)
print('First 2000 chars from index:')
print(content[idx:idx+2000])
