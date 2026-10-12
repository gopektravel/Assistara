with open('supabase/functions/paymongo-webhook/index.ts') as f:
    s = f.read()
# The exact broken snippet from original (line 15 area)
broken = ".replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('\"','\"\"');"
# Actually just find the line containing the broken replaceAll and replace the last part
lines = s.splitlines()
for i, line in enumerate(lines):
    if 'function esc' in line or (i > 10 and i < 20 and 'replaceAll' in line and 'replaceAll' in lines[i-1] if i>0 else False):
        pass
# Find exact broken pattern: .replaceAll('"','""); at end of esc definition
# Search by index for the broken closing
bad = """.replaceAll('"',""");"""
if bad in s:
    s = s.replace(bad, ".replaceAll('"','&quot;');")
    with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
        f.write(s)
    print('paymongo esc fixed at source')
else:
    # Try alternative broken form
    alt = ".replaceAll('"',\"\");"
    if alt in s:
        s = s.replace(alt, ".replaceAll('"','&quot;');")
        with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
            f.write(s)
        print('paymongo esc fixed (alt)')
    else:
        # Show line area
        for i, line in enumerate(lines):
            if 'replaceAll' in line:
                print('line', i+1, ':', line[:120])
