with open('supabase/functions/paymongo-webhook/index.ts') as f:
    s = f.read()
# Find line 15 by counting newlines
lines = s.split('\n')
line = lines[14]
# Replace using char indices — find position of last ');' in line
idx = line.rfind(');')
if idx >= 0:
    # Before that, find the broken quote sequence starting at replaceAll('"'
    start = line.find("replaceAll('", idx-40)
    # Just rebuild from start to end with correct content
    new_end = '''.replaceAll('"','&quot;');'''
    fixed_line = line[:start] + new_end + line[idx+2:]  # keep any after );
    lines[14] = fixed_line
    with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('paymongo line 15 fixed via index')
else:
    print('cannot find end')
