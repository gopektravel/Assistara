with open('supabase/functions/paymongo-webhook/index.ts') as f:
    s = f.read()
old = ".replaceAll('\\\"','\\\"\\\"');"
new = ".replaceAll('\\\"','&quot;');"
if old in s:
    s = s.replace(old, new)
    with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
        f.write(s)
    print('fixed paymongo esc')
else:
    print('not found:', repr(old))
    # Show lines with replaceAll
    for i, line in enumerate(s.splitlines(), 1):
        if 'replaceAll' in line:
            print(i, line)
