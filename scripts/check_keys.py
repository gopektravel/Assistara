import re
with open('supabase/functions/_shared/email-template-registry.ts', encoding='utf-8') as f:
    content = f.read()
# The registry has object exports; find all key: values in exported objects
keys = set(re.findall(r"key\s*:\s*['\"]([a-z_][a-z0-9_]*)['\"]", content))
print("Keys found:", len(keys))
for k in sorted(keys):
    print("  ", k)
